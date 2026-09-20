import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export interface PlaceholderLink {
  to: string;
  /** i18n key of the link's title (under `classWorkspace.legacy.*`). */
  labelKey: string;
  /** i18n key of the link's one-line description. */
  descriptionKey: string;
}

interface ClassPlaceholderTabProps {
  /** i18n key of the tab's heading. */
  titleKey: string;
  /** i18n key of the short "what will live here" sentence. */
  noteKey: string;
  /** Pre-Phase-13 standalone pages for this area, already scoped with `?classId=`. */
  links: PlaceholderLink[];
}

/**
 * Stand-in body for a class workspace tab whose real content is still being built
 * (Bài tập / Học sinh / Điểm số / Thống kê — T-103/T-104). It says so plainly ("Đang hoàn
 * thiện") and lists the LEGACY pages for that area so nothing is unreachable while the
 * real tab is in flight. The owning task replaces the tab's file (`ClassAssignmentsTab.tsx`
 * etc.) — it does not need to touch this component or the layout.
 */
function ClassPlaceholderTab({ titleKey, noteKey, links }: ClassPlaceholderTabProps) {
  const { t } = useTranslation();

  return (
    <section className="flex flex-col gap-5">
      <div className="rounded-2xl border border-dashed border-primary-300 bg-primary-50 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold text-primary-700">{t(titleKey)}</h2>
          <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-800">
            {t('classWorkspace.placeholder.badge')}
          </span>
        </div>
        <p className="mt-2 text-sm text-base-black/70">{t(noteKey)}</p>
      </div>

      {links.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-base-black/70">
            {t('classWorkspace.placeholder.legacyHeading')}
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {links.map((link) => (
              <Link
                key={link.labelKey}
                to={link.to}
                className="flex flex-col gap-1 rounded-xl border border-primary-200 p-4 transition-colors hover:border-primary-400 hover:bg-primary-50"
              >
                <span className="text-base font-semibold text-primary-700">{t(link.labelKey)}</span>
                <span className="text-sm text-base-black/60">{t(link.descriptionKey)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default ClassPlaceholderTab;
