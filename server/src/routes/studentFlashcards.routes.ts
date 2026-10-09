/**
 * Student-facing vocabulary endpoints: browsing flashcard sets + study/review mode
 * (T-023), the four vocabulary exercise types built in this same batch (T-024
 * fill-blank, T-025 unscramble, T-026 listen-and-type, T-027 IPA-to-word), and the later
 * "Tự kiểm tra" self-check quiz (T-089) — a student-initiated, per-set, untimed
 * multiple-choice re-check of cards the student has personally marked "known", whose
 * permanent +10/-20 point ledger drives both the per-set score below and the Vocabulary
 * Leaderboard (`vocabLeaderboard.ts`). Do not confuse T-089 with the unrelated,
 * teacher-assigned "Kiểm tra từ vựng" / Vocabulary Check feature (T-038/T-086, a
 * different `Test`-based timed test in `teacherVocabularyCheck.routes.ts`).
 *
 * Class-scoped as of T-076, Phase 12: every route here is `student`-only
 * (`requireRole('student')` — a teacher gets 403, same as any student-only route) AND
 * now additionally scoped to sets ASSIGNED to the calling student's own `Class`
 * (`FlashcardSet.classes`, T-075) — this SUPERSEDES the earlier "no enrollment concept,
 * any logged-in student can study any set" assumption this doc comment used to describe.
 * `loadSetWithCards` below is the single chokepoint every per-set route (detail,
 * exercises, matching, sentence, games, progress-marking, self-check) goes through, so
 * the class check is enforced identically everywhere with one implementation rather than
 * per-route.
 */

import { Router } from 'express';
import type {
  CheckVocabExerciseRequest,
  CheckVocabExerciseResponse,
  CompleteVocabActivityRequest,
  CompleteVocabActivityResponse,
  GameWordDTO,
  MatchingMode,
  MatchingPairDTO,
  SelfCheckAnswerResponse,
  SelfCheckPromptDTO,
  SentencePromptDTO,
  StudentFlashcardCardDTO,
  StudentFlashcardSetDetailDTO,
  StudentFlashcardSetSummaryDTO,
  StudentVocabProgressDTO,
  SubmitSentenceRequest,
  SubmitSentenceResponse,
  UpdateFlashcardProgressRequest,
  VocabExercisePromptDTO,
  VocabExerciseType,
  VocabGameType,
  VocabSetProgressDTO,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import {
  advanceStatus,
  applyBatchProgress,
  getCurrentStatus,
  recordExerciseAttempt,
  setFlashcardProgress,
} from '../lib/flashcardProgress';
import {
  MATCHING_MODES,
  VOCAB_EXERCISE_TYPES,
  buildMatchingTarget,
  buildPrompt,
  isCorrectAnswer,
  isEligible,
  isMatchingEligible,
  normalize,
} from '../lib/flashcardExercises';
import { sentenceContainsWord } from '../lib/vocabSentence';
import { summarizeActivityStats, summarizeCardStatuses } from '../lib/vocabProgress';
import { getStudentClassAndPeriod } from '../lib/classScoping';
import { buildSelfCheckPrompts } from '../lib/selfCheckQuiz';
import { selfCheckPointValue } from '../lib/selfCheckScoring';

export const studentFlashcardsRouter = Router();

studentFlashcardsRouter.use(requireAuth, requireRole('student'));

// --- Browse + study mode (T-023) ------------------------------------------------------

/** GET / — every `FlashcardSet` ASSIGNED TO THE CALLING STUDENT'S OWN CLASS (T-076). A
 * classless student (shouldn't happen post-T-074/T-075, see `getStudentClassId`'s doc
 * comment) sees an empty list rather than every set or a crash.
 *
 * `selfCheckScore` (T-089): this student's own point total for EACH set individually —
 * the sum of their `selfCheck`-type `FlashcardExerciseAttempt` point-values for cards
 * belonging to that one set. Computed with exactly one query across ALL of this
 * student's `selfCheck` attempts (never scoped to a single set at the DB level), then
 * bucketed by each attempt's card's `setId` in memory — deliberately not one query per
 * set, which would be N+1 for a student with many sets. */
studentFlashcardsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const scp = await getStudentClassAndPeriod(req.user!.sub);
    if (!scp || scp.periodId == null) {
      res.status(200).json([] satisfies StudentFlashcardSetSummaryDTO[]);
      return;
    }

    const sets = await prisma.flashcardSet.findMany({
      where: { classAssignments: { some: { classId: scp.classId, periodId: scp.periodId } } },
      orderBy: { updatedAt: 'desc' },
      include: { unit: { select: { name: true } }, _count: { select: { cards: true } } },
    });

    const selfCheckAttempts = await prisma.flashcardExerciseAttempt.findMany({
      where: { studentId: req.user!.sub, type: 'selfCheck' },
      select: { correct: true, card: { select: { setId: true } } },
    });
    const scoreBySetId = new Map<string, number>();
    for (const attempt of selfCheckAttempts) {
      const setId = attempt.card.setId;
      scoreBySetId.set(setId, (scoreBySetId.get(setId) ?? 0) + selfCheckPointValue(attempt.correct));
    }

    const summaries: StudentFlashcardSetSummaryDTO[] = sets.map((set) => ({
      id: set.id,
      name: set.name,
      unitId: set.unitId,
      unitName: set.unit?.name ?? null,
      cardCount: set._count.cards,
      selfCheckScore: scoreBySetId.get(set.id) ?? 0,
    }));
    res.status(200).json(summaries);
  }),
);

/**
 * `GET /progress` — the requesting student's own vocabulary progress (T-030).
 * Registered BEFORE `GET /:setId` below so the literal path `/progress` isn't swallowed
 * by that param route (Express matches routes in declaration order).
 *
 * Documented choice: `sets` only includes a flashcard set once the student has at least
 * one `FlashcardProgress` row somewhere in it — an untouched set trivially reads "0
 * known, 0 learning, all new," which isn't informative "progress" to show; T-023's
 * browse page already lists every available set for starting fresh study. `activityStats`
 * (per exercise/activity type accuracy) is intentionally NOT scoped to one set — a
 * student's fill-blank accuracy is one number across everything they've practiced.
 *
 * T-076: `sets` is additionally filtered to this student's own class, same rule as
 * `GET /` above — a set the student progressed on before being moved to a different
 * class (or before the set was ever assigned to a class at all, pre-T-075) simply drops
 * out of this list rather than erroring; `activityStats` below is untouched since it's a
 * cross-cutting number, not a list of items to gate.
 */
studentFlashcardsRouter.get(
  '/progress',
  asyncHandler(async (req, res) => {
    const studentId = req.user!.sub;
    const scp = await getStudentClassAndPeriod(studentId);

    const sets =
      scp && scp.periodId != null
        ? await prisma.flashcardSet.findMany({
            where: { classAssignments: { some: { classId: scp.classId, periodId: scp.periodId } } },
            orderBy: { updatedAt: 'desc' },
            include: { unit: { select: { name: true } }, cards: { select: { id: true } } },
          })
        : [];

    const progressRows = await prisma.flashcardProgress.findMany({
      where: { studentId },
      select: { cardId: true, status: true },
    });
    const statusByCardId = new Map(progressRows.map((p) => [p.cardId, p.status]));

    const setSummaries: VocabSetProgressDTO[] = sets
      .filter((set) => set.cards.some((card) => statusByCardId.has(card.id)))
      .map((set) => {
        const cardIds = set.cards.map((c) => c.id);
        const statusesInSet = cardIds
          .map((id) => statusByCardId.get(id))
          .filter((status): status is NonNullable<typeof status> => !!status)
          .map((status) => ({ status }));
        const { knownCount, learningCount, newCount } = summarizeCardStatuses(cardIds, statusesInSet);
        return {
          setId: set.id,
          setName: set.name,
          unitName: set.unit?.name ?? null,
          cardCount: cardIds.length,
          knownCount,
          learningCount,
          newCount,
        };
      });

    const attemptRows = await prisma.flashcardExerciseAttempt.findMany({
      where: { studentId },
      select: { type: true, correct: true },
    });

    const response: StudentVocabProgressDTO = {
      sets: setSummaries,
      activityStats: summarizeActivityStats(attemptRows),
    };
    res.status(200).json(response);
  }),
);

/** Loads a set + its cards, or writes a 404 and returns `null`. Shared by the detail
 * view and every exercise/matching/sentence/game/progress route below (all scoped to
 * `:setId`), which is what makes T-076/T-099's class+period check below apply
 * identically everywhere with one implementation.
 *
 * T-076 (extended T-099): also verifies this set is assigned to `studentId`'s own class
 * FOR THAT CLASS'S CURRENT SEMESTER, writing the IDENTICAL 404 "Flashcard set not
 * found." for "doesn't exist", "exists, but not assigned to your class", and "assigned
 * to your class, but under a DIFFERENT semester than the one it's currently on" — same
 * anti-leak reasoning as every ownership-check helper in this codebase (`ownedTest.ts`
 * et al.): a student probing another class's (or another semester's) set id learns
 * nothing beyond "not found". */
async function loadSetWithCards(setId: string, studentId: string, res: import('express').Response) {
  const set = await prisma.flashcardSet.findUnique({
    where: { id: setId },
    include: {
      unit: { select: { name: true } },
      cards: { orderBy: { order: 'asc' } },
    },
  });
  if (!set) {
    res.status(404).json({ error: 'Flashcard set not found.' });
    return null;
  }

  const scp = await getStudentClassAndPeriod(studentId);
  if (!scp || scp.periodId == null) {
    res.status(404).json({ error: 'Flashcard set not found.' });
    return null;
  }
  const assignment = await prisma.flashcardSetClassPeriodAssignment.findUnique({
    where: {
      flashcardSetId_classId_periodId: {
        flashcardSetId: set.id,
        classId: scp.classId,
        periodId: scp.periodId,
      },
    },
  });
  if (!assignment) {
    res.status(404).json({ error: 'Flashcard set not found.' });
    return null;
  }

  return set;
}

/** `GET /:setId` — the study/review payload (T-023): every card plus THIS student's own
 * progress for it (`null` = never reviewed — same as `new`, see `FlashcardProgress`'s
 * schema doc comment), so reopening the set later shows prior status rather than
 * resetting, per T-023's acceptance criteria. */
studentFlashcardsRouter.get(
  '/:setId',
  asyncHandler(async (req, res) => {
    const set = await loadSetWithCards(req.params.setId, req.user!.sub, res);
    if (!set) return;

    const progressRows = await prisma.flashcardProgress.findMany({
      where: { studentId: req.user!.sub, cardId: { in: set.cards.map((c) => c.id) } },
    });
    const progressByCardId = new Map(progressRows.map((p) => [p.cardId, p]));

    const cards: StudentFlashcardCardDTO[] = set.cards.map((card) => {
      const progress = progressByCardId.get(card.id);
      return {
        id: card.id,
        term: card.term,
        meaning: card.meaning,
        ipa: card.ipa,
        imageUrl: card.imageUrl,
        audioUrl: card.audioUrl,
        exampleSentence: card.exampleSentence,
        synonyms: card.synonyms,
        antonyms: card.antonyms,
        cefrLevel: card.cefrLevel,
        order: card.order,
        progressStatus: progress?.status ?? null,
        // T-089: exposes the stricter "verified via self-check" tier alongside the
        // self-claimed `progressStatus`, so the client's "Xem thẻ đã thuộc" view can tell
        // the two apart without a second endpoint.
        verifiedKnown: progress?.verifiedKnown ?? false,
        lastReviewedAt: progress?.lastReviewedAt ? progress.lastReviewedAt.toISOString() : null,
      };
    });

    const response: StudentFlashcardSetDetailDTO = {
      id: set.id,
      name: set.name,
      unitId: set.unitId,
      unitName: set.unit?.name ?? null,
      cards,
    };
    res.status(200).json(response);
  }),
);

/** `PUT /:setId/cards/:cardId/progress` — direct study-mode marking (T-023): the
 * student flips a card and explicitly marks it, e.g. "Known" / "Still learning". Sets
 * the status EXACTLY as requested (no `advanceStatus` derivation — that rule is only
 * for exercise-correctness-driven updates, T-024–T-027 below). */
studentFlashcardsRouter.put(
  '/:setId/cards/:cardId/progress',
  asyncHandler(async (req, res) => {
    // T-076: routed through the same class-scoped `loadSetWithCards` gate as every other
    // per-set route in this file, even though this handler doesn't need the nested cards.
    const set = await loadSetWithCards(req.params.setId, req.user!.sub, res);
    if (!set) return;
    const card = await prisma.flashcardCard.findUnique({ where: { id: req.params.cardId } });
    if (!card || card.setId !== set.id) {
      res.status(404).json({ error: 'Card not found.' });
      return;
    }

    const body = req.body as Partial<UpdateFlashcardProgressRequest>;
    const validStatuses = ['new', 'learning', 'known'];
    if (typeof body.status !== 'string' || !validStatuses.includes(body.status)) {
      res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}.` });
      return;
    }

    const updated = await setFlashcardProgress(card.id, req.user!.sub, body.status);
    res.status(200).json({
      cardId: card.id,
      status: updated.status,
      lastReviewedAt: updated.lastReviewedAt ? updated.lastReviewedAt.toISOString() : null,
    });
  }),
);

// --- Vocabulary exercises (T-024–T-027) -----------------------------------------------

function isVocabExerciseType(value: string): value is VocabExerciseType {
  return (VOCAB_EXERCISE_TYPES as string[]).includes(value);
}

/** `GET /:setId/exercises/:type` — the eligible, answer-free prompt list for one
 * exercise type on this set. Cards that don't qualify (per `isEligible`) are simply
 * left out, never surfaced as an error — per every one of T-024/T-025/T-026/T-027's
 * acceptance criteria ("skip"/"exclude ... rather than failing"). An empty result (e.g.
 * a set where no card has audio yet) is a valid, empty list, not a 4xx. */
studentFlashcardsRouter.get(
  '/:setId/exercises/:type',
  asyncHandler(async (req, res) => {
    const type = req.params.type;
    if (!isVocabExerciseType(type)) {
      res.status(400).json({ error: `Unknown exercise type. Must be one of: ${VOCAB_EXERCISE_TYPES.join(', ')}.` });
      return;
    }

    const set = await loadSetWithCards(req.params.setId, req.user!.sub, res);
    if (!set) return;

    const prompts: VocabExercisePromptDTO[] = set.cards
      .filter((card) => isEligible(type, card))
      .map((card) => buildPrompt(type, card));

    res.status(200).json(prompts);
  }),
);

/** `POST /:setId/exercises/:type/:cardId/check` — grades one submission (T-024–T-027):
 * case-insensitive, whitespace-trimmed exact match (fill-blank additionally accepts the
 * card's configured synonyms — see `flashcardExercises.ts`'s `acceptedAnswers` doc
 * comment) against the card's `term`. Immediately updates `FlashcardProgress` via
 * `advanceStatus` and returns the correct answer alongside the verdict so the client can
 * show "the correct answer was ..." on a miss, satisfying "immediate feedback" for every
 * one of these four tasks with one shared implementation. */
studentFlashcardsRouter.post(
  '/:setId/exercises/:type/:cardId/check',
  asyncHandler(async (req, res) => {
    const type = req.params.type;
    if (!isVocabExerciseType(type)) {
      res.status(400).json({ error: `Unknown exercise type. Must be one of: ${VOCAB_EXERCISE_TYPES.join(', ')}.` });
      return;
    }

    // T-076: gate on the set's own class assignment before even looking at the card.
    const scopedSet = await loadSetWithCards(req.params.setId, req.user!.sub, res);
    if (!scopedSet) return;

    const card = await prisma.flashcardCard.findUnique({ where: { id: req.params.cardId } });
    if (!card || card.setId !== req.params.setId) {
      res.status(404).json({ error: 'Card not found in this flashcard set.' });
      return;
    }
    if (!isEligible(type, card)) {
      res.status(400).json({ error: `This card is not eligible for the "${type}" exercise.` });
      return;
    }

    const body = req.body as Partial<CheckVocabExerciseRequest>;
    if (typeof body.answer !== 'string') {
      res.status(400).json({ error: 'answer is required and must be a string.' });
      return;
    }

    const correct = isCorrectAnswer(body.answer, type, card);
    const currentStatus = await getCurrentStatus(card.id, req.user!.sub);
    const nextStatus = advanceStatus(currentStatus, correct);
    await setFlashcardProgress(card.id, req.user!.sub, nextStatus);
    // T-030: append-only attempt log, alongside the FlashcardProgress upsert above.
    await recordExerciseAttempt(card.id, req.user!.sub, type, correct);

    const response: CheckVocabExerciseResponse = {
      correct,
      correctAnswer: card.term,
      progressStatus: nextStatus,
    };
    res.status(200).json(response);
  }),
);

// --- Self-check quiz for mastered cards (T-089) -----------------------------------------
// A completely different, STUDENT-initiated, per-flashcard-set, untimed self-quiz over
// only the cards THIS student has personally marked "Đã thuộc" (self-claimed `known`) in
// ONE set — never confuse with the unrelated, teacher-assigned "Kiểm tra từ vựng" /
// Vocabulary Check feature (T-038/T-086, `teacherVocabularyCheck.routes.ts`,
// `Test`/`Attempt`/`TestAssignment`-based). Mirrors the T-024–T-027 per-card shape just
// above (answer-free `GET` prompts, `POST` grades one submission immediately) — NOT the
// batch "matching/games complete" shape below. See `@platform/shared`'s
// `SelfCheckPromptDTO`/`SelfCheckAnswerResponse` doc comments and
// `server/src/lib/vocabLeaderboard.ts`'s doc comment for the permanent point-ledger this
// feature drives.

/** `GET /:setId/self-check` — multiple-choice, answer-free prompts (T-089) built ONLY
 * from cards where, for the calling student in this set, `FlashcardProgress.status ===
 * 'known' && verifiedKnown === false`. A card already verified in an earlier self-check
 * session is excluded forever ("flashcard không hiện thẻ đó nữa" — nothing left to
 * verify); a card never marked known yet is never offered either. Empty list is valid
 * (nothing eligible right now), never a 4xx — same convention as the exercise-prompt
 * route above. */
studentFlashcardsRouter.get(
  '/:setId/self-check',
  asyncHandler(async (req, res) => {
    const set = await loadSetWithCards(req.params.setId, req.user!.sub, res);
    if (!set) return;

    const progressRows = await prisma.flashcardProgress.findMany({
      where: {
        studentId: req.user!.sub,
        cardId: { in: set.cards.map((c) => c.id) },
        status: 'known',
        verifiedKnown: false,
      },
      select: { cardId: true },
    });
    const eligibleCardIds = new Set(progressRows.map((p) => p.cardId));
    const eligibleCards = set.cards.filter((card) => eligibleCardIds.has(card.id));

    const prompts: SelfCheckPromptDTO[] = await buildSelfCheckPrompts(eligibleCards);
    res.status(200).json(prompts);
  }),
);

/** `POST /:setId/self-check/:cardId/answer` — grades one self-check submission (T-089),
 * mirroring the T-024–T-027 `POST .../check` per-card-immediate pattern above.
 * RE-VERIFIES eligibility itself (`status === 'known' && verifiedKnown === false` for
 * THIS card+student, read fresh from the DB) before grading, even though `GET
 * .../self-check` already filtered to the same rule — this is what stops a student from
 * farming points by POSTing an already-verified card's id directly, and from ever
 * grading a card that was never marked known at all. Grading compares the submitted text
 * to the card's `meaning` (case-insensitive/trimmed via `normalize`, same convention as
 * every other exact-match check in this codebase). Logs exactly ONE
 * `FlashcardExerciseAttempt(type: 'selfCheck', correct)` row — this row IS the permanent
 * point ledger (`selfCheckScoring.ts`), never a mutable running total. A correct answer
 * additionally flips `FlashcardProgress.verifiedKnown` to `true` (never reset back to
 * `false` afterward, per that field's own doc comment in `schema.prisma`). */
studentFlashcardsRouter.post(
  '/:setId/self-check/:cardId/answer',
  asyncHandler(async (req, res) => {
    // T-076: gate on the set's own class assignment before even looking at the card.
    const scopedSet = await loadSetWithCards(req.params.setId, req.user!.sub, res);
    if (!scopedSet) return;

    const card = await prisma.flashcardCard.findUnique({ where: { id: req.params.cardId } });
    if (!card || card.setId !== req.params.setId) {
      res.status(404).json({ error: 'Card not found in this flashcard set.' });
      return;
    }

    const body = req.body as Partial<CheckVocabExerciseRequest>;
    if (typeof body.answer !== 'string') {
      res.status(400).json({ error: 'answer is required and must be a string.' });
      return;
    }

    const progress = await prisma.flashcardProgress.findUnique({
      where: { cardId_studentId: { cardId: card.id, studentId: req.user!.sub } },
    });
    if (!progress || progress.status !== 'known' || progress.verifiedKnown) {
      res.status(400).json({
        error:
          'This card is not eligible for the self-check quiz right now (it must be marked "known" and not already verified).',
      });
      return;
    }

    const correct = normalize(body.answer) === normalize(card.meaning);
    // T-089: append-only attempt log — this row IS the permanent point ledger, summed
    // (never overwritten) by the sets-list score and the Vocabulary Leaderboard.
    await recordExerciseAttempt(card.id, req.user!.sub, 'selfCheck', correct);
    if (correct) {
      await prisma.flashcardProgress.update({
        where: { cardId_studentId: { cardId: card.id, studentId: req.user!.sub } },
        data: { verifiedKnown: true },
      });
    }

    const response: SelfCheckAnswerResponse = {
      correct,
      correctMeaning: card.meaning,
      pointsDelta: selfCheckPointValue(correct),
    };
    res.status(200).json(response);
  }),
);

// --- Matching exercise (T-028) ---------------------------------------------------------

function isMatchingMode(value: string): value is MatchingMode {
  return (MATCHING_MODES as string[]).includes(value);
}

/** `GET /:setId/matching/:mode` — the eligible pairs for one matching mode on this set
 * (T-028). Same "just filter, never error" convention as the exercise-prompt route
 * above: a mode with 0 or 1 eligible pairs is returned as-is (an empty/too-short list),
 * and it's the client's job to treat that as "this mode isn't available for this set"
 * rather than trying to render an unplayable round. */
studentFlashcardsRouter.get(
  '/:setId/matching/:mode',
  asyncHandler(async (req, res) => {
    const mode = req.params.mode;
    if (!isMatchingMode(mode)) {
      res.status(400).json({ error: `Unknown matching mode. Must be one of: ${MATCHING_MODES.join(', ')}.` });
      return;
    }

    const set = await loadSetWithCards(req.params.setId, req.user!.sub, res);
    if (!set) return;

    const pairs: MatchingPairDTO[] = set.cards
      .filter((card) => isMatchingEligible(mode, card))
      .map((card) => ({ cardId: card.id, term: card.term, target: buildMatchingTarget(mode, card) }));

    res.status(200).json(pairs);
  }),
);

/** `POST /:setId/matching/:mode/complete` — records a finished matching round (T-028).
 * The client already knows which pairs it got right vs. wrong (it holds both sides of
 * every pair, see `MatchingPairDTO`'s doc comment) — this endpoint only persists the
 * verdicts via the shared `applyBatchProgress` helper, same mechanism every other
 * exercise type in this file uses. */
studentFlashcardsRouter.post(
  '/:setId/matching/:mode/complete',
  asyncHandler(async (req, res) => {
    const mode = req.params.mode;
    if (!isMatchingMode(mode)) {
      res.status(400).json({ error: `Unknown matching mode. Must be one of: ${MATCHING_MODES.join(', ')}.` });
      return;
    }

    const set = await loadSetWithCards(req.params.setId, req.user!.sub, res);
    if (!set) return;

    const body = req.body as Partial<CompleteVocabActivityRequest>;
    if (!Array.isArray(body.results)) {
      res.status(400).json({ error: 'results must be an array of { cardId, correct }.' });
      return;
    }

    const cardIds = new Set(set.cards.map((c) => c.id));
    const validResults = body.results.filter(
      (r): r is { cardId: string; correct: boolean } =>
        !!r && typeof r.cardId === 'string' && typeof r.correct === 'boolean' && cardIds.has(r.cardId),
    );

    // T-030: logs one `FlashcardExerciseAttempt` row (type 'matching') per result,
    // alongside the FlashcardProgress upsert `applyBatchProgress` already does.
    const updated = await applyBatchProgress(req.user!.sub, validResults, 'matching');
    const response: CompleteVocabActivityResponse = { updated };
    res.status(200).json(response);
  }),
);

// --- Use-word-in-a-sentence exercise (T-029) --------------------------------------------

/** `GET /:setId/sentence-prompts` — every card in the set is eligible (any word can be
 * used in a free-text sentence), unlike every exercise type above. */
studentFlashcardsRouter.get(
  '/:setId/sentence-prompts',
  asyncHandler(async (req, res) => {
    const set = await loadSetWithCards(req.params.setId, req.user!.sub, res);
    if (!set) return;

    const prompts: SentencePromptDTO[] = set.cards.map((card) => ({
      cardId: card.id,
      term: card.term,
      meaning: card.meaning,
    }));
    res.status(200).json(prompts);
  }),
);

/** `POST /:setId/sentence/:cardId/submit` — stores a student's sentence (T-029). Always
 * succeeds (never a 4xx for a "wrong" or word-missing sentence, per T-029's acceptance
 * criteria "does not block progress on a wrong answer") as long as the request itself
 * is well-formed; `containsWord` is purely informational feedback plus the signal fed
 * into `advanceStatus`, both computed via `sentenceContainsWord`'s heuristic (see that
 * module's doc comment for exactly which inflections count). */
studentFlashcardsRouter.post(
  '/:setId/sentence/:cardId/submit',
  asyncHandler(async (req, res) => {
    // T-076: gate on the set's own class assignment before even looking at the card.
    const scopedSet = await loadSetWithCards(req.params.setId, req.user!.sub, res);
    if (!scopedSet) return;

    const card = await prisma.flashcardCard.findUnique({ where: { id: req.params.cardId } });
    if (!card || card.setId !== req.params.setId) {
      res.status(404).json({ error: 'Card not found in this flashcard set.' });
      return;
    }

    const body = req.body as Partial<SubmitSentenceRequest>;
    if (typeof body.sentence !== 'string' || body.sentence.trim() === '') {
      res.status(400).json({ error: 'sentence is required and must be a non-empty string.' });
      return;
    }

    const containsWord = sentenceContainsWord(body.sentence, card.term);

    await prisma.vocabSentenceSubmission.create({
      data: {
        cardId: card.id,
        studentId: req.user!.sub,
        sentence: body.sentence.trim(),
        containsWord,
      },
    });

    const currentStatus = await getCurrentStatus(card.id, req.user!.sub);
    const nextStatus = advanceStatus(currentStatus, containsWord);
    await setFlashcardProgress(card.id, req.user!.sub, nextStatus);
    // T-030: append-only attempt log, alongside the FlashcardProgress upsert above.
    await recordExerciseAttempt(card.id, req.user!.sub, 'sentence', containsWord);

    const response: SubmitSentenceResponse = { containsWord, progressStatus: nextStatus };
    res.status(200).json(response);
  }),
);

// --- Vocab games: space shooter (T-034) and runner (T-035) ------------------------------

const VOCAB_GAME_TYPES: VocabGameType[] = ['spaceShooter', 'runner'];

function isVocabGameType(value: string): value is VocabGameType {
  return (VOCAB_GAME_TYPES as string[]).includes(value);
}

/** `GET /:setId/game-words` — the word pool both vocab games play with (T-034/T-035).
 * Every card qualifies (term+meaning are always present, no eligibility filter needed)
 * — shared by both games since they're built from the exact same underlying data,
 * only the play mechanic differs client-side. */
studentFlashcardsRouter.get(
  '/:setId/game-words',
  asyncHandler(async (req, res) => {
    const set = await loadSetWithCards(req.params.setId, req.user!.sub, res);
    if (!set) return;

    const words: GameWordDTO[] = set.cards.map((card) => ({
      cardId: card.id,
      term: card.term,
      meaning: card.meaning,
    }));
    res.status(200).json(words);
  }),
);

/** `POST /:setId/games/:gameType/complete` — records a finished game round (T-034
 * space shooter, T-035 runner). Both games play entirely client-side (a canvas game
 * loop firing an HTTP request per frame/shot would be pointless overhead) and report
 * their aggregated per-word results once, at round end, through the same
 * `applyBatchProgress` mechanism the matching exercise above uses — "completing a round
 * records progress via the same mechanism as the other exercises", per both tasks'
 * acceptance criteria. `gameType` is validated but doesn't change the update logic
 * itself; it exists for clarity/future per-game analytics, not because the two games
 * need different progress-recording rules. */
studentFlashcardsRouter.post(
  '/:setId/games/:gameType/complete',
  asyncHandler(async (req, res) => {
    const gameType = req.params.gameType;
    if (!isVocabGameType(gameType)) {
      res.status(400).json({ error: `Unknown game type. Must be one of: ${VOCAB_GAME_TYPES.join(', ')}.` });
      return;
    }

    const set = await loadSetWithCards(req.params.setId, req.user!.sub, res);
    if (!set) return;

    const body = req.body as Partial<CompleteVocabActivityRequest>;
    if (!Array.isArray(body.results)) {
      res.status(400).json({ error: 'results must be an array of { cardId, correct }.' });
      return;
    }

    const cardIds = new Set(set.cards.map((c) => c.id));
    const validResults = body.results.filter(
      (r): r is { cardId: string; correct: boolean } =>
        !!r && typeof r.cardId === 'string' && typeof r.correct === 'boolean' && cardIds.has(r.cardId),
    );

    // T-030: logs one `FlashcardExerciseAttempt` row (type = gameType) per result,
    // alongside the FlashcardProgress upsert `applyBatchProgress` already does.
    const updated = await applyBatchProgress(req.user!.sub, validResults, gameType);
    const response: CompleteVocabActivityResponse = { updated };
    res.status(200).json(response);
  }),
);
