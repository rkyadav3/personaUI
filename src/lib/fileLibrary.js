export function libraryFileType(name = '') {
  if (/\.(pdf|docx?|pptx?|xlsx?)$/i.test(name)) return 'documents';
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(name)) return 'images';
  if (/\.(txt|md|markdown|csv|tsv|json|xml|html?|tex|js|py|r|yaml|yml|log|bib)$/i.test(name)) return 'text';
  return 'other';
}

export function filterLibraryFiles(files = [], { status = 'all', type = 'all', sort = 'newest' } = {}) {
  return files.filter(file => (status === 'all' || file.status === status) && (type === 'all' || libraryFileType(file.name) === type)).sort((a, b) => {
    if (sort === 'name') return (a.name || '').localeCompare(b.name || '') || Number(a.id) - Number(b.id);
    if (sort === 'largest') return (b.size || 0) - (a.size || 0) || (a.name || '').localeCompare(b.name || '');
    return (Date.parse(b.updated_at || b.created_at) || 0) - (Date.parse(a.updated_at || a.created_at) || 0) || Number(b.id) - Number(a.id);
  });
}
