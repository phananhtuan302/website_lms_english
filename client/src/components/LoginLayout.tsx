import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { APP_NAME } from '@platform/shared';

interface LoginLayoutProps {
  children: ReactNode;
}

/** Login-only frame: keep the learning story on desktop and the form first on phones. */
function LoginLayout({ children }: LoginLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-2xl border border-primary-100/70 bg-base-white shadow-panel md:grid-cols-[1fr_1fr]">
      <section className="relative flex min-w-0 flex-col overflow-hidden bg-gradient-to-br from-primary-900 to-primary-800 px-6 py-5 text-base-white sm:px-8 md:px-10 md:py-10">
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

        <div className="relative mt-10 hidden md:block">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary-100">
            {t('auth.login.storyEyebrow')}
          </p>
          <h2 className="max-w-sm text-4xl font-semibold leading-tight tracking-tight lg:text-[2.75rem]">
            {t('auth.login.storyHeading')}
          </h2>
          <p className="mt-5 max-w-sm text-sm leading-7 text-primary-100">
            {t('auth.login.storyDescription')}
          </p>
        </div>

        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 360 190"
          fill="none"
          className="relative my-6 hidden h-44 w-full text-primary-100 md:block"
        >
          <ellipse cx="180" cy="164" rx="114" ry="12" fill="currentColor" opacity="0.08" />
          <circle cx="180" cy="91" r="72" stroke="currentColor" strokeOpacity="0.12" />
          <circle cx="180" cy="91" r="90" stroke="currentColor" strokeOpacity="0.07" />
          <path
            d="M78 57C113 48 148 56 180 76C212 56 247 48 282 57V142C245 134 213 140 180 158C147 140 115 134 78 142V57Z"
            fill="currentColor"
            opacity="0.16"
          />
          <path
            d="M88 46C123 43 153 55 180 73C207 55 237 43 272 46V131C237 128 207 140 180 154C153 140 123 128 88 131V46Z"
            fill="currentColor"
            opacity="0.95"
          />
          <path
            d="M180 73V153"
            stroke="rgb(var(--color-primary-800))"
            strokeWidth="2"
            strokeOpacity="0.35"
          />
          <g
            stroke="rgb(var(--color-primary-800))"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.45"
          >
            <path d="M109 70C127 71 145 77 160 85M109 86C127 87 145 93 160 101M109 102C122 103 134 106 145 111" />
            <path d="M201 85C216 77 234 71 252 70M201 101C216 93 234 87 252 86M201 117C211 112 222 108 233 106" />
          </g>
          <path d="M244 45V81L254 74L264 78V44" fill="rgb(var(--color-primary-500))" />
          <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M63 24L66 33L75 36L66 39L63 48L60 39L51 36L60 33L63 24Z" />
            <path d="M301 89L304 97L312 100L304 103L301 111L298 103L290 100L298 97L301 89Z" />
            <path d="M288 29V39M283 34H293M54 112V120M50 116H58" opacity="0.6" />
          </g>
        </svg>

        <ul className="relative mt-auto hidden flex-wrap gap-2 md:flex">
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

      <div className="flex min-w-0 items-center px-6 py-7 sm:px-10 sm:py-10 md:px-9 lg:px-12">
        <div className="mx-auto w-full max-w-[440px]">{children}</div>
      </div>
    </div>
  );
}

export default LoginLayout;
