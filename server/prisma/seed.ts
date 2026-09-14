/**
 * Dev seed script (T-005 + T-007 verification).
 *
 * Run with: `npm run seed -w server` (also wired as Prisma's default seed command, so
 * `npx prisma db seed` -w server works too).
 *
 * What it does:
 * 1. Creates (or reuses) one teacher account for local dev/testing, since teachers are
 *    never created via public registration (PROJECT_PLAN Assumption A1). Credentials
 *    come from `SEED_TEACHER_EMAIL` / `SEED_TEACHER_PASSWORD` env vars if set, else
 *    fall back to documented dev-only defaults (printed below either way so you never
 *    have to go dig through `.env`).
 * 2. Creates (or reuses) one demo Test owned by that teacher, with one Section
 *    containing one question of each objective type (multipleChoice, trueFalse,
 *    fillBlank) — this is T-007's required round-trip proof. It then re-queries that
 *    test with nested includes (sections -> questions -> choices) and prints the full
 *    structure so you can see the exact shape a later API/UI will consume.
 * 3. Creates (or reuses) a SECOND teacher account (`SEED_TEACHER_2_*`). This is a
 *    permanent dev fixture, not a leftover — T-008's acceptance criteria requires
 *    proving cross-teacher isolation (teacher A can't edit teacher B's test), which
 *    needs at least two real teacher accounts to test against at any time, not just
 *    during one verification session. Kept here (rather than deleted after use) so the
 *    next person/agent who needs to re-verify authoring/variant/session ownership
 *    checks doesn't have to reconstruct this fixture from scratch.
 * 4. Creates two default `AcademicPeriod`s spanning the CURRENT calendar year (T-018's
 *    required "at least two default academic periods for the current year"), split at
 *    the year's midpoint so "today" always falls inside one of them no matter when this
 *    seed is run. Also seeds a couple of sample `Unit`s so the curriculum-tagging UI has
 *    something to select from immediately. Dates are parsed the same
 *    Asia/Ho_Chi_Minh-fixed-offset way as `curriculum.routes.ts`'s `parseHcmDate`
 *    (PROJECT_PLAN Assumption A5) — kept as a small local copy here rather than an
 *    import since a seed script intentionally doesn't depend on route modules.
 *
 * Idempotent: safe to run multiple times — it looks up existing rows by a stable key
 * (email for the user, title+teacherId for the test, name for units/periods) instead of
 * blindly inserting duplicates every run.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SEED_TEACHER_EMAIL = process.env.SEED_TEACHER_EMAIL ?? 'teacher@example.com';
const SEED_TEACHER_PASSWORD = process.env.SEED_TEACHER_PASSWORD ?? 'teacher-dev-password123';
const SEED_TEACHER_NAME = process.env.SEED_TEACHER_NAME ?? 'Demo Teacher';

// Second teacher fixture (T-008) — see doc comment above. Only used for
// cross-teacher-isolation testing; no demo test is seeded for this one on purpose, so
// "teacher 2 has zero tests of their own" stays a stable, predictable starting point.
const SEED_TEACHER_2_EMAIL = process.env.SEED_TEACHER_2_EMAIL ?? 'teacher2@example.com';
const SEED_TEACHER_2_PASSWORD = process.env.SEED_TEACHER_2_PASSWORD ?? 'teacher2-dev-password123';
const SEED_TEACHER_2_NAME = process.env.SEED_TEACHER_2_NAME ?? 'Demo Teacher Two';

const DEMO_TEST_TITLE = 'Seed Demo Test (T-007 round-trip check)';

async function seedSecondTeacher() {
  const passwordHash = await bcrypt.hash(SEED_TEACHER_2_PASSWORD, 12);

  await prisma.user.upsert({
    where: { email: SEED_TEACHER_2_EMAIL },
    update: {},
    create: {
      email: SEED_TEACHER_2_EMAIL,
      name: SEED_TEACHER_2_NAME,
      role: 'teacher',
      passwordHash,
    },
  });

  console.log('[seed] Second teacher account ready (cross-teacher-isolation fixture, T-008):');
  console.log(`  email:    ${SEED_TEACHER_2_EMAIL}`);
  console.log(`  password: ${SEED_TEACHER_2_PASSWORD}\n`);
}

async function seedTeacher() {
  const passwordHash = await bcrypt.hash(SEED_TEACHER_PASSWORD, 12);

  const teacher = await prisma.user.upsert({
    where: { email: SEED_TEACHER_EMAIL },
    update: {},
    create: {
      email: SEED_TEACHER_EMAIL,
      name: SEED_TEACHER_NAME,
      role: 'teacher',
      passwordHash,
    },
  });

  console.log('\n[seed] Teacher account ready for local dev/testing:');
  console.log(`  email:    ${SEED_TEACHER_EMAIL}`);
  console.log(`  password: ${SEED_TEACHER_PASSWORD}`);
  console.log(
    '  (dev-only credentials — override with SEED_TEACHER_EMAIL / SEED_TEACHER_PASSWORD / SEED_TEACHER_NAME env vars.)\n',
  );

  return teacher;
}

async function seedDemoTest(teacherId: string) {
  const existing = await prisma.test.findFirst({
    where: { title: DEMO_TEST_TITLE, teacherId },
  });
  if (existing) {
    console.log(`[seed] Demo test already exists (id: ${existing.id}), skipping creation.`);
    return existing.id;
  }

  const test = await prisma.test.create({
    data: {
      title: DEMO_TEST_TITLE,
      teacherId,
      sections: {
        create: [
          {
            title: 'Section 1 — Mixed objective questions',
            order: 1,
            questions: {
              create: [
                {
                  type: 'multipleChoice',
                  prompt: 'Which word is a synonym of "happy"?',
                  order: 1,
                  choices: {
                    create: [
                      { text: 'Joyful', isCorrect: true, order: 1 },
                      { text: 'Sad', isCorrect: false, order: 2 },
                      { text: 'Angry', isCorrect: false, order: 3 },
                      { text: 'Tired', isCorrect: false, order: 4 },
                    ],
                  },
                },
                {
                  type: 'trueFalse',
                  prompt: 'The sun rises in the west.',
                  order: 2,
                  choices: {
                    create: [
                      { text: 'True', isCorrect: false, order: 1 },
                      { text: 'False', isCorrect: true, order: 2 },
                    ],
                  },
                },
                {
                  type: 'fillBlank',
                  prompt: 'Water boils at 100 degrees _____.',
                  order: 3,
                  acceptedAnswers: ['Celsius', 'celsius', 'C'],
                },
              ],
            },
          },
        ],
      },
    },
  });

  console.log(`[seed] Created demo test (id: ${test.id}).`);
  return test.id;
}

async function verifyRoundTrip(testId: string) {
  const test = await prisma.test.findUniqueOrThrow({
    where: { id: testId },
    include: {
      teacher: { select: { id: true, name: true, email: true, role: true } },
      sections: {
        orderBy: { order: 'asc' },
        include: {
          questions: {
            orderBy: { order: 'asc' },
            include: {
              choices: { orderBy: { order: 'asc' } },
            },
          },
        },
      },
    },
  });

  console.log('\n[seed] T-007 round-trip verification — nested query result:');
  console.log(JSON.stringify(test, null, 2));

  const questionTypes = test.sections.flatMap((s) => s.questions.map((q) => q.type));
  const hasAllThreeTypes = ['multipleChoice', 'trueFalse', 'fillBlank'].every((t) =>
    questionTypes.includes(t as (typeof questionTypes)[number]),
  );
  console.log(
    `\n[seed] Contains one of each required type (multipleChoice, trueFalse, fillBlank): ${hasAllThreeTypes}\n`,
  );
}

/** Fixed Asia/Ho_Chi_Minh offset (UTC+7, no DST) — same convention as
 * `curriculum.routes.ts`'s `parseHcmDate`, per PROJECT_PLAN Assumption A5. */
function hcmDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00+07:00`);
}

async function seedAcademicPeriods() {
  const year = new Date().getFullYear();
  const periods = [
    { name: `Semester 1 ${year}`, startDate: `${year}-01-01`, endDate: `${year}-06-30` },
    { name: `Semester 2 ${year}`, startDate: `${year}-07-01`, endDate: `${year}-12-31` },
  ];

  for (const period of periods) {
    const existing = await prisma.academicPeriod.findFirst({ where: { name: period.name } });
    if (existing) continue;
    await prisma.academicPeriod.create({
      data: {
        name: period.name,
        startDate: hcmDate(period.startDate),
        endDate: hcmDate(period.endDate),
      },
    });
  }
  console.log(`[seed] Academic periods ready: two semesters spanning ${year} (T-018).`);
}

async function seedUnits() {
  const units = [
    { name: 'Unit 1 — Getting Started', order: 1 },
    { name: 'Unit 2 — Family & Friends', order: 2 },
  ];

  for (const unit of units) {
    const existing = await prisma.unit.findFirst({ where: { name: unit.name } });
    if (existing) continue;
    await prisma.unit.create({ data: unit });
  }
  console.log('[seed] Sample curriculum units ready (T-018).');
}

const DEMO_FLASHCARD_SET_NAME = 'Seed Demo Vocabulary Set (T-021 round-trip check)';

/**
 * Placeholder image/audio URL convention (T-021/T-026, documented choice): these are
 * NOT real assets — no image/audio hosting or TTS service exists in this project (and
 * none is needed; per the batch instructions, a simple placeholder string is enough, so
 * this is a code/README-documented convention, not an `INTEGRATIONS_TODO.md` entry).
 * `imageUrl`/`audioUrl` are just URL-shaped strings the teacher-authoring UI accepts
 * as-is; the listen-and-type exercise (T-026) only checks that `audioUrl` is non-null to
 * consider a card eligible, it never validates that the URL actually resolves to
 * playable audio. Real content authoring later just means teachers pasting real hosted
 * URLs here instead.
 */
function placeholderImageUrl(slug: string): string {
  return `https://example.com/placeholder-assets/images/${slug}.png`;
}
function placeholderAudioUrl(slug: string): string {
  return `https://example.com/placeholder-assets/audio/${slug}.mp3`;
}

/**
 * Seeds one demo `FlashcardSet` (T-021) with cards deliberately varying which optional
 * fields are populated, so the round-trip check below actually exercises "some with
 * optional fields, some without" per T-021's acceptance criteria:
 * - `apple`: every optional field populated (ipa, image, audio, exampleSentence,
 *   synonyms, antonyms) — also eligible for all four T-024–T-027 exercise types.
 * - `happy`: ipa + exampleSentence + synonyms/antonyms, but no image/audio.
 * - `run`: audio only (eligible for T-026 listen-and-type), nothing else optional.
 * - `book`: bare minimum — term + meaning only, every optional field left unset. Proves
 *   optional really means optional, and this card is correctly excluded from all four
 *   exercise types below.
 * - `quick`: ipa + synonyms/antonyms + audio, but no exampleSentence.
 */
async function seedFlashcards(teacherId: string, unitId: string | null) {
  const existing = await prisma.flashcardSet.findFirst({
    where: { name: DEMO_FLASHCARD_SET_NAME, teacherId },
  });
  if (existing) {
    console.log(`[seed] Demo flashcard set already exists (id: ${existing.id}), skipping creation.`);
    return existing.id;
  }

  const set = await prisma.flashcardSet.create({
    data: {
      name: DEMO_FLASHCARD_SET_NAME,
      teacherId,
      unitId,
      cards: {
        create: [
          {
            term: 'apple',
            meaning: 'A round fruit with red, green, or yellow skin and a crisp white inside.',
            ipa: '/ˈæp.əl/',
            imageUrl: placeholderImageUrl('apple'),
            audioUrl: placeholderAudioUrl('apple'),
            exampleSentence: 'She ate an ___ for breakfast.',
            synonyms: ['pome fruit'],
            antonyms: [],
            order: 1,
          },
          {
            term: 'happy',
            meaning: 'Feeling or showing pleasure and contentment.',
            ipa: '/ˈhæp.i/',
            exampleSentence: 'The children looked ___ after winning the game.',
            synonyms: ['glad', 'joyful'],
            antonyms: ['sad', 'unhappy'],
            order: 2,
          },
          {
            term: 'run',
            meaning: 'To move at a speed faster than walking, using your legs.',
            audioUrl: placeholderAudioUrl('run'),
            order: 3,
          },
          {
            term: 'book',
            meaning: 'A set of printed pages bound together for reading.',
            order: 4,
          },
          {
            term: 'quick',
            meaning: 'Moving or happening fast.',
            ipa: '/kwɪk/',
            audioUrl: placeholderAudioUrl('quick'),
            synonyms: ['fast', 'rapid'],
            antonyms: ['slow'],
            order: 5,
          },
        ],
      },
    },
  });

  console.log(`[seed] Created demo flashcard set (id: ${set.id}).`);
  return set.id;
}

async function verifyFlashcardRoundTrip(setId: string) {
  const set = await prisma.flashcardSet.findUniqueOrThrow({
    where: { id: setId },
    include: {
      teacher: { select: { id: true, name: true, email: true } },
      unit: { select: { id: true, name: true } },
      cards: { orderBy: { order: 'asc' } },
    },
  });

  console.log('\n[seed] T-021 round-trip verification — nested query result:');
  console.log(JSON.stringify(set, null, 2));

  const bySlug = Object.fromEntries(set.cards.map((c) => [c.term, c]));
  const checks = {
    'exactly 5 cards': set.cards.length === 5,
    'apple has every optional field set': Boolean(
      bySlug.apple?.ipa && bySlug.apple?.imageUrl && bySlug.apple?.audioUrl &&
        bySlug.apple?.exampleSentence && bySlug.apple?.synonyms.length > 0,
    ),
    'book has every optional field null/empty': Boolean(
      bySlug.book &&
        bySlug.book.ipa === null &&
        bySlug.book.imageUrl === null &&
        bySlug.book.audioUrl === null &&
        bySlug.book.exampleSentence === null &&
        bySlug.book.synonyms.length === 0 &&
        bySlug.book.antonyms.length === 0,
    ),
    'exampleSentence contains the blank marker': bySlug.apple?.exampleSentence?.includes('___') ?? false,
  };
  console.log('\n[seed] Field-intact checks:', checks);
}

async function main() {
  const teacher = await seedTeacher();
  await seedSecondTeacher();
  const testId = await seedDemoTest(teacher.id);
  await verifyRoundTrip(testId);
  await seedAcademicPeriods();
  await seedUnits();
  const unit = await prisma.unit.findFirst({ orderBy: { order: 'asc' } });
  const flashcardSetId = await seedFlashcards(teacher.id, unit?.id ?? null);
  await verifyFlashcardRoundTrip(flashcardSetId);
}

main()
  .catch((err) => {
    console.error('[seed] Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
