import { useClassWorkspace } from '../../hooks/useClassWorkspace';
import { legacyClassPaths } from '../../lib/classWorkspace';
import ClassPlaceholderTab from './ClassPlaceholderTab';

/**
 * "Bài tập" tab — PLACEHOLDER until T-103 replaces this file with the unified assignment
 * list + "Giao bài mới" dialog. Until then it links the legacy pages that currently do this
 * job: My Content (assign library items to the class), Unit Tests, Vocabulary Check.
 */
function ClassAssignmentsTab() {
  const { cls } = useClassWorkspace();
  const paths = legacyClassPaths(cls);

  return (
    <ClassPlaceholderTab
      titleKey="classWorkspace.tabs.assignments"
      noteKey="classWorkspace.placeholder.assignmentsNote"
      links={[
        {
          to: paths.myContent,
          labelKey: 'classWorkspace.legacy.myContent',
          descriptionKey: 'classWorkspace.legacy.myContentDescription',
        },
        {
          to: paths.unitTests,
          labelKey: 'classWorkspace.legacy.unitTests',
          descriptionKey: 'classWorkspace.legacy.unitTestsDescription',
        },
        {
          to: paths.vocabularyChecks,
          labelKey: 'classWorkspace.legacy.vocabularyChecks',
          descriptionKey: 'classWorkspace.legacy.vocabularyChecksDescription',
        },
      ]}
    />
  );
}

export default ClassAssignmentsTab;
