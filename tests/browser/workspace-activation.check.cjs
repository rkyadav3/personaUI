async page => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await page.goto('http://127.0.0.1:5181/tests/browser/settings.html');
  await page.getByRole('navigation', { name: 'Settings pages' }).waitFor();
  for (const label of ['Website connections', 'Team access', 'Webhooks', 'Data export']) {
    check(await page.getByRole('link', { name: label, exact: true }).count() === 0, 'Disabled Settings link: ' + label);
  }
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await page.getByRole('heading', { name: 'Privacy settings', exact: true }).waitFor();
  for (const route of ['/admin/integrations', '/admin/team', '/admin/team?invite=wi_disabled_test_invitation', '/admin/webhooks', '/admin/export']) {
    await page.goto('http://127.0.0.1:5181/tests/browser/admin-workflow.html?route=' + encodeURIComponent(route));
    await page.getByRole('heading', { name: 'This feature is not enabled yet', exact: true }).waitFor();
    check(await page.getByRole('button', { name: 'Accept invitation', exact: true }).count() === 0, 'Disabled invitation offered acceptance');
    const called = await page.evaluate(() => window.fixtureRequests.map(request => request.op));
    check(!called.some(op => /^(integrations\.|team\.|webhooks\.|data\.export)/.test(op)), 'Unavailable route requested account tools: ' + route);
  }
  const mobile = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1 });
  try {
    const mobilePage = await mobile.newPage();
    await mobilePage.goto('http://127.0.0.1:5181/tests/browser/settings.html');
    await mobilePage.getByRole('navigation', { name: 'Settings pages' }).waitFor();
    const fit = await mobilePage.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyText: getComputedStyle(document.body).fontSize }));
    check(fit.width === 390 && fit.scrollWidth <= 390 && fit.bodyText === '16px', 'Mobile Settings layout or text size regressed');
  } finally { await mobile.close(); }
  return ['Disabled Settings and direct links, including invitations', 'Legacy Privacy access', 'Actual 390px mobile fit and 16px body text'];
}
