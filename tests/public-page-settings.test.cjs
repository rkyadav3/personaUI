const test = require('node:test');
const assert = require('node:assert/strict');

test('public page editing has one Settings destination, with no copies in other admin groups', async () => {
  const { ADMIN_SECTIONS, adminLocation } = await import('../src/lib/adminNavigation.js');
  const settings = ADMIN_SECTIONS.find(section => section.id === 'settings');
  assert.equal(settings.pages.filter(page => page.id === 'editor').length, 1);
  assert.equal(settings.pages.find(page => page.id === 'editor').to, '/admin/settings');
  for (const section of ADMIN_SECTIONS.filter(section => section.id !== 'settings')) {
    assert.ok(section.pages.every(page => !page.to.startsWith('/admin/portfolio') && !page.to.startsWith('/admin/settings')), section.id);
  }
  for (const tab of ['hero', 'numbers', 'about', 'projects', 'talks', 'recognition', 'certificates', 'testimonials', 'experience', 'products', 'store', 'persona', 'contact', 'look', 'design']) {
    assert.deepEqual(adminLocation('/admin/settings', `?tab=${tab}`), { group: 'settings', page: 'editor' }, tab);
    assert.deepEqual(adminLocation('/admin/portfolio', `?tab=${tab}`), { group: 'settings', page: 'editor' }, tab);
  }
});

test('legacy editor links retain their tab and unrelated parameters when moving into Settings', async () => {
  const { settingsHref } = await import('../src/lib/publicPageSettings.js');
  assert.equal(settingsHref('?tab=products&focus=checkout'), '/admin/settings?tab=products&focus=checkout');
  assert.equal(settingsHref('?focus=contact', 'contact'), '/admin/settings?focus=contact&tab=contact');
  assert.equal(settingsHref('?tab=unknown&focus=chat'), '/admin/settings?tab=hero&focus=chat');
  assert.equal(settingsHref('?tab=visibility'), '/admin/settings?tab=privacy');
  assert.equal(settingsHref('?tab=settings'), '/admin/settings?tab=payments');
});

test('public page settings retains every editor area and safely resolves invalid tabs', async () => {
  const { EDITOR_AREAS, EDITOR_TABS, readSettingsTab } = await import('../src/lib/publicPageSettings.js');
  assert.deepEqual(Object.keys(EDITOR_AREAS), ['home', 'activity', 'store', 'chat', 'contact', 'appearance']);
  for (const tabs of Object.values(EDITOR_TABS)) for (const tab of Object.keys(tabs)) assert.equal(readSettingsTab(tab), tab);
  assert.equal(readSettingsTab('privacy'), 'privacy');
  assert.equal(readSettingsTab('payments'), 'payments');
  assert.equal(readSettingsTab('visibility'), 'privacy');
  assert.equal(readSettingsTab('settings'), 'payments');
  assert.equal(readSettingsTab('__proto__'), 'hero');
  assert.equal(readSettingsTab(null), 'hero');
});

test('assistant links reach the consolidated editor and the separate offerings manager', async () => {
  const { STUDIO_ENTITIES } = await import('../shared/studioAssistant.js');
  for (const entity of Object.values(STUDIO_ENTITIES).filter(entity => entity.root === 'settings' && !['Portfolio projects', 'Free and paid shop products', 'Public experience timeline', 'Portfolio talks and interviews', 'Home award highlights', 'Recognition and awards', 'Certificates', 'Testimonials'].includes(entity.label))) assert.ok(entity.href.startsWith('/admin/settings'), entity.label);
  assert.equal(STUDIO_ENTITIES.payments.href, '/admin/settings?tab=payments');
  assert.equal(STUDIO_ENTITIES.contributions.href, '/admin/store?tab=categories');
  assert.equal(STUDIO_ENTITIES.offerings.href, '/admin/store?tab=categories');
});
