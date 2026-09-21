/**
 * Client-side helpers for adding students to a class (T-111): parsing an Excel roster
 * (SheetJS `xlsx`), the preview-time validation, and the two `.xlsx` downloads (the blank
 * template and the list of created accounts). Used by `pages/classWorkspace/AddStudentsModal.tsx`.
 *
 * Same conventions as the flashcard import (`flashcardExcelImport.ts`): parsing happens entirely
 * in the browser (the file is never uploaded, only the parsed rows are sent as plain JSON), the
 * header row is matched case-insensitively, cells are trimmed, fully blank rows are skipped, and
 * file-level problems throw a `RosterParseError` whose message is an i18n sub-key.
 *
 * The row checks here are only instant feedback: the server re-validates every row on its own
 * (`server/src/routes/teacherClassRoster.routes.ts`) and stays the source of truth.
 */

import * as XLSX from 'xlsx';
import {
  CLASS_ROSTER_BULK_MAX_ROWS,
  CLASS_ROSTER_MIN_PASSWORD_LENGTH,
} from '@platform/shared';

/** Thrown for FILE-level problems; `message` is a `classRoster.parseError.*` sub-key. */
export class RosterParseError extends Error {}

/** One student as typed in the form or read from a sheet row. `row` is the 1-based row number
 * in the spreadsheet (header = row 1) so an error can point at the exact line to fix. */
export interface RosterInputRow {
  row: number;
  name: string;
  email: string;
  /** Empty = let the system generate one. */
  password: string;
}

/** Why a row cannot be sent (`classRoster.reason.*`). */
export type RosterRowIssue = 'nameRequired' | 'emailInvalid' | 'passwordInvalid' | 'duplicateInFile';

export interface CheckedRosterRow extends RosterInputRow {
  issue: RosterRowIssue | null;
  /** For `duplicateInFile`: the row where the same email first appears. */
  duplicateOfRow: number | null;
}

// Same pattern as public registration and the server route.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 72;

/** Lower-cases, strips Vietnamese diacritics and any "(…)" note, so "Mật khẩu (không bắt buộc)",
 * "MAT KHAU" and "mật khẩu" all read the same. */
function normalizeHeader(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const NAME_HEADERS = ['ho ten', 'ho va ten', 'ten', 'ten hoc sinh', 'hoten', 'name', 'full name', 'fullname'];
const EMAIL_HEADERS = ['email', 'e-mail', 'dia chi email', 'gmail'];
const PASSWORD_HEADERS = ['mat khau', 'password', 'pass'];

function cellText(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

/** Validates ONE row in isolation (no duplicate check). */
function rowIssue(row: RosterInputRow): RosterRowIssue | null {
  if (row.name === '' || row.name.length > MAX_NAME_LENGTH) return 'nameRequired';
  if (!EMAIL_RE.test(row.email) || row.email.length > MAX_EMAIL_LENGTH) return 'emailInvalid';
  if (
    row.password !== '' &&
    (row.password.length < CLASS_ROSTER_MIN_PASSWORD_LENGTH || row.password.length > MAX_PASSWORD_LENGTH)
  ) {
    return 'passwordInvalid';
  }
  return null;
}

/**
 * Checks every row: required name, email format, password length, and duplicate emails within
 * the list (the FIRST row with an email is fine, later ones are flagged — the server does the
 * same). Emails are compared case-insensitively.
 */
export function checkRosterRows(rows: RosterInputRow[]): CheckedRosterRow[] {
  const firstRowOfEmail = new Map<string, number>();
  return rows.map((row) => {
    const email = row.email.trim().toLowerCase();
    const normalized: RosterInputRow = { ...row, name: row.name.trim(), email };
    const issue = rowIssue(normalized);
    if (issue !== null) return { ...normalized, issue, duplicateOfRow: null };
    const firstRow = firstRowOfEmail.get(email);
    if (firstRow !== undefined) {
      return { ...normalized, issue: 'duplicateInFile' as const, duplicateOfRow: firstRow };
    }
    firstRowOfEmail.set(email, row.row);
    return { ...normalized, issue: null, duplicateOfRow: null };
  });
}

/**
 * Reads an uploaded `.xlsx`/`.xls` File into roster rows. The first non-blank row is the header;
 * it must contain a name column ("Họ tên") and an email column ("Email"), the password column is
 * optional. Rows are returned as typed (trimmed); run `checkRosterRows` for validation.
 */
export async function parseRosterFile(file: File): Promise<RosterInputRow[]> {
  const buffer = await file.arrayBuffer();

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'array' });
  } catch {
    throw new RosterParseError('unreadable');
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new RosterParseError('noSheet');

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  // `sheet_to_json` numbers rows from the sheet's first used row; add its offset so the
  // reported row number matches what Excel shows in its row margin.
  const firstUsedRow = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']).s.r : 0;
  const isBlank = (row: unknown[] | undefined) => !row || row.every((cell) => cellText(cell) === '');

  const headerIndex = rows.findIndex((row) => !isBlank(row));
  if (headerIndex === -1) throw new RosterParseError('noHeaderRow');

  const columns = { name: -1, email: -1, password: -1 };
  rows[headerIndex].forEach((headerCell, index) => {
    const header = normalizeHeader(cellText(headerCell));
    // First match wins on a duplicated header, like the flashcard import.
    if (columns.name === -1 && NAME_HEADERS.includes(header)) columns.name = index;
    else if (columns.email === -1 && EMAIL_HEADERS.includes(header)) columns.email = index;
    else if (columns.password === -1 && PASSWORD_HEADERS.includes(header)) columns.password = index;
  });
  if (columns.name === -1 || columns.email === -1) throw new RosterParseError('missingColumns');

  const parsed: RosterInputRow[] = [];
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    if (isBlank(row)) return; // trailing blank rows are common in a hand-edited sheet
    parsed.push({
      row: firstUsedRow + headerIndex + offset + 2, // 0-based -> 1-based, +1 to skip the header
      name: cellText(row[columns.name]),
      email: cellText(row[columns.email]).toLowerCase(),
      password: columns.password === -1 ? '' : cellText(row[columns.password]),
    });
  });

  if (parsed.length === 0) throw new RosterParseError('noDataRows');
  if (parsed.length > CLASS_ROSTER_BULK_MAX_ROWS) throw new RosterParseError('tooManyRows');
  return parsed;
}

/** Characters Windows/macOS do not allow in a file name, plus control characters. */
function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'file';
}

function downloadSheet(
  rows: string[][],
  sheetName: string,
  fileBaseName: string,
  columnWidths: number[],
): void {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = columnWidths.map((wch) => ({ wch }));
  const workbook = XLSX.utils.book_new();
  // Sheet names are capped at 31 characters and cannot contain : \ / ? * [ ].
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName.replace(/[:\\/?*[\]]/g, '_').slice(0, 31) || 'Sheet1');
  XLSX.writeFile(workbook, `${sanitizeFileName(fileBaseName)}.xlsx`);
}

export interface RosterTemplateLabels {
  sheetName: string;
  nameHeader: string;
  emailHeader: string;
  passwordHeader: string;
  /** File name without the extension. */
  fileBaseName: string;
}

/** Downloads the blank template: just the header row, so the teacher sees the exact columns. */
export function downloadRosterTemplate(labels: RosterTemplateLabels): void {
  downloadSheet(
    [[labels.nameHeader, labels.emailHeader, labels.passwordHeader]],
    labels.sheetName,
    labels.fileBaseName,
    [28, 34, 26],
  );
}

export interface CredentialRow {
  name: string;
  email: string;
  password: string;
}

export interface CredentialsLabels {
  sheetName: string;
  nameHeader: string;
  emailHeader: string;
  passwordHeader: string;
}

/** Downloads the created accounts with their passwords, so the teacher can hand them out.
 * `fileBaseName` is the name without the extension (it should contain the class name). */
export function downloadCredentialsXlsx(
  accounts: CredentialRow[],
  labels: CredentialsLabels,
  fileBaseName: string,
): void {
  downloadSheet(
    [
      [labels.nameHeader, labels.emailHeader, labels.passwordHeader],
      ...accounts.map((account) => [account.name, account.email, account.password]),
    ],
    labels.sheetName,
    fileBaseName,
    [28, 34, 18],
  );
}
