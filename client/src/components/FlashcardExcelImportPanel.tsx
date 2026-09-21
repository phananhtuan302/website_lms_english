import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FLASHCARD_BULK_IMPORT_MAX_ROWS, type BulkCreateFlashcardCardsResponse, type FlashcardSetDetailDTO } from '@platform/shared';
import {
  downloadFlashcardImportTemplate,
  FLASHCARD_IMPORT_COLUMNS,
  parseFlashcardImportFile,
  validateFlashcardImportRow,
  FlashcardImportParseError,
  type ParsedFlashcardImportRow,
} from '../lib/flashcardExcelImport';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

interface FlashcardExcelImportPanelProps {
  setId: string;
  onImported: (updatedSet: FlashcardSetDetailDTO) => void;
}

interface InvalidRow {
  row: number;
  reasonKey: 'termRequired' | 'meaningRequired' | 'exampleSentenceMarker';
}

/**
 * "Import from Excel" panel (T-085) on `TeacherFlashcardSetEditorPage.tsx` — download a
 * blank template, upload a filled-in `.xlsx`/`.xls`, preview which rows are valid vs. which
 * have a specific error, then submit only the valid rows to the bulk endpoint and show the
 * SERVER's own per-row result too (client-side validation is instant feedback only, never
 * a substitute for the independent server re-check — same convention as every other
 * authoring form in this app).
 *
 * Kept as its own component (rather than inlined into the page) for the same reason
 * `FlashcardCardEditor.tsx` is its own component: a self-contained chunk of state/markup
 * that the page itself doesn't need to know the internals of, it just needs the final
 * updated `FlashcardSetDetailDTO` back via `onImported`.
 */
function FlashcardExcelImportPanel({ setId, onImported }: FlashcardExcelImportPanelProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [parseErrorKey, setParseErrorKey] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedFlashcardImportRow[] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkCreateFlashcardCardsResponse | null>(null);
  // The exact rows actually submitted (valid-at-submit-time), kept alongside the result so
  // the server's per-row `errors[].row` (a 1-based index into the SUBMITTED array, see
  // `BulkCreateFlashcardCardsRowError`'s doc comment in `@platform/shared`) can be mapped
  // back to the real spreadsheet row number for display — only the client still has that
  // mapping, the server never saw a spreadsheet at all.
  const [submittedRows, setSubmittedRows] = useState<ParsedFlashcardImportRow[]>([]);

  function resetFileInput() {
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function clearAll() {
    setParseErrorKey(null);
    setParsedRows(null);
    setSubmitError(null);
    setResult(null);
    setSubmittedRows([]);
    resetFileInput();
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setSubmitError(null);
    setResult(null);
    setSubmittedRows([]);

    try {
      const rows = await parseFlashcardImportFile(file);
      if (rows.length === 0) {
        setParsedRows(null);
        setParseErrorKey('parseError.noDataRows');
        return;
      }
      if (rows.length > FLASHCARD_BULK_IMPORT_MAX_ROWS) {
        setParsedRows(null);
        setParseErrorKey('parseError.tooManyRows');
        return;
      }
      setParseErrorKey(null);
      setParsedRows(rows);
    } catch (err) {
      setParsedRows(null);
      setParseErrorKey(err instanceof FlashcardImportParseError ? err.message : 'parseError.unreadable');
    }
  }

  const validRows = parsedRows?.filter((row) => validateFlashcardImportRow(row.data) === null) ?? [];
  const invalidRows: InvalidRow[] =
    parsedRows
      ?.map((row) => ({ row: row.row, reasonKey: validateFlashcardImportRow(row.data) }))
      .filter((entry): entry is InvalidRow => entry.reasonKey !== null) ?? [];

  async function handleConfirmImport() {
    if (validRows.length === 0) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const response = await teacherApi.bulkAddFlashcardCards(setId, {
        cards: validRows.map((row) => row.data),
      });
      setSubmittedRows(validRows);
      setResult(response);
      setParsedRows(null);
      resetFileInput();
      onImported(response.set);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : t('teacherFlashcardImport.submitError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-primary-100 bg-base-white p-4">
      <h3 className="text-base font-bold text-base-black">{t('teacherFlashcardImport.heading')}</h3>
      <p className="text-sm text-base-black/60">
        {t('teacherFlashcardImport.description', { columns: FLASHCARD_IMPORT_COLUMNS.join(', ') })}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => downloadFlashcardImportTemplate()}
          className="rounded-md border border-primary-300 px-3 py-2.5 text-sm font-medium text-primary-700 hover:bg-primary-50 sm:py-1.5"
        >
          {t('teacherFlashcardImport.downloadTemplate')}
        </button>

        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('teacherFlashcardImport.fileInputLabel')}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => void handleFileChange(event)}
            className="text-sm text-base-black/80"
          />
        </label>
      </div>

      {parseErrorKey && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(`teacherFlashcardImport.${parseErrorKey}`, { max: FLASHCARD_BULK_IMPORT_MAX_ROWS })}
        </p>
      )}

      {parsedRows && (
        <div className="flex flex-col gap-2 rounded-md border border-primary-200 p-3">
          <p className="text-sm font-medium text-base-black">
            {t('teacherFlashcardImport.previewValidCount', { count: validRows.length })}
            {invalidRows.length > 0 && (
              <> — {t('teacherFlashcardImport.previewInvalidCount', { count: invalidRows.length })}</>
            )}
          </p>

          {invalidRows.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm text-red-700">
              {invalidRows.map((entry) => (
                <li key={entry.row}>
                  {t('teacherFlashcardImport.rowError', {
                    row: entry.row,
                    reason: t(`teacherFlashcardImport.reason.${entry.reasonKey}`),
                  })}
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleConfirmImport()}
              disabled={validRows.length === 0 || isSubmitting}
              className="rounded-md bg-primary-500 px-4 py-2.5 sm:py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? t('teacherFlashcardImport.importing')
                : t('teacherFlashcardImport.confirmButton', { count: validRows.length })}
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={isSubmitting}
              className="rounded-md px-3 py-2 text-sm font-medium text-base-black/60 hover:bg-base-black/5"
            >
              {t('teacherFlashcardImport.cancelButton')}
            </button>
          </div>
          {validRows.length === 0 && (
            <p className="text-sm text-base-black/60">{t('teacherFlashcardImport.noValidRows')}</p>
          )}
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
            {t('teacherFlashcardImport.resultCreated', { count: result.created })}
          </p>
          {result.errors.length > 0 && (
            <>
              <p className="text-sm font-medium text-red-700">{t('teacherFlashcardImport.resultErrorsHeading')}</p>
              <ul className="flex flex-col gap-1 text-sm text-red-700">
                {result.errors.map((rowError) => {
                  // Server `row` is a 1-based index into the array WE submitted
                  // (`BulkCreateFlashcardCardsRowError`'s documented contract) — map it
                  // back to the real spreadsheet row via the `submittedRows` we kept from
                  // the moment of submission, since the server never knew about
                  // spreadsheet rows at all.
                  const originalRow = submittedRows[rowError.row - 1]?.row ?? rowError.row;
                  return (
                    <li key={rowError.row}>
                      {t('teacherFlashcardImport.rowError', { row: originalRow, reason: rowError.message })}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <button
            type="button"
            onClick={clearAll}
            className="self-start rounded-md border border-primary-300 px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-100"
          >
            {t('teacherFlashcardImport.dismissResult')}
          </button>
        </div>
      )}
    </section>
  );
}

export default FlashcardExcelImportPanel;
