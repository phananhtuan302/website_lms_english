/*
  Warnings:

  - You are about to drop the `test_score_releases` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "test_score_releases" DROP CONSTRAINT "test_score_releases_classId_fkey";

-- DropForeignKey
ALTER TABLE "test_score_releases" DROP CONSTRAINT "test_score_releases_testId_fkey";

-- DropTable
DROP TABLE "test_score_releases";

-- CreateTable
CREATE TABLE "test_class_schedules" (
    "testId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "openAt" TIMESTAMP(3),
    "closeAt" TIMESTAMP(3),
    "scoresPublishedManually" BOOLEAN NOT NULL DEFAULT false,
    "autoPublishScoresOnClose" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_class_schedules_pkey" PRIMARY KEY ("testId","classId")
);

-- AddForeignKey
ALTER TABLE "test_class_schedules" ADD CONSTRAINT "test_class_schedules_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_class_schedules" ADD CONSTRAINT "test_class_schedules_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
