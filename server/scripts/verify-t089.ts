/**
 * T-089 verification script — REAL REST calls against an already-running dev server
 * (http://localhost:4000) + Postgres, same convention as `verify-t075.ts`. Builds its
 * own throwaway teacher/class/students/flashcard-sets fixture (never touches the real
 * `teacher.1a1@example.com` / class "1A1" data) and deletes it all again at the end,
 * success or failure.
 *
 * Covers the self-check quiz's per-card-immediate endpoints, the permanent point ledger,
 * the per-set score on the sets list, and the Vocabulary Leaderboard's replaced formula:
 *   - marking 2+ cards "known" makes them (and ONLY them) appear in the self-check quiz;
 *   - a correct answer: +10, `verifiedKnown` flips true, excluded from a fresh GET after;
 *   - an incorrect answer: -20, permanent, STILL included in a fresh GET after;
 *   - the per-set score on `GET /api/flashcard-sets` reflects the net total for that set;
 *   - the Vocabulary Leaderboard sums the SAME ledger across every set the student has
 *     activity in (two different sets in this fixture);
 *   - POSTing an answer for a card that's never been marked known, or already verified,
 *     is rejected (400) rather than silently graded;
 *   - a wrong-then-right sequence on the SAME card nets -20 + 10 = -10 (both rows kept).
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
const RUN_ID = Date.now().toString(36);

let passCount = 0;
let failCount = 0;

function pass(label: string): void {
  passCount += 1;
  console.log(`  [PASS] ${label}`);
}
function fail(label: string, detail?: unknown): never {
  failCount += 1;
  console.error(`  [FAIL] ${label}`, detail ?? '');
  throw new Error(`Verification step failed: ${label}`);
}
function assert(condition: unknown, label: string, detail?: unknown): asserts condition {
  if (condition) pass(label);
  else fail(label, detail);
}

async function apiRequest<T>(
  path: string,
  token: string | null,
  options: { method?: string; body?: unknown; expectStatus?: number } = {},
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const body = (await res.json().catch(() => undefined)) as T;
  if (options.expectStatus !== undefined && res.status !== options.expectStatus) {
    fail(`${options.method ?? 'GET'} ${path} expected ${options.expectStatus}, got ${res.status}`, body);
  }
  return { status: res.status, body };
}

async function login(email: string, password: string): Promise<string> {
  const { body } = await apiRequest<{ token: string }>('/api/auth/login', null, {
    method: 'POST',
    body: { email, password },
    expectStatus: 200,
  });
  return body.token;
}

interface Fixture {
  teacherId: string;
  classId: string;
  studentId: string;
  studentEmail: string;
  setAId: string;
  setBId: string;
  cards: {
    setA: { known1: string; known2: string; unknown: string };
    setB: { known1: string };
  };
}

async function buildFixture(): Promise<Fixture> {
  const passwordHash = await bcrypt.hash('t089-verify-password', 12);

  const teacher = await prisma.user.create({
    data: {
      email: `t089-teacher-${RUN_ID}@example.com`,
      passwordHash,
      name: 'T-089 Verify Teacher',
      role: 'teacher',
    },
  });

  const klass = await prisma.class.create({
    data: { name: `T089-Verify-Class-${RUN_ID}`, teacherId: teacher.id },
  });

  const student = await prisma.user.create({
    data: {
      email: `t089-student-${RUN_ID}@example.com`,
      passwordHash,
      name: 'T-089 Verify Student',
      role: 'student',
      classId: klass.id,
    },
  });

  const setA = await prisma.flashcardSet.create({
    data: {
      name: `T089 Verify Set A ${RUN_ID}`,
      teacherId: teacher.id,
      classes: { connect: { id: klass.id } },
      cards: {
        create: [
          { term: 'alpha', meaning: 'The first letter of the Greek alphabet.', order: 1 },
          { term: 'beta', meaning: 'The second letter of the Greek alphabet.', order: 2 },
          { term: 'gamma', meaning: 'The third letter of the Greek alphabet.', order: 3 },
        ],
      },
    },
    include: { cards: true },
  });

  const setB = await prisma.flashcardSet.create({
    data: {
      name: `T089 Verify Set B ${RUN_ID}`,
      teacherId: teacher.id,
      classes: { connect: { id: klass.id } },
      cards: {
        create: [{ term: 'delta', meaning: 'The fourth letter of the Greek alphabet.', order: 1 }],
      },
    },
    include: { cards: true },
  });

  const cardByTerm = (cards: { id: string; term: string }[], term: string) => {
    const c = cards.find((x) => x.term === term);
    if (!c) throw new Error(`fixture card ${term} missing`);
    return c.id;
  };

  return {
    teacherId: teacher.id,
    classId: klass.id,
    studentId: student.id,
    studentEmail: student.email,
    setAId: setA.id,
    setBId: setB.id,
    cards: {
      setA: {
        known1: cardByTerm(setA.cards, 'alpha'),
        known2: cardByTerm(setA.cards, 'beta'),
        unknown: cardByTerm(setA.cards, 'gamma'),
      },
      setB: { known1: cardByTerm(setB.cards, 'delta') },
    },
  };
}

async function cleanup(fx: Fixture): Promise<void> {
  // Cascades handle FlashcardCard/FlashcardProgress/FlashcardExerciseAttempt via
  // onDelete: Cascade on the card/student relations — deleting the sets + student +
  // class + teacher is enough.
  await prisma.flashcardSet.deleteMany({ where: { id: { in: [fx.setAId, fx.setBId] } } });
  await prisma.user.delete({ where: { id: fx.studentId } }).catch(() => undefined);
  await prisma.class.delete({ where: { id: fx.classId } }).catch(() => undefined);
  await prisma.user.delete({ where: { id: fx.teacherId } }).catch(() => undefined);
}

async function main() {
  console.log(`[verify-t089] Building throwaway fixture (run ${RUN_ID})...`);
  const fx = await buildFixture();

  try {
    const studentToken = await login(fx.studentEmail, 't089-verify-password');

    // --- Mark 2 cards "known" in set A, leave the third untouched ---------------------
    await apiRequest(`/api/flashcard-sets/${fx.setAId}/cards/${fx.cards.setA.known1}/progress`, studentToken, {
      method: 'PUT',
      body: { status: 'known' },
      expectStatus: 200,
    });
    await apiRequest(`/api/flashcard-sets/${fx.setAId}/cards/${fx.cards.setA.known2}/progress`, studentToken, {
      method: 'PUT',
      body: { status: 'known' },
      expectStatus: 200,
    });

    // --- Self-check quiz pool: only the 2 known cards, never the untouched one --------
    interface Prompt {
      cardId: string;
      term: string;
      choices: string[];
    }
    const pool1 = await apiRequest<Prompt[]>(`/api/flashcard-sets/${fx.setAId}/self-check`, studentToken, {
      expectStatus: 200,
    });
    const pool1Ids = pool1.body.map((p) => p.cardId).sort();
    assert(
      JSON.stringify(pool1Ids) === JSON.stringify([fx.cards.setA.known1, fx.cards.setA.known2].sort()),
      'self-check pool contains exactly the 2 known cards, not the untouched one',
      pool1Ids,
    );

    // --- Fetch the real card meanings for correct/incorrect answers -------------------
    const cardsInSetA = await prisma.flashcardCard.findMany({ where: { setId: fx.setAId } });
    const meaningOf = (id: string) => cardsInSetA.find((c) => c.id === id)!.meaning;

    // --- Answer known1 CORRECTLY: +10, verifiedKnown flips true ------------------------
    interface AnswerResp {
      correct: boolean;
      correctMeaning: string;
      pointsDelta: number;
    }
    const correctAnswer = await apiRequest<AnswerResp>(
      `/api/flashcard-sets/${fx.setAId}/self-check/${fx.cards.setA.known1}/answer`,
      studentToken,
      { method: 'POST', body: { answer: meaningOf(fx.cards.setA.known1) }, expectStatus: 200 },
    );
    assert(correctAnswer.body.correct === true, 'correct self-check answer graded correct: true');
    assert(correctAnswer.body.pointsDelta === 10, 'correct answer pointsDelta === +10', correctAnswer.body);

    const progressAfterCorrect = await prisma.flashcardProgress.findUnique({
      where: { cardId_studentId: { cardId: fx.cards.setA.known1, studentId: fx.studentId } },
    });
    assert(progressAfterCorrect?.verifiedKnown === true, 'verifiedKnown flipped true after correct answer');

    const pool2 = await apiRequest<Prompt[]>(`/api/flashcard-sets/${fx.setAId}/self-check`, studentToken, {
      expectStatus: 200,
    });
    assert(
      !pool2.body.some((p) => p.cardId === fx.cards.setA.known1),
      'verified card excluded from a fresh self-check pool fetch',
      pool2.body,
    );
    assert(
      pool2.body.some((p) => p.cardId === fx.cards.setA.known2),
      'still-unverified known2 remains in the fresh pool',
      pool2.body,
    );

    // --- Answer known2 INCORRECTLY: -20, permanent, still reappears --------------------
    const wrongAnswer = await apiRequest<AnswerResp>(
      `/api/flashcard-sets/${fx.setAId}/self-check/${fx.cards.setA.known2}/answer`,
      studentToken,
      { method: 'POST', body: { answer: 'definitely not the real meaning' }, expectStatus: 200 },
    );
    assert(wrongAnswer.body.correct === false, 'incorrect self-check answer graded correct: false');
    assert(wrongAnswer.body.pointsDelta === -20, 'incorrect answer pointsDelta === -20', wrongAnswer.body);

    const pool3 = await apiRequest<Prompt[]>(`/api/flashcard-sets/${fx.setAId}/self-check`, studentToken, {
      expectStatus: 200,
    });
    assert(
      pool3.body.some((p) => p.cardId === fx.cards.setA.known2),
      'wrongly-answered card STILL included in a fresh pool fetch after the miss',
      pool3.body,
    );

    // --- Reject re-submitting an already-verified card ---------------------------------
    const rejectVerified = await apiRequest(
      `/api/flashcard-sets/${fx.setAId}/self-check/${fx.cards.setA.known1}/answer`,
      studentToken,
      { method: 'POST', body: { answer: meaningOf(fx.cards.setA.known1) } },
    );
    assert(
      rejectVerified.status === 400,
      'POSTing an answer for an already-verified card is rejected (400), not re-graded',
      rejectVerified,
    );

    // --- Reject grading a card never marked known --------------------------------------
    const rejectNeverKnown = await apiRequest(
      `/api/flashcard-sets/${fx.setAId}/self-check/${fx.cards.setA.unknown}/answer`,
      studentToken,
      { method: 'POST', body: { answer: meaningOf(fx.cards.setA.unknown) } },
    );
    assert(
      rejectNeverKnown.status === 400,
      'POSTing an answer for a card never marked known is rejected (400)',
      rejectNeverKnown,
    );

    // --- Wrong-then-right on the SAME card (known2): nets -20 + 10 = -10 --------------
    const retryCorrect = await apiRequest<AnswerResp>(
      `/api/flashcard-sets/${fx.setAId}/self-check/${fx.cards.setA.known2}/answer`,
      studentToken,
      { method: 'POST', body: { answer: meaningOf(fx.cards.setA.known2) }, expectStatus: 200 },
    );
    assert(retryCorrect.body.correct === true, 'retry on known2 graded correct after the earlier miss');

    const attemptRows = await prisma.flashcardExerciseAttempt.findMany({
      where: { studentId: fx.studentId, type: 'selfCheck', cardId: fx.cards.setA.known2 },
      orderBy: { createdAt: 'asc' },
    });
    assert(
      attemptRows.length === 2 && attemptRows[0].correct === false && attemptRows[1].correct === true,
      'known2 has exactly 2 append-only attempt rows: wrong then right, neither overwritten',
      attemptRows,
    );

    // Set A net so far: known1 +10, known2 -20 then +10 => total = 10 - 20 + 10 = 0
    interface SetSummary {
      id: string;
      selfCheckScore: number;
    }
    const setsAfterA = await apiRequest<SetSummary[]>('/api/flashcard-sets', studentToken, { expectStatus: 200 });
    const setASummary = setsAfterA.body.find((s) => s.id === fx.setAId);
    assert(setASummary?.selfCheckScore === 0, 'set A per-set score reflects +10 -20 +10 = 0', setASummary);

    // --- Give the student self-check activity in a SECOND set (set B) -----------------
    await apiRequest(`/api/flashcard-sets/${fx.setBId}/cards/${fx.cards.setB.known1}/progress`, studentToken, {
      method: 'PUT',
      body: { status: 'known' },
      expectStatus: 200,
    });
    const cardsInSetB = await prisma.flashcardCard.findMany({ where: { setId: fx.setBId } });
    const setBAnswer = await apiRequest<AnswerResp>(
      `/api/flashcard-sets/${fx.setBId}/self-check/${fx.cards.setB.known1}/answer`,
      studentToken,
      {
        method: 'POST',
        body: { answer: cardsInSetB.find((c) => c.id === fx.cards.setB.known1)!.meaning },
        expectStatus: 200,
      },
    );
    assert(setBAnswer.body.correct === true, 'set B correct answer graded correct');

    const setsAfterB = await apiRequest<SetSummary[]>('/api/flashcard-sets', studentToken, { expectStatus: 200 });
    const setBSummary = setsAfterB.body.find((s) => s.id === fx.setBId);
    assert(setBSummary?.selfCheckScore === 10, 'set B per-set score is +10, independent of set A', setBSummary);
    const setAUnchanged = setsAfterB.body.find((s) => s.id === fx.setAId);
    assert(setAUnchanged?.selfCheckScore === 0, 'set A score unaffected by set B activity', setAUnchanged);

    // --- Vocabulary Leaderboard: sums the SAME ledger across BOTH sets ----------------
    interface LeaderboardEntry {
      studentId: string;
      knownCardCount: number;
      totalAttempts: number;
      correctAttempts: number;
      score: number;
    }
    interface LeaderboardResponse {
      entries: LeaderboardEntry[];
    }
    const leaderboard = await apiRequest<LeaderboardResponse>('/api/vocab-leaderboard', studentToken, {
      expectStatus: 200,
    });
    const entry = leaderboard.body.entries.find((e) => e.studentId === fx.studentId);
    assert(!!entry, 'student appears in their class Vocabulary Leaderboard', leaderboard.body);
    // Total across both sets: set A net 0 (+10 -20 +10) + set B +10 = 10.
    assert(entry!.score === 10, 'leaderboard score sums set A (0) + set B (+10) = 10', entry);
    // verifiedKnown cards: known1 (setA) + known2 (setA, verified on retry) + known1 (setB) = 3.
    assert(entry!.knownCardCount === 3, 'leaderboard knownCardCount === 3 verified cards', entry);
    // selfCheck attempts only: known1(1) + known2(2) + setB known1(1) = 4 attempts, 3 correct.
    assert(entry!.totalAttempts === 4, 'leaderboard totalAttempts scoped to selfCheck only === 4', entry);
    assert(entry!.correctAttempts === 3, 'leaderboard correctAttempts === 3', entry);

    console.log(`\n[verify-t089] ${passCount} passed, ${failCount} failed.`);
  } finally {
    await cleanup(fx);
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[verify-t089] FAILED:', err);
  process.exitCode = 1;
});
