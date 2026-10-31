// Get plain text out of uploaded files.
import { htmlToText } from './chunker.js';

export const TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.xml', '.html', '.htm', '.tex', '.js', '.py', '.r', '.yaml', '.yml', '.log', '.bib']);
const MAX_CHARS = 2_000_000;

export const extOf = name => { const i = name.lastIndexOf('.'); return i < 0 ? '' : name.slice(i).toLowerCase(); };
export const isText = name => TEXT_EXT.has(extOf(name));

export async function extractText(name, buf) {
  const ext = extOf(name);
  try {
    let t;
    if (TEXT_EXT.has(ext)) {
      t = Buffer.from(buf).toString('utf-8');
      if (ext === '.html' || ext === '.htm') t = t.replace(/<(script|style)[\s\S]*?<\/\1>|<[^>]+>/gi, ' ');
    } else if (ext === '.pdf') {
      const { extractText: pdfText, getDocumentProxy } = await import('unpdf');   // loaded on demand: keeps every other request fast
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      t = (await pdfText(pdf, { mergePages: true })).text;
    } else if (ext === '.docx') {
      const mammoth = (await import('mammoth')).default;
      t = htmlToText((await mammoth.convertToHtml({ buffer: Buffer.from(buf) })).value);   // Heading styles become "# " lines
    } else return '';
    return t.slice(0, MAX_CHARS);
  } catch { return ''; }
}
