import { useClassWorkspace } from '../../hooks/useClassWorkspace';
import { legacyClassPaths } from '../../lib/classWorkspace';
import ClassPlaceholderTab from './ClassPlaceholderTab';

/**
 * "Thống kê" tab — PLACEHOLDER until T-104 replaces this file with the reports hub embedded
 * in the class layout. Until then it links the same legacy reports hub and vocabulary
 * leaderboard as the Điểm số placeholder.
 */
function ClassStatsTab() {
  const { cls } = useClassWorkspace();
  const paths = legacyClassPaths(cls);

  return (
    <ClassPlaceholderTab
      titleKey="classWorkspace.tabs.stats"
      noteKey="classWorkspace.placeholder.statsNote"
      links={[
        {
          to: paths.reports,
          labelKey: 'classWorkspace.legacy.reports',
          descriptionKey: 'classWorkspace.legacy.reportsDescription',
        },
        {
          to: paths.vocabLeaderboard,
          labelKey: 'classWorkspace.legacy.vocabLeaderboard',
          descriptionKey: 'classWorkspace.legacy.vocabLeaderboardDescription',
        },
      ]}
    />
  );
}

export default ClassStatsTab;
