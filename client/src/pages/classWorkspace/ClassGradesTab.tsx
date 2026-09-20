import { useClassWorkspace } from '../../hooks/useClassWorkspace';
import { legacyClassPaths } from '../../lib/classWorkspace';
import ClassPlaceholderTab from './ClassPlaceholderTab';

/**
 * "Điểm số" tab — PLACEHOLDER until T-104 replaces this file with the gradebook grid.
 * Until then it links the legacy reports hub and the vocabulary leaderboard.
 */
function ClassGradesTab() {
  const { cls } = useClassWorkspace();
  const paths = legacyClassPaths(cls);

  return (
    <ClassPlaceholderTab
      titleKey="classWorkspace.tabs.grades"
      noteKey="classWorkspace.placeholder.gradesNote"
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

export default ClassGradesTab;
