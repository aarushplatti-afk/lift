import { expect, test as base } from '@playwright/test';

const DEFAULT_ALLOWED: RegExp[] = [];

interface Options {
  /** Extra console.error patterns a spec may opt in to via test.use({ allowedConsoleErrors: [/a|b/] }).
   * Use ONE combined regex: Playwright reads a two-element array as a [value, options] tuple. */
  allowedConsoleErrors: RegExp[];
}

interface Fixtures {
  consoleGuard: undefined;
}

export const test = base.extend<Fixtures & Options>({
  allowedConsoleErrors: [[], { option: true }],
  consoleGuard: [
    async ({ page, allowedConsoleErrors }, use) => {
      const allowed = [...DEFAULT_ALLOWED, ...allowedConsoleErrors];
      const problems: string[] = [];
      page.on('pageerror', (err) => {
        problems.push(`pageerror: ${err.message}`);
      });
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        if (allowed.some((re) => re.test(text))) return;
        problems.push(`console.error: ${text}`);
      });
      await use(undefined);
      expect(problems, 'unexpected page errors or console.error output').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
