import ClassPlaceholderTab from './ClassPlaceholderTab';

/**
 * "Học sinh" tab — PLACEHOLDER until T-104 replaces this file with the class roster table.
 * There is no legacy page for a per-class roster, so it only carries a note.
 */
function ClassStudentsTab() {
  return (
    <ClassPlaceholderTab
      titleKey="classWorkspace.tabs.students"
      noteKey="classWorkspace.placeholder.studentsNote"
      links={[]}
    />
  );
}

export default ClassStudentsTab;
