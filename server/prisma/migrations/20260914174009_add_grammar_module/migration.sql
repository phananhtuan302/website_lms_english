-- CreateTable
CREATE TABLE "grammar_topics" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "unitId" TEXT,
    "theoryContent" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grammar_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grammar_exercises" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "acceptedAnswers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grammar_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grammar_choices" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,

    CONSTRAINT "grammar_choices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grammar_exercise_attempts" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "selectedChoiceId" TEXT,
    "textAnswer" TEXT,
    "isCorrect" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grammar_exercise_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grammar_exercise_attempts_studentId_topicId_idx" ON "grammar_exercise_attempts"("studentId", "topicId");

-- CreateIndex
CREATE INDEX "grammar_exercise_attempts_topicId_idx" ON "grammar_exercise_attempts"("topicId");

-- CreateIndex
CREATE INDEX "grammar_exercise_attempts_createdAt_idx" ON "grammar_exercise_attempts"("createdAt");

-- AddForeignKey
ALTER TABLE "grammar_topics" ADD CONSTRAINT "grammar_topics_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grammar_topics" ADD CONSTRAINT "grammar_topics_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grammar_exercises" ADD CONSTRAINT "grammar_exercises_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "grammar_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grammar_choices" ADD CONSTRAINT "grammar_choices_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "grammar_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grammar_exercise_attempts" ADD CONSTRAINT "grammar_exercise_attempts_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "grammar_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grammar_exercise_attempts" ADD CONSTRAINT "grammar_exercise_attempts_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "grammar_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grammar_exercise_attempts" ADD CONSTRAINT "grammar_exercise_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grammar_exercise_attempts" ADD CONSTRAINT "grammar_exercise_attempts_selectedChoiceId_fkey" FOREIGN KEY ("selectedChoiceId") REFERENCES "grammar_choices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
