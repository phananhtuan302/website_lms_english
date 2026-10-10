import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TeacherChatMessageDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import { Alert, Button, PageHeader } from '../components/ui';

/**
 * Teacher AI chat assistant (2026-10, feature 4 of the "AI Content Tools" set) —
 * request/response chat (no streaming, matching every other AI call in this app) scoped
 * strictly to the calling teacher's own data (see `teacherChatTools.ts`'s doc comment on
 * the server for the security model). `toolsUsed` is shown per reply, for THIS session
 * only, so a teacher can see what each answer is actually based on — it isn't persisted,
 * so history reloaded from the server never shows it for older messages.
 */
function TeacherChatPage() {
  const { t } = useTranslation();

  const [messages, setMessages] = useState<TeacherChatMessageDTO[] | null>(null);
  const [toolsUsedByMessageId, setToolsUsedByMessageId] = useState<Record<string, string[]>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [isClearing, setIsClearing] = useState(false);

  function load() {
    teacherApi
      .listChatMessages()
      .then((res) => setMessages(res.messages))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : t('teacherChat.loadFailed')));
  }

  // `t` is stable in practice (site-wide, admin-controlled language — PROJECT_PLAN
  // Guiding Principle 3/Assumption A13), safe to omit from this dependency list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  async function handleSend() {
    const content = input.trim();
    if (!content || isSending) return;

    setIsSending(true);
    setSendError(null);
    try {
      const response = await teacherApi.sendChatMessage({ content });
      setMessages((prev) => [...(prev ?? []), response.userMessage, response.assistantMessage]);
      if (response.toolsUsed.length > 0) {
        setToolsUsedByMessageId((prev) => ({ ...prev, [response.assistantMessage.id]: response.toolsUsed }));
      }
      setInput('');
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : t('teacherChat.sendFailed'));
    } finally {
      setIsSending(false);
    }
  }

  async function handleClear() {
    if (isClearing || !window.confirm(t('teacherChat.confirmClear'))) return;
    setIsClearing(true);
    try {
      await teacherApi.clearChatMessages();
      setMessages([]);
      setToolsUsedByMessageId({});
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : t('teacherChat.clearFailed'));
    } finally {
      setIsClearing(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader
        title={t('teacherChat.heading')}
        subtitle={t('teacherChat.subtitle')}
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void handleClear()} disabled={isClearing}>
            {t('teacherChat.clearButton')}
          </Button>
        }
      />

      {loadError && <Alert>{loadError}</Alert>}

      <div className="flex min-h-[50vh] flex-col gap-3 rounded-xl border border-primary-100 bg-base-white p-4">
        {messages === null && !loadError && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}
        {messages?.length === 0 && <p className="text-sm text-base-black/60">{t('teacherChat.emptyState')}</p>}
        {messages?.map((message) => (
          <div key={message.id} className={message.role === 'user' ? 'self-end' : 'self-start'}>
            <div
              className={
                message.role === 'user'
                  ? 'max-w-md rounded-2xl rounded-br-sm bg-primary-600 px-4 py-2 text-sm text-base-white'
                  : 'max-w-md rounded-2xl rounded-bl-sm bg-primary-50 px-4 py-2 text-sm text-base-black whitespace-pre-wrap'
              }
            >
              {message.content}
            </div>
            {toolsUsedByMessageId[message.id] && (
              <p className="mt-1 text-xs text-base-black/50">
                {t('teacherChat.toolsUsed', { tools: toolsUsedByMessageId[message.id].join(', ') })}
              </p>
            )}
          </div>
        ))}
      </div>

      {sendError && <Alert>{sendError}</Alert>}

      <div className="flex items-end gap-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          rows={2}
          placeholder={t('teacherChat.inputPlaceholder')}
          className="flex-1 rounded-md border border-primary-200 bg-base-white px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        <Button type="button" onClick={() => void handleSend()} disabled={!input.trim() || isSending}>
          {isSending ? t('teacherChat.sending') : t('teacherChat.sendButton')}
        </Button>
      </div>
    </div>
  );
}

export default TeacherChatPage;
