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
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  function resetFileInput() {
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSelectedFileName(null);
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

    setSelectedFileName(file.name);
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
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="border-b border-slate-100 pb-3 mb-4">
        <h3 className="text-base font-bold text-slate-900">{t('teacherFlashcardImport.heading')}</h3>
        <p className="mt-1 text-xs text-slate-500 max-w-3xl leading-relaxed">
          {t('teacherFlashcardImport.description', { columns: FLASHCARD_IMPORT_COLUMNS.join(', ') })}
        </p>
      </div>

      <div className="flex flex-col gap-3 max-w-xl">
        {/* Nút tải mẫu đặt ngay phía trên để người dùng dễ chú ý */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => downloadFlashcardImportTemplate()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary-200 bg-primary-50/70 px-3.5 py-2 text-xs font-semibold text-primary-700 shadow-2xs transition-colors hover:bg-primary-100 active:scale-[0.98]"
          >
            <svg className="h-4 w-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t('teacherFlashcardImport.downloadTemplate')}
          </button>
          <span className="text-xs text-slate-400">
            (Tải file mẫu Excel chuẩn để điền từ vựng)
          </span>
        </div>

        {/* Khối chọn tệp đặt ngay bên dưới nút tải mẫu */}
        <div className="flex flex-col gap-1.5 pt-1">
          <span className="text-xs font-semibold text-slate-700">
            Chọn tệp danh sách từ vựng Excel (.xlsx, .xls)
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              id="flashcard-excel-file"
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => void handleFileChange(event)}
              className="hidden"
            />
            <label
              htmlFor="flashcard-excel-file"
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-primary-700 active:scale-[0.98]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Chọn tệp Excel
            </label>

            {selectedFileName ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-1.5 text-xs text-emerald-800">
                <span className="font-semibold">{selectedFileName}</span>
                <button
                  type="button"
                  onClick={clearAll}
                  title="Bỏ chọn tệp"
                  className="ml-1 text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>
            ) : (
              <span className="text-xs text-slate-400 italic">Chưa chọn tệp nào</span>
            )}
          </div>
        </div>
      </div>

      {parseErrorKey && (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-700">
          {t(`teacherFlashcardImport.${parseErrorKey}`, { max: FLASHCARD_BULK_IMPORT_MAX_ROWS })}
        </p>
      )}

      {parsedRows && (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
          <p className="text-xs font-medium text-slate-700">
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
