// Stage 1: split a document into retrieval-sized chunks that keep their section heading.
const words = s => s.split(/\s+/).filter(Boolean);

export function htmlToText(html) {
  let h = String(html ?? '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');
  h = h.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, l, t) => `\n\n${'#'.repeat(+l)} ${t.replace(/<[^>]+>/g, '')}\n\n`);
  h = h.replace(/<\/(p|div|li|tr|blockquote|pre)>|<br\s*\/?>/gi, '\n\n');
  h = h.replace(/<[^>]+>/g, ' ');
  for (const [a, b] of [['&nbsp;', ' '], ['&lt;', '<'], ['&gt;', '>'], ['&quot;', '"'], ['&amp;', '&']]) h = h.split(a).join(b);
  h = h.replace(/[ \t]+/g, ' ');
  return h.replace(/\n{3,}/g, '\n\n').trim();
}

function splitLong(block, target) {
  const out = [];
  for (const part of block.split(/(?<=[.!?])\s+|\n/).filter(Boolean)) {
    const w = words(part);
    if (w.length <= target * 1.5) out.push(part);
    else for (let i = 0; i < w.length; i += target) out.push(w.slice(i, i + target).join(' '));
  }
  return out;
}

/** target = words per chunk; overlap = words repeated at the start of the next chunk. */
export function chunk(text, target = 180, overlap = 30) {
  const chunks = [];
  let heading = '', curHeading = '', cur = [], curWords = 0;

  const emit = keepTail => {
    if (!cur.length) return;
    const body = cur.join('\n').trim();
    if (words(body).length >= 5) chunks.push({ heading: curHeading, text: body });
    const tail = keepTail ? words(body).slice(-overlap).join(' ') : '';
    cur = tail ? [tail] : [];
    curWords = words(tail).length;
    curHeading = heading;
  };

  for (const raw of text.split(/\n{2,}/)) {
    const block = raw.trim();
    if (!block) continue;
    const m = block.match(/^#{1,6}\s+(.+)$/);
    if (m && !block.includes('\n')) {          // a heading starts a new section
      emit(false);
      heading = curHeading = m[1].trim();
      continue;
    }
    const pieces = words(block).length > target * 1.5 ? splitLong(block, target) : [block];
    for (const piece of pieces) {
      const w = words(piece).length;
      if (curWords + w > target && curWords > 0) emit(true);
      cur.push(piece);
      curWords += w;
    }
  }
  emit(false);
  return chunks;
}
