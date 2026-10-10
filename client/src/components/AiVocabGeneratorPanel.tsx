import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CEFR_LEVELS,
  type BulkCreateFlashcardCardsResponse,
  type CefrLevel,
  type FlashcardSetDetailDTO,
  type GeneratedVocabCardDTO,
} from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import { Button, Input, Select } from './ui';

interface AiVocabGeneratorPanelProps {
  setId: string;
  onImported: (updatedSet: FlashcardSetDetailDTO) => void;
}

const MIN_COUNT = 1;
const MAX_COUNT = 40;

/** Editable draft row — same shape as `GeneratedVocabCardDTO` plus a stable `key` so a row
 * can be deleted from the middle of the list without React re-keying every sibling by
 * array index (and silently losing in-progress edits in whichever row happens to shift). */
interface DraftRow extends GeneratedVocabCardDTO {
  key: string;
}

let nextKey = 0;
function freshKey(): string {
  nextKey += 1;
  return `draft-${nextKey}`;
}

/**
 * "AI Tạo từ vựng" panel (2026-10, feature 1 of the "AI Content Tools" set) on
 * `TeacherFlashcardSetEditorPage.tsx`, sitting alongside `FlashcardExcelImportPanel` — same
 * overall shape (generate/parse → editable preview → submit through the existing bulk
 * endpoint → show the server's per-row result), since this is the same "draft, reviewed by
 * the teacher, then saved" flow, just sourced from an AI call instead of a spreadsheet.
 *
 * Deliberately reuses `teacherApi.bulkAddFlashcardCards` for the save step rather than
 * introducing a separate "commit" endpoint — see `vocabGenerator.ts`'s doc comment on the
 * server for why.
 */
function AiVocabGeneratorPanel({ setId, onImported }: AiVocabGeneratorPanelProps) {
  const { t } = useTranslation();

  const [topic, setTopic] = useState('');
  const [levels, setLevels] = useState<CefrLevel[]>(['A1']);
  const [count, setCount] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [draftRows, setDraftRows] = useState<DraftRow[] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkCreateFlashcardCardsResponse | null>(null);

  function toggleLevel(level: CefrLevel) {
    setLevels((prev) => (prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]));
  }

  function clearAll() {
    setDraftRows(null);
    setGenerateError(null);
    setSubmitError(null);
    setResult(null);
  }

  async function handleGenerate() {
    if (!topic.trim() || levels.length === 0 || isGenerating) return;
    setIsGenerating(true);
    setGenerateError(null);
    setResult(null);
    try {
      const response = await teacherApi.generateVocabulary({ topic: topic.trim(), levels, count });
      setDraftRows(response.cards.map((card) => ({ ...card, key: freshKey() })));
    } catch (err) {
      setGenerateError(err instanceof ApiError ? err.message : t('aiVocabGenerator.generateError'));
    } finally {
      setIsGenerating(false);
    }
  }

  function updateRow(key: string, patch: Partial<GeneratedVocabCardDTO>) {
    setDraftRows((prev) => prev?.map((row) => (row.key === key ? { ...row, ...patch } : row)) ?? null);
  }

  function removeRow(key: string) {
    setDraftRows((prev) => prev?.filter((row) => row.key !== key) ?? null);
  }

  async function handleSave() {
    if (!draftRows || draftRows.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const response = await teacherApi.bulkAddFlashcardCards(setId, {
        cards: draftRows.map(({ key: _key, ...card }) => card),
      });
      setResult(response);
      setDraftRows(null);
      onImported(response.set);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : t('aiVocabGenerator.saveError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-primary-100 bg-base-white p-4">
      <h3 className="text-base font-bold text-base-black">{t('aiVocabGenerator.heading')}</h3>
      <p className="text-sm text-base-black/60">{t('aiVocabGenerator.description')}</p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-base-black">
          {t('aiVocabGenerator.topicLabel')}
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t('aiVocabGenerator.topicPlaceholder')}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('aiVocabGenerator.countLabel')}
          <Input
            type="number"
            min={MIN_COUNT}
            max={MAX_COUNT}
            value={count}
            onChange={(e) => setCount(Math.min(MAX_COUNT, Math.max(MIN_COUNT, Number(e.target.value) || MIN_COUNT)))}
            className="w-24"
          />
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-base-black">{t('aiVocabGenerator.levelsLabel')}</span>
        <div className="flex flex-wrap gap-2">
          {CEFR_LEVELS.map((level) => (
            <Button
              key={level}
              type="button"
              size="sm"
              variant={levels.includes(level) ? 'solid' : 'outline'}
              onClick={() => toggleLevel(level)}
            >
              {level}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Button type="button" onClick={() => void handleGenerate()} disabled={!topic.trim() || levels.length === 0 || isGenerating}>
          {isGenerating ? t('aiVocabGenerator.generating') : t('aiVocabGenerator.generateButton')}
        </Button>
      </div>

      {generateError && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {generateError}
        </p>
      )}

      {draftRows && (
        <div className="flex flex-col gap-2 rounded-md border border-primary-200 p-3">
          <p className="text-sm font-medium text-base-black">
            {t('aiVocabGenerator.previewCount', { count: draftRows.length })}
          </p>

          <div className="flex flex-col gap-2">
            {draftRows.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-1 gap-2 rounded-md border border-primary-100 p-2 sm:grid-cols-[1fr_1fr_90px_1fr_90px_auto]"
              >
                <Input
                  size="sm"
                  value={row.term}
                  onChange={(e) => updateRow(row.key, { term: e.target.value })}
                  placeholder={t('aiVocabGenerator.rowTermPlaceholder')}
                />
                <Input
                  size="sm"
                  value={row.meaning}
                  onChange={(e) => updateRow(row.key, { meaning: e.target.value })}
                  placeholder={t('aiVocabGenerator.rowMeaningPlaceholder')}
                />
                <Input
                  size="sm"
                  value={row.ipa}
                  onChange={(e) => updateRow(row.key, { ipa: e.target.value })}
                  placeholder={t('aiVocabGenerator.rowIpaPlaceholder')}
                />
                <Input
                  size="sm"
                  value={row.exampleSentence}
                  onChange={(e) => updateRow(row.key, { exampleSentence: e.target.value })}
                  placeholder={t('aiVocabGenerator.rowExamplePlaceholder')}
                />
                <Select
                  size="sm"
                  value={row.cefrLevel}
                  onChange={(e) => updateRow(row.key, { cefrLevel: e.target.value as CefrLevel })}
                >
                  {CEFR_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </Select>
                <Button type="button" variant="ghost" tone="danger" size="sm" onClick={() => removeRow(row.key)}>
                  {t('aiVocabGenerator.removeRowButton')}
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" onClick={() => void handleSave()} disabled={draftRows.length === 0 || isSubmitting}>
              {isSubmitting ? t('aiVocabGenerator.saving') : t('aiVocabGenerator.saveButton', { count: draftRows.length })}
            </Button>
            <Button type="button" variant="ghost" onClick={clearAll} disabled={isSubmitting}>
              {t('aiVocabGenerator.cancelButton')}
            </Button>
          </div>
        </div>
      )}

      {submitError && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {submitError}
        </p>
      )}

      {result && (
        <div className="flex flex-col gap-2 rounded-md border border-primary-200 bg-primary-50 p-3">
          <p className="text-sm font-medium text-base-black">
            {t('aiVocabGenerator.resultCreated', { count: result.created })}
          </p>
          {result.errors.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm text-red-700">
              {result.errors.map((rowError) => (
                <li key={rowError.row}>{t('aiVocabGenerator.rowError', { row: rowError.row, reason: rowError.message })}</li>
              ))}
            </ul>
          )}
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={clearAll}>
            {t('aiVocabGenerator.dismissResult')}
          </Button>
        </div>
      )}
    </section>
  );
}

export default AiVocabGeneratorPanel;
