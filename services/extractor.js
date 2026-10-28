const fs = require('fs');
const path = require('path');
const TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.xml', '.html', '.htm', '.tex', '.js', '.py', '.r', '.yaml', '.yml', '.log', '.bib']);
const MAX = 2 * 1024 * 1024;

exports.isText = name => TEXT_EXT.has(path.extname(name).toLowerCase());

exports.extractText = (filePath, name) => {
  if (!exports.isText(name)) return ''; // PDF/DOCX: add a parser here later (pdf-parse, mammoth)
  let text = fs.readFileSync(filePath, 'utf8').slice(0, MAX);
  if (/\.html?$/i.test(name)) text = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ');
  return text;
};
