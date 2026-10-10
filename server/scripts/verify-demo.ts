import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { computeAttemptScore, buildManualItems } from '../src/lib/attemptScore';
import { gradeAnswer } from '../src/lib/grading';
const db = new PrismaClient();
const prefix = 'demo-webeng-v1-';
async function main() {
  const attempts = await db.attempt.findMany({
    where: { id: { startsWith: prefix } },
    include: {
      student: true,
      session: true,
      variant: true,
      test: { include: { sections: { include: { questions: { include: { choices: true } } } } } },
      answers: true,
    },
  });
  let submitted = 0,
    inProgress = 0;
  const errors: string[] = [];
  for (const a of attempts) {
    const qs = a.test.sections.flatMap((s) => s.questions);
    if (a.testId !== a.session.testId || a.testId !== a.variant.testId)
      errors.push(`Test mismatch ${a.id}`);
    const assignment = await db.testClassPeriodAssignment.findFirst({
      where: { testId: a.testId, classId: a.student.classId! },
    });
    if (!assignment) {
      errors.push(`Missing assignment ${a.id}`);
      continue;
    }
    const schedule = await db.testClassSchedule.findUnique({
      where: {
        testId_classId_periodId: {
          testId: a.testId,
          classId: a.student.classId!,
          periodId: assignment.periodId,
        },
      },
    });
    if (
      (schedule?.openAt && a.startedAt < schedule.openAt) ||
      (schedule?.closeAt && a.submittedAt && a.submittedAt > schedule.closeAt)
    )
      errors.push(`Outside schedule ${a.id}`);
    if (a.status === 'inProgress') {
      inProgress++;
      continue;
    }
    submitted++;
    let correctCount = 0,
      totalCount = 0;
    for (const q of qs) {
      if (q.type === 'essay' || q.type === 'speaking') continue;
      totalCount++;
      const answer = a.answers.find((x) => x.questionId === q.id);
      const correct = gradeAnswer(q, answer);
      if (correct) correctCount++;
      if (answer?.isCorrect !== correct) errors.push(`Answer grading mismatch ${a.id}/${q.id}`);
    }
    const score = computeAttemptScore({
      correctCount,
      totalCount,
      manual: buildManualItems(qs, new Map(a.answers.map((x) => [x.questionId, x]))),
    });
    if (
      a.correctCount !== correctCount ||
      a.totalCount !== totalCount ||
      a.scorePercent !== score.scorePercent
    )
      errors.push(`Score mismatch ${a.id}`);
  }
  const variants = await db.testVariant.findMany({
    where: { id: { startsWith: prefix } },
    include: {
      test: { include: { sections: { include: { questions: { include: { choices: true } } } } } },
    },
  });
  for (const v of variants) {
    const layout = v.layout as {
      sections: { sectionId: string; questionIds: string[] }[];
      choiceOrder: Record<string, string[]>;
    };
    for (const s of v.test.sections) {
      const l = layout.sections.find((x) => x.sectionId === s.id);
      if (
        !l ||
        l.questionIds.length !== s.questions.length ||
        s.questions.some((q) => !l.questionIds.includes(q.id))
      )
        errors.push(`Invalid variant section ${v.id}`);
      for (const q of s.questions)
        if (
          q.choices.length &&
          (layout.choiceOrder[q.id]?.length !== q.choices.length ||
            q.choices.some((c) => !layout.choiceOrder[q.id].includes(c.id)))
        )
          errors.push(`Invalid variant choices ${v.id}`);
    }
  }
  const ownerMismatch = await db.$queryRaw<
    Array<{ count: bigint }>
  >`SELECT COUNT(*) AS count FROM test_class_period_assignments a JOIN tests t ON t.id=a."testId" JOIN classes c ON c.id=a."classId" WHERE a."classId" LIKE 'demo-webeng-v1-%' AND t."teacherId" <> c."teacherId"`;
  if (Number(ownerMismatch[0].count)) errors.push('Content owner mismatch');
  console.log(
    JSON.stringify(
      {
        attempts: attempts.length,
        submitted,
        inProgress,
        variants: variants.length,
        errorCount: errors.length,
        errors: errors.slice(0, 20),
      },
      null,
      2,
    ),
  );
  if (errors.length) process.exitCode = 1;
}
main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : 'Verification failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
