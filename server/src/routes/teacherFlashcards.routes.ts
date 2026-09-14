/**
 * Teacher flashcard-set & vocabulary-word authoring (T-022): CRUD for a teacher's own
 * `FlashcardSet`/`FlashcardCard`. Same shape as `teacherTests.routes.ts` — every route
 * here is teacher-only (`requireRole('teacher')`) and every route touching a specific
 * set enforces ownership via `requireOwnedFlashcardSet` (404 for another teacher's set,
 * same "don't reveal existence" reasoning as `requireOwnedTest`).
 */

import { Router } from 'express';
import type {
  CreateFlashcardCardRequest,
  CreateFlashcardSetRequest,
  FlashcardCardDTO,
  FlashcardSetDetailDTO,
  FlashcardSetSummaryDTO,
  SentenceSubmissionDTO,
  UpdateFlashcardCardRequest,
  UpdateFlashcardSetRequest,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { requireOwnedFlashcardSet } from '../lib/ownedFlashcardSet';

export const teacherFlashcardsRouter = Router();

teacherFlashcardsRouter.use(requireAuth, requireRole('teacher'));

// --- Serialization -------------------------------------------------------------------

function toCardDTO(card: {
  id: string;
  term: string;
  meaning: string;
  ipa: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  exampleSentence: string | null;
  synonyms: string[];
  antonyms: string[];
  order: number;
}): FlashcardCardDTO {
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
  };
}

async function fetchDetail(setId: string): Promise<FlashcardSetDetailDTO> {
  const set = await prisma.flashcardSet.findUniqueOrThrow({
    where: { id: setId },
    include: {
      unit: { select: { id: true, name: true } },
      cards: { orderBy: { order: 'asc' } },
    },
  });
  return {
    id: set.id,
    name: set.name,
    teacherId: set.teacherId,
    unitId: set.unitId,
    unit: set.unit ? { id: set.unit.id, name: set.unit.name } : null,
    cards: set.cards.map(toCardDTO),
    createdAt: set.createdAt.toISOString(),
    updatedAt: set.updatedAt.toISOString(),
  };
}

/** Same "your call, document it" `unitId` validation as `teacherTests.routes.ts`'s
 * `validateUnitId` — kept as a local copy rather than a shared import since it's a
 * three-line DB lookup, not worth cross-module coupling for. */
async function validateUnitId(value: unknown): Promise<string | null> {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return 'unitId must be a string id or null.';
  const unit = await prisma.unit.findUnique({ where: { id: value } });
  if (!unit) return 'unitId does not reference an existing Unit.';
  return null;
}

/** Validates a create/edit card body. Returns an English error string, or `null` if
 * valid — same convention as `teacherTests.routes.ts`'s `validateQuestionBody`. */
function validateCardBody(body: Partial<CreateFlashcardCardRequest>): string | null {
  if (typeof body.term !== 'string' || body.term.trim() === '') {
    return 'Card term is required.';
  }
  if (typeof body.meaning !== 'string' || body.meaning.trim() === '') {
    return 'Card meaning is required.';
  }
  if (body.exampleSentence != null) {
    if (typeof body.exampleSentence !== 'string' || !body.exampleSentence.includes('___')) {
      return 'exampleSentence, if provided, must contain "___" to mark the blank.';
    }
  }
  for (const field of ['synonyms', 'antonyms'] as const) {
    const value = body[field];
    if (value !== undefined && (!Array.isArray(value) || value.some((v) => typeof v !== 'string'))) {
      return `${field} must be an array of strings.`;
    }
  }
  return null;
}

// --- Flashcard set CRUD ----------------------------------------------------------------

teacherFlashcardsRouter.post(
  '/flashcard-sets',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<CreateFlashcardSetRequest>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      res.status(400).json({ error: 'Flashcard set name is required.' });
      return;
    }
    const unitError = await validateUnitId(body.unitId);
    if (unitError) {
      res.status(400).json({ error: unitError });
      return;
    }

    const set = await prisma.flashcardSet.create({
      data: { name, teacherId: req.user!.sub, unitId: body.unitId ?? null },
    });
    res.status(201).json(await fetchDetail(set.id));
  }),
);

teacherFlashcardsRouter.get(
  '/flashcard-sets',
  asyncHandler(async (req, res) => {
    const sets = await prisma.flashcardSet.findMany({
      where: { teacherId: req.user!.sub },
      orderBy: { updatedAt: 'desc' },
      include: { unit: { select: { id: true, name: true } }, _count: { select: { cards: true } } },
    });
    const summaries: FlashcardSetSummaryDTO[] = sets.map((set) => ({
      id: set.id,
      name: set.name,
      unitId: set.unitId,
      unitName: set.unit?.name ?? null,
      cardCount: set._count.cards,
      createdAt: set.createdAt.toISOString(),
      updatedAt: set.updatedAt.toISOString(),
    }));
    res.status(200).json(summaries);
  }),
);

teacherFlashcardsRouter.get(
  '/flashcard-sets/:setId',
  asyncHandler(async (req, res) => {
    const set = await requireOwnedFlashcardSet(req.params.setId, req.user!.sub, res);
    if (!set) return;
    res.status(200).json(await fetchDetail(set.id));
  }),
);

teacherFlashcardsRouter.patch(
  '/flashcard-sets/:setId',
  asyncHandler(async (req, res) => {
    const set = await requireOwnedFlashcardSet(req.params.setId, req.user!.sub, res);
    if (!set) return;

    const body = req.body as Partial<UpdateFlashcardSetRequest>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      res.status(400).json({ error: 'Flashcard set name is required.' });
      return;
    }
    const unitError = await validateUnitId(body.unitId);
    if (unitError) {
      res.status(400).json({ error: unitError });
      return;
    }

    await prisma.flashcardSet.update({
      where: { id: set.id },
      data: { name, ...(body.unitId !== undefined ? { unitId: body.unitId } : {}) },
    });
    res.status(200).json(await fetchDetail(set.id));
  }),
);

teacherFlashcardsRouter.delete(
  '/flashcard-sets/:setId',
  asyncHandler(async (req, res) => {
    const set = await requireOwnedFlashcardSet(req.params.setId, req.user!.sub, res);
    if (!set) return;
    await prisma.flashcardSet.delete({ where: { id: set.id } });
    res.status(204).send();
  }),
);

// --- Card CRUD -------------------------------------------------------------------------

async function loadOwnedCard(setId: string, cardId: string) {
  const card = await prisma.flashcardCard.findUnique({ where: { id: cardId } });
  if (!card || card.setId !== setId) return null;
  return card;
}

teacherFlashcardsRouter.post(
  '/flashcard-sets/:setId/cards',
  asyncHandler(async (req, res) => {
    const set = await requireOwnedFlashcardSet(req.params.setId, req.user!.sub, res);
    if (!set) return;

    const body = req.body as Partial<CreateFlashcardCardRequest>;
    const validationError = validateCardBody(body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const maxOrder = await prisma.flashcardCard.aggregate({
      where: { setId: set.id },
      _max: { order: true },
    });

    await prisma.flashcardCard.create({
      data: {
        setId: set.id,
        term: body.term!.trim(),
        meaning: body.meaning!.trim(),
        ipa: body.ipa?.trim() || null,
        imageUrl: body.imageUrl?.trim() || null,
        audioUrl: body.audioUrl?.trim() || null,
        exampleSentence: body.exampleSentence?.trim() || null,
        synonyms: (body.synonyms ?? []).map((s) => s.trim()).filter(Boolean),
        antonyms: (body.antonyms ?? []).map((s) => s.trim()).filter(Boolean),
        order: (maxOrder._max.order ?? 0) + 1,
      },
    });

    res.status(201).json(await fetchDetail(set.id));
  }),
);

teacherFlashcardsRouter.patch(
  '/flashcard-sets/:setId/cards/:cardId',
  asyncHandler(async (req, res) => {
    const set = await requireOwnedFlashcardSet(req.params.setId, req.user!.sub, res);
    if (!set) return;

    const card = await loadOwnedCard(set.id, req.params.cardId);
    if (!card) {
      res.status(404).json({ error: 'Card not found.' });
      return;
    }

    const body = req.body as Partial<UpdateFlashcardCardRequest>;
    const validationError = validateCardBody(body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    await prisma.flashcardCard.update({
      where: { id: card.id },
      data: {
        term: body.term!.trim(),
        meaning: body.meaning!.trim(),
        ipa: body.ipa?.trim() || null,
        imageUrl: body.imageUrl?.trim() || null,
        audioUrl: body.audioUrl?.trim() || null,
        exampleSentence: body.exampleSentence?.trim() || null,
        synonyms: (body.synonyms ?? []).map((s) => s.trim()).filter(Boolean),
        antonyms: (body.antonyms ?? []).map((s) => s.trim()).filter(Boolean),
      },
    });

    res.status(200).json(await fetchDetail(set.id));
  }),
);

teacherFlashcardsRouter.delete(
  '/flashcard-sets/:setId/cards/:cardId',
  asyncHandler(async (req, res) => {
    const set = await requireOwnedFlashcardSet(req.params.setId, req.user!.sub, res);
    if (!set) return;

    const card = await loadOwnedCard(set.id, req.params.cardId);
    if (!card) {
      res.status(404).json({ error: 'Card not found.' });
      return;
    }

    await prisma.flashcardCard.delete({ where: { id: card.id } });
    res.status(200).json(await fetchDetail(set.id));
  }),
);

// --- Sentence submissions, read-only (T-029 "stored for teacher visibility") -----------

/** `GET /flashcard-sets/:setId/sentence-submissions` — every student's "use it in a
 * sentence" submission for this teacher's own set, newest first. Read-only: this batch
 * never adds a grading/override UI for these (T-029 is explicitly not AI- or
 * teacher-graded, just "stored for teacher visibility" per its acceptance criteria) —
 * a teacher can skim raw submissions here, nothing more yet. */
teacherFlashcardsRouter.get(
  '/flashcard-sets/:setId/sentence-submissions',
  asyncHandler(async (req, res) => {
    const set = await requireOwnedFlashcardSet(req.params.setId, req.user!.sub, res);
    if (!set) return;

    const submissions = await prisma.vocabSentenceSubmission.findMany({
      where: { card: { setId: set.id } },
      orderBy: { createdAt: 'desc' },
      include: { card: { select: { term: true } }, student: { select: { name: true } } },
    });

    const dtos: SentenceSubmissionDTO[] = submissions.map((s) => ({
      id: s.id,
      cardId: s.cardId,
      term: s.card.term,
      studentId: s.studentId,
      studentName: s.student.name,
      sentence: s.sentence,
      containsWord: s.containsWord,
      createdAt: s.createdAt.toISOString(),
    }));
    res.status(200).json(dtos);
  }),
);
