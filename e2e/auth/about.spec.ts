import { readFileSync } from 'node:fs';
import { expect, test } from '../fixtures';
import { createUser, hasSupabase, openSettings, SKIP_REASON, signInUi } from './helpers';

test.skip(!hasSupabase, SKIP_REASON);

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

test('About shows the package version and Install app only after beforeinstallprompt', async ({
  page,
}) => {
  const user = await createUser('about');
  await signInUi(page, user);
  await openSettings(page);

  const about = page.getByRole('region', { name: 'About' });
  await expect(about).toContainText(pkg.version);
  await expect(about.getByRole('button', { name: 'Install app' })).toHaveCount(0);

  await page.evaluate(() => {
    const ev = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(ev, {
      prompt: () => Promise.resolve(),
      userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
    });
    window.dispatchEvent(ev);
  });
  await expect(about.getByRole('button', { name: 'Install app' })).toBeVisible();

  await about.getByRole('button', { name: 'How to install' }).click();
  await expect(page.getByRole('dialog', { name: 'How to install' })).toBeVisible();
});
