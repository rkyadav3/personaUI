// Shared admin behaviour (kept small on purpose).
document.querySelectorAll('input[type=search]').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Escape') i.value = ''; }));
