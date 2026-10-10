/** Additive, deterministic local demo seeder. Never updates/deletes existing records. */
import 'dotenv/config';
import { Prisma, PrismaClient, QuestionType, TestType } from '@prisma/client';
import bcrypt from 'bcrypt';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeAttemptScore, type ManualScoreItem } from '../src/lib/attemptScore';
import { gradeAnswer } from '../src/lib/grading';
import { vocabulary, grammar, passage, listeningTranscript } from './seed-demo-content';

const db = new PrismaClient();
const PREFIX = 'demo-webeng-v1-';
const id = (kind: string, n: number | string) => `${PREFIX}${kind}-${n}`;
// A stable reference makes reruns identical; deliberately not tied to the wall clock.
const reference = new Date('2026-10-10T12:00:00+07:00');
const days = (n: number) => new Date(reference.getTime() + n * 86400000);
const models = [
  'user',
  'academicPeriod',
  'class',
  'unit',
  'test',
  'section',
  'question',
  'choice',
  'testVariant',
  'testSession',
  'testClassPeriodAssignment',
  'testClassSchedule',
  'flashcardSet',
  'flashcardCard',
  'flashcardSetClassPeriodAssignment',
  'grammarTopic',
  'grammarExercise',
  'grammarChoice',
  'grammarTopicClassPeriodAssignment',
  'attempt',
  'answer',
  'flashcardProgress',
  'flashcardExerciseAttempt',
  'vocabSentenceSubmission',
  'grammarExerciseAttempt',
  'classAnnouncement',
] as const;
type Model = (typeof models)[number];
// Every bulk insert uses skipDuplicates. Empty update upserts are unnecessary: existing rows stay untouched.
async function insert<T>(model: Model, rows: T[]) {
  const delegate = db[model] as unknown as {
    createMany(args: { data: T[]; skipDuplicates: boolean }): Promise<{ count: number }>;
  };
  for (let start = 0; start < rows.length; start += 500)
    await delegate.createMany({ data: rows.slice(start, start + 500), skipDuplicates: true });
}
async function counts() {
  const result: Record<string, { total: number; demo: number }> = {};
  for (const model of models) {
    const delegate = db[model] as unknown as { count(args?: { where: object }): Promise<number> };
    // Explicit assignment/schedule joins have no id column, so scope through their demo class.
    const where = [
      'testClassPeriodAssignment',
      'testClassSchedule',
      'flashcardSetClassPeriodAssignment',
      'grammarTopicClassPeriodAssignment',
    ].includes(model)
      ? { classId: { startsWith: PREFIX } }
      : { id: { startsWith: PREFIX } };
    result[model] = { total: await delegate.count(), demo: await delegate.count({ where }) };
  }
  return result;
}
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.pathname !== '/english_platform_dev'
  ) {
    throw new Error('Refusing: seed-demo only supports local english_platform_dev.');
  }
  const actual = await db.$queryRaw<
    Array<{ database: string }>
  >`SELECT current_database() AS database`;
  if (actual[0]?.database !== 'english_platform_dev')
    throw new Error('Database identity mismatch.');
  console.log('Verified local target:', url.hostname, actual[0].database);
  const before = await counts();
  console.log('BEFORE', JSON.stringify(before));
  if (process.argv.includes('--inspect')) return;
  const passwordHash = await bcrypt.hash('Demo@2026!', 12);
  const users: Prisma.UserCreateManyInput[] = [];
  const existingEmails = await db.user.findMany({
    where: { email: { endsWith: '@demo.webeng.test' } },
    select: { id: true, email: true },
  });
  for (let t = 0; t < 8; t++)
    users.push({
      id: id('teacher', t),
      email: `demo.teacher${t + 1}@demo.webeng.test`,
      name: `Demo ${['Avery Brook', 'Morgan Vale', 'Rowan Park', 'Casey Reed', 'Jordan Finch', 'Taylor Stone', 'Riley Meadow', 'Alex Rivers'][t]}`,
      role: 'teacher',
      passwordHash,
    });
  users.push({
    id: id('admin', 0),
    email: 'demo.admin@demo.webeng.test',
    name: 'Demo Platform Administrator',
    role: 'admin',
    passwordHash,
  });
  for (let s = 0; s < 480; s++)
    users.push({
      id: id('student', s),
      email: `demo.student${String(s + 1).padStart(3, '0')}@demo.webeng.test`,
      name: `Demo ${['Amelia', 'Noah', 'Olivia', 'Liam', 'Emma', 'Oliver', 'Ava', 'Elijah', 'Sophia', 'James', 'Isabella', 'Lucas', 'Mia', 'Henry', 'Charlotte', 'Leo', 'Harper', 'Ethan', 'Evelyn', 'Theo'][s % 20]} ${['Ashford', 'Bellwood', 'Cedar', 'Dale', 'Elmhurst', 'Fairmont', 'Glenwood', 'Hartley', 'Ivydale', 'Juniper', 'Kingsley', 'Larkspur', 'Maple', 'Northwood', 'Oakley', 'Pinehurst', 'Quill', 'Rosewood', 'Silverton', 'Thornfield', 'Underwood', 'Valewood', 'Westbrook', 'Yarrow'][Math.floor(s / 20)]}`,
      role: 'student',
      passwordHash,
      classId: id('class', Math.floor(s / 20)),
    });
  for (const user of users) {
    const conflict = existingEmails.find((e) => e.email === user.email && e.id !== user.id);
    if (conflict)
      throw new Error(`Email collision: ${user.email}; no existing identity will be modified.`);
  }
  await insert(
    'user',
    users.filter((u) => u.role !== 'student'),
  );
  await insert('academicPeriod', [
    {
      id: id('period', 0),
      name: 'Demo Spring 2026',
      startDate: new Date('2026-01-01T00:00:00+07:00'),
      endDate: new Date('2026-05-31T23:59:59+07:00'),
    },
    {
      id: id('period', 1),
      name: 'Demo Summer 2026',
      startDate: new Date('2026-06-01T00:00:00+07:00'),
      endDate: new Date('2026-08-31T23:59:59+07:00'),
    },
    {
      id: id('period', 2),
      name: 'Demo Autumn 2026',
      startDate: new Date('2026-09-01T00:00:00+07:00'),
      endDate: new Date('2026-12-31T23:59:59+07:00'),
    },
  ] satisfies Prisma.AcademicPeriodCreateManyInput[]);
  await insert(
    'class',
    Array.from({ length: 24 }, (_, c) => ({
      id: id('class', c),
      name: `Demo ${['Foundation', 'Intermediate', 'Advanced'][c % 3]} ${Math.floor(c / 3) + 1}`,
      teacherId: id('teacher', Math.floor(c / 3)),
      currentPeriodId: id('period', 2),
    })),
  );
  await insert(
    'user',
    users.filter((u) => u.role === 'student'),
  );
  await insert(
    'unit',
    Array.from({ length: 24 }, (_, u) => ({
      id: id('unit', u),
      name: `Demo Unit ${u + 1}: ${vocabulary[u % 12][0]} ${u < 12 ? 'Foundations' : 'Applications'}`,
      order: u + 1,
    })),
  );
  const tests: Prisma.TestCreateManyInput[] = [],
    sections: Prisma.SectionCreateManyInput[] = [],
    questions: Prisma.QuestionCreateManyInput[] = [],
    choices: Prisma.ChoiceCreateManyInput[] = [],
    variants: Prisma.TestVariantCreateManyInput[] = [],
    sessions: Prisma.TestSessionCreateManyInput[] = [];
  const assignments: Prisma.TestClassPeriodAssignmentCreateManyInput[] = [],
    schedules: Prisma.TestClassScheduleCreateManyInput[] = [];
  for (let t = 0; t < 8; t++)
    for (let k = 0; k < 9; k++) {
      const n = t * 9 + k,
        period = Math.floor(k / 3),
        category = k % 6;
      const testType: TestType = [
        'unitTest',
        'generic',
        'listeningTest',
        'mockTest',
        'vocabularyCheck',
        'generic',
      ][category] as TestType;
      const labels = [
        'Integrated unit assessment',
        'Reading and headings',
        'Listening workshop (transcript practice)',
        'Academic mock examination',
        'Vocabulary in context',
        'Writing and speaking portfolio',
      ];
      tests.push({
        id: id('test', n),
        title: `Demo ${labels[category]} — ${vocabulary[t % 12][0]} — ${period + 1}`,
        teacherId: id('teacher', t),
        unitId: id('unit', t * 3 + period),
        testType,
        published: !(k === 8 && t % 2 === 1),
        timeLimitMinutes: category === 3 ? 60 : 30,
        createdAt: days(-280 + n),
      });
      const sid = id('section', n);
      sections.push({
        id: sid,
        testId: id('test', n),
        title:
          category === 2
            ? 'Listening transcript practice — read aloud locally'
            : 'Community learning: reading and language',
        order: 0,
        passageText: category === 2 ? listeningTranscript : passage,
      });
      const qids: string[] = [],
        choiceOrder: Record<string, string[]> = {};
      for (let q = 0; q < 10; q++) {
        const qid = id('question', `${n}-${q}`);
        qids.push(qid);
        let type: QuestionType =
          q % 3 === 0 ? 'multipleChoice' : q % 3 === 1 ? 'trueFalse' : 'fillBlank';
        let prompt = '',
          options: string[] = [],
          acceptedAnswers: string[] = [];
        if (q === 0) {
          prompt = 'Where was the learning garden created?';
          options = [
            'Behind a public library',
            'Inside a train station',
            'Beside an airport',
            'On a school roof',
          ];
        }
        if (q === 1) {
          prompt = 'The garden uses chemical pesticides.';
          options = ['False', 'True'];
        }
        if (q === 2) {
          prompt = 'Volunteers meet every ___ at nine.';
          acceptedAnswers = ['Saturday'];
        }
        if (q === 3) {
          type = 'matching';
          prompt = 'Match paragraph B to the most suitable heading.';
          options = [
            'Reusing resources responsibly',
            'A new railway service',
            'An expensive restaurant',
            'A history of libraries',
          ];
        }
        if (q === 4) {
          type = 'multipleChoice';
          prompt = 'Why will the group need a larger water tank?';
          options = [
            'A dry month revealed a shortage',
            'The library will close',
            'They stopped collecting rainwater',
            'The kitchen requested it',
          ];
        }
        if (q === 5) {
          prompt = 'Half of the harvest went to a community ___.';
          acceptedAnswers = ['kitchen'];
        }
        if (q === 6) {
          prompt = 'Which future activity is planned?';
          options = [
            'Free cooking workshops',
            'Paid parking lessons',
            'A shopping centre',
            'A private swimming pool',
          ];
        }
        if (q === 7) {
          prompt = 'The students consulted local residents before planning.';
          options = ['True', 'False'];
        }
        if (q === 8) {
          prompt = 'Vegetable scraps are turned into ___.';
          acceptedAnswers = ['compost'];
        }
        if (q === 9) {
          prompt = 'What did the group record during the first summer?';
          options = [
            'Visitors and the weight of harvested vegetables',
            'Only rainfall',
            'Library membership fees',
            'Bus departure times',
          ];
        }
        if (category === 2) {
          const listen = [
            [
              'What time should participants arrive?',
              'Nine thirty|Nine o’clock|Ten thirty|Eight thirty',
            ],
            ['The morning session is free.', 'True|False'],
            ['The workshop is in Room ___.', 'Four'],
            ['Which item must participants bring?', 'A notebook|A spade|A lunch voucher|A uniform'],
            ['When is the reservation deadline?', 'Thursday|Friday|Sunday|Monday'],
            ['The optional lunch costs ___ pounds.', 'five'],
            [
              'Where will planting move if it rains?',
              'The greenhouse|The station|The car park|The theatre',
            ],
            ['Tools will be supplied.', 'True|False'],
            ['Bring a reusable water ___.', 'bottle'],
            ['Who takes reservations?', 'The librarian|The bus driver|The chef|The coach'],
          ];
          prompt = listen[q][0];
          if (q % 3 === 2) {
            type = 'fillBlank';
            acceptedAnswers = [listen[q][1]];
            options = [];
          } else {
            type = q === 1 || q === 7 ? 'trueFalse' : 'multipleChoice';
            options = listen[q][1].split('|');
            acceptedAnswers = [];
          }
        }
        if ((category === 0 || category === 3 || category === 5) && q === 8) {
          type = 'essay';
          prompt =
            'Should schools create community gardens? Write a balanced discussion with reasons, examples, and a clear conclusion. Consider costs, educational benefits, and local participation.';
          options = [];
          acceptedAnswers = [];
        }
        if ((category === 0 || category === 3 || category === 5) && q === 9) {
          type = 'speaking';
          prompt =
            'Describe a community project you would like to join. Explain what you would do, who would benefit, and why it matters. Speak for one minute.';
          options = [];
          acceptedAnswers = [];
        }
        questions.push({
          id: qid,
          sectionId: sid,
          type,
          prompt,
          order: q,
          acceptedAnswers,
          essayMaxScore: type === 'essay' ? 10 : null,
          essayMinWords: type === 'essay' ? 150 : null,
          essayTaskType: type === 'essay' ? 'task2' : null,
          essayUseIeltsCriteria: false,
          allowedResponseSeconds: type === 'speaking' ? 60 : null,
          preparationSeconds: type === 'speaking' ? 30 : null,
          fillBlankMaxWords: type === 'fillBlank' ? 2 : null,
        });
        if (options.length)
          choiceOrder[qid] = options.map((text, ci) => {
            const cid = id('choice', `${n}-${q}-${ci}`);
            choices.push({ id: cid, questionId: qid, text, isCorrect: ci === 0, order: ci });
            return cid;
          });
      }
      for (let v = 0; v < 2; v++)
        variants.push({
          id: id('variant', `${n}-${v}`),
          testId: id('test', n),
          code: String(101 + v),
          layout: {
            sections: [{ sectionId: sid, questionIds: v ? [...qids].reverse() : qids }],
            choiceOrder: Object.fromEntries(
              Object.entries(choiceOrder).map(([key, value]) => [
                key,
                v ? [...value].reverse() : value,
              ]),
            ),
          },
        });
      const historical = period < 2;
      sessions.push({
        id: id('session', n),
        testId: id('test', n),
        joinToken: id('join', n),
        manualCode: String(410000 + n),
        status: historical ? 'closed' : 'active',
        mode: 'selfPractice',
        startAt: days(historical ? (period === 0 ? -260 : -120) : -35),
        endAt: historical ? days(period === 0 ? -160 : -45) : null,
        closedAt: historical ? days(period === 0 ? -160 : -45) : null,
        createdAt: days(-280 + period * 150),
      });
      for (let c = t * 3; c < t * 3 + 3; c++) {
        assignments.push({
          testId: id('test', n),
          classId: id('class', c),
          periodId: id('period', period),
        });
        schedules.push({
          testId: id('test', n),
          classId: id('class', c),
          periodId: id('period', period),
          openAt: historical ? days(period === 0 ? -260 : -120) : days(k % 3 === 2 ? 5 : -35),
          closeAt: historical
            ? days(period === 0 ? -160 : -45)
            : days(k % 3 === 2 ? 20 : k % 3 === 1 ? -1 : 10),
          scoresPublishedManually: historical || (k === 6 && c % 2 === 0),
          autoPublishScoresOnClose: k === 7 && c % 2 === 1,
        });
      }
    }
  await insert('test', tests);
  await insert('section', sections);
  await insert('question', questions);
  await insert('choice', choices);
  await insert('testVariant', variants);
  await insert('testSession', sessions);
  await insert('testClassPeriodAssignment', assignments);
  await insert('testClassSchedule', schedules);

  const sets: Prisma.FlashcardSetCreateManyInput[] = [],
    cards: Prisma.FlashcardCardCreateManyInput[] = [],
    setAssignments: Prisma.FlashcardSetClassPeriodAssignmentCreateManyInput[] = [];
  for (let set = 0; set < 36; set++) {
    const teacher = set % 8,
      period = Math.floor(set / 12),
      topic = vocabulary[set % 12];
    sets.push({
      id: id('set', set),
      teacherId: id('teacher', teacher),
      unitId: id('unit', teacher * 3 + period),
      name: `Demo ${topic[0]} — ${['Core words', 'Review and application', 'Fluent use'][period]}`,
    });
    topic[1].split('|').forEach((entry, index) => {
      const [term, meaning] = entry.split(':');
      cards.push({
        id: id('card', `${set}-${index}`),
        setId: id('set', set),
        term,
        meaning,
        order: index,
        exampleSentence: `In our ${topic[0].toLowerCase()} lesson, we discussed ${term} and its importance.`,
      });
    });
    for (let c = teacher * 3; c < teacher * 3 + 3; c++)
      setAssignments.push({
        flashcardSetId: id('set', set),
        classId: id('class', c),
        periodId: id('period', period),
      });
  }
  await insert('flashcardSet', sets);
  await insert('flashcardCard', cards);
  await insert('flashcardSetClassPeriodAssignment', setAssignments);
  const topics: Prisma.GrammarTopicCreateManyInput[] = [],
    exercises: Prisma.GrammarExerciseCreateManyInput[] = [],
    grammarChoices: Prisma.GrammarChoiceCreateManyInput[] = [],
    topicAssignments: Prisma.GrammarTopicClassPeriodAssignmentCreateManyInput[] = [];
  for (let g = 0; g < 24; g++) {
    const [title, theory, prompt, correct, wrong] = grammar[g],
      teacher = g % 8,
      period = Math.floor(g / 8);
    topics.push({
      id: id('grammar', g),
      teacherId: id('teacher', teacher),
      unitId: id('unit', teacher * 3 + period),
      title: `Demo ${title}`,
      theoryContent: `<h2>${title}</h2><p>${theory}</p><h3>Worked example</h3><p>${prompt.replace('___', correct)}</p><p>Check the time expression and the subject before choosing your verb form. Read your complete sentence aloud after answering.</p><h3>Practice</h3><p>Complete the sentence, then compare the alternatives. Explain why the other forms do not fit this context.</p>`,
    });
    for (let e = 0; e < 4; e++) {
      const eid = id('exercise', `${g}-${e}`),
        fill = e % 2 === 1;
      exercises.push({
        id: eid,
        topicId: id('grammar', g),
        type: fill ? 'fillBlank' : 'multipleChoice',
        prompt: `${e >= 2 ? 'Review without notes: ' : ''}${prompt}`,
        order: e,
        acceptedAnswers: fill ? [correct] : [],
      });
      if (!fill)
        [correct, ...wrong.split('|')].forEach((text, j) =>
          grammarChoices.push({
            id: id('grammar-choice', `${g}-${e}-${j}`),
            exerciseId: eid,
            text,
            isCorrect: j === 0,
            order: j,
          }),
        );
    }
    for (let c = teacher * 3; c < teacher * 3 + 3; c++)
      topicAssignments.push({
        grammarTopicId: id('grammar', g),
        classId: id('class', c),
        periodId: id('period', period),
      });
  }
  await insert('grammarTopic', topics);
  await insert('grammarExercise', exercises);
  await insert('grammarChoice', grammarChoices);
  await insert('grammarTopicClassPeriodAssignment', topicAssignments);

  const attempts: Prisma.AttemptCreateManyInput[] = [],
    answers: Prisma.AnswerCreateManyInput[] = [],
    progress: Prisma.FlashcardProgressCreateManyInput[] = [],
    vocabAttempts: Prisma.FlashcardExerciseAttemptCreateManyInput[] = [],
    sentences: Prisma.VocabSentenceSubmissionCreateManyInput[] = [],
    grammarAttempts: Prisma.GrammarExerciseAttemptCreateManyInput[] = [];
  const essay =
    'Community gardens can help schools teach practical skills while bringing neighbours together. Students learn how food grows and why water should not be wasted. They can also measure plant growth and use real evidence in science lessons. Working with older residents encourages patience and respect. However, gardens need careful planning. Equipment and water tanks cost money, and volunteers may be unavailable during holidays. A small pilot project is therefore better than a large garden that nobody can maintain. Schools should ask families about their needs, publish a realistic budget, and share responsibilities fairly. The library garden offers a useful example because it combines quiet spaces with learning activities. Donating vegetables to a community kitchen also gives the project a clear social purpose. In conclusion, I support school gardens when they have a sustainable plan. Their success should be measured not only by the harvest but also by what participants learn and the relationships they build.';
  for (let s = 0; s < 480; s++) {
    const teacher = Math.floor(s / 60),
      classIndex = Math.floor(s / 20),
      ability = 25 + ((s * 17) % 71);
    for (let k = 0; k < 9; k++) {
      // Upcoming and draft tests have no synthetic attempts. Every historical submission fits its schedule.
      if (k === 8) continue;
      const n = teacher * 9 + k,
        aid = id('attempt', `${s}-${k}`),
        period = Math.floor(k / 3),
        startedAt = days(period < 2 ? (period === 0 ? -250 : -115) + (s % 60) : -30 + (s % 25));
      const inProgress = k === 6 && s % 31 === 0,
        duration = 600 + ((s * 19 + k * 31) % 900);
      const submittedAt = inProgress ? null : new Date(startedAt.getTime() + duration * 1000);
      let correctCount = 0,
        totalCount = 0;
      const manual: ManualScoreItem[] = [];
      const qs = questions.filter((q) => q.sectionId === id('section', n));
      for (const [qi, q] of qs.entries()) {
        if (inProgress && qi > 3) continue;
        const success = (s * 13 + qi * 29 + k * 7) % 100 < ability;
        const options = choices.filter((c) => c.questionId === q.id);
        const answer: Prisma.AnswerCreateManyInput = {
          id: id('answer', `${s}-${k}-${qi}`),
          attemptId: aid,
          questionId: q.id!,
          selectedChoiceId: null,
          textAnswer: null,
          isCorrect: null,
        };
        if (q.type === 'essay') {
          answer.textAnswer = success ? essay : essay.split(' ').slice(0, 65).join(' ');
          const pending = s % 5 === 0;
          answer.manualScore = pending ? null : Number((ability / 10).toFixed(1));
          answer.manualComment = pending
            ? null
            : 'Demo teacher feedback: clear position; develop supporting examples and check sentence variety.';
          manual.push({
            type: 'essay',
            maxPoints: 10,
            manualScore: answer.manualScore ?? null,
            essayAiScore: null,
            speakingAiScore: null,
          });
        } else if (q.type === 'speaking') {
          // No invented recording, transcript, or AI grade. Missing recording correctly earns zero.
          manual.push({
            type: 'speaking',
            maxPoints: 100,
            manualScore: null,
            essayAiScore: null,
            speakingAiScore: null,
          });
        } else {
          answer.selectedChoiceId = options.length ? options[success ? 0 : 1].id! : null;
          answer.textAnswer =
            q.type === 'fillBlank'
              ? success
                ? (q.acceptedAnswers as string[])[0]
                : 'unknown'
              : null;
          answer.isCorrect = gradeAnswer(
            {
              id: q.id!,
              type: q.type!,
              choices: options.map((c) => ({ id: c.id!, isCorrect: c.isCorrect ?? false })),
              acceptedAnswers: q.acceptedAnswers as string[],
            },
            { selectedChoiceId: answer.selectedChoiceId, textAnswer: answer.textAnswer },
          );
          totalCount++;
          if (answer.isCorrect) correctCount++;
        }
        answers.push(answer);
      }
      const score = computeAttemptScore({ correctCount, totalCount, manual });
      attempts.push({
        id: aid,
        sessionId: id('session', n),
        testId: id('test', n),
        studentId: id('student', s),
        variantId: id('variant', `${n}-${s % 2}`),
        status: inProgress ? 'inProgress' : 'submitted',
        startedAt,
        submittedAt,
        correctCount: inProgress ? null : correctCount,
        totalCount: inProgress ? null : totalCount,
        scorePercent: inProgress ? null : score.scorePercent,
        timeTakenSeconds: inProgress ? null : duration,
        tabSwitchCount: s % 7 === 0 ? 2 : 0,
        tabSwitchLog:
          s % 7 === 0
            ? [
                new Date(startedAt.getTime() + 60000).toISOString(),
                new Date(startedAt.getTime() + 120000).toISOString(),
              ]
            : [],
      });
    }
    for (const assignment of setAssignments.filter((a) => a.classId === id('class', classIndex))) {
      const setCards = cards.filter((c) => c.setId === assignment.flashcardSetId),
        setNum = Number(assignment.flashcardSetId.split('-').at(-1));
      for (const [ci, card] of setCards.entries()) {
        if ((s + ci) % 6 === 0) continue; // genuine never-reviewed words remain absent
        const correct = (s * 13 + ci * 7) % 100 < ability,
          known = correct && ci % 3 !== 0;
        const reviewedAt = days(
          assignment.periodId === id('period', 2)
            ? -20 + (s % 18)
            : assignment.periodId === id('period', 1)
              ? -110 + (s % 20)
              : -230 + (s % 20),
        );
        progress.push({
          id: id('progress', `${s}-${setNum}-${ci}`),
          studentId: id('student', s),
          cardId: card.id!,
          status: known ? 'known' : 'learning',
          verifiedKnown: known,
          lastReviewedAt: reviewedAt,
          createdAt: reviewedAt,
        });
        for (let round = 0; round < 2; round++)
          vocabAttempts.push({
            id: id('vocab-attempt', `${s}-${setNum}-${ci}-${round}`),
            studentId: id('student', s),
            cardId: card.id!,
            type: round ? 'selfCheck' : 'fillBlank',
            correct: round ? correct : known,
            createdAt: new Date(reviewedAt.getTime() - (1 - round) * 3600000),
          });
        if (ci === 0)
          sentences.push({
            id: id('sentence', `${s}-${setNum}`),
            studentId: id('student', s),
            cardId: card.id!,
            sentence: card.exampleSentence!,
            containsWord: true,
            createdAt: reviewedAt,
          });
      }
    }
    for (const assignment of topicAssignments.filter((a) => a.classId === id('class', classIndex)))
      for (const ex of exercises.filter((e) => e.topicId === assignment.grammarTopicId)) {
        const options = grammarChoices.filter((c) => c.exerciseId === ex.id),
          success = (s * 11 + ex.order * 19) % 100 < ability;
        grammarAttempts.push({
          id: id('grammar-attempt', `${s}-${ex.id}`),
          studentId: id('student', s),
          topicId: ex.topicId,
          exerciseId: ex.id!,
          selectedChoiceId: options.length ? options[success ? 0 : 1].id : null,
          textAnswer:
            ex.type === 'fillBlank'
              ? success
                ? (ex.acceptedAnswers as string[])[0]
                : 'unknown'
              : null,
          isCorrect: success,
          createdAt: days(
            assignment.periodId === id('period', 2)
              ? -18 + (s % 16)
              : assignment.periodId === id('period', 1)
                ? -100 + (s % 20)
                : -225 + (s % 20),
          ),
        });
      }
  }
  await insert('attempt', attempts);
  await insert('answer', answers);
  await insert('flashcardProgress', progress);
  await insert('flashcardExerciseAttempt', vocabAttempts);
  await insert('vocabSentenceSubmission', sentences);
  await insert('grammarExerciseAttempt', grammarAttempts);
  await insert(
    'classAnnouncement',
    Array.from({ length: 72 }, (_, n) => ({
      id: id('announcement', n),
      classId: id('class', Math.floor(n / 3)),
      authorId: id('teacher', Math.floor(n / 9)),
      body: [
        'Welcome to the autumn term! Open your assigned unit, review the vocabulary cards, and complete the first practice assessment.',
        'Your reading feedback is available. Check the grade-release status before contacting your teacher. Bring one question to the next lesson.',
        'Upcoming workshop: prepare a short talk about a community project. Speaking recordings are not included in the demo dataset; record your own response during practice.',
      ][n % 3],
      pinned: n % 3 === 0,
      createdAt: days(-20 + (n % 3) * 5),
    })),
  );
  const after = await counts();
  const created = Object.fromEntries(models.map((m) => [m, after[m].total - before[m].total]));
  const pendingEssays = await db.answer.count({
    where: {
      id: { startsWith: PREFIX },
      question: { type: 'essay' },
      manualScore: null,
      essayAiScore: null,
      attempt: { status: 'submitted' },
    },
  });
  const result = {
    target: { host: url.hostname, database: actual[0].database },
    reference: reference.toISOString(),
    before,
    created,
    after,
    pendingEssays,
    note: 'Existing rows preserved; reruns insert missing stable IDs only.',
  };
  writeFileSync(resolve('scripts/seed-demo-report.json'), JSON.stringify(result, null, 2) + '\n');
  console.log('AFTER', JSON.stringify(after));
  console.log('CREATED', JSON.stringify(created));
  console.log('Pending submitted essays:', pendingEssays);
}
main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Demo seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
