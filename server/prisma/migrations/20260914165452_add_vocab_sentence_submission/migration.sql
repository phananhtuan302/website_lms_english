-- CreateTable
CREATE TABLE "vocab_sentence_submissions" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sentence" TEXT NOT NULL,
    "containsWord" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vocab_sentence_submissions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "vocab_sentence_submissions" ADD CONSTRAINT "vocab_sentence_submissions_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "flashcard_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_sentence_submissions" ADD CONSTRAINT "vocab_sentence_submissions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
