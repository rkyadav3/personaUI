async page => {
  const base = 'http://127.0.0.1:5179/tests/browser/governance.html';
  const check = (value, message) => { if (!value) throw new Error(message); }, results = [];
  let tracked = 0;
  await page.unroute('**/api/**');
  try {
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/api/home') return route.fulfill({ json: { name: 'Persona', members: [{ name: 'Maya', slug: 'maya', expertise: ['Design'] }], products: [{ id: '1', kind: 'offering', slug: 'maya', member: 'Maya', title: 'Design guide', pricing: 'free' }] } });
    if (path === '/api/track') { tracked++; return route.fulfill({ json: { ok: true } }); }
    const op = request.postDataJSON()?.op;
    return route.fulfill({ json: op === 'auth.me' ? { user: { id: 'owner', name: 'Owner', isSuperAdmin: true, isAdmin: false } } : { error: 'Unexpected preview request' } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}?role=owner&view=/superadmin/customers`);
  await page.getByRole('button', { name: 'Add new tag', exact: true }).click();
  await page.getByRole('textbox', { name: 'New tag name', exact: true }).fill('Mentor');
  await page.getByRole('combobox', { name: 'Tag visibility', exact: true }).selectOption('private');
  await page.getByRole('button', { name: 'Create tag', exact: true }).click();
  await page.getByText('Mentor · private', { exact: true }).waitFor();
  const customer = page.getByRole('row').filter({ hasText: 'maya@example.test' });
  await customer.getByRole('button', { name: 'Edit & tags', exact: true }).click();
  await page.getByRole('checkbox', { name: /^Mentor/ }).check();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByText('Customer account updated.', { exact: true }).waitFor();
  check(await page.evaluate(() => window.governanceFixture.users.find(user => user.id === 'maya').profile_private), 'Custom private tag did not restrict access');
  results.push('Custom private tag creation and customer assignment');
  await page.goto(`${base}?role=owner&view=/superadmin/settings`);
  const preview = page.frameLocator('iframe[title="Live main site preview"]');
  await preview.getByRole('heading', { name: /Meet industry/ }).waitFor();
  await page.getByRole('textbox', { name: 'Headline opening', exact: true }).fill('Explore our');
  await page.getByRole('textbox', { name: 'Highlighted words', exact: true }).fill('creative');
  await page.getByRole('textbox', { name: 'Headline ending', exact: true }).fill('community');
  await preview.getByRole('heading', { name: 'Explore our creative community', exact: true }).waitFor();
  await page.getByRole('checkbox', { name: 'Show products and offerings', exact: true }).uncheck();
  await page.waitForFunction(() => !document.querySelector('iframe').contentDocument.querySelector('.directory-products'));
  check(tracked === 0, 'Preview counted product views');
  results.push('Live unsaved directory preview without tracking');
  await page.goto(`${base}?role=member&view=/admin`);
  await page.getByRole('heading', { name: 'While you were away', exact: true }).waitFor();
  check((await page.locator('.admin-glimpse').innerText()).includes('+3'), 'Sales increase missing');
  await page.getByRole('button', { name: 'Dismiss activity summary', exact: true }).click();
  await page.getByRole('button', { name: 'Recent activity', exact: true }).click();
  await page.getByRole('heading', { name: 'While you were away', exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.admin-glimpse'), null, { timeout: 15000 });
  results.push('Return activity, dismissal, reopening and fade');
  await page.getByRole('button', { name: 'Explain my activity', exact: true }).click();
  await page.getByRole('button', { name: 'Plan changes', exact: true }).click();
  await page.getByRole('heading', { name: 'Your activity at a glance', exact: true }).waitFor();
  await page.getByText('View daily paid sales data', { exact: true }).click();
  check(await page.getByRole('cell', { name: '2026-11-12', exact: true }).count() === 1, 'Chart data alternative missing');
  results.push('Assistant explanation, metrics and accessible sales data');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Add category', exact: true }).click();
  await page.getByRole('heading', { name: 'Add a category', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  check((await page.getByRole('link', { name: 'Profile', exact: true }).first().getAttribute('href')) === '/admin/profile', 'Profile is not in Settings');
  await page.goto(`${base}?role=owner&view=/superadmin/settings`);
  await page.getByRole('heading', { name: 'Live main site preview', exact: true }).waitFor();
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile editor overflows');
  results.push('Top Add category action, Settings profile navigation and responsive preview');
  await page.goto(`${base}?role=member&view=/admin&delay-activity=1`);
  await page.waitForFunction(() => window.governanceFixture.resumeCalls === 1);
  await page.evaluate(() => {
    const original = Date.now;
    Date.now = () => original() + 6 * 60000;
    window.dispatchEvent(new Event('pointerdown'));
    Date.now = original;
    window.governanceFixture.resumeResolvers.shift()();
  });
  await page.waitForFunction(() => window.governanceFixture.resumeCalls === 2, null, { timeout: 3000 });
  await page.evaluate(() => window.governanceFixture.resumeResolvers.shift()());
  await page.getByRole('heading', { name: 'While you were away', exact: true }).waitFor();
  results.push('Activity refresh survives return during a pending request');
  return results;
  } finally {
    await page.unroute('**/api/**');
  }
}
