/**
 * T-028/T-029/T-034/T-035 verification script — REAL REST calls against an
 * already-running dev server + Postgres (same convention as `verify-reporting.ts`),
 * plus direct Prisma reads to confirm `FlashcardProgress`/`VocabSentenceSubmission`
 * rows actually land correctly. Covers what a browser-driven Playwright pass would be
 * slow/awkward to assert precisely (eligibility-filtered lists, exact DB state), per
 * PROJECT_PLAN Section 8's "verify primarily via direct HTTP/API + DB queries" velocity
 * mode. The one real-browser pass is reserved for actually playing the games/rounds
 * end to end.
 *
 * Usage: start the dev server first (`npm run dev:server` from the repo root, or the
 * root `npm run dev`), then `npm run verify:vocab-batch -w server`. Requires the seeded
 * teacher account (`prisma/seed.ts`) and its demo flashcard set.
 */

import { PrismaClient } from '@prisma/client';

const API = 'http://localhost:4000';
const prisma = new PrismaClient();

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  [pass] ${label}`);
  } else {
    failures += 1;
    console.error(`  [FAIL] ${label}`, detail ?? '');
  }
}

async function api<T>(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : undefined;
  return { status: res.status, body: parsed as T };
}

async function main() {
  console.log('=== Login as seeded teacher ===');
  const teacherLogin = await api<{ token: string }>('POST', '/api/auth/login', null, {
    email: process.env.SEED_TEACHER_EMAIL ?? 'teacher@example.com',
    password: process.env.SEED_TEACHER_PASSWORD ?? 'teacher-dev-password123',
  });
  check('teacher login succeeds', teacherLogin.status === 200, teacherLogin);
  const teacherToken = teacherLogin.body.token;

  const sets = await api<Array<{ id: string; name: string }>>(
    'GET',
    '/api/teacher/flashcard-sets',
    teacherToken,
  );
  const demoSet = sets.body.find((s) => s.name.startsWith('Seed Demo Vocabulary Set'));
  check('demo flashcard set found', !!demoSet, sets.body);
  const setId = demoSet!.id;

  console.log('\n=== Register/login a fresh verification student ===');
  const studentEmail = `vocab-batch-verify-${Date.now()}@example.com`;
  const register = await api('POST', '/api/auth/register', null, {
    email: studentEmail,
    password: 'student-dev-password123',
    name: 'Vocab Batch Verify Student',
  });
  check('student registration succeeds', register.status === 201, register);
  const studentLogin = await api<{ token: string }>('POST', '/api/auth/login', null, {
    email: studentEmail,
    password: 'student-dev-password123',
  });
  const studentToken = studentLogin.body.token;
  const studentId = (
    await prisma.user.findUniqueOrThrow({ where: { email: studentEmail } })
  ).id;

  // --- T-028: matching eligibility per mode -----------------------------------------
  console.log('\n=== T-028 matching: per-mode eligibility filtering ===');
  const meaning = await api<Array<{ cardId: string; term: string; target: string }>>(
    'GET',
    `/api/flashcard-sets/${setId}/matching/meaning`,
    studentToken,
  );
  check('meaning mode: all 5 seed cards eligible', meaning.body.length === 5, meaning.body);

  const synonym = await api<Array<{ cardId: string; term: string; target: string }>>(
    'GET',
    `/api/flashcard-sets/${setId}/matching/synonym`,
    studentToken,
  );
  check(
    'synonym mode: exactly apple/happy/quick (3) eligible',
    synonym.body.length === 3 &&
      ['apple', 'happy', 'quick'].every((t) => synonym.body.some((p) => p.term === t)),
    synonym.body,
  );

  const antonym = await api<Array<{ cardId: string; term: string }>>(
    'GET',
    `/api/flashcard-sets/${setId}/matching/antonym`,
    studentToken,
  );
  check(
    'antonym mode: exactly happy/quick (2) eligible',
    antonym.body.length === 2 && ['happy', 'quick'].every((t) => antonym.body.some((p) => p.term === t)),
    antonym.body,
  );

  const image = await api<Array<{ cardId: string; term: string }>>(
    'GET',
    `/api/flashcard-sets/${setId}/matching/image`,
    studentToken,
  );
  check(
    'image mode: only apple (1) eligible — "unavailable" per AC, but no error',
    image.status === 200 && image.body.length === 1 && image.body[0].term === 'apple',
    image.body,
  );

  const badMode = await api('GET', `/api/flashcard-sets/${setId}/matching/bogus`, studentToken);
  check('unknown matching mode returns 400, not a crash', badMode.status === 400, badMode);

  console.log('\n=== T-028 matching: completion records progress ===');
  const apple = synonym.body.find((p) => p.term === 'apple')!;
  const happy = synonym.body.find((p) => p.term === 'happy')!;
  const quick = synonym.body.find((p) => p.term === 'quick')!;
  const complete = await api<{ updated: number }>(
    'POST',
    `/api/flashcard-sets/${setId}/matching/synonym/complete`,
    studentToken,
    {
      results: [
        { cardId: apple.cardId, correct: true },
        { cardId: happy.cardId, correct: true },
        { cardId: quick.cardId, correct: false },
      ],
    },
  );
  check('matching complete returns updated: 3', complete.body.updated === 3, complete.body);

  const progressAfterMatching = await prisma.flashcardProgress.findMany({
    where: { studentId, cardId: { in: [apple.cardId, happy.cardId, quick.cardId] } },
  });
  const byCard = Object.fromEntries(progressAfterMatching.map((p) => [p.cardId, p.status]));
  check(
    'correct matches advanced new -> learning',
    byCard[apple.cardId] === 'learning' && byCard[happy.cardId] === 'learning',
    byCard,
  );
  check('incorrect match on a "new" card stays "new" (never regresses below new)', byCard[quick.cardId] === 'new', byCard);

  // --- T-029: use-word-in-a-sentence ---------------------------------------------------
  console.log('\n=== T-029 sentence exercise ===');
  const prompts = await api<Array<{ cardId: string; term: string; meaning: string }>>(
    'GET',
    `/api/flashcard-sets/${setId}/sentence-prompts`,
    studentToken,
  );
  check('sentence-prompts returns all 5 cards (no eligibility filter)', prompts.body.length === 5, prompts.body);

  const bookCard = prompts.body.find((p) => p.term === 'book')!;
  const runCard = prompts.body.find((p) => p.term === 'run')!;
  const quickCard = prompts.body.find((p) => p.term === 'quick')!;

  const exactMatch = await api<{ containsWord: boolean }>(
    'POST',
    `/api/flashcard-sets/${setId}/sentence/${bookCard.cardId}/submit`,
    studentToken,
    { sentence: 'I read a good book yesterday.' },
  );
  check('exact word match detected', exactMatch.body.containsWord === true, exactMatch.body);

  const inflectedMatch = await api<{ containsWord: boolean }>(
    'POST',
    `/api/flashcard-sets/${setId}/sentence/${runCard.cardId}/submit`,
    studentToken,
    { sentence: 'She runs every morning before school.' },
  );
  check('simple inflection ("run" -> "runs") detected', inflectedMatch.body.containsWord === true, inflectedMatch.body);

  const noMatch = await api<{ containsWord: boolean; progressStatus: string }>(
    'POST',
    `/api/flashcard-sets/${setId}/sentence/${quickCard.cardId}/submit`,
    studentToken,
    { sentence: 'This sentence is about something else entirely.' },
  );
  check(
    'missing-word submission still succeeds (200) and never blocks',
    noMatch.status === 200 && noMatch.body.containsWord === false,
    noMatch.body,
  );

  const submissionRows = await prisma.vocabSentenceSubmission.findMany({ where: { studentId } });
  check('all 3 sentence submissions persisted to DB', submissionRows.length === 3, submissionRows.length);
  check(
    'containsWord stored correctly per row',
    submissionRows.filter((r) => r.containsWord).length === 2 &&
      submissionRows.filter((r) => !r.containsWord).length === 1,
    submissionRows.map((r) => ({ sentence: r.sentence, containsWord: r.containsWord })),
  );

  const teacherView = await api<Array<{ studentName: string; term: string; containsWord: boolean }>>(
    'GET',
    `/api/teacher/flashcard-sets/${setId}/sentence-submissions`,
    teacherToken,
  );
  check(
    'teacher can view student sentence submissions',
    teacherView.status === 200 && teacherView.body.some((s) => s.term === 'book'),
    teacherView.body,
  );

  // A second teacher (not the owner) must be blocked from viewing submissions.
  const teacher2Login = await api<{ token: string }>('POST', '/api/auth/login', null, {
    email: process.env.SEED_TEACHER_2_EMAIL ?? 'teacher2@example.com',
    password: process.env.SEED_TEACHER_2_PASSWORD ?? 'teacher2-dev-password123',
  });
  const crossTeacherView = await api(
    'GET',
    `/api/teacher/flashcard-sets/${setId}/sentence-submissions`,
    teacher2Login.body.token,
  );
  check('a non-owning teacher is blocked (404) from another teacher\'s submissions', crossTeacherView.status === 404, crossTeacherView);

  // --- T-034 / T-035: game word pool + batch progress completion ----------------------
  console.log('\n=== T-034/T-035 vocab games: word pool + completion ===');
  const gameWords = await api<Array<{ cardId: string; term: string; meaning: string }>>(
    'GET',
    `/api/flashcard-sets/${setId}/game-words`,
    studentToken,
  );
  check('game-words returns all 5 cards', gameWords.body.length === 5, gameWords.body);

  const shooterResults = gameWords.body.slice(0, 3).map((w, i) => ({ cardId: w.cardId, correct: i !== 2 }));
  const shooterComplete = await api<{ updated: number }>(
    'POST',
    `/api/flashcard-sets/${setId}/games/spaceShooter/complete`,
    studentToken,
    { results: shooterResults },
  );
  check('space shooter completion updates 3 cards', shooterComplete.body.updated === 3, shooterComplete.body);

  const runnerResults = gameWords.body.map((w) => ({ cardId: w.cardId, correct: true }));
  const runnerComplete = await api<{ updated: number }>(
    'POST',
    `/api/flashcard-sets/${setId}/games/runner/complete`,
    studentToken,
    { results: runnerResults },
  );
  check('runner completion updates all 5 cards', runnerComplete.body.updated === 5, runnerComplete.body);

  const badGameType = await api(
    'POST',
    `/api/flashcard-sets/${setId}/games/notAGame/complete`,
    studentToken,
    { results: [] },
  );
  check('unknown game type returns 400, not a crash', badGameType.status === 400, badGameType);

  const finalProgress = await prisma.flashcardProgress.findMany({
    where: { studentId },
    include: { card: { select: { term: true } } },
  });
  check(
    'every one of the 5 seed cards now has a progress row for this student',
    finalProgress.length === 5,
    finalProgress.map((p) => ({ term: p.card.term, status: p.status })),
  );

  console.log(`\n=== Result: ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ===`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('[verify-vocab-batch] Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
