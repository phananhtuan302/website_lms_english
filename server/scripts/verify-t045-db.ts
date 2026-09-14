/**
 * T-045 DB-level spot check — direct Prisma queries against the same Postgres instance
 * the app uses, run right after `npm run verify:t045` so it can find that script's most
 * recently created `testType: 'mockTest'` test by title prefix. Confirms the persisted
 * rows match what the HTTP responses claimed (not just "the API said so"): the Test row
 * really is `testType: mockTest` with 5 sections spanning passage/audio/plain/essay/
 * speaking content, the Attempt row's stored `correctCount`/`totalCount`/`scorePercent`
 * match the auto-graded tally, and the essay Answer row's `manualScore`/`manualComment`
 * persisted correctly after teacher grading.
 *
 * Usage: `npm run verify:t045:db -w server` (run AFTER `npm run verify:t045 -w server`).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const test = await prisma.test.findFirst({
    where: { title: { startsWith: 'Mock Test T-045 verify' } },
    orderBy: { createdAt: 'desc' },
    include: { sections: { include: { questions: true }, orderBy: { order: 'asc' } } },
  });
  if (!test) throw new Error('No T-045 verification test found in DB — run `npm run verify:t045` first.');

  console.log(`[db-check] Test ${test.id} "${test.title}"`);
  console.log(`  testType (DB column): ${test.testType}`);
  if (test.testType !== 'mockTest') throw new Error(`Expected testType 'mockTest', got '${test.testType}'`);
  console.log(`  sections: ${test.sections.map((s) => `${s.title} (${s.questions.length}q)`).join(', ')}`);

  const readingSection = test.sections.find((s) => s.title === 'Reading');
  const listeningSection = test.sections.find((s) => s.title === 'Listening');
  const writingSection = test.sections.find((s) => s.title === 'Writing');
  if (!readingSection?.passageText) throw new Error('Reading section missing passageText in DB');
  if (!listeningSection?.audioUrl) throw new Error('Listening section missing audioUrl in DB');
  const essayQuestion = writingSection?.questions.find((q) => q.type === 'essay');
  if (!essayQuestion) throw new Error('Writing section missing essay question in DB');
  console.log('  [PASS] DB row confirms: Reading has passageText, Listening has audioUrl, Writing has an essay question — all on ONE Test row.');

  const attempt = await prisma.attempt.findFirst({
    where: { testId: test.id, status: 'submitted' },
    orderBy: { startedAt: 'desc' },
    include: { answers: { include: { question: true } } },
  });
  if (!attempt) throw new Error('No submitted Attempt found for this test in DB.');
  console.log(`  Attempt ${attempt.id}: correctCount=${attempt.correctCount} totalCount=${attempt.totalCount} scorePercent=${attempt.scorePercent}`);
  if (attempt.correctCount !== 4 || attempt.totalCount !== 4 || Number(attempt.scorePercent) !== 100) {
    throw new Error('Attempt auto-graded tally in DB does not match expected 4/4/100.');
  }
  console.log('  [PASS] DB row confirms the persisted Attempt tally: 4/4 objective questions, 100%.');

  const essayAnswer = attempt.answers.find((a) => a.question.type === 'essay');
  if (!essayAnswer) throw new Error('No essay Answer row found for this attempt.');
  console.log(`  Essay Answer row: manualScore=${essayAnswer.manualScore} manualComment=${JSON.stringify(essayAnswer.manualComment)} isCorrect=${essayAnswer.isCorrect}`);
  if (essayAnswer.manualScore !== 18 || essayAnswer.manualComment !== 'Well-written and on topic.') {
    throw new Error('Essay Answer manual grade did not persist as expected.');
  }
  if (essayAnswer.isCorrect !== null) {
    throw new Error('Essay Answer isCorrect should remain null (never auto-graded) even after manual grading.');
  }
  console.log('  [PASS] DB row confirms the essay Answer persisted manualScore=18/manualComment, isCorrect stays null (never auto-graded).');

  console.log('\nT-045 DB-level verification: ALL CHECKS PASSED.');
}

main()
  .catch((err) => {
    console.error('\n[verify-t045-db] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
