import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

type LibrarySection = 'tests' | 'flashcards' | 'grammar' | 'curriculum';

const SECTIONS: Record<LibrarySection, { to: string; labelKey: string }> = {
  tests: { to: '/teacher/tests', labelKey: 'teacherLibrary.tests.title' },
  flashcards: { to: '/teacher/flashcard-sets', labelKey: 'teacherLibrary.flashcards.title' },
  grammar: { to: '/teacher/grammar-topics', labelKey: 'teacherLibrary.grammar.title' },
  curriculum: { to: '/teacher/curriculum', labelKey: 'teacherLibrary.curriculum.title' },
};

interface LibraryBreadcrumbProps {
  section: LibrarySection;
  /** On an editor page the section crumb links back to that section's list; on the list
   * page itself it is just the current location. */
  linkSection?: boolean;
}

/**
 * One-line "Thư viện › Bài kiểm tra" trail at the top of every Library list and editor page
 * (T-106), so a teacher who arrived from a class's "Sửa nội dung" (or a bookmark) can always
 * find their way back to the Library landing (`/teacher/library`).
 */
function LibraryBreadcrumb({ section, linkSection = false }: LibraryBreadcrumbProps) {
  const { t } = useTranslation();
  const { to, labelKey } = SECTIONS[section];
  const linkClass = 'text-primary-600 hover:underline';

  return (
    <nav aria-label={t('libraryBreadcrumb.ariaLabel')} className="text-sm">
      <ol className="flex flex-wrap items-center gap-1.5 text-base-black/60">
        <li>
          <Link to="/teacher/library" className={linkClass}>
            {t('teacherLibrary.heading')}
          </Link>
        </li>
        <li aria-hidden="true">›</li>
        <li>
          {linkSection ? (
            <Link to={to} className={linkClass}>
              {t(labelKey)}
            </Link>
          ) : (
            <span aria-current="page" className="font-medium text-base-black/80">
              {t(labelKey)}
            </span>
          )}
        </li>
      </ol>
    </nav>
  );
}

export default LibraryBreadcrumb;
