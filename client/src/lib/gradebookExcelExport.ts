/**
 * Client-side Excel (SheetJS `xlsx`) export of the class gradebook (T-104, reworked in Phase 15 for
 * the office-ready sheet a teacher hands in): the "Tải bảng điểm (Excel)" button on the "Điểm số"
 * tab. Like the T-085 flashcard import (`flashcardExcelImport.ts`) everything happens in the browser
 * from data the tab already loaded — no server round trip, no new endpoint.
 *
 * Layout (top to bottom):
 *   BẢNG ĐIỂM / Lớp: … / Học kỳ: … / Ngày xuất: dd/mm/yyyy / Thang điểm: 10 / (blank row)
 *   STT | Họ và tên | <one column per test> | Điểm trung bình [| Ghi chú]
 *   (blank) | Trạng thái điểm | "Đã cho xem" / "Chưa cho xem" per test        <- was a header suffix
 *   1 | <student> | 8.5 | "Chưa nộp" | … | 8.5
 *   …
 *   (blank) | Trung bình cả lớp | <column averages>
 *
 * Every score is a real NUMBER on the thang điểm 10 with one decimal (cell format `0.0`, so Excel in
 * Vietnamese shows "8,5"), never a percent or text, so it can be summed/sorted. A student who has not
 * submitted a test gets the TEXT "Chưa nộp" (a blank looked like a forgotten mark). A provisional score
 * (an essay still ungraded) stays a number and is flagged in the extra "Ghi chú" column, which is only
 * added when at least one cell is provisional.
 */

import * as XLSX from 'xlsx';
import type { ClassGradebookDTO } from '@platform/shared';
import { percentToScore10 } from './scoreFormat';

export interface GradebookExportLabels {
  sheetName: string;
  /** "BẢNG ĐIỂM" */
  title: string;
  /** Already formatted, e.g. "Lớp: 9A". */
  classLine: string;
  /** e.g. "Học kỳ: Học kì 1". */
  semesterLine: string;
  /** e.g. "Ngày xuất: 21/09/2026". */
  exportDateLine: string;
  /** "Thang điểm: 10" — every score below is out of 10, spelled out once for whoever reads the
   * sheet later (T-114 round 2: a printed sheet with no header context reads as a raw number). */
  scaleLine: string;
  sttHeader: string;
  studentHeader: string;
  averageHeader: string;
  noteHeader: string;
  /** "Chưa nộp" — text in the cell of a test the student has not handed in. */
  notSubmitted: string;
  /** "Tạm tính (còn bài viết chưa chấm)" — the titles of the tests concerned are appended after ": ". */
  provisionalNote: string;
  /** "Trạng thái điểm" — the label of the row under the header. */
  statusRowLabel: string;
  released: string;
  notReleased: string;
  /** "Trung bình cả lớp" */
  classAverageLabel: string;
}

/** A spreadsheet row: text for labels, number for scores/averages, `null` for an empty cell. */
export type GradebookSheetRow = Array<string | number | null>;

/** Cell format of every score: one decimal. */
const SCORE_FORMAT = '0.0';

/** The sheet as an array-of-arrays. Pure — exported so the row/column mapping can be checked without
 * a browser download. Score cells are numbers on the thang điểm 10. */
export function buildGradebookRows(gradebook: ClassGradebookDTO, labels: GradebookExportLabels): GradebookSheetRow[] {
  const cellFor = (studentId: string, testId: string) => gradebook.cells[studentId]?.[testId] ?? null;
  const provisionalTitlesOf = (studentId: string) =>
    gradebook.tests.filter((test) => cellFor(studentId, test.id)?.provisional).map((test) => test.title);
  const hasNoteColumn = gradebook.students.some((student) => provisionalTitlesOf(student.id).length > 0);

  const header: GradebookSheetRow = [
    labels.sttHeader,
    labels.studentHeader,
    ...gradebook.tests.map((test) => test.title),
    labels.averageHeader,
    ...(hasNoteColumn ? [labels.noteHeader] : []),
  ];

  const statusRow: GradebookSheetRow = [
    null,
    labels.statusRowLabel,
    ...gradebook.tests.map((test) => (test.scoresPublished ? labels.released : labels.notReleased)),
    null,
    ...(hasNoteColumn ? [null] : []),
  ];

  const studentRows = gradebook.students.map((student, index): GradebookSheetRow => {
    const average = gradebook.studentAverages[student.id] ?? null;
    const provisionalTitles = provisionalTitlesOf(student.id);
    return [
      index + 1,
      student.name,
      ...gradebook.tests.map((test) => {
        const cell = cellFor(student.id, test.id);
        return cell ? percentToScore10(cell.scorePercent) : labels.notSubmitted;
      }),
      average === null ? labels.notSubmitted : percentToScore10(average),
      ...(hasNoteColumn
        ? [provisionalTitles.length > 0 ? `${labels.provisionalNote}: ${provisionalTitles.join(', ')}` : null]
        : []),
    ];
  });

  const averageRow: GradebookSheetRow = [
    null,
    labels.classAverageLabel,
    ...gradebook.tests.map((test) => {
      const average = gradebook.testAverages[test.id] ?? null;
      return average === null ? '—' : percentToScore10(average);
    }),
    null,
    ...(hasNoteColumn ? [null] : []),
  ];

  return [
    [labels.title],
    [labels.classLine],
    [labels.semesterLine],
    [labels.exportDateLine],
    [labels.scaleLine],
    [],
    header,
    statusRow,
    ...studentRows,
    averageRow,
  ];
}

/** Characters Windows/macOS do not allow in a file name, plus control characters. */
function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'gradebook';
}

/** The workbook (one sheet) for a gradebook. Pure apart from SheetJS itself; used by
 * `downloadGradebookXlsx` and by anything that wants the file content without a browser download. */
export function buildGradebookWorkbook(gradebook: ClassGradebookDTO, labels: GradebookExportLabels): XLSX.WorkBook {
  const rows = buildGradebookRows(gradebook, labels);
  const sheet = XLSX.utils.aoa_to_sheet(rows);

  // One decimal on every numeric score cell.
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith('!')) continue;
    const typed = cell as XLSX.CellObject;
    if (typed.t === 'n') typed.z = SCORE_FORMAT;
  }

  // Column widths: STT narrow, names wide, test columns as wide as their title (within limits).
  // These ARE written into the file's real column metadata (OOXML `<cols>`) and any spreadsheet
  // app (Excel, LibreOffice, Google Sheets) honours them when it opens the file — `xlsx`'s own
  // `readFile` just does not surface `!cols` back into its in-memory sheet object by default, so
  // a script that reads the file back with this same library can look like the widths are
  // missing when they are not (confirmed by inspecting the written `xl/worksheets/sheet1.xml`
  // directly — the `<cols>` element with real `width` attributes is there). Verify with a real
  // spreadsheet app, not `XLSX.readFile(...).Sheets[...]['!cols']`, if this is ever in doubt.
  const headerRow = rows[6];
  sheet['!cols'] = headerRow.map((value, index) => {
    if (index === 0) return { wch: 6 };
    if (index === 1) return { wch: 28 };
    const text = String(value ?? '');
    if (index === headerRow.length - 1 && text === labels.noteHeader) return { wch: 46 };
    return { wch: Math.min(Math.max(text.length + 2, 14), 32) };
  });

  const workbook = XLSX.utils.book_new();
  // Sheet names are capped at 31 characters and cannot contain : \ / ? * [ ].
  const sheetName = labels.sheetName.replace(/[:\\/?*[\]]/g, '_').slice(0, 31) || 'Gradebook';
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return workbook;
}

/** Builds the workbook and triggers the browser download. `fileBaseName` is the name without
 * extension (it should contain the class name). Returns the file name that was offered
 * (with the ".xlsx" extension) so the page can tell the teacher what to look for. */
export function downloadGradebookXlsx(
  gradebook: ClassGradebookDTO,
  labels: GradebookExportLabels,
  fileBaseName: string,
): string {
  const fileName = `${sanitizeFileName(fileBaseName)}.xlsx`;
  XLSX.writeFile(buildGradebookWorkbook(gradebook, labels), fileName);
  return fileName;
}
