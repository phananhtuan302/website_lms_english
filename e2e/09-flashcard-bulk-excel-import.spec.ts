import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';
import { newTeacherContext, uniqueTitle } from './utils';

/**
 * T-085: bulk-import flashcard cards from an uploaded Excel file, through the real UI
 * (`TeacherFlashcardSetEditorPage.tsx`'s new "Import from Excel" panel).
 *
 * Builds a small `.xlsx` fixture entirely IN-MEMORY at test time (via the same `xlsx`
 * library the app itself uses to parse it), rather than checking in a static binary
 * fixture file under `e2e/fixtures/` — there's no reason to version-control a binary
 * spreadsheet for three rows of text when the exact row data can sit right next to the
 * assertions that check it, and `page.setInputFiles` accepts an in-memory buffer directly
 * with no temp file needed on disk.
 *
 * One row is deliberately malformed (missing `meaning`) to prove T-085's partial-success
 * behavior end-to-end: the two good rows must show up as real, saved cards, and the bad
 * row must be reported as an error (both in the client-side pre-upload preview AND in the
 * server's own post-upload result) and must NEVER be silently created as a broken/empty
 * card — the exact "don't trust client validation alone, but don't punish the whole file
 * for one bad row either" behavior the bulk route's own doc comment documents.
 *
 * Uses a brand-new, uniquely-titled flashcard set (via `uniqueTitle`) rather than the
 * shared seeded "Seed Demo Vocabulary Set" — same "don't collide with
 * `02-flashcard-and-exercise.spec.ts`'s own use of that exact seeded set" reasoning every
 * other spec in this suite already follows for its own freshly-authored content.
 */
test('teacher bulk-imports flashcard cards from an uploaded Excel file, with one malformed row reported and skipped', async ({
  browser,
  baseURL,
}) => {
  const teacherContext = await newTeacherContext(browser, baseURL!);
  const page = await teacherContext.newPage();

  try {
    const setTitle = uniqueTitle('T-085 Bulk Import Set');

    await page.goto('/teacher/flashcard-sets');
    await page.getByLabel('New set name').fill(setTitle);
    await page.getByRole('button', { name: 'Create set' }).click();
    await page.waitForURL(/\/teacher\/flashcard-sets\/[a-zA-Z0-9-]+$/);

    // Header row + 3 data rows (spreadsheet rows 2-4) — row 3 ("zebra") is deliberately
    // missing `meaning`, the one other required field alongside `term`.
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['term', 'meaning', 'ipa', 'imageUrl', 'audioUrl', 'exampleSentence', 'synonyms', 'antonyms'],
      ['xylophone', 'a musical instrument with wooden bars', '', '', '', '', 'marimba', ''],
      ['zebra', '', '', '', '', '', '', ''],
      ['yarn', 'thread used for knitting', '', '', '', 'She knitted a scarf with ___.', '', ''],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Cards');
    const fileBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    await page.getByLabel('Choose Excel file (.xlsx, .xls)').setInputFiles({
      name: 'bulk-import-fixture.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: fileBuffer,
    });

    // Client-side preview (before any network call): 2 valid rows, 1 flagged with its
    // specific, actionable reason.
    await expect(page.getByText('2 rows will be imported')).toBeVisible();
    await expect(page.getByText('Row 3: meaning is required')).toBeVisible();

    await page.getByRole('button', { name: 'Import 2 cards' }).click();

    // Server's own independent re-validation result (source of truth, not just an echo of
    // the client-side preview).
    await expect(page.getByText('2 cards imported.')).toBeVisible();

    // The two valid rows are real, saved cards now — card term/meaning render as
    // controlled <input value=...> in `FlashcardCardEditor.tsx`, not plain text nodes, so
    // assert on the input's value attribute (same convention as `e2e/utils.ts`'s
    // `createTestWithQuestion` waiting on `input[value="..."]` for an editable section title).
    await expect(page.locator('input[value="xylophone"]')).toBeVisible();
    await expect(page.locator('input[value="yarn"]')).toBeVisible();

    // The malformed row was never silently created as a broken/empty card.
    await expect(page.locator('input[value="zebra"]')).toHaveCount(0);

    // Reload to confirm the two cards actually persisted server-side, not just optimistic
    // local state from the bulk-import response.
    await page.reload();
    await expect(page.locator('input[value="xylophone"]')).toBeVisible();
    await expect(page.locator('input[value="yarn"]')).toBeVisible();
    await expect(page.locator('input[value="zebra"]')).toHaveCount(0);
  } finally {
    await teacherContext.close();
  }
});
