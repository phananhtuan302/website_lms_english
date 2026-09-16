-- CreateTable
CREATE TABLE "test_score_releases" (
    "testId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_score_releases_pkey" PRIMARY KEY ("testId","classId")
);

-- AddForeignKey
ALTER TABLE "test_score_releases" ADD CONSTRAINT "test_score_releases_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_score_releases" ADD CONSTRAINT "test_score_releases_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
