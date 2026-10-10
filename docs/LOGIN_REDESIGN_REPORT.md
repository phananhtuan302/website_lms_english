# Login redesign acceptance — 2026-10-10

## Scope and process
PM coordinated Planner/Designer (read-only existing-code analysis), Coder (isolated visual implementation), Tester (real browser automation), independent Reviewer, and User (cold-start black-box simulated browser test). Existing authentication business flow was frozen. No database, server auth API, role helper, AuthContext, registration layout or global theme changes; no deletions.

## Design
Login-only max-width two-panel card inside existing AppShell. Desktop learning story, local decorative SVG book and translated informational chips; compact mobile brand strip. White form panel with stronger hierarchy, 48px inputs/submit, visible keyboard focus and linked email hint. Existing primary theme tokens and English/Vietnamese localization preserved. Dedicated LoginLayout avoids changing registration.

## Product paths
- client/src/components/LoginLayout.tsx (new)
- client/src/pages/LoginPage.tsx
- client/src/i18n/en.json
- client/src/i18n/vi.json

## Evidence
- Independent reviewer APPROVED: pre-return state/handlers/Navigate logic byte-identical to HEAD; original locale values unchanged.
- Build shared/server/client passed; existing >500kB client chunk warning remains.
- Scoped ESLint and client typecheck passed.
- Real headless installed Edge: desktop1440x1000 and mobile375x812 no horizontal overflow; wrong-password error displayed, password toggle, register navigation passed.
- Enter-key successful login: teacher /teacher/classes, student /student/dashboard, admin /admin/dashboard.
- Protected-route login returned to /teacher/library.
- Browser-only settings response substitution checked EN/VI and sunset palette without changing site settings. Loading submit disabled correctly.
- Screenshot/JSON evidence: artifacts/login-redesign/; reproducible technical test: scripts/verify-login-redesign.cjs.

## Simulated User acceptance
Independent user agent had only URL, tasks and demo credentials; source/DB/network/storage inspection prohibited. Desktop teacher and phone student logins, wrong-password recovery, toggle, keyboard navigation and registration link passed. Not an actual human study; phone was emulation, not physical keyboard/device.
User found small show-password and registration touch targets. PM enlarged both to minimum44px (min-h-11), retaining semantics and reran technical checks. Existing English server error in Vietnamese UI and absent password-reset flow documented, deliberately not changed because auth behavior is outside visual scope. Vertical footer scrolling normal; no horizontal overflow. No claim of post-login learning regression coverage.
