async page => {
  // Run with browser_run_code_unsafe against the local Vite server only.
  const origin = new URL(page.url()).origin;
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Open a local fixture first.');
  const check = (value, message) => { if (!value) throw new Error(message); };
  await page.setViewportSize({ width: 960, height: 700 });
  const scale = await page.evaluate(() => innerWidth / 960);
  const viewport = width => page.setViewportSize({ width: Math.round(width / scale), height: 700 });
  const results = [];

  await page.goto(`${origin}/tests/browser/settings.html`);
  await page.evaluate(() => sessionStorage.removeItem('fixture:public-page-settings'));
  await page.reload();
  await page.locator('input[placeholder="Chat with my AI"]').waitFor();
  const media = page.locator('.media-field').filter({ hasText: 'Introduction video or file' });
  for (const width of [1440, 1250, 1024, 768, 390, 320]) {
    await viewport(width);
    check(await media.evaluate(e => {
      const card = e.closest('.card').getBoundingClientRect();
      return [...e.querySelectorAll('input')].every(input => input.getBoundingClientRect().right < card.right) && document.documentElement.scrollWidth <= document.documentElement.clientWidth;
    }), `Editor fields overflow at ${width}px`);
  }
  await viewport(1440);
  await page.locator('input[placeholder="Chat with my AI"]').fill('Watch introduction');
  await media.locator('input[type=text]').fill('https://example.test/introduction.mp4');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('button', { name: 'Saved', exact: true }).waitFor();
  await page.reload();
  check(await media.locator('input[type=text]').inputValue() === 'https://example.test/introduction.mp4', 'Introduction link did not persist');
  await page.getByRole('tab', { name: 'Contact', exact: true }).click();
  const controls = page.locator('.customization-controls');
  await controls.locator('select').nth(0).selectOption('sidebar');
  await controls.locator('select').nth(1).selectOption('comfortable');
  await controls.getByRole('checkbox', { name: 'Show direct contact details' }).uncheck();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('button', { name: 'Saved', exact: true }).waitFor();
  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('fixture:public-page-settings')).site.page.customization);
  check(saved.contactLayout === 'sidebar' && saved.contactWidth === 'comfortable' && !saved.contactDetails, 'Contact settings did not persist');
  results.push('Editor field containment and settings persistence');

  await page.goto(`${origin}/tests/browser/navigation.html?view=contact`);
  await page.locator('.pf-form').waitFor();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await viewport(width);
    check(await page.locator('.pf-contact-grid').evaluate(e => {
      const grid = e.getBoundingClientRect(), form = e.querySelector('.pf-form').getBoundingClientRect(), side = e.querySelector('.pf-side').getBoundingClientRect();
      return Math.abs(form.x + form.width / 2 - (grid.x + grid.width / 2)) < 1 && side.y >= form.bottom && document.documentElement.scrollWidth <= document.documentElement.clientWidth;
    }), `Contact form is not centered at ${width}px`);
  }
  await viewport(1440);
  await page.goto(`${origin}/tests/browser/navigation.html?view=contact&contactLayout=sidebar&contactWidth=comfortable`);
  check(await page.locator('.pf-contact-grid').evaluate(e => {
    const form = e.querySelector('.pf-form').getBoundingClientRect(), side = e.querySelector('.pf-side').getBoundingClientRect();
    return form.width <= 640 && side.x >= form.right;
  }), 'Contact sidebar layout is not applied');
  results.push('Centered contact form and optional sidebar');

  const api = `${origin}/api`;
  await page.route(`${api}/admin`, route => route.fulfill({ json: { user: { id: 'preview-owner', isSuperAdmin: true } } }));
  await page.route(`${api}/home`, route => route.fulfill({ json: { members: [{ slug: 'public-fixture', name: 'Public creator', expertise: ['Design'], views: 20 }], products: [] } }));
  try {
    await page.goto(`${origin}/tests/browser/governance.html?view=%2Fsuperadmin%2Fsettings`);
    const card = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Featured profile card' }) });
    await card.locator('input[maxlength="40"]').fill('Explore everything this creator offers');
    await card.locator('input[maxlength="60"]').fill('Community spotlight');
    await card.locator('select').selectOption('square');
    const frame = page.frameLocator('iframe[title="Live main site preview"]');
    await frame.locator('.directory-profile-cta.shape-square').filter({ hasText: 'Explore everything this creator offers' }).waitFor();
    for (const portrait of [true, false]) {
      await card.getByRole('checkbox', { name: 'Show portrait', exact: true }).setChecked(portrait);
      for (const width of [1100, 950, 768, 600, 390, 320]) {
        await page.locator('iframe').evaluate((e, width) => { e.style.width = `${width}px`; }, width);
        check(await frame.locator('.directory-feature').evaluate(e => {
          const card = e.getBoundingClientRect(), button = e.querySelector('.directory-profile-cta').getBoundingClientRect();
          return button.left >= card.left && card.right - button.right >= 10 && document.documentElement.scrollWidth <= document.documentElement.clientWidth;
        }), `Featured profile button clips at ${width}px`);
      }
    }
    await page.getByRole('button', { name: 'Save main site settings', exact: true }).click();
    await page.getByText('Main site settings saved. The public directory now uses these settings.', { exact: true }).waitFor();
    check(await page.evaluate(() => window.governanceFixture.homeSettings.featuredButtonStyle === 'square'), 'Featured card settings did not save');
    results.push('Featured card live preview, long labels and visibility settings');
  } finally {
    await page.unroute(`${api}/admin`);
    await page.unroute(`${api}/home`);
  }
  return results;
}
