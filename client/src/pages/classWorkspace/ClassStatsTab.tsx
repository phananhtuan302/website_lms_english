import TeacherReportsHubPage from '../TeacherReportsHubPage';

/**
 * "Thống kê" tab (T-104): the existing reports hub (Bài kiểm tra / Kiểm tra Unit / Từ vựng /
 * Ngữ pháp / Nói) rendered INSIDE the class workspace, plus the vocabulary leaderboard as a
 * sixth sub-tab ("Xếp hạng từ vựng"). No report is reimplemented here.
 *
 * The hub and every report page under it detect that they are embedded from the route's
 * `:classId` param (see `hooks/useClassScope.ts`), so the class is locked to this workspace's
 * class and their own "Đổi lớp" links are hidden. The active sub-tab is the optional
 * `:module` segment — `/teacher/classes/:classId/stats/:module?` (see `App.tsx`); it stays
 * under the "Thống kê" tab in the tab bar because that tab matches on the `stats` segment.
 */
function ClassStatsTab() {
  return <TeacherReportsHubPage />;
}

export default ClassStatsTab;
