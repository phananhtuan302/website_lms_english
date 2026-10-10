import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/useAuth';

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
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { to, labelKey } = SECTIONS[section];
  const adminToList = section === 'tests' ? '/admin/tests' : section === 'flashcards' ? '/admin/flashcard-sets' : '/admin/grammar-topics';
  const linkClass = 'text-primary-600 hover:underline font-medium';

  return (
    <nav aria-label={t('libraryBreadcrumb.ariaLabel')} className="text-xs">
      <ol className="flex flex-wrap items-center gap-1.5 text-slate-500">
        {!isAdmin && (
          <>
            <li>
              <Link to="/teacher/library" className={linkClass}>
                {t('teacherLibrary.heading')}
              </Link>
            </li>
            <li aria-hidden="true" className="text-slate-300">/</li>
          </>
        )}
        <li>
          {linkSection ? (
            <Link to={isAdmin ? adminToList : to} className={linkClass}>
              {isAdmin && section === 'tests' ? 'Bài kiểm tra' : t(labelKey)}
            </Link>
          ) : (
            <span aria-current="page" className="font-semibold text-slate-800">
              {isAdmin && section === 'tests' ? 'Bài kiểm tra' : t(labelKey)}
            </span>
          )}
        </li>
      </ol>
    </nav>
  );
}

export default LibraryBreadcrumb;
