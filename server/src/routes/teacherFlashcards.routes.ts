/**
 * Teacher flashcard-set & vocabulary-word authoring (T-022): CRUD for a teacher's own
 * `FlashcardSet`/`FlashcardCard`. Same shape as `teacherTests.routes.ts` — every route
 * here is teacher-only (`requireRole('teacher')`) and every route touching a specific
 * set enforces ownership via `requireOwnedFlashcardSet` (404 for another teacher's set,
 * same "don't reveal existence" reasoning as `requireOwnedTest`).
 */

import { Router } from 'express';
import type {
  BulkCreateFlashcardCardsRequest,
  BulkCreateFlashcardCardsResponse,
  BulkCreateFlashcardCardsRowError,
  CefrLevel,
  ContentClassAssignmentDTO,
  CreateFlashcardCardRequest,
  CreateFlashcardSetRequest,
  FlashcardCardDTO,
  FlashcardSetDetailDTO,
  FlashcardSetSummaryDTO,
  GenerateVocabularyRequest,
  GenerateVocabularyResponse,
  SentenceSubmissionDTO,
  UpdateContentClassesRequest,
  UpdateFlashcardCardRequest,
  UpdateFlashcardSetRequest,
} from '@platform/shared';
import { CEFR_LEVELS, FLASHCARD_BULK_IMPORT_MAX_ROWS } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { requireOwnedFlashcardSet } from '../lib/ownedFlashcardSet';
import { loadOwnerClassesWithCurrentPeriod, validateClassIdsForOwner } from '../lib/contentClassAssignment';
import { generateVocabulary, VOCAB_GENERATION_MAX_COUNT, VOCAB_GENERATION_MIN_COUNT } from '../aiTools/vocabGenerator';

export const teacherFlashcardsRouter = Router();

// T-071: `admin` also allowed (PROJECT_PLAN Assumption A12) — see
// `teacherTests.routes.ts`'s identical note; `requireOwnedFlashcardSet` is what lets
// admin manage ANY teacher's flashcard set through these same routes.
teacherFlashcardsRouter.use(requireAuth, requireRole('teacher', 'admin'));

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
  cefrLevel: string | null;
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
    cefrLevel: card.cefrLevel as CefrLevel | null,
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
  if (body.cefrLevel != null && !CEFR_LEVELS.includes(body.cefrLevel)) {
    return `cefrLevel must be one of: ${CEFR_LEVELS.join(', ')}.`;
  }
  return null;
}

// --- AI vocabulary generation (2026-10, feature 1 of the "AI Content Tools" set) -------

/**
 * `POST /flashcards/generate` — NOT scoped to a `:setId` (unlike every other route in this
 * file): generating a draft doesn't touch any particular set, or any set at all, until the
 * teacher reviews it and chooses where to save it. Returns a DRAFT only (`generateVocabulary`
 * never writes to the DB) — saving is a SEPARATE, later call to the existing
 * `POST .../cards/bulk` endpoint above, into whichever set (new or existing) the teacher
 * picks client-side. See `vocabGenerator.ts`'s doc comment for why there's no dedicated
 * "commit" endpoint for this feature.
 */
teacherFlashcardsRouter.post(
  '/flashcards/generate',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<GenerateVocabularyRequest>;

    const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
    if (!topic) {
      res.status(400).json({ error: 'topic is required.' });
      return;
    }
    if (!Array.isArray(body.levels) || body.levels.length === 0 || body.levels.some((l) => !CEFR_LEVELS.includes(l))) {
      res.status(400).json({ error: `levels must be a non-empty array of: ${CEFR_LEVELS.join(', ')}.` });
      return;
    }
    if (
      typeof body.count !== 'number' ||
      !Number.isInteger(body.count) ||
      body.count < VOCAB_GENERATION_MIN_COUNT ||
      body.count > VOCAB_GENERATION_MAX_COUNT
    ) {
      res.status(400).json({
        error: `count must be an integer between ${VOCAB_GENERATION_MIN_COUNT} and ${VOCAB_GENERATION_MAX_COUNT}.`,
      });
      return;
    }

    const cards = await generateVocabulary({ topic, levels: body.levels, count: body.count });
    const response: GenerateVocabularyResponse = { cards };
    res.status(200).json(response);
  }),
);

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
    const set = await requireOwnedFlashcardSet(req.params.setId, req.user!, res);
    if (!set) return;
    res.status(200).json(await fetchDetail(set.id));
  }),
);

teacherFlashcardsRouter.patch(
  '/flashcard-sets/:setId',
  asyncHandler(async (req, res) => {
    const set = await requireOwnedFlashcardSet(req.params.setId, req.user!, res);
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
    const set = await requireOwnedFlashcardSet(req.params.setId, req.user!, res);
    if (!set) return;
    await prisma.flashcardSet.delete({ where: { id: set.id } });
    res.status(204).send();
  }),
);

/**
 * POST /api/teacher/flashcard-sets/:setId/duplicate (T-118, Phase 16's "Nhân bản" finding) —
 * same shape/reasoning as `teacherTests.routes.ts`'s `POST /tests/:testId/duplicate`: deep-copies
 * the `FlashcardSet` row (name gets " (bản sao)", `unitId` kept) and every `FlashcardCard` (in
 * order), owned by the same teacher as the original set — never `req.user!.sub`, so an admin
 * duplicating another teacher's set doesn't reassign it to themselves. Does NOT copy
 * `FlashcardProgress`/`FlashcardExerciseAttempt` (student runtime state) or any
 * `FlashcardSetClassPeriodAssignment` — the copy starts assigned to no class, same as a
 * brand-new set. One Prisma transaction via a nested write (`cards: { create: [...] }`).
 * Response reuses `fetchDetail`, the same serializer every other route in this file returns.
 */
teacherFlashcardsRouter.post(
  '/flashcard-sets/:setId/duplicate',
  asyncHandler(async (req, res) => {
    const set = await requireOwnedFlashcardSet(req.params.setId, req.user!, res);
    if (!set) return;

    const source = await prisma.flashcardSet.findUniqueOrThrow({
      where: { id: set.id },
      include: { cards: { orderBy: { order: 'asc' } } },
    });

    const created = await prisma.$transaction(async (tx) => {
      return tx.flashcardSet.create({
        data: {
          name: `${source.name} (bản sao)`,
          teacherId: source.teacherId,
          unitId: source.unitId,
          cards: {
            create: source.cards.map((card) => ({
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
            })),
          },
        },
        select: { id: true },
      });
    });

    res.status(201).json(await fetchDetail(created.id));
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
    const set = await requireOwnedFlashcardSet(req.params.setId, req.user!, res);
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
        cefrLevel: body.cefrLevel ?? null,
        order: (maxOrder._max.order ?? 0) + 1,
      },
    });

    res.status(201).json(await fetchDetail(set.id));
  }),
);

/**
 * `POST /flashcard-sets/:setId/cards/bulk` (T-085) — adds many cards to a set in one
 * request, e.g. from a teacher's Excel-file upload (parsed entirely client-side into
 * plain `CreateFlashcardCardRequest` rows — see `client/src/lib/flashcardExcelImport.ts`;
 * this route has no idea the request came from a spreadsheet, it just sees an array).
 *
 * Atomicity, your-call-documented: PARTIAL SUCCESS, not all-or-nothing. Every row is
 * independently validated with the exact same `validateCardBody` the single-card route
 * above uses, and a row that fails validation is skipped and reported back with its
 * reason — it does NOT abort rows that already passed. Reasoning: the realistic failure
 * mode for a bulk import is a handful of typo'd/missing cells scattered through an
 * otherwise-fine spreadsheet of dozens-to-hundreds of words. All-or-nothing would force
 * the teacher to fix one bad row and re-upload the ENTIRE file (re-submitting hundreds of
 * already-good rows) just to get anything saved; partial success saves everything that's
 * already valid and lets the teacher fix only the handful of rows called out in the
 * response — the same "independent server re-check, but forgiving of individual mistakes"
 * spirit as every other authoring form in this app, just applied N times in one request
 * instead of once. There is deliberately no DB transaction wrapping the whole loop for
 * this same reason: a later row failing must never roll back earlier rows that already
 * succeeded.
 *
 * Server-side re-validation is NOT optional here even though the client already validates
 * client-side first (T-085's client-side preview step) — this route trusts nothing about
 * the request body beyond its own re-check, same as every other route in this file.
 */
teacherFlashcardsRouter.post(
  '/flashcard-sets/:setId/cards/bulk',
  asyncHandler(async (req, res) => {
    const set = await requireOwnedFlashcardSet(req.params.setId, req.user!, res);
    if (!set) return;

    const body = req.body as Partial<BulkCreateFlashcardCardsRequest>;
    if (!Array.isArray(body.cards) || body.cards.length === 0) {
      res.status(400).json({ error: 'cards must be a non-empty array.' });
      return;
    }
    // Max-rows cap (your call, documented at the shared constant's own definition,
    // `FLASHCARD_BULK_IMPORT_MAX_ROWS` in `@platform/shared`) — re-enforced here rather
    // than trusting the client's own pre-upload check of the same limit.
    if (body.cards.length > FLASHCARD_BULK_IMPORT_MAX_ROWS) {
      res.status(400).json({
        error: `cards cannot exceed ${FLASHCARD_BULK_IMPORT_MAX_ROWS} rows per bulk import.`,
      });
      return;
    }

    const maxOrder = await prisma.flashcardCard.aggregate({
      where: { setId: set.id },
      _max: { order: true },
    });
    let nextOrder = (maxOrder._max.order ?? 0) + 1;

    const errors: BulkCreateFlashcardCardsRowError[] = [];
    let created = 0;
    for (const [index, rawRow] of body.cards.entries()) {
      // `rawRow` is untyped request-body data, same trust level as any other route's
      // `req.body` — re-cast and re-validate exactly like the single-card route does,
      // not assumed to already match `CreateFlashcardCardRequest` just because the
      // top-level array shape checked out above.
      const rowBody = (rawRow ?? {}) as Partial<CreateFlashcardCardRequest>;
      const validationError = validateCardBody(rowBody);
      if (validationError) {
        errors.push({ row: index + 1, message: validationError });
        continue;
      }

      await prisma.flashcardCard.create({
        data: {
          setId: set.id,
          term: rowBody.term!.trim(),
          meaning: rowBody.meaning!.trim(),
          ipa: rowBody.ipa?.trim() || null,
          imageUrl: rowBody.imageUrl?.trim() || null,
          audioUrl: rowBody.audioUrl?.trim() || null,
          exampleSentence: rowBody.exampleSentence?.trim() || null,
          synonyms: (rowBody.synonyms ?? []).map((s) => s.trim()).filter(Boolean),
          antonyms: (rowBody.antonyms ?? []).map((s) => s.trim()).filter(Boolean),
          cefrLevel: rowBody.cefrLevel ?? null,
          order: nextOrder,
        },
      });
      nextOrder += 1;
      created += 1;
    }

    // Always 201: the REQUEST itself was well-formed and fully processed (every row got
    // either created or reported), even if zero individual rows happened to be valid —
    // per-row outcome lives in the response body, not the HTTP status, so the client can
    // handle this response uniformly without branching on status code first.
    const response: BulkCreateFlashcardCardsResponse = {
      created,
      errors,
      set: await fetchDetail(set.id),
    };
    res.status(201).json(response);
  }),
);

teacherFlashcardsRouter.patch(
  '/flashcard-sets/:setId/cards/:cardId',
  asyncHandler(async (req, res) => {
    const set = await requireOwnedFlashcardSet(req.params.setId, req.user!, res);
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
        cefrLevel: body.cefrLevel ?? null,
      },
    });

    res.status(200).json(await fetchDetail(set.id));
  }),
);

teacherFlashcardsRouter.delete(
  '/flashcard-sets/:setId/cards/:cardId',
  asyncHandler(async (req, res) => {
    const set = await requireOwnedFlashcardSet(req.params.setId, req.user!, res);
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
    const set = await requireOwnedFlashcardSet(req.params.setId, req.user!, res);
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

// --- Content-to-class assignment (T-075) ---------------------------------------------
// Same shape/reasoning as `teacherTests.routes.ts`'s identical block — see
// `lib/contentClassAssignment.ts`'s doc comment for why validation is against
// `set.teacherId` (the set's own owner), not `req.user!.sub`.

teacherFlashcardsRouter.get(
  '/flashcard-sets/:setId/classes',
  asyncHandler(async (req, res) => {
    const set = await requireOwnedFlashcardSet(req.params.setId, req.user!, res);
    if (!set) return;

    const ownerClassPeriods = await loadOwnerClassesWithCurrentPeriod(set.teacherId);
    const assigned =
      ownerClassPeriods.length === 0
        ? []
        : await prisma.flashcardSetClassPeriodAssignment.findMany({
            where: { flashcardSetId: set.id, OR: ownerClassPeriods },
            select: { classId: true },
          });
    const body: ContentClassAssignmentDTO = { classIds: assigned.map((a) => a.classId) };
    res.status(200).json(body);
  }),
);

teacherFlashcardsRouter.put(
  '/flashcard-sets/:setId/classes',
  asyncHandler(async (req, res) => {
    const set = await requireOwnedFlashcardSet(req.params.setId, req.user!, res);
    if (!set) return;

    const body = req.body as Partial<UpdateContentClassesRequest>;
    const result = await validateClassIdsForOwner(body.classIds, set.teacherId);
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }

    // T-099: replace-not-merge, scoped to exactly this set's (class, CLASS'S CURRENT
    // PERIOD) slice — see `teacherTests.routes.ts`'s identical `PUT .../classes` for the
    // full reasoning.
    const requested = new Set(result.classIds);
    const ownerClassPeriods = await loadOwnerClassesWithCurrentPeriod(set.teacherId);
    await prisma.$transaction(
      ownerClassPeriods.map(({ classId, periodId }) =>
        requested.has(classId)
          ? prisma.flashcardSetClassPeriodAssignment.upsert({
              where: {
                flashcardSetId_classId_periodId: { flashcardSetId: set.id, classId, periodId },
              },
              create: { flashcardSetId: set.id, classId, periodId },
              update: {},
            })
          : prisma.flashcardSetClassPeriodAssignment.deleteMany({
              where: { flashcardSetId: set.id, classId, periodId },
            }),
      ),
    );

    const assigned =
      ownerClassPeriods.length === 0
        ? []
        : await prisma.flashcardSetClassPeriodAssignment.findMany({
            where: { flashcardSetId: set.id, OR: ownerClassPeriods },
            select: { classId: true },
          });
    const response: ContentClassAssignmentDTO = { classIds: assigned.map((a) => a.classId) };
    res.status(200).json(response);
  }),
);
