const { chromium } = require('playwright');
const fs = require('fs');
const assert = require('assert');
const base = 'http://127.0.0.1:5173';
const out = 'artifacts/auth-layout-correction';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  fs.mkdirSync(out, { recursive: true });
  const report = [];
  async function checkShell(page) {
    assert.equal(await page.locator('[data-auth-layout]').count(), 1);
    assert.equal(await page.locator('aside, nav').count(), 0);
    assert.equal(await page.locator('.sticky.top-0, .h-14.shrink-0').count(), 0); // desktop/mobile app headers
    assert.equal(await page.getByRole('button', { name: /open.*menu|mở.*menu/i }).count(), 0);
    assert.equal(await page.locator('main').count(), 1);
    assert.equal(await page.locator('form').count(), 1);
    assert(await page.locator('footer').evaluate((el) => el.getBoundingClientRect().height <= 60));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.equal((await page.locator('footer').innerText()).trim(), 'Powered by TechVN.top');
    const footerLink = page.locator('footer a');
    assert.equal(await footerLink.getAttribute('href'), 'https://techvn.top/');
    assert.equal(await footerLink.getAttribute('target'), '_blank');
    assert.equal(await footerLink.getAttribute('rel'), 'noopener noreferrer');
  }
  for (const width of [1440, 375]) {
    const ctx = await browser.newContext({
      viewport: { width, height: width === 375 ? 812 : 1000 },
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/login`);
    await page.locator('#login-email').waitFor();
    await checkShell(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/login-${width}.png`, fullPage: true });
    await page.locator('#login-email').fill('demo.teacher1@demo.webeng.test');
    await page.locator('#login-password').fill('wrong-password');
    await page.locator('button[type=submit]').click();
    await page.getByRole('alert').waitFor();
    assert(new URL(page.url()).pathname === '/login');
    assert.equal(await page.evaluate(() => localStorage.getItem('webeng.rememberedEmail')), null);
    await page.locator('input[type=checkbox]').check();
    await page.waitForFunction(
      () => localStorage.getItem('webeng.rememberedEmail') === 'demo.teacher1@demo.webeng.test',
    );
    assert.equal(await page.locator('#login-password').getAttribute('type'), 'password');
    assert.equal(
      await page.locator('#login-password').getAttribute('autocomplete'),
      'current-password',
    );
    assert(!(await page.evaluate(() => JSON.stringify(localStorage))).includes('wrong-password'));
    await page.reload();
    await page.locator('#login-email').waitFor();
    assert.equal(await page.locator('#login-email').inputValue(), 'demo.teacher1@demo.webeng.test');
    assert.equal(await page.locator('#login-password').inputValue(), '');
    await page.locator('input[type=checkbox]').uncheck();
    await page.waitForFunction(() => localStorage.getItem('webeng.rememberedEmail') === null);
    await page.evaluate(() => {
      window.authMotionEvidence = [];
      new MutationObserver(() => {
        const outgoing = document.querySelector('.auth-form-outgoing');
        const incoming = document.querySelector('[data-auth-form]');
        if (outgoing && incoming)
          window.authMotionEvidence.push({
            route: incoming.dataset.authForm,
            exit: outgoing.style.getPropertyValue('--auth-exit-x'),
            enter: getComputedStyle(incoming).getPropertyValue('--auth-enter-x').trim(),
            exitAnimation: getComputedStyle(outgoing).animationName,
            inert: outgoing.inert,
            hidden: outgoing.getAttribute('aria-hidden'),
            controls: outgoing.querySelectorAll('form, input, select, button').length,
          });
      }).observe(document.querySelector('main'), { childList: true, subtree: true });
    });
    const registerLink = page.locator('a[href="/register"]');
    await registerLink.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/register');
    await checkShell(page);
    await page.waitForFunction(() => document.activeElement === document.querySelector('h1'));
    assert.equal(
      await page.locator('[data-auth-form]').evaluate((el) => getComputedStyle(el).animationName),
      'auth-form-enter',
    );
    assert.equal(await page.locator('#register-password-warning').count(), 0);
    await page.locator('input[autocomplete="new-password"]').fill('short');
    await page.locator('#register-password-warning').waitFor();
    await page.locator('input[autocomplete="new-password"]').fill('long-enough-password');
    assert.equal(await page.locator('#register-password-warning').count(), 0);
    await page.locator('input[autocomplete="new-password"]').fill('');
    await page.locator('select option').nth(1).waitFor({ state: 'attached' });
    await page.locator('button[type=submit]').click();
    await page.getByRole('alert').waitFor(); // required-class validation, no account created
    await page.locator('a[href="/login"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/register-${width}.png`, fullPage: true });
    await page.locator('a[href="/login"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/login');
    await page.waitForFunction(() => document.activeElement === document.querySelector('h1'));
    const motion = await page.evaluate(() => window.authMotionEvidence);
    assert(
      motion.some(
        (m) =>
          m.route === 'register' &&
          m.exit === '-110%' &&
          m.enter === '110%' &&
          m.exitAnimation === 'auth-form-exit' &&
          m.inert &&
          m.hidden === 'true' &&
          m.controls === 0,
      ),
    );
    assert(
      motion.some(
        (m) =>
          m.route === 'login' &&
          m.exit === '110%' &&
          m.enter === '-110%' &&
          m.exitAnimation === 'auth-form-exit' &&
          m.inert &&
          m.hidden === 'true' &&
          m.controls === 0,
      ),
    );
    await page.goBack();
    await page.waitForURL('**/register');
    await page.goForward();
    await page.waitForURL('**/login');
    await checkShell(page);
    assert.deepEqual(errors, []);
    report.push({
      width,
      cleanAuthChrome: true,
      compactFooter: true,
      overflow: false,
      rememberEmailConsentAndReload: true,
      noPasswordStorage: true,
      conditionalPasswordWarning: true,
      directionalExitAndEnterVerified: true,
      externalFooterVerified: true,
      wrongPassword: true,
      keyboardSwitchBothDirections: true,
      headingFocus: true,
      history: true,
      classPicker: true,
      requiredClassValidation: true,
      pageErrors: errors,
    });
    await ctx.close();
  }
  const reduced = await browser.newContext({ reducedMotion: 'reduce' });
  const rp = await reduced.newPage();
  await rp.goto(`${base}/login`);
  await rp.locator('#login-email').waitFor();
  for (const route of ['/register', '/login']) {
    await rp.locator(`a[href="${route}"]`).click();
    await rp.waitForURL(`**${route}`);
    await rp.waitForFunction(() => document.querySelector('[data-auth-form]')?.dataset.authForm === location.pathname.slice(1));
    assert.equal(
      await rp.locator('[data-auth-form]').evaluate((el) => getComputedStyle(el).animationName),
      'none',
    );
    await checkShell(rp);
  }
  report.push({ reducedMotionBothDirections: true });
  await reduced.close();
  for (const [account, target] of [
    ['teacher1', '/teacher/classes'],
    ['student002', '/student/dashboard'],
    ['admin', '/admin/dashboard'],
  ]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${base}/login`);
    await page.locator('#login-email').fill(`demo.${account}@demo.webeng.test`);
    await page.locator('#login-password').fill('Demo@2026!');
    await page.locator('#login-password').press('Enter');
    await page.waitForURL(`**${target}`, { timeout: 30000 });
    await page.locator('[data-auth-layout]').waitFor({ state: 'detached' });
    assert((await page.locator('aside').count()) > 0);
    report.push({ account, keyboardSubmit: true, path: target, normalShellPreserved: true });
    await ctx.close();
  }
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(`${base}/teacher/library`);
  await p.waitForURL('**/login');
  await p.locator('a[href="/register"]').click();
  await p.waitForURL('**/register');
  await p.locator('a[href="/login"]').click();
  await p.waitForURL('**/login');
  await p.locator('#login-email').fill('demo.teacher1@demo.webeng.test');
  await p.locator('#login-password').fill('Demo@2026!');
  await p.locator('button[type=submit]').click();
  await p.waitForURL('**/teacher/library');
  report.push({ returnRouteAcrossFormSwitches: '/teacher/library', preserved: true });
  await ctx.close();
  // Browser-local settings response substitution only: no server settings writes.
  for (const [language, themeId] of [
    ['en', 'forest'],
    ['vi', 'forest'],
    ['en', 'sunset'],
  ]) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await c.route('**/api/settings', async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      await route.fulfill({ response, json: { ...data, language, themeId } });
    });
    const page = await c.newPage();
    await page.goto(`${base}/login`);
    await page.locator('#login-email').waitFor();
    const token = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-primary-700').trim(),
    );
    assert(token);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/login-${language}-${themeId}.png`, fullPage: true });
    await page.locator('a[href="/register"]').click();
    await page.waitForURL('**/register');
    await checkShell(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/register-${language}-${themeId}.png`, fullPage: true });
    report.push({ language, themeId, primary700: token, bothForms: true });
    await c.close();
  }
  await browser.close();
  fs.writeFileSync(`${out}/technical-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
