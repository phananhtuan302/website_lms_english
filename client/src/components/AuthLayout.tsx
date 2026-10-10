import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { APP_NAME } from '@platform/shared';
import './AuthLayout.css';

interface AuthLayoutProps {
  children: ReactNode;
}

/** Persistent auth-only viewport; only the active route owns a live form.
 * Directional CSS exit/entrance never delays routing, focus or API work. The
 * outgoing visual snapshot is inert, aria-hidden and stripped of form controls.
 */
function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const formPanel = useRef<HTMLDivElement>(null);
  const previousPath = useRef(pathname);
  const snapshot = useRef<HTMLElement | null>(null);
  const isRegister = pathname === '/register';

  useLayoutEffect(() => {
    let outgoing: HTMLElement | null = null;
    if (previousPath.current !== pathname) {
      if (snapshot.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        outgoing = snapshot.current;
        outgoing.className = 'auth-form-outgoing';
        outgoing.removeAttribute('data-auth-form');
        outgoing.querySelectorAll('form').forEach((form) => {
          const visual = document.createElement('div');
          visual.className = form.className;
          visual.append(...Array.from(form.childNodes));
          form.replaceWith(visual);
        });
        outgoing.setAttribute('aria-hidden', 'true');
        outgoing.inert = true;
        outgoing.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
        outgoing.querySelectorAll('input, select, textarea, button').forEach((control) => {
          const visual = document.createElement('div');
          visual.className = control.className;
          visual.textContent = control instanceof HTMLButtonElement ? control.textContent : '';
          control.replaceWith(visual);
        });
        outgoing.querySelectorAll('a').forEach((link) => link.removeAttribute('href'));
        outgoing.style.setProperty('--auth-exit-x', pathname === '/register' ? '-110%' : '110%');
        formPanel.current?.parentElement?.append(outgoing);
        outgoing.addEventListener('animationend', () => outgoing?.remove(), { once: true });
      }
      // React Router may commit its new outlet after this parent's layout effect.
      // Focus the committed heading on the next frame, without waiting for motion.
      const frame = requestAnimationFrame(() => {
        const heading = formPanel.current?.querySelector('h1');
        if (heading) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
        }
        window.scrollTo({ top: 0, behavior: 'instant' });
        snapshot.current = formPanel.current?.cloneNode(true) as HTMLElement | null;
      });
      previousPath.current = pathname;
      return () => {
        cancelAnimationFrame(frame);
        outgoing?.remove();
      };
    }
    const frame = requestAnimationFrame(() => {
      snapshot.current = formPanel.current?.cloneNode(true) as HTMLElement | null;
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    <div
      className="auth-viewport flex min-h-screen flex-col bg-app-canvas text-base-black"
      data-auth-layout
    >
      <main className="flex w-full flex-1 items-center justify-center px-4 py-6 sm:px-8 sm:py-10">
        <div className="auth-card grid w-full max-w-5xl overflow-hidden rounded-2xl border border-primary-100/70 bg-base-white md:grid-cols-2">
          <section className="relative flex min-w-0 flex-col justify-center overflow-hidden bg-gradient-to-br from-primary-900 to-primary-800 px-6 py-5 text-base-white sm:px-8 md:px-10 md:py-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-24 top-40 hidden h-80 w-80 rounded-full border border-base-white/10 md:block"
            />
            <div className="relative flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-base-white/20 bg-base-white/10 text-sm font-bold"
              >
                E
              </span>
              <p className="text-sm font-semibold tracking-wide">{APP_NAME}</p>
            </div>
            <div className="relative my-12 hidden md:block">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary-100">
                {t('auth.login.storyEyebrow')}
              </p>
              <h2 className="max-w-sm text-4xl font-semibold leading-tight tracking-tight lg:text-[2.75rem]">
                {t('auth.login.storyHeading')}
              </h2>
              <p className="mt-5 max-w-sm text-sm leading-7 text-primary-100">
                {t('auth.login.storyDescription')}
              </p>
              <svg
                aria-hidden="true"
                focusable="false"
                viewBox="0 0 300 140"
                fill="none"
                className="mt-8 h-32 w-full text-primary-100"
              >
                <circle cx="150" cy="68" r="64" stroke="currentColor" strokeOpacity="0.12" />
                <path
                  d="M52 23C88 19 118 32 150 51C182 32 212 19 248 23V108C212 104 182 117 150 132C118 117 88 104 52 108V23Z"
                  fill="currentColor"
                  opacity="0.95"
                />
                <g
                  stroke="rgb(var(--color-primary-800))"
                  strokeWidth="3"
                  strokeLinecap="round"
                  opacity="0.5"
                >
                  <path d="M150 51V130M75 48L125 67M75 65L125 84M75 82L112 96M175 67L225 48M175 84L225 65M175 101L213 86" />
                </g>
                <path d="M218 23V58L228 51L238 55V22" fill="rgb(var(--color-primary-500))" />
              </svg>
            </div>
            <ul className="relative hidden flex-wrap gap-2 md:flex">
              {['tests', 'vocabulary', 'progress'].map((feature) => (
                <li
                  key={feature}
                  className="rounded-full border border-base-white/20 bg-base-white/10 px-3 py-2 text-xs font-medium text-primary-50"
                >
                  {t(`auth.login.features.${feature}`)}
                </li>
              ))}
            </ul>
          </section>
          <div className="auth-form-stage relative flex min-w-0 items-center overflow-hidden px-6 py-7 sm:px-10 sm:py-10 md:px-9 lg:px-12">
            <div
              key={pathname}
              ref={formPanel}
              className="auth-form-transition mx-auto w-full max-w-[440px]"
              data-auth-form={isRegister ? 'register' : 'login'}
            >
              {children}
            </div>
          </div>
        </div>
      </main>
      <footer
        className="shrink-0 border-t border-primary-100/70 bg-base-white/50 px-4 py-2 text-center text-xs leading-5 text-base-black/60"
        data-auth-footer
      >
        Powered by{' '}
        <a
          href="https://techvn.top/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-primary-700 underline underline-offset-2"
        >
          TechVN.top
        </a>
      </footer>
    </div>
  );
}

export default AuthLayout;
