/**
 * Client-side Excel (SheetJS `xlsx`) export of the class gradebook (T-104): the "Xuất Excel"
 * button on the "Điểm số" tab. Like the T-085 flashcard import (`flashcardExcelImport.ts`)
 * everything happens in the browser from data the tab already loaded — no server round trip,
 * no new endpoint.
 *
 * Layout mirrors the on-screen grid exactly: one row per student, one column per test (header =
 * the test title, with a "not published" note when its scores are still hidden from students),
 * a trailing "Average" column, and a trailing "Average" row. A score is written as a plain
 * NUMBER (percent, e.g. `85.7`) so the teacher can sort/compute on it in Excel; a student who
 * has not submitted a test gets an EMPTY cell (the grid shows "—" for the same state).
 */

import * as XLSX from 'xlsx';
import type { ClassGradebookDTO } from '@platform/shared';

export interface GradebookExportLabels {
  sheetName: string;
  studentHeader: string;
  averageHeader: string;
  /** Appended to a test's header when its scores are not published yet, e.g. "chưa công bố điểm". */
  unpublishedSuffix: string;
}

/** A spreadsheet row: text for labels, number for scores/averages, `null` for an empty cell. */
export type GradebookSheetRow = Array<string | number | null>;

/** The sheet as an array-of-arrays (header row, one row per student, average row). Pure —
 * exported so the row/column mapping can be checked without a browser download. */
export function buildGradebookRows(
  gradebook: ClassGradebookDTO,
  labels: GradebookExportLabels,
): GradebookSheetRow[] {
  const header: GradebookSheetRow = [
    labels.studentHeader,
    ...gradebook.tests.map((test) =>
      test.scoresPublished ? test.title : `${test.title} (${labels.unpublishedSuffix})`,
    ),
    labels.averageHeader,
  ];

  const studentRows = gradebook.students.map((student): GradebookSheetRow => [
    student.name,
    ...gradebook.tests.map((test) => gradebook.cells[student.id]?.[test.id]?.scorePercent ?? null),
    gradebook.studentAverages[student.id] ?? null,
  ]);

  const averageRow: GradebookSheetRow = [
    labels.averageHeader,
    ...gradebook.tests.map((test) => gradebook.testAverages[test.id] ?? null),
    null,
  ];

  return [header, ...studentRows, averageRow];
}

/** Characters Windows/macOS do not allow in a file name, plus control characters. */
function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'gradebook';
}

/** Builds the workbook and triggers the browser download. `fileBaseName` is the name without
 * extension (it should contain the class name). */
export function downloadGradebookXlsx(
  gradebook: ClassGradebookDTO,
  labels: GradebookExportLabels,
  fileBaseName: string,
): void {
  const rows = buildGradebookRows(gradebook, labels);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = rows[0].map((_, index) => ({ wch: index === 0 ? 28 : 16 }));

  const workbook = XLSX.utils.book_new();
  // Sheet names are capped at 31 characters and cannot contain : \ / ? * [ ].
  const sheetName = labels.sheetName.replace(/[:\\/?*[\]]/g, '_').slice(0, 31) || 'Gradebook';
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  XLSX.writeFile(workbook, `${sanitizeFileName(fileBaseName)}.xlsx`);
}
