import { test, expect } from '@playwright/test';
import { build } from 'vite';
import path from 'node:path';
import { openViewingTools } from './helpers/viewing';

let probe: string;
test.beforeAll(async () => {
  // Bundle the production shaders into an isolated browser probe. This keeps
  // the color assertions independent of camera framing and photograph content.
  const result = await build({ configFile: false, logLevel: 'silent', build: {
    write: false, lib: { entry: path.resolve('tests/helpers/filmToneProbe.ts'), formats: ['iife'], name: 'FilmToneProbe' },
  } });
  const output = (Array.isArray(result) ? result[0] : result) as { output: { type: string; code?: string }[] };
  probe = output.output.find(item => item.type === 'chunk')!.code!;
});

test('80% preserves source colors directly and through the loupe, with matching film rails and gaps', async ({ page }, info) => {
  await page.goto('/guest?mode=inspect&reduced_motion=true');
  await expect(page.locator('main')).toHaveAttribute('data-assets-ready', 'true');
  await openViewingTools(page);
  await expect(page.getByRole('slider', { name: 'Light Table Brightness', exact: true })).toHaveValue('0.8');
  await page.addScriptTag({ content: probe });
  const result = await page.evaluate(() => (window as any).FilmToneProbe.run());
  await info.attach('rendered-color-measurements', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.direct.max).toBeLessThanOrEqual(1);
  expect(result.capture.max).toBeLessThanOrEqual(2);
  for (const rebate of result.rebates) expect(rebate.rail, `${rebate.id}/${rebate.positive}`).toEqual(rebate.gap);
  expect(result.dimmer.find((item: any) => item.brightness === .8).sample).toEqual([128, 128, 128]);
  for (let i = 1; i < result.dimmer.length; i++) expect(result.dimmer[i].sample[0]).toBeGreaterThan(result.dimmer[i - 1].sample[0]);
});
