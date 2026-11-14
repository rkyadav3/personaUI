export function sortDisplayItems(items, order = 'saved') {
  const rows = [...items];
  if (order === 'title') rows.sort((a, b) => String(a.title || a.author || a.role || '').localeCompare(String(b.title || b.author || b.role || '')));
  if (order === 'newest') { const date = row => Date.parse(row.startsAt || row.date || row.year || row.createdAt || '') || 0; rows.sort((a, b) => date(b) - date(a)); }
  if (order === 'price_low' || order === 'price_high') rows.sort((a, b) => (Number(a.amount || 0) - Number(b.amount || 0)) * (order === 'price_low' ? 1 : -1));
  return rows;
}
export function activityDisplayModel(model, config, limit) {
  const result = { ...model };
  const eventKeys = ['events', 'updates', 'schedule'];
  const events = sortDisplayItems(eventKeys.flatMap(key => (model[key] || []).map(item => ({ ...item, source: key }))), config.activitySort).slice(0, limit);
  for (const key of ['projects', ...eventKeys, 'talks', 'recognition', 'activityAwards', 'certificates', 'testimonials', 'experience', 'education']) result[key] = (eventKeys.includes(key) ? events.filter(item => item.source === key) : sortDisplayItems(model[key] || [], config.activitySort).slice(0, limit)).map(item => ({ ...item,
    ...(key === 'projects' ? { featured: item === model.featured } : {}),
    ...(!config.activityDescriptions ? { summary: '', body: '', description: '' } : {}),
    ...(!config.activityDates ? { year: '', date: '', period: '' } : {}),
  }));
  result.featured = result.projects.find(row => row.featured) || null;
  if (!config.activityDescriptions) result.experienceNote = '';
  return result;
}
