/**
 * Route/tab plumbing for the class workspace (T-102, Phase 13). Lives in a plain module
 * (not next to the layout component) so the layout, the quick class-switcher, the tabs
 * themselves and the future T-103/T-104 pages all build class URLs the same way, and so
 * the layout file only exports components (react-refresh lint rule).
 */

export const CLASSES_HOME_PATH = '/teacher/classes';

export interface ClassTab {
  /** URL segment under `/teacher/classes/:classId`; `''` = the index route (Tổng quan). */
  segment: string;
  /** Key under `classWorkspace.tabs.*` in the i18n files. */
  labelKey: string;
  /**
   * Other first-path-segments that should ALSO highlight this tab. T-103 hangs
   * class-embedded pages such as `/tests/:testId/results` and `/vocabulary-checks` off the
   * class layout as siblings of `/assignments`; listing them here keeps "Bài tập" lit up
   * (and the class-switcher on the right tab) without T-103 having to touch the layout.
   */
  alsoSegments?: string[];
}

/** Tab bar order = display order. Add a segment here and a `<Route>` in `App.tsx`. */
export const CLASS_TABS: ClassTab[] = [
  { segment: '', labelKey: 'classWorkspace.tabs.overview' },
  {
    segment: 'assignments',
    labelKey: 'classWorkspace.tabs.assignments',
    alsoSegments: ['tests', 'vocabulary-checks'],
  },
  { segment: 'students', labelKey: 'classWorkspace.tabs.students' },
  { segment: 'grades', labelKey: 'classWorkspace.tabs.grades' },
  { segment: 'stats', labelKey: 'classWorkspace.tabs.stats' },
  { segment: 'settings', labelKey: 'classWorkspace.tabs.settings' },
];

/** `/teacher/classes/<id>` (overview) or `/teacher/classes/<id>/<segment>`. */
export function classTabPath(classId: string, segment = ''): string {
  const base = `${CLASSES_HOME_PATH}/${encodeURIComponent(classId)}`;
  return segment ? `${base}/${segment}` : base;
}

/** The first path segment after `/teacher/classes/:classId` ('' for the overview). */
export function currentClassSegment(pathname: string): string {
  // ['', 'teacher', 'classes', '<id>', '<segment>', ...]
  return pathname.split('/')[4] ?? '';
}

/** The tab a pathname belongs to; falls back to the overview for unknown segments. */
export function activeClassTab(pathname: string): ClassTab {
  const segment = currentClassSegment(pathname);
  return (
    CLASS_TABS.find((tab) => tab.segment === segment || tab.alsoSegments?.includes(segment)) ??
    CLASS_TABS[0]
  );
}
