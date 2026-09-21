import { useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CLASS_ROSTER_BULK_MAX_ROWS,
  CLASS_ROSTER_MIN_PASSWORD_LENGTH,
  type ClassRosterBulkResponseDTO,
  type ClassRosterBulkSkipReason,
} from '@platform/shared';
import Modal from '../../components/Modal';
import { teacherApi } from '../../lib/teacherApi';
import {
  checkRosterRows,
  downloadCredentialsXlsx,
  downloadRosterTemplate,
  parseRosterFile,
  RosterParseError,
  type CheckedRosterRow,
  type RosterRowIssue,
} from '../../lib/rosterExcel';

interface AddStudentsModalProps {
  classId: string;
  className: string;
  onClose: () => void;
  /** Called once accounts were created, so the roster behind the dialog refreshes. */
  onChanged: () => void;
}

type Mode = 'form' | 'excel';

/** One line of the result table (a created account or a skipped row). */
interface ResultRow {
  key: string;
  /** Spreadsheet row (Excel import only), `null` for the one-student form. */
  row: number | null;
  name: string;
  email: string;
  status: 'created' | 'skipped';
  /** Already-translated reason for a skipped row. */
  reason: string | null;
  /** The password of a created account and where it came from; `null` for a skipped row. */
  password: string | null;
  passwordGenerated: boolean;
}

interface ResultView {
  rows: ResultRow[];
  created: number;
  skipped: number;
  showRowNumbers: boolean;
}

const INPUT_CLASS =
  'min-h-[2.5rem] w-full rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200';
const PRIMARY_BUTTON_CLASS =
  'min-h-[2.5rem] rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60';
const SECONDARY_BUTTON_CLASS =
  'min-h-[2.5rem] rounded-md border border-primary-300 px-4 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60';

/**
 * "Thêm học sinh" dialog on the class "Học sinh" tab (T-111). Two ways to create student
 * accounts in this class, both sent to `POST /api/teacher/classes/:classId/students/bulk`:
 *  - a small form for one student;
 *  - an Excel import: template download, file picker, a preview that checks every row before
 *    anything is sent (required name, email format, duplicates within the file, at most
 *    `CLASS_ROSTER_BULK_MAX_ROWS` rows).
 * Either way it ends on the same result table (created / skipped + why) with a download of the
 * created accounts and their passwords — a password the system generated is only ever returned
 * once, in that response, so the teacher is warned to download it before closing.
 */
function AddStudentsModal({ classId, className, onClose, onChanged }: AddStudentsModalProps) {
  const { t } = useTranslation();
  const formId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<Mode>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formIssue, setFormIssue] = useState<CheckedRosterRow | null>(null);

  const [parseErrorKey, setParseErrorKey] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<CheckedRosterRow[] | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultView | null>(null);
  const [credentials, setCredentials] = useState<Array<{ name: string; email: string; password: string }>>([]);
  const [downloaded, setDownloaded] = useState(false);

  const hasGeneratedPasswords = result?.rows.some((row) => row.passwordGenerated) ?? false;

  function reasonText(reason: ClassRosterBulkSkipReason | RosterRowIssue, duplicateOfRow: number | null): string {
    if (reason === 'duplicateInFile' && duplicateOfRow !== null) {
      return t('classRoster.reason.duplicateOfRow', { row: duplicateOfRow });
    }
    return t(`classRoster.reason.${reason}`, { min: CLASS_ROSTER_MIN_PASSWORD_LENGTH });
  }

  function handleClose() {
    if (hasGeneratedPasswords && !downloaded && !window.confirm(t('classRoster.closeConfirm'))) return;
    onClose();
  }

  function resetForNext() {
    setName('');
    setEmail('');
    setPassword('');
    setFormIssue(null);
    setParseErrorKey(null);
    setPreviewRows(null);
    setSubmitError(null);
    setResult(null);
    setCredentials([]);
    setDownloaded(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setFormIssue(null);
    setParseErrorKey(null);
    setSubmitError(null);
  }

  /** Sends the rows that passed the client check and builds the result table for ALL of
   * `rows` — client-rejected rows show up as skipped too, so the teacher sees the whole file. */
  async function send(rows: CheckedRosterRow[], showRowNumbers: boolean) {
    const sendable = rows.filter((row) => row.issue === null);
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response: ClassRosterBulkResponseDTO = await teacherApi.addClassStudents(classId, {
        students: sendable.map((row) => ({
          name: row.name,
          email: row.email,
          password: row.password === '' ? null : row.password,
        })),
      });

      const created: Array<{ name: string; email: string; password: string }> = [];
      const resultRows = rows.map((row): ResultRow => {
        const base = { key: `${row.row}-${row.email}`, row: showRowNumbers ? row.row : null };
        if (row.issue !== null) {
          return {
            ...base,
            name: row.name,
            email: row.email,
            status: 'skipped',
            reason: reasonText(row.issue, row.duplicateOfRow),
            password: null,
            passwordGenerated: false,
          };
        }
        const server = response.results[sendable.indexOf(row)];
        if (!server || server.status !== 'created') {
          return {
            ...base,
            name: row.name,
            email: row.email,
            status: 'skipped',
            reason: reasonText(server?.reason ?? 'emailExists', null),
            password: null,
            passwordGenerated: false,
          };
        }
        const finalPassword = server.generatedPassword ?? row.password;
        created.push({ name: server.name, email: server.email, password: finalPassword });
        return {
          ...base,
          name: server.name,
          email: server.email,
          status: 'created',
          reason: null,
          password: finalPassword,
          passwordGenerated: server.generatedPassword !== null,
        };
      });

      setResult({
        rows: resultRows,
        created: created.length,
        skipped: resultRows.length - created.length,
        showRowNumbers,
      });
      setCredentials(created);
      setDownloaded(false);
      setPreviewRows(null);
      if (created.length > 0) onChanged();
    } catch {
      setSubmitError(t('classRoster.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  function handleFormSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const [checked] = checkRosterRows([{ row: 1, name, email, password }]);
    if (checked.issue !== null) {
      setFormIssue(checked);
      return;
    }
    setFormIssue(null);
    void send([checked], false);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSubmitError(null);
    try {
      const parsed = await parseRosterFile(file);
      setParseErrorKey(null);
      setPreviewRows(checkRosterRows(parsed));
    } catch (error) {
      setPreviewRows(null);
      setParseErrorKey(error instanceof RosterParseError ? error.message : 'unreadable');
    }
  }

  function clearFile() {
    setPreviewRows(null);
    setParseErrorKey(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleDownloadTemplate() {
    downloadRosterTemplate({
      sheetName: t('classRoster.files.templateSheet'),
      nameHeader: t('classRoster.files.name'),
      emailHeader: t('classRoster.files.email'),
      passwordHeader: t('classRoster.files.passwordOptional'),
      fileBaseName: 'mau-danh-sach-hoc-sinh',
    });
  }

  function handleDownloadCredentials() {
    downloadCredentialsXlsx(
      credentials,
      {
        sheetName: t('classRoster.files.credentialsSheet'),
        nameHeader: t('classRoster.files.name'),
        emailHeader: t('classRoster.files.email'),
        passwordHeader: t('classRoster.files.password'),
      },
      `tai-khoan-${className}`,
    );
    setDownloaded(true);
  }

  const validCount = previewRows?.filter((row) => row.issue === null).length ?? 0;
  const invalidCount = (previewRows?.length ?? 0) - validCount;

  // ---- footer ---------------------------------------------------------------------------
  let footer;
  if (result) {
    footer = (
      <>
        {credentials.length > 0 && (
          <button type="button" onClick={handleDownloadCredentials} className={SECONDARY_BUTTON_CLASS}>
            {t('classRoster.result.download')}
          </button>
        )}
        <button type="button" onClick={resetForNext} className={SECONDARY_BUTTON_CLASS}>
          {t('classRoster.result.addMore')}
        </button>
        <button type="button" onClick={handleClose} className={PRIMARY_BUTTON_CLASS}>
          {t('classRoster.result.done')}
        </button>
      </>
    );
  } else if (mode === 'form') {
    footer = (
      <>
        <button type="button" onClick={handleClose} disabled={submitting} className={SECONDARY_BUTTON_CLASS}>
          {t('classRoster.closeLabel')}
        </button>
        <button type="submit" form={formId} disabled={submitting} className={PRIMARY_BUTTON_CLASS}>
          {submitting ? t('classRoster.form.submitting') : t('classRoster.form.submit')}
        </button>
      </>
    );
  } else {
    footer = (
      <>
        <button type="button" onClick={handleClose} disabled={submitting} className={SECONDARY_BUTTON_CLASS}>
          {t('classRoster.closeLabel')}
        </button>
        {previewRows && (
          <button
            type="button"
            onClick={() => void send(previewRows, true)}
            disabled={validCount === 0 || submitting}
            className={PRIMARY_BUTTON_CLASS}
          >
            {submitting ? t('classRoster.excel.confirming') : t('classRoster.excel.confirm', { valid: validCount })}
          </button>
        )}
      </>
    );
  }

  const modeButtonClass = (active: boolean) =>
    `min-h-[2.5rem] flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
      active ? 'bg-primary-500 text-base-white' : 'text-primary-700 hover:bg-primary-100'
    }`;

  return (
    <Modal
      title={t('classRoster.modalTitle')}
      onClose={handleClose}
      busy={submitting}
      closeLabel={t('classRoster.closeLabel')}
      footer={footer}
    >
      {result ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-base font-bold text-base-black">{t('classRoster.result.heading')}</h3>
          <p role="status" className="text-sm font-medium text-base-black">
            {t('classRoster.result.summary', { created: result.created, skipped: result.skipped })}
          </p>
          {hasGeneratedPasswords && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {t('classRoster.result.passwordWarning')}
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border border-primary-200">
            <table className="min-w-full divide-y divide-primary-100 text-sm">
              <thead className="bg-primary-50 text-left text-xs font-semibold uppercase tracking-wide text-primary-700">
                <tr>
                  {result.showRowNumbers && (
                    <th scope="col" className="px-3 py-2">
                      {t('classRoster.result.columns.row')}
                    </th>
                  )}
                  <th scope="col" className="px-3 py-2">
                    {t('classRoster.result.columns.name')}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    {t('classRoster.result.columns.email')}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    {t('classRoster.result.columns.status')}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    {t('classRoster.result.columns.password')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-100">
                {result.rows.map((row) => (
                  <tr key={row.key}>
                    {result.showRowNumbers && (
                      <td className="px-3 py-2 tabular-nums text-base-black/60">{row.row}</td>
                    )}
                    <td className="px-3 py-2 font-medium text-base-black">{row.name}</td>
                    <td className="px-3 py-2 text-base-black/70">{row.email}</td>
                    <td className="px-3 py-2">
                      {row.status === 'created' ? (
                        <span className="font-semibold text-green-700">{t('classRoster.result.created')}</span>
                      ) : (
                        <span className="text-red-700">
                          <span className="font-semibold">{t('classRoster.result.skipped')}</span>
                          {row.reason && <> — {row.reason}</>}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.password === null ? (
                        <span className="text-base-black/40">—</span>
                      ) : row.passwordGenerated ? (
                        <code className="select-all rounded bg-primary-50 px-1.5 py-0.5 font-mono text-sm text-base-black">
                          {row.password}
                        </code>
                      ) : (
                        <span className="text-base-black/60">{t('classRoster.result.passwordYours')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div
            role="group"
            aria-label={t('classRoster.modeLabel')}
            className="flex gap-1 rounded-lg bg-primary-50 p-1"
          >
            <button
              type="button"
              aria-pressed={mode === 'form'}
              onClick={() => switchMode('form')}
              disabled={submitting}
              className={modeButtonClass(mode === 'form')}
            >
              {t('classRoster.modeForm')}
            </button>
            <button
              type="button"
              aria-pressed={mode === 'excel'}
              onClick={() => switchMode('excel')}
              disabled={submitting}
              className={modeButtonClass(mode === 'excel')}
            >
              {t('classRoster.modeExcel')}
            </button>
          </div>

          {mode === 'form' ? (
            <form id={formId} onSubmit={handleFormSubmit} noValidate className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
                {t('classRoster.form.name')}
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="off"
                  data-autofocus
                  className={INPUT_CLASS}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
                {t('classRoster.form.email')}
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="off"
                  className={INPUT_CLASS}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
                {t('classRoster.form.password')}
                {/* Plain text on purpose: the teacher is choosing a password for someone else
                    (and gets it back in the account list), and a password-type field next to
                    an email would make the browser offer the teacher's OWN saved login. */}
                <input
                  type="text"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="off"
                  className={INPUT_CLASS}
                />
                <span className="text-xs font-normal text-base-black/60">
                  {t('classRoster.form.passwordHint', { min: CLASS_ROSTER_MIN_PASSWORD_LENGTH })}
                </span>
              </label>
              {formIssue && (
                <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {reasonText(formIssue.issue!, formIssue.duplicateOfRow)}
                </p>
              )}
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-base-black/70">
                {t('classRoster.excel.description', { max: CLASS_ROSTER_BULK_MAX_ROWS })}
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <button type="button" onClick={handleDownloadTemplate} className={SECONDARY_BUTTON_CLASS}>
                  {t('classRoster.excel.downloadTemplate')}
                </button>
                <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-base-black">
                  {t('classRoster.excel.fileLabel')}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(event) => void handleFileChange(event)}
                    disabled={submitting}
                    data-autofocus
                    className="max-w-full text-sm text-base-black/80"
                  />
                </label>
              </div>

              {parseErrorKey && (
                <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {t(`classRoster.parseError.${parseErrorKey}`, { max: CLASS_ROSTER_BULK_MAX_ROWS })}
                </p>
              )}

              {previewRows && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-base font-bold text-base-black">{t('classRoster.excel.previewHeading')}</h3>
                  <p className="text-sm font-medium text-base-black">
                    {t('classRoster.excel.previewSummary', { valid: validCount, invalid: invalidCount })}
                  </p>
                  {validCount === 0 && (
                    <p className="text-sm text-base-black/60">{t('classRoster.excel.noValidRows')}</p>
                  )}
                  <div className="max-h-72 overflow-auto rounded-xl border border-primary-200">
                    <table className="min-w-full divide-y divide-primary-100 text-sm">
                      <thead className="sticky top-0 bg-primary-50 text-left text-xs font-semibold uppercase tracking-wide text-primary-700">
                        <tr>
                          <th scope="col" className="px-3 py-2">
                            {t('classRoster.excel.columns.row')}
                          </th>
                          <th scope="col" className="px-3 py-2">
                            {t('classRoster.excel.columns.name')}
                          </th>
                          <th scope="col" className="px-3 py-2">
                            {t('classRoster.excel.columns.email')}
                          </th>
                          <th scope="col" className="px-3 py-2">
                            {t('classRoster.excel.columns.password')}
                          </th>
                          <th scope="col" className="px-3 py-2">
                            {t('classRoster.excel.columns.status')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-primary-100">
                        {previewRows.map((row) => (
                          <tr key={row.row} className={row.issue ? 'bg-red-50/60' : undefined}>
                            <td className="px-3 py-2 tabular-nums text-base-black/60">{row.row}</td>
                            <td className="px-3 py-2 font-medium text-base-black">{row.name || '—'}</td>
                            <td className="px-3 py-2 text-base-black/70">{row.email || '—'}</td>
                            <td className="px-3 py-2 text-base-black/60">
                              {row.password === ''
                                ? t('classRoster.excel.passwordGenerated')
                                : t('classRoster.excel.passwordSupplied')}
                            </td>
                            <td className="px-3 py-2">
                              {row.issue ? (
                                <span className="text-red-700">{reasonText(row.issue, row.duplicateOfRow)}</span>
                              ) : (
                                <span className="text-green-700">{t('classRoster.excel.rowOk')}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    onClick={clearFile}
                    disabled={submitting}
                    className="self-start rounded-md px-3 py-2 text-sm font-medium text-base-black/60 hover:bg-base-black/5"
                  >
                    {t('classRoster.excel.chooseAnother')}
                  </button>
                </div>
              )}
            </div>
          )}

          {submitError && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {submitError}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

export default AddStudentsModal;
