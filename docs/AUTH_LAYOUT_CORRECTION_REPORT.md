# Auth layout correction — 2026-10-10

## Delivered
- `/login` and `/register` alone bypass AppShell navigation: no sidebar, desktop header or mobile menu bar. Every other route retains the existing shell.
- Shared, full-viewport responsive auth card, stronger token-driven shadow, persistent themed learning panel/compact mobile brand strip, and exact compact footer `Powered by TechVN.top` with secure new-tab link to https://techvn.top/.
- Form-only 320ms directional exit/enter on real route changes: Register slides login LEFT while registration enters from right; Login slides registration RIGHT while login enters from left. The outgoing visual is inert, aria-hidden, stripped of IDs/forms/controls/links, and removed after animation. No duplicate accessible forms, animation dependency, navigation delay or API delay. Reduced motion disables both. Focus moves to incoming heading after route commit; history remains native.
- Both account-switch links forward existing `location.state`, preserving protected return targets through login → registration → login.
- Register controls match login and 48px sizing. Crisp 2px focus outlines replace input rings. Tall forms scroll naturally. Registration minimum-length warning appears only when nonempty password is shorter than eight; backend handlers and existing validation preserved.
- Replaced Show password with translated `Remember email` / `Nhớ email`, explicitly opt-in localStorage key `webeng.rememberedEmail`. Password stays masked, never persisted by this feature; browser `current-password` autocomplete remains available. JWT/session storage untouched. Storage-disabled errors are handled.
- Auth API calls, redirects, role logic, registration class loading/required-class validation, password minimum attribute and handlers unchanged. No user creation/deletion, database reset, server setting changes, global theme changes or process kills.

## Files changed for this correction
- `client/src/components/AppShell.tsx`
- `client/src/components/AuthLayout.tsx`
- `client/src/components/AuthLayout.css` (new, auth-scoped)
- `client/src/pages/LoginPage.tsx`
- `client/src/pages/RegisterPage.tsx`
- `scripts/verify-login-redesign.cjs` (expanded browser verification)
- `scripts/update-auth-layout.cjs` (one-off implementation transform, retained because deletion prohibited)
- `docs/AUTH_LAYOUT_CORRECTION_REPORT.md`

Preceding redesign's `LoginLayout.tsx` remains on disk but is no longer imported. Added `auth.login.rememberEmail` to `client/src/i18n/en.json` and `vi.json`; other prior locale additions reused. One-off follow-up transform retained in `scripts/auth-followup.cjs` (no deletions).

## Verification
- `npm run build` PASS (shared, server, client). Existing >500kB Vite chunk warning remains.
- `npm run typecheck` PASS all three workspaces.
- Scoped ESLint PASS: AppShell/AuthLayout/LoginPage/RegisterPage.
- `node scripts/verify-login-redesign.cjs` PASS on live app/API using installed headless Edge.
- Desktop 1440×1000 and mobile 375×812: one form only, no navigation chrome, compact footer ≤60px, no horizontal overflow, wrong-password feedback, remembered-email consent/reload/removal with password absence in localStorage, conditional short-password warning, directional exit/enter evidence, secure exact footer, class picker and required-class feedback, keyboard route switching both directions, incoming heading focus, back/forward, no browser page errors.
- Reduced-motion switches both directions: computed animation `none`.
- Enter-key demo logins: teacher `/teacher/classes`, student `/student/dashboard`, admin `/admin/dashboard`. Normal sidebar returns after login.
- Protected `/teacher/library` survives login → register → login and successful authentication.
- Browser-only settings response overrides verify EN/VI forest and EN sunset on both forms. Forest primary-700 `4 120 87`, sunset `181 64 42`; no server settings mutation.
- Screenshots inspected: forest desktop login and tall mobile registration; no clipping found.

Evidence: `artifacts/auth-layout-correction/technical-report.json`, `login-1440.png`, `login-375.png`, `register-1440.png`, `register-375.png`, plus EN/VI forest and EN sunset images for both forms.

## Caveats
Registration success is intentionally not submitted (no accounts created); original business handlers were preserved and required-class validation exercised. Tests are browser emulation, not physical mobile/human testing. Transition uses a static outgoing presentation snapshot and one live incoming form; the persistent shared panel does not animate. Existing registration validation behavior is not broadened. No full post-login learning regression coverage claimed.
