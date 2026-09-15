/**
 * Client-side Excel (SheetJS `xlsx`) parsing for the T-085 bulk flashcard-card import,
 * used by `TeacherFlashcardSetEditorPage.tsx`. Parsing happens entirely in the browser —
 * the raw file is never uploaded anywhere (this codebase has never used multipart/file
 * uploads, see `apiClient.ts`'s doc comment on why every request is plain JSON); only the
 * parsed rows get sent, as ordinary JSON, to `teacherApi.bulkAddFlashcardCards`.
 *
 * Column mapping (T-085's acceptance criteria): header row required, matched
 * case-insensitively against `FLASHCARD_IMPORT_COLUMNS` below. `term`/`meaning` are
 * required columns; the rest are optional. `synonyms`/`antonyms` are each a single
 * comma-separated cell, split+trimmed into a string array — the same shape
 * `FlashcardCardEditor.tsx`'s own `splitList` already produces for the one-at-a-time
 * editor, reused here (as a literal copy, not an import — `FlashcardCardEditor.tsx` isn't
 * a shared-logic module) for behavioral consistency between the two ways of entering a
 * card's synonyms/antonyms.
 */

import * as XLSX from 'xlsx';
import type { FlashcardCardInput } from '@platform/shared';

export const FLASHCARD_IMPORT_COLUMNS = [
  'term',
  'meaning',
  'ipa',
  'imageUrl',
  'audioUrl',
  'exampleSentence',
  'synonyms',
  'antonyms',
] as const;

type FlashcardImportColumn = (typeof FLASHCARD_IMPORT_COLUMNS)[number];

const REQUIRED_COLUMNS: readonly FlashcardImportColumn[] = ['term', 'meaning'];

function splitList(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** One parsed spreadsheet row, still carrying its original 1-based spreadsheet row number
 * (header row is row 1, so the first data row is row 2) — every later error report, both
 * this module's own client-side validation and the server's independent per-row errors,
 * needs to point the teacher at the exact row to fix in their original file. */
export interface ParsedFlashcardImportRow {
  row: number;
  data: FlashcardCardInput;
}

/** Thrown for FILE-level problems (unreadable file, no header row, a missing REQUIRED
 * column) — these abort the whole import before any row is even looked at, since there's
 * nothing sensible to validate per-row if the file doesn't have a `term`/`meaning` column
 * at all. Row-level problems (a required CELL left blank on one otherwise-fine row) are
 * NOT this — see `validateFlashcardImportRow` — mirroring the server's own split between
 * "malformed request, 400 before the row loop starts" and "this one row failed
 * validation" in `teacherFlashcards.routes.ts`'s bulk route. */
export class FlashcardImportParseError extends Error {}

/**
 * Reads an uploaded `.xlsx`/`.xls` File and maps it to `FlashcardCardInput` rows.
 *
 * Uses `{ header: 1 }` (raw row arrays) rather than `sheet_to_json`'s default
 * object-per-row mode specifically so column matching can be done case-insensitively
 * against the real header cell text, and so every row (including a blank one in the
 * middle of the sheet) keeps its true position for row-number reporting — the default
 * object mode's handling of duplicate/blank headers would make both of those harder for
 * no benefit here.
 */
export async function parseFlashcardImportFile(file: File): Promise<ParsedFlashcardImportRow[]> {
  const buffer = await file.arrayBuffer();

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'array' });
  } catch {
    throw new FlashcardImportParseError('parseError.unreadable');
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) {
    throw new FlashcardImportParseError('parseError.noSheet');
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  const [headerRow, ...dataRows] = rows;
  if (!headerRow || headerRow.length === 0) {
    throw new FlashcardImportParseError('parseError.noHeaderRow');
  }

  const columnIndex = new Map<FlashcardImportColumn, number>();
  headerRow.forEach((headerCell, index) => {
    const normalized = String(headerCell ?? '').trim().toLowerCase();
    const match = FLASHCARD_IMPORT_COLUMNS.find((col) => col.toLowerCase() === normalized);
    // First match wins on a duplicate header, same "don't error, just be deterministic"
    // spirit as the rest of this parser — a malformed header is reported at the
    // MISSING-required-column check below, not by trying to detect every possible way a
    // header row could be odd.
    if (match && !columnIndex.has(match)) {
      columnIndex.set(match, index);
    }
  });

  const missingRequired = REQUIRED_COLUMNS.filter((col) => !columnIndex.has(col));
  if (missingRequired.length > 0) {
    throw new FlashcardImportParseError('parseError.missingColumns');
  }

  function cellText(row: unknown[], col: FlashcardImportColumn): string {
    const index = columnIndex.get(col);
    if (index === undefined) return '';
    const value = row[index];
    return value === undefined || value === null ? '' : String(value).trim();
  }

  const parsed: ParsedFlashcardImportRow[] = [];
  dataRows.forEach((row, offset) => {
    // Skip fully-blank rows (common trailing rows in a hand-edited spreadsheet) instead
    // of reporting them as an error — there is no data on the row to fail validation on.
    const isBlank = !row || row.every((c) => c === undefined || c === null || String(c).trim() === '');
    if (isBlank) return;

    const synonyms = cellText(row, 'synonyms');
    const antonyms = cellText(row, 'antonyms');
    const ipa = cellText(row, 'ipa');
    const imageUrl = cellText(row, 'imageUrl');
    const audioUrl = cellText(row, 'audioUrl');
    const exampleSentence = cellText(row, 'exampleSentence');

    parsed.push({
      row: offset + 2, // +1 to convert 0-based offset to 1-based, +1 for the header row.
      data: {
        term: cellText(row, 'term'),
        meaning: cellText(row, 'meaning'),
        ipa: ipa || null,
        imageUrl: imageUrl || null,
        audioUrl: audioUrl || null,
        exampleSentence: exampleSentence || null,
        synonyms: splitList(synonyms),
        antonyms: splitList(antonyms),
      },
    });
  });

  return parsed;
}

/** The exact same three rules `validateCardBody` enforces server-side
 * (`server/src/routes/teacherFlashcards.routes.ts`), re-stated here rather than imported
 * — `shared/` only carries plain types/constants across the client/server boundary, never
 * route-adjacent validation functions, and the server's own copy remains the source of
 * truth regardless: EVERY row is independently re-validated server-side too when the
 * import is actually submitted (T-085's "never trust client-side validation alone" rule).
 * This client-side pass exists purely so a teacher gets instant feedback on obvious
 * mistakes before any network call, not as a substitute for that server re-check.
 *
 * Returns an i18n key (not a literal message), unlike the server's raw English `error`
 * string, so the caller can render it in the site's current admin-controlled language. */
export type FlashcardImportRowErrorKey = 'termRequired' | 'meaningRequired' | 'exampleSentenceMarker';

export function validateFlashcardImportRow(data: FlashcardCardInput): FlashcardImportRowErrorKey | null {
  if (typeof data.term !== 'string' || data.term.trim() === '') return 'termRequired';
  if (typeof data.meaning !== 'string' || data.meaning.trim() === '') return 'meaningRequired';
  if (data.exampleSentence != null) {
    if (typeof data.exampleSentence !== 'string' || !data.exampleSentence.includes('___')) {
      return 'exampleSentenceMarker';
    }
  }
  return null;
}

/**
 * Downloadable `.xlsx` template (T-085) — just the header row, so a teacher knows the
 * exact expected column names before filling one in. Generated client-side with the same
 * `xlsx` library used for parsing, from the single `FLASHCARD_IMPORT_COLUMNS` source of
 * truth above (rather than a static asset file that could silently drift out of sync with
 * the columns this module actually reads).
 */
export function downloadFlashcardImportTemplate(filename = 'flashcard-import-template.xlsx'): void {
  const worksheet = XLSX.utils.aoa_to_sheet([[...FLASHCARD_IMPORT_COLUMNS]]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cards');
  XLSX.writeFile(workbook, filename);
}
