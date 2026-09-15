-- CreateTable
CREATE TABLE "_TestClasses" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TestClasses_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_FlashcardSetClasses" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_FlashcardSetClasses_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_GrammarTopicClasses" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_GrammarTopicClasses_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_TestClasses_B_index" ON "_TestClasses"("B");

-- CreateIndex
CREATE INDEX "_FlashcardSetClasses_B_index" ON "_FlashcardSetClasses"("B");

-- CreateIndex
CREATE INDEX "_GrammarTopicClasses_B_index" ON "_GrammarTopicClasses"("B");

-- AddForeignKey
ALTER TABLE "_TestClasses" ADD CONSTRAINT "_TestClasses_A_fkey" FOREIGN KEY ("A") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TestClasses" ADD CONSTRAINT "_TestClasses_B_fkey" FOREIGN KEY ("B") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FlashcardSetClasses" ADD CONSTRAINT "_FlashcardSetClasses_A_fkey" FOREIGN KEY ("A") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FlashcardSetClasses" ADD CONSTRAINT "_FlashcardSetClasses_B_fkey" FOREIGN KEY ("B") REFERENCES "flashcard_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GrammarTopicClasses" ADD CONSTRAINT "_GrammarTopicClasses_A_fkey" FOREIGN KEY ("A") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GrammarTopicClasses" ADD CONSTRAINT "_GrammarTopicClasses_B_fkey" FOREIGN KEY ("B") REFERENCES "grammar_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
