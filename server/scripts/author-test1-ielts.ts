/**
 * One-off content-authoring script: turns the real teacher's existing "test1" (currently
 * an empty `mockTest`-type Test with one blank "Đọc hiểu" section) into a full,
 * standard-format IELTS Academic mock test.
 *
 * IMPORTANT — copyright note: this content is 100% ORIGINAL, written for this script, NOT
 * copied from any real/official IELTS exam. Reproducing an actual Cambridge/IELTS exam's
 * passages or questions verbatim would infringe their copyright even when sourced from a
 * page ielts.org itself makes freely viewable — "free to view for practice" is not "free
 * to copy into another product." This script instead authors new passages/questions in
 * the same FORMAT, difficulty, and standard timing as the real Academic test.
 *
 * Structure (standard IELTS Academic order and timing): Listening -> Reading -> Writing,
 * one shared `Test.timeLimitMinutes` (this engine has only one timer per Test, not
 * separate per-section clocks like the real exam) set to 150 minutes — the standard
 * combined Listening(30)+Reading(60)+Writing(60) total.
 *
 * Listening section is intentionally left with `audioUrl: null` — there is no legitimate
 * way for this script to produce a real spoken-audio recording. The questions are already
 * written and correct against the original script printed to the console below; the
 * teacher can record themselves reading it and attach the file via T-090's new upload
 * button on this section once done.
 *
 * Run with: `npx tsx scripts/author-test1-ielts.ts` (from `server/`).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const READING_PASSAGE = `As cities around the world continue to expand, urban planners and public health researchers have turned increasing attention to the role of green spaces — parks, gardens, and tree-lined streets — in the daily lives of city residents. Far from being simply decorative, these spaces are now understood to provide a wide range of benefits that touch on health, environment, and social wellbeing.

The modern urban park movement traces its roots to the nineteenth century, when rapid industrialisation drew huge numbers of people into crowded, polluted cities. Reformers argued that access to open, natural space was essential for public health, leading to the creation of large municipal parks designed as green refuges within the built environment. This period established the idea, still influential today, that green space is not a luxury but a basic component of a healthy city.

Contemporary research has strengthened this view considerably. Time spent in green environments has been associated with lower levels of stress and improved mood, and parks provide accessible venues for the physical activity that is increasingly recognised as vital for preventing chronic illness. Because green spaces are often free to enter and open to all residents regardless of income, they are also seen as an important tool for reducing health inequalities between wealthier and poorer neighbourhoods.

Beyond their impact on human health, urban green spaces perform a number of environmental functions. Trees and vegetation help to cool city streets, offsetting what is known as the urban heat island effect, in which built-up areas absorb and retain heat far more than surrounding rural land. Green spaces also improve air quality by filtering pollutants, manage stormwater by absorbing rainfall, and provide habitats that support urban biodiversity, from insects and birds to small mammals.

Despite these well-documented benefits, many cities struggle to protect and expand their green space. Land in urban centres is expensive, and the pressure to build housing or commercial property often competes directly with proposals for new parks. Maintenance budgets for existing green spaces are also frequently among the first to be cut when municipal finances tighten. A further concern raised by researchers is that access to high-quality green space is not distributed evenly: wealthier districts often have more, and better maintained, parks than lower-income areas, even though the latter may have greater need given generally poorer health outcomes.

Looking ahead, a number of planning concepts aim to address these challenges. The idea of the "15-minute city", in which residents can reach essential services and green space within a short walk or cycle of home, has gained attention among policymakers seeking to make urban life more sustainable and equitable. Green roofs and vertical gardens are also being adopted in some dense city centres as a way of introducing vegetation where ground-level space is unavailable. Whether these approaches can be implemented at a scale sufficient to match the pace of urban growth remains an open question, but there is broad agreement among researchers that green space will remain a central consideration in the design of healthy, liveable cities.`;

const LISTENING_SCRIPT_FOR_TEACHER = `
[KỊCH BẢN NGHE — chưa có audio, giáo viên tự thu âm rồi upload vào Section "Nghe" bằng nút tải file mới]

Staff: Good morning, Riverside Sports Centre, how can I help you?
Customer: Hi, I'd like to find out about becoming a member.
Staff: Sure! Can I take your full name, please?
Customer: Yes, it's Daniel Carter — that's C-A-R-T-E-R.
Staff: Great, thank you. And can I get a contact phone number?
Customer: It's 0791 442 356.
Staff: Perfect. We have three membership types: Standard, which is 35 pounds a month; Premium, which is 55 pounds a month and includes the swimming pool; and Family, which is 90 pounds a month for up to four people.
Customer: I think Premium sounds good, actually — I really want to use the pool.
Staff: Great choice. The centre is open from six in the morning until ten at night on weekdays, and from eight until six on weekends.
Customer: That's good to know. Is there a joining fee?
Staff: Yes, there's a one-off joining fee of twenty pounds, but that's currently waived if you sign up before the end of this month.
Customer: Oh perfect, I'll definitely sign up this month then.
Staff: Wonderful. One last thing — would you like to receive our monthly newsletter by email?
Customer: Yes, please. My email is d.carter@mailbox.com.
Staff: Great, I've got all your details. Welcome to Riverside Sports Centre, Daniel!
`;

async function main() {
  const teacher = await prisma.user.findUnique({ where: { email: 'teacher.1a1@example.com' } });
  if (!teacher) throw new Error('teacher.1a1@example.com not found.');

  const test = await prisma.test.findFirst({ where: { title: 'test1', teacherId: teacher.id } });
  if (!test) throw new Error('"test1" not found for this teacher.');

  await prisma.test.update({
    where: { id: test.id },
    data: { timeLimitMinutes: 150, testType: 'mockTest' },
  });

  // --- Section 1: Listening --------------------------------------------------------
  const listening = await prisma.section.create({
    data: { testId: test.id, title: 'Nghe (Listening)', order: 1, audioUrl: null },
  });
  const listeningQuestions: Array<
    | { type: 'fillBlank'; prompt: string; acceptedAnswers: string[] }
    | { type: 'multipleChoice'; prompt: string; choices: string[]; correctIndex: number }
  > = [
    { type: 'fillBlank', prompt: "Customer's surname: _____", acceptedAnswers: ['Carter'] },
    {
      type: 'fillBlank',
      prompt: 'Contact phone number: _____',
      acceptedAnswers: ['0791442356', '0791 442 356'],
    },
    {
      type: 'multipleChoice',
      prompt: 'Which membership type does the customer choose?',
      choices: ['Standard', 'Premium', 'Family'],
      correctIndex: 1,
    },
    {
      type: 'fillBlank',
      prompt: 'Premium membership costs _____ pounds a month.',
      acceptedAnswers: ['55', 'fifty-five', 'fifty five'],
    },
    {
      type: 'fillBlank',
      prompt: 'On weekdays the centre is open until _____ at night.',
      acceptedAnswers: ['10', 'ten', '10pm', '10 pm'],
    },
    {
      type: 'fillBlank',
      prompt: 'On weekends the centre opens at _____.',
      acceptedAnswers: ['8', 'eight', '8am', '8 am'],
    },
    {
      type: 'multipleChoice',
      prompt: 'How much is the joining fee normally?',
      choices: ['10 pounds', '20 pounds', '35 pounds', '55 pounds'],
      correctIndex: 1,
    },
    {
      type: 'fillBlank',
      prompt: 'The joining fee is currently waived if the customer signs up before the end of _____.',
      acceptedAnswers: ['this month', 'the month'],
    },
  ];
  for (const [i, q] of listeningQuestions.entries()) {
    if (q.type === 'fillBlank') {
      await prisma.question.create({
        data: {
          sectionId: listening.id,
          type: 'fillBlank',
          prompt: q.prompt,
          order: i + 1,
          acceptedAnswers: q.acceptedAnswers,
        },
      });
    } else {
      await prisma.question.create({
        data: {
          sectionId: listening.id,
          type: 'multipleChoice',
          prompt: q.prompt,
          order: i + 1,
          choices: {
            create: q.choices.map((text, idx) => ({ text, isCorrect: idx === q.correctIndex, order: idx + 1 })),
          },
        },
      });
    }
  }

  // --- Section 2: Reading (reuse existing empty section) ----------------------------
  const reading = await prisma.section.findFirst({ where: { testId: test.id, title: 'Đọc hiểu' } });
  if (!reading) throw new Error('Existing "Đọc hiểu" section not found.');
  await prisma.section.update({
    where: { id: reading.id },
    data: { title: 'Đọc hiểu (Reading)', order: 2, passageText: READING_PASSAGE },
  });

  type TFNG = { type: 'tfng'; prompt: string; correct: 'True' | 'False' | 'Not Given' };
  type MC = { type: 'multipleChoice'; prompt: string; choices: string[]; correctIndex: number };
  type FB = { type: 'fillBlank'; prompt: string; acceptedAnswers: string[] };
  const readingQuestions: Array<TFNG | MC | FB> = [
    {
      type: 'tfng',
      prompt: 'According to the passage, urban parks were originally created purely for decorative purposes.',
      correct: 'False',
    },
    {
      type: 'tfng',
      prompt: 'The nineteenth-century urban park movement was a direct response to problems caused by industrialisation.',
      correct: 'True',
    },
    {
      type: 'tfng',
      prompt: 'Research shows that people who visit parks more than three times a week have significantly lower blood pressure.',
      correct: 'Not Given',
    },
    {
      type: 'tfng',
      prompt: 'Green spaces help to reduce differences in health outcomes between rich and poor neighbourhoods.',
      correct: 'True',
    },
    {
      type: 'multipleChoice',
      prompt: "What is the 'urban heat island effect' as described in the passage?",
      choices: [
        'A type of park found only in tropical cities',
        'The tendency of built-up areas to absorb and retain more heat than surrounding rural land',
        'A government policy for cooling city streets',
        'A method of measuring air pollution',
      ],
      correctIndex: 1,
    },
    {
      type: 'multipleChoice',
      prompt: 'According to the passage, which of the following is NOT mentioned as a function of green spaces?',
      choices: [
        'Filtering air pollutants',
        'Managing stormwater',
        'Providing habitats for wildlife',
        'Reducing traffic congestion',
      ],
      correctIndex: 3,
    },
    {
      type: 'multipleChoice',
      prompt: 'Why do many cities struggle to expand green space, according to the passage?',
      choices: [
        'Residents are not interested in parks',
        'Land is expensive and competes with housing/commercial development',
        'Green spaces cause an increase in the urban heat island effect',
        'There is no scientific evidence of their benefits',
      ],
      correctIndex: 1,
    },
    {
      type: 'fillBlank',
      prompt:
        "The concept of the '_____', in which residents can access essential services and green space within a short walk or cycle of their home, has attracted interest among urban policymakers.",
      acceptedAnswers: ['15-minute city', '15 minute city'],
    },
    {
      type: 'fillBlank',
      prompt:
        'In dense city centres where there is no space at ground level, some cities have introduced vegetation through green roofs and _____.',
      acceptedAnswers: ['vertical gardens', 'vertical garden'],
    },
    {
      type: 'fillBlank',
      prompt:
        'Wealthier districts often have more, and better maintained, parks than lower-income areas, even though the latter may have greater need given generally poorer _____.',
      acceptedAnswers: ['health outcomes', 'health outcome'],
    },
  ];
  for (const [i, q] of readingQuestions.entries()) {
    if (q.type === 'tfng') {
      await prisma.question.create({
        data: {
          sectionId: reading.id,
          type: 'multipleChoice',
          prompt: q.prompt,
          order: i + 1,
          choices: {
            create: ['True', 'False', 'Not Given'].map((text, idx) => ({
              text,
              isCorrect: text === q.correct,
              order: idx + 1,
            })),
          },
        },
      });
    } else if (q.type === 'multipleChoice') {
      await prisma.question.create({
        data: {
          sectionId: reading.id,
          type: 'multipleChoice',
          prompt: q.prompt,
          order: i + 1,
          choices: {
            create: q.choices.map((text, idx) => ({ text, isCorrect: idx === q.correctIndex, order: idx + 1 })),
          },
        },
      });
    } else {
      await prisma.question.create({
        data: {
          sectionId: reading.id,
          type: 'fillBlank',
          prompt: q.prompt,
          order: i + 1,
          acceptedAnswers: q.acceptedAnswers,
        },
      });
    }
  }

  // --- Section 3: Writing ------------------------------------------------------------
  const writing = await prisma.section.create({
    data: { testId: test.id, title: 'Viết (Writing)', order: 3 },
  });
  await prisma.question.create({
    data: {
      sectionId: writing.id,
      type: 'essay',
      order: 1,
      essayMaxScore: 9,
      prompt:
        'WRITING TASK 1\n\nYou should spend about 20 minutes on this task.\n\n' +
        'The table below shows the number of visitors (in thousands) to three public parks in a city in 2015 and 2025.\n\n' +
        'Park | 2015 | 2025\nRiverside Park | 120 | 310\nOakwood Gardens | 95 | 140\nCentral Green | 260 | 245\n\n' +
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\n' +
        'Write at least 150 words.',
    },
  });
  await prisma.question.create({
    data: {
      sectionId: writing.id,
      type: 'essay',
      order: 2,
      essayMaxScore: 9,
      prompt:
        'WRITING TASK 2\n\nYou should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\n' +
        'Some people believe that city governments should spend more money on creating and maintaining public parks and green spaces, ' +
        'even if this means less funding for other public services. To what extent do you agree or disagree?\n\n' +
        'Give reasons for your answer and include any relevant examples from your own knowledge or experience.\n\n' +
        'Write at least 250 words.',
    },
  });

  // --- Assign to the real class so students can actually see/practice it ------------
  const class1A1 = await prisma.class.findFirst({ where: { name: '1A1', teacherId: teacher.id } });
  if (class1A1) {
    await prisma.test.update({ where: { id: test.id }, data: { classes: { connect: { id: class1A1.id } } } });
  }

  console.log('[author-test1-ielts] Done. Test id:', test.id);
  console.log('[author-test1-ielts] Sections: Nghe (8 q), Đọc hiểu (10 q), Viết (2 essay).');
  console.log('[author-test1-ielts] timeLimitMinutes = 150 (standard combined Listening+Reading+Writing).');
  console.log('[author-test1-ielts] Assigned to class 1A1:', Boolean(class1A1));
  console.log(LISTENING_SCRIPT_FOR_TEACHER);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
