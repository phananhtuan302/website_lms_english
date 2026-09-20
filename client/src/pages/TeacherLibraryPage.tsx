import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { teacherApi } from '../lib/teacherApi';

interface LibraryCard {
  to: string;
  titleKey: string;
  descriptionKey: string;
  /** i18n key of the plural-aware "N items" label (`{{count}}`), when a count is cheap. */
  countKey?: string;
  count: number | null;
}

/**
 * "Thư viện" landing (T-102, Phase 13) — the second of the teacher's two top-level areas
 * (the other is "Lớp học"). Library = where content is AUTHORED once and shared; handing it
 * to a class happens inside each class. Four big cards lead into the existing authoring
 * pages (tests, flashcard sets, Grammar topics, curriculum) which are unchanged.
 *
 * Each card shows a count of what the teacher already has where the existing list endpoints
 * make that free. The four list requests are independent and best-effort: a failed one just
 * leaves that card without a count — it never blocks the page or the link.
 */
function TeacherLibraryPage() {
  const { t } = useTranslation();
  const [counts, setCounts] = useState<{
    tests: number | null;
    flashcards: number | null;
    grammar: number | null;
    curriculum: number | null;
  }>({ tests: null, flashcards: null, grammar: null, curriculum: null });

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      teacherApi.listTests(),
      teacherApi.listFlashcardSets(),
      teacherApi.listGrammarTopics(),
      teacherApi.listUnits(),
    ]).then(([tests, flashcards, grammar, units]) => {
      if (cancelled) return;
      setCounts({
        tests: tests.status === 'fulfilled' ? tests.value.length : null,
        flashcards: flashcards.status === 'fulfilled' ? flashcards.value.length : null,
        grammar: grammar.status === 'fulfilled' ? grammar.value.length : null,
        curriculum: units.status === 'fulfilled' ? units.value.length : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const cards: LibraryCard[] = [
    {
      to: '/teacher/tests',
      titleKey: 'teacherLibrary.tests.title',
      descriptionKey: 'teacherLibrary.tests.description',
      countKey: 'teacherLibrary.tests.count',
      count: counts.tests,
    },
    {
      to: '/teacher/flashcard-sets',
      titleKey: 'teacherLibrary.flashcards.title',
      descriptionKey: 'teacherLibrary.flashcards.description',
      countKey: 'teacherLibrary.flashcards.count',
      count: counts.flashcards,
    },
    {
      to: '/teacher/grammar-topics',
      titleKey: 'teacherLibrary.grammar.title',
      descriptionKey: 'teacherLibrary.grammar.description',
      countKey: 'teacherLibrary.grammar.count',
      count: counts.grammar,
    },
    {
      to: '/teacher/curriculum',
      titleKey: 'teacherLibrary.curriculum.title',
      descriptionKey: 'teacherLibrary.curriculum.description',
      countKey: 'teacherLibrary.curriculum.count',
      count: counts.curriculum,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-700">{t('teacherLibrary.heading')}</h1>
        <p className="mt-1 text-sm text-base-black/60">{t('teacherLibrary.intro')}</p>
      </div>

      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {cards.map((card) => (
          <li key={card.to} className="flex">
            <Link
              to={card.to}
              className="group flex w-full flex-col gap-2 rounded-2xl border border-primary-200 bg-base-white p-6 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-primary-400 hover:bg-primary-50 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            >
              <span className="text-xl font-bold text-primary-700">{t(card.titleKey)}</span>
              <span className="text-sm text-base-black/70">{t(card.descriptionKey)}</span>
              <span className="mt-auto flex items-center justify-between pt-3 text-sm">
                <span className="font-medium text-base-black/60">
                  {card.count !== null && card.countKey
                    ? t(card.countKey, { count: card.count })
                    : ''}
                </span>
                <span className="font-semibold text-primary-600 group-hover:underline">
                  {t('teacherLibrary.open')}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TeacherLibraryPage;
