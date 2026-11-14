async page => {
  // Run against local fixtures only. Their fetch interceptors never call live APIs.
  const origin = 'http://127.0.0.1:5173/tests/browser';
  const check = (value, message) => { if (!value) throw new Error(message); };
  const results = [];
  await page.setViewportSize({ width: 960, height: 667 });
  await page.goto(`${origin}/admin-workflow.html?route=${encodeURIComponent('/admin/activity')}`);
  await page.getByRole('button', { name: '+ Add project', exact: true }).click();
  const project = page.getByRole('dialog', { name: 'Add project', exact: true });
  await project.getByRole('textbox', { name: 'One-line summary', exact: true }).fill('Draft details');
  await project.getByRole('button', { name: 'Add project', exact: true }).click();
  await project.getByText('Add a name or title before adding this entry.', { exact: true }).waitFor();
  await project.getByRole('textbox', { name: 'Title', exact: true }).fill('Staged project');
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (url, options) => {
      if (url === '/api/admin' && JSON.parse(options.body).op === 'assets.sign') {
        return new Promise(resolve => {
          window.finishUploadFixture = () => resolve(new Response(JSON.stringify({ error: 'Upload interrupted' }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
        });
      }
      return original(url, options);
    };
  });
  await project.getByLabel('Choose file for Picture link (https://…)').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('fixture') });
  await page.waitForFunction(() => !!window.finishUploadFixture);
  await page.keyboard.press('Escape');
  check(await project.isVisible(), 'Upload dialog was dismissed');
  check(await project.getByRole('button', { name: 'Cancel', exact: true }).isDisabled(), 'Upload can be cancelled');
  check(await project.getByRole('button', { name: 'Add project', exact: true }).isDisabled(), 'Incomplete upload can be submitted');
  await page.evaluate(() => window.finishUploadFixture());
  await project.getByText('Upload interrupted', { exact: true }).waitFor();
  check(await project.getByRole('textbox', { name: 'Title', exact: true }).inputValue() === 'Staged project', 'Failed upload lost draft');
  await project.getByRole('button', { name: 'Cancel', exact: true }).click();
  await project.waitFor({ state: 'hidden' });
  check(await page.getByText('Staged project', { exact: true }).count() === 0, 'Cancelled project was added');
  results.push('Validation, upload closure/submit guards, failed-upload draft preservation and cancellation');

  await page.goto(`${origin}/admin-workflow.html?route=${encodeURIComponent('/admin/writing?tab=templates')}`);
  await page.getByText('Research summary', { exact: true }).click();
  await page.getByRole('button', { name: 'Use for new article', exact: true }).click();
  const article = page.getByRole('dialog', { name: 'New article', exact: true });
  await article.waitFor();
  check(await article.getByRole('combobox', { name: 'Starting template (optional)', exact: true }).inputValue() === '1', 'Template shortcut lost selection');
  check(await page.evaluate(() => window.fixtureRequests.filter(request => request.op === 'posts.create').length) === 0, 'Shortcut created an article before submission');
  await page.keyboard.press('Escape');
  await article.waitFor({ state: 'hidden' });
  check(await page.evaluate(() => window.fixtureRequests.filter(request => request.op === 'posts.create').length) === 0, 'Cancelling setup created an article');
  results.push('Template shortcut opens setup and cancellation creates no article');

  await page.setViewportSize({ width: 260, height: 563 });
  await page.goto(`${origin}/governance.html?role=member&view=/admin/suggestions`);
  await page.getByRole('heading', { name: 'Platform suggestions', exact: true }).waitFor();
  const tabs = await page.getByRole('navigation', { name: 'Settings pages', exact: true }).getByRole('link').allTextContents();
  check(tabs.at(-2) === 'Support' && tabs.at(-1) === 'Suggestions', 'Suggestions must follow Support');
  await page.getByRole('button', { name: 'Suggest an improvement', exact: true }).click();
  const suggestion = page.getByRole('dialog', { name: 'Suggest an improvement', exact: true });
  await suggestion.getByRole('textbox', { name: 'Title', exact: true }).fill('Improve forms');
  await suggestion.getByRole('textbox', { name: 'Description', exact: true }).fill('Keep forms clear and easy to use.');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile form overflows');
  await suggestion.getByRole('button', { name: 'Send suggestion', exact: true }).click();
  await page.getByText('Improve forms', { exact: true }).waitFor();
  results.push('Mobile suggestion popup submission and Settings order');
  return results;
}
