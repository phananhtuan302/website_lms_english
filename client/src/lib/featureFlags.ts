/**
 * Switches for features that are built but deliberately hidden. Flip a flag to `true` and
 * everything it lists comes back — no other change needed.
 */

/**
 * Class reports ("Thống kê" tab and its sub-pages: test / unit-test / vocabulary / grammar /
 * speaking reports and the vocabulary ranking) and the "Báo cáo" link on the Library test list.
 * Hidden on 2026-09-22 at the customer's request ("tạm thời ẩn, không dùng tới").
 * The per-test "Kết quả" page inside a class (used to grade and to let students see scores) and
 * the class gradebook ("Điểm số") are NOT part of this flag and stay visible.
 * While `false`, `/teacher/classes/:classId/stats/*` falls through to the class overview.
 */
export const REPORTS_ENABLED = false;
