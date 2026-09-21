import type { ClassAssignmentScheduleDTO, TeacherContentType, TestType } from '@platform/shared';
import { teacherApi } from './teacherApi';
import { classTabPath } from './classWorkspace';

/**
 * Plain helpers shared by the class "Bài tập" tab, its "Giao bài mới" dialog and the
 * class-embedded results / vocabulary-check pages (T-103, Phase 13). Kept out of the
 * component files so those only export components (react-refresh lint rule) and so every
 * caller builds class-scoped URLs and reads/writes assignments the same way.
 */

// --- URLs ------------------------------------------------------------------------------

/** The Bài tập tab of a class. */
export function classAssignmentsPath(classId: string): string {
  return classTabPath(classId, 'assignments');
}

/** A test's results page INSIDE the class workspace (class locked from the route). */
export function classTestResultsPath(classId: string, testId: string): string {
  return `${classTabPath(classId, 'tests')}/${encodeURIComponent(testId)}/results`;
}

/** The Vocabulary Check page inside the class workspace (roster defaults to the class). */
export function classVocabularyChecksPath(classId: string): string {
  return classTabPath(classId, 'vocabulary-checks');
}

/** The Library editor for one item, by content type. */
export function contentEditorPath(type: TeacherContentType, id: string): string {
  const segment =
    type === 'test' ? 'tests' : type === 'flashcardSet' ? 'flashcard-sets' : 'grammar-topics';
  return `/teacher/${segment}/${encodeURIComponent(id)}`;
}

// --- Labels ----------------------------------------------------------------------------

/** i18n key (under `classAssignments.types`) of the readable badge for each `testType`. */
export const TEST_TYPE_LABEL_KEYS: Record<TestType, string> = {
  generic: 'classAssignments.types.generic',
  unitTest: 'classAssignments.types.unitTest',
  vocabularyCheck: 'classAssignments.types.vocabularyCheck',
  listeningTest: 'classAssignments.types.listeningTest',
  mockTest: 'classAssignments.types.mockTest',
};

// --- Schedule window -------------------------------------------------------------------

export type AssignmentWindowState = 'unlimited' | 'upcoming' | 'open' | 'closed';

/**
 * Where a test currently sits relative to its class schedule — mirrors the server's
 * `checkAttemptWindow` (`openAt` checked first, then `closeAt`) so the badge a teacher sees
 * matches what a student's start attempt would be told. No row, or a row with neither date =
 * "unlimited". `open` covers both "window is open now" and "opened with no close time".
 */
export function scheduleWindowState(
  schedule: Pick<ClassAssignmentScheduleDTO, 'openAt' | 'closeAt'> | null,
  now: Date = new Date(),
): AssignmentWindowState {
  if (!schedule || (!schedule.openAt && !schedule.closeAt)) return 'unlimited';
  if (schedule.openAt && now < new Date(schedule.openAt)) return 'upcoming';
  if (schedule.closeAt && now > new Date(schedule.closeAt)) return 'closed';
  return 'open';
}

export function formatDateTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
}

/** A moment → the local `datetime-local` input value (`YYYY-MM-DDTHH:mm`). */
export function dateToDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A `datetime-local` input value → ISO string, or `null` for empty / unparsable input. */
export function datetimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// --- Assign / remove (read-modify-write) -----------------------------------------------

/**
 * Adds `classId` to (or removes it from) ONE item's set of assigned classes, leaving every
 * other class of that item exactly as it was.
 *
 * Why read-modify-write: the three `PUT .../:id/classes` endpoints REPLACE the item's whole
 * class set (for every one of the teacher's classes at its current semester). Sending only
 * `[thisClass]` would silently un-assign the item from every OTHER class. So this first reads
 * the item's current set (`GET .../:id/classes`), changes just this class, and writes the
 * result back. Idempotent: asking for the state the item is already in is a no-op (no write).
 * Throws whatever the API throws (an `ApiError` with a readable message) — callers report
 * failures per item.
 */
export async function setClassAssignment(
  type: TeacherContentType,
  id: string,
  classId: string,
  assigned: boolean,
): Promise<void> {
  const read =
    type === 'test'
      ? teacherApi.getTestClasses
      : type === 'flashcardSet'
        ? teacherApi.getFlashcardSetClasses
        : teacherApi.getGrammarTopicClasses;
  const write =
    type === 'test'
      ? teacherApi.updateTestClasses
      : type === 'flashcardSet'
        ? teacherApi.updateFlashcardSetClasses
        : teacherApi.updateGrammarTopicClasses;

  const { classIds } = await read(id);
  if (classIds.includes(classId) === assigned) return;
  await write(id, {
    classIds: assigned ? [...classIds, classId] : classIds.filter((existing) => existing !== classId),
  });
}
