const fs = require('fs');
for (const page of ['Login', 'Register']) {
  const path = `client/src/pages/${page}Page.tsx`;
  let s = fs.readFileSync(path, 'utf8');
  s = s
    .replace(/import (LoginLayout|AuthLayout) from .*;\r?\n/, '')
    .replace(/<(LoginLayout|AuthLayout)>/, '<>')
    .replace(/<\/(LoginLayout|AuthLayout)>/, '</>');
  s = s.replace(
    page === 'Login' ? 'to="/register"' : 'to="/login"',
    page === 'Login'
      ? 'to="/register" state={location.state}'
      : 'to="/login" state={location.state}',
  );
  if (page === 'Register') {
    s = s
      .replace(
        'mb-6 text-2xl font-bold text-primary-700',
        'mb-7 text-3xl font-semibold tracking-tight text-base-black sm:text-4xl',
      )
      .replaceAll('gap-1 text-sm font-medium', 'gap-2 text-sm font-semibold');
    const field =
      'min-h-12 w-full rounded-xl border border-primary-200 bg-base-white px-4 py-3 text-base font-normal text-base-black focus-visible:border-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/25 focus-visible:ring-offset-2';
    s = s
      .replaceAll(
        'rounded-md border border-primary-200 px-3 py-2 text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200',
        field,
      )
      .replaceAll(
        'rounded-md border border-primary-200 bg-base-white px-3 py-2 text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200',
        field,
      );
    s = s.replace(
      'rounded-md bg-primary-500 px-4 py-2.5 sm:py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600',
      'min-h-12 w-full rounded-xl bg-primary-700 px-4 py-3 text-sm font-semibold text-base-white transition-colors hover:bg-primary-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-700',
    );
    s = s
      .replace(
        'mt-4 text-sm text-base-black/70',
        'mt-6 border-t border-primary-100 pt-6 text-center text-sm leading-6 text-base-black/70',
      )
      .replace(
        'font-medium text-primary-600 hover:underline',
        'inline-flex min-h-11 items-center rounded font-semibold text-primary-700 underline decoration-primary-200 underline-offset-4 hover:decoration-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-700',
      );
  }
  fs.writeFileSync(path, s);
}
