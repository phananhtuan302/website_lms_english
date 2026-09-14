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
 *
 * Idempotent: safe to run multiple times — it looks up existing rows by a stable key
 * (email for the user, title+teacherId for the test) instead of blindly inserting
 * duplicates every run.
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

async function main() {
  const teacher = await seedTeacher();
  await seedSecondTeacher();
  const testId = await seedDemoTest(teacher.id);
  await verifyRoundTrip(testId);
}

main()
  .catch((err) => {
    console.error('[seed] Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
