async page => {
  const origin = new URL(page.url()).origin;
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Open a local fixture first.');
  for (const mobile of [false, true]) {
    await page.goto(origin + '/tests/browser/scaled-preview.html' + (mobile ? '?mobile' : ''));
    await page.frameLocator('iframe').getByRole('heading', { name: 'Preview content' }).waitFor();
    const heights = await page.evaluate(async () => {
      const values = [];
      for (let i = 0; i < 12; i++) { await new Promise(requestAnimationFrame); values.push(document.querySelector('iframe').getBoundingClientRect().height); }
      return values;
    });
    if (Math.max(...heights) - Math.min(...heights) > 2) throw new Error('Preview height grows with its own viewport: ' + JSON.stringify(heights));
    const dimensions = await page.locator('iframe').evaluate(frame => ({ viewport: frame.clientHeight, content: frame.contentDocument.documentElement.scrollHeight }));
    if (dimensions.content <= dimensions.viewport) throw new Error('Tall preview content should remain scrollable.');
  }
  return 'Desktop and mobile previews keep a stable viewport and scroll tall content.';
}
