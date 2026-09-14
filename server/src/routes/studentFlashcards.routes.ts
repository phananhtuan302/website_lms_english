/**
 * Student-facing vocabulary endpoints: browsing flashcard sets + study/review mode
 * (T-023), and the four vocabulary exercise types built in this same batch (T-024
 * fill-blank, T-025 unscramble, T-026 listen-and-type, T-027 IPA-to-word).
 *
 * Documented choice: unlike `Test`/`TestSession` (which are only reachable via an
 * explicit QR-join), a `FlashcardSet` has no enrollment/assignment concept anywhere in
 * this schema — unlike a live test session, vocabulary study is a standing resource a
 * student can return to anytime. So every route here is `student`-only
 * (`requireRole('student')` — a teacher gets 403, same as any student-only route) but
 * NOT ownership-scoped to a particular teacher: any logged-in student can study any
 * set. This matches the single-small-class assumption already used for `Unit`/
 * `AcademicPeriod` (schema.prisma) and can be tightened later (e.g. a class/cohort
 * model) without breaking this shape.
 */

import { Router } from 'express';
import type {
  CheckVocabExerciseRequest,
  CheckVocabExerciseResponse,
  StudentFlashcardCardDTO,
  StudentFlashcardSetDetailDTO,
  StudentFlashcardSetSummaryDTO,
  UpdateFlashcardProgressRequest,
  VocabExercisePromptDTO,
  VocabExerciseType,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { advanceStatus, getCurrentStatus, setFlashcardProgress } from '../lib/flashcardProgress';
import {
  VOCAB_EXERCISE_TYPES,
  buildPrompt,
  isCorrectAnswer,
  isEligible,
} from '../lib/flashcardExercises';

export const studentFlashcardsRouter = Router();

studentFlashcardsRouter.use(requireAuth, requireRole('student'));

// --- Browse + study mode (T-023) ------------------------------------------------------

studentFlashcardsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const sets = await prisma.flashcardSet.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { unit: { select: { name: true } }, _count: { select: { cards: true } } },
    });
    const summaries: StudentFlashcardSetSummaryDTO[] = sets.map((set) => ({
      id: set.id,
      name: set.name,
      unitId: set.unitId,
      unitName: set.unit?.name ?? null,
      cardCount: set._count.cards,
    }));
    res.status(200).json(summaries);
  }),
);

/** Loads a set + its cards, or writes a 404 and returns `null`. Shared by the detail
 * view and every exercise route below (all scoped to `:setId`). */
async function loadSetWithCards(setId: string, res: import('express').Response) {
  const set = await prisma.flashcardSet.findUnique({
    where: { id: setId },
    include: { unit: { select: { name: true } }, cards: { orderBy: { order: 'asc' } } },
  });
  if (!set) {
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
    const set = await loadSetWithCards(req.params.setId, res);
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
        order: card.order,
        progressStatus: progress?.status ?? null,
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
    const set = await prisma.flashcardSet.findUnique({ where: { id: req.params.setId } });
    if (!set) {
      res.status(404).json({ error: 'Flashcard set not found.' });
      return;
    }
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

    const set = await loadSetWithCards(req.params.setId, res);
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

    const response: CheckVocabExerciseResponse = {
      correct,
      correctAnswer: card.term,
      progressStatus: nextStatus,
    };
    res.status(200).json(response);
  }),
);
