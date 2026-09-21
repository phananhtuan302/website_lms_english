import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { QuestionDTO, SectionDTO, TestDetailDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { rawErrorText } from '../lib/editorErrors';

interface TestPreviewModalProps {
  testId: string;
  onClose: () => void;
}

interface FlatQuestion {
  section: SectionDTO;
  question: QuestionDTO;
}

/** What a student has picked / typed for one question — kept only in this window. */
interface PreviewAnswer {
  choiceId?: string;
  text?: string;
}

/**
 * "Xem thử như học sinh": the test as a student sees it — one question at a time with the
 * question navigator, reading passage / audio above the question, every question type — in a
 * full-screen window with a banner saying nothing is saved or graded.
 *
 * It is deliberately a read-only renderer that talks to ONE endpoint (`GET .../tests/:id`, the
 * author's own view of the test): it never starts a session, creates an attempt or stores an
 * answer, so a preview can never show up in a report. Answers typed here live in this component's
 * state and vanish when it closes. (The real take-test screen is welded to the attempt / autosave
 * / speaking-recorder machinery, so it is imitated rather than reused.)
 */
function TestPreviewModal({ testId, onClose }: TestPreviewModalProps) {
  const { t } = useTranslation();
  const [test, setTest] = useState<TestDetailDTO | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, PreviewAnswer>>({});
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    let cancelled = false;
    teacherApi
      .getTest(testId)
      .then((data) => {
        if (!cancelled) setTest(data);
      })
      .catch((err) => {
        console.warn('[preview] could not load the test:', rawErrorText(err));
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [testId]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  const flat = useMemo<FlatQuestion[]>(
    () =>
      test
        ? [...test.sections]
            .sort((a, b) => a.order - b.order)
            .flatMap((section) =>
              [...section.questions].sort((a, b) => a.order - b.order).map((question) => ({ section, question })),
            )
        : [],
    [test],
  );

  const total = flat.length;
  const active = flat[Math.min(current, Math.max(total - 1, 0))];
  const isAnswered = (question: QuestionDTO) => {
    const answer = answers[question.id];
    return Boolean(answer && (answer.choiceId || (answer.text && answer.text.trim() !== '')));
  };
  const answeredCount = flat.filter((f) => isAnswered(f.question)).length;

  function setAnswer(questionId: string, patch: PreviewAnswer) {
    setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], ...patch } }));
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('testPreview.dialogLabel')}
      data-testid="test-preview"
      className="fixed inset-0 z-50 overflow-y-auto bg-base-white"
    >
      <div className="sticky top-0 z-10 border-b border-amber-300 bg-amber-100 px-4 py-3">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-amber-900">{t('testPreview.banner')}</p>
            <p className="text-xs text-amber-900/80">{t('testPreview.shuffleNote')}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md bg-base-black px-4 py-2.5 text-sm font-semibold text-base-white hover:bg-base-black/80"
          >
            {t('testPreview.close')}
          </button>
        </div>
      </div>

      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
        {loadError && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {t('testPreview.loadFailed')}
          </p>
        )}
        {!loadError && !test && <p className="text-center text-base-black/60">{t('common.loading')}</p>}

        {test && (
          <>
            <div>
              <h1 className="text-xl font-bold text-primary-700">{test.title}</h1>
              <p className="text-sm text-base-black/60">
                {t('takeTest.answeredCount', { answered: answeredCount, total })}
                {test.timeLimitMinutes != null &&
                  ` · ${t('testPreview.timeLimit', { minutes: test.timeLimitMinutes })}`}
              </p>
            </div>

            {total === 0 && (
              <p className="rounded-md border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-base-black/80">
                {t('testPreview.noQuestions')}
              </p>
            )}

            {total > 0 && active && (
              <>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2" aria-label={t('takeTest.questionNavigatorLabel')}>
                    {flat.map((item, index) => {
                      const answered = isAnswered(item.question);
                      return (
                        <button
                          key={item.question.id}
                          type="button"
                          onClick={() => setCurrent(index)}
                          aria-current={index === current ? 'true' : undefined}
                          aria-label={t(
                            answered ? 'takeTest.goToQuestionAnswered' : 'takeTest.goToQuestionUnanswered',
                            { number: index + 1 },
                          )}
                          className={`h-10 w-10 rounded-md text-sm font-semibold transition-colors ${
                            index === current
                              ? 'bg-primary-700 text-base-white ring-2 ring-primary-300 ring-offset-1'
                              : answered
                                ? 'bg-primary-500 text-base-white hover:bg-primary-600'
                                : 'border border-primary-200 bg-base-white text-base-black/70 hover:bg-primary-50'
                          }`}
                        >
                          {index + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-primary-200 bg-primary-50 p-6" data-testid="preview-question">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">
                    {active.section.title} · {t('takeTest.questionXOfY', { current: current + 1, total })}
                  </p>

                  {active.section.passageText && (
                    <div className="mt-3 rounded-lg border border-primary-200 bg-base-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-base-black/50">
                        {t('takeTest.readingPassageLabel')}
                      </p>
                      {active.section.passageImageUrl && (
                        <img
                          src={active.section.passageImageUrl}
                          alt={t('takeTest.readingPassageImageAlt')}
                          className="mt-2 max-h-64 rounded-md border border-primary-100 object-contain"
                        />
                      )}
                      <p className="mt-2 whitespace-pre-wrap text-sm text-base-black/90">
                        {active.section.passageText}
                      </p>
                    </div>
                  )}

                  {active.section.audioUrl && (
                    <div className="mt-3 rounded-lg border border-primary-200 bg-base-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-base-black/50">
                        {t('takeTest.listeningAudioLabel')}
                      </p>
                      <audio controls preload="none" src={active.section.audioUrl} className="mt-2 w-full" />
                    </div>
                  )}

                  <p className="mt-4 text-lg font-medium text-base-black">{active.question.prompt}</p>

                  {active.question.type === 'essay' ? (
                    <div className="mt-4">
                      <textarea
                        value={answers[active.question.id]?.text ?? ''}
                        onChange={(event) => setAnswer(active.question.id, { text: event.target.value })}
                        rows={8}
                        placeholder={t('testPreview.essayPlaceholder')}
                        className="w-full rounded-md border border-primary-200 bg-base-white px-3 py-2 text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                      />
                      {active.question.essayMaxScore != null && (
                        <p className="mt-1 text-xs text-base-black/50">
                          {t('takeTest.essayGradedManually', { points: active.question.essayMaxScore })}
                        </p>
                      )}
                    </div>
                  ) : active.question.type === 'fillBlank' ? (
                    <input
                      type="text"
                      value={answers[active.question.id]?.text ?? ''}
                      onChange={(event) => setAnswer(active.question.id, { text: event.target.value })}
                      placeholder={t('takeTest.fillBlankPlaceholder')}
                      className="mt-4 w-full rounded-md border border-primary-200 bg-base-white px-3 py-2 text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                    />
                  ) : active.question.type === 'speaking' ? (
                    <div className="mt-4 flex flex-col gap-3">
                      {active.question.promptAudioUrl && (
                        <audio controls src={active.question.promptAudioUrl} className="w-full" />
                      )}
                      <button
                        type="button"
                        disabled
                        className="self-start rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white opacity-50"
                      >
                        🎤 {t('takeTest.startRecording')}
                      </button>
                      <p className="text-xs text-base-black/60">
                        {t('testPreview.speakingNote', { seconds: active.question.allowedResponseSeconds ?? 60 })}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-col gap-2">
                      {active.question.choices.map((choice) => (
                        <label
                          key={choice.id}
                          className="flex cursor-pointer items-center gap-3 rounded-md border border-primary-200 bg-base-white px-4 py-3 text-base-black hover:border-primary-400"
                        >
                          <input
                            type="radio"
                            name={`preview-${active.question.id}`}
                            checked={answers[active.question.id]?.choiceId === choice.id}
                            onChange={() => setAnswer(active.question.id, { choiceId: choice.id })}
                          />
                          {choice.text}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setCurrent((i) => Math.max(0, i - 1))}
                    disabled={current === 0}
                    className="min-h-11 rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ← {t('takeTest.previous')}
                  </button>
                  {current < total - 1 ? (
                    <button
                      type="button"
                      onClick={() => setCurrent((i) => Math.min(total - 1, i + 1))}
                      className="min-h-11 rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
                    >
                      {t('takeTest.next')} →
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      title={t('testPreview.submitDisabled')}
                      className="min-h-11 rounded-md bg-primary-700 px-6 py-2 text-sm font-semibold text-base-white opacity-50"
                    >
                      {t('takeTest.submitTest')}
                    </button>
                  )}
                </div>
                {current === total - 1 && (
                  <p className="text-center text-xs text-base-black/60">{t('testPreview.submitDisabled')}</p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default TestPreviewModal;
