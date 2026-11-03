import { readFile, mkdir, writeFile } from 'node:fs/promises';

const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = text => escape(text).replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+|\/[a-z]+)\)/g, '<a href="$2">$1</a>');

// The two policy sources use headings, paragraphs, lists and links only.
function render(markdown) {
  return markdown.trim().split(/\r?\n\s*\r?\n/).map(block => {
    const heading = block.match(/^(#{1,2}) (.+)$/);
    if (heading) return `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`;
    if (block.startsWith('- ')) return `<ul>${block.split(/\r?\n/).map(line => `<li>${inline(line.replace(/^- /, ''))}</li>`).join('')}</ul>`;
    return `<p>${inline(block.replace(/\r?\n/g, ' '))}</p>`;
  }).join('\n');
}

for (const [slug, file, title] of [['privacy', 'PRIVACY.md', 'นโยบายความเป็นส่วนตัว'], ['terms', 'TERMS.md', 'ข้อกำหนดการใช้บริการ']]) {
  const content = render(await readFile(file, 'utf8'));
  await mkdir(`public/${slug}`, { recursive: true });
  await writeFile(`public/${slug}/index.html`, `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} | LINE × Godot Build</title><meta name="description" content="${title}ของบริการ LINE × Godot Build">
<link rel="stylesheet" href="/legal.css"></head><body>
<header><a class="brand" href="/">LINE × Godot Build</a><nav aria-label="เมนูเอกสาร"><a href="/privacy"${slug === 'privacy' ? ' aria-current="page"' : ''}>ความเป็นส่วนตัว</a><a href="/terms"${slug === 'terms' ? ' aria-current="page"' : ''}>ข้อกำหนด</a></nav></header>
<main>${content}</main><footer><a href="/">กลับหน้าแรก</a><a href="https://github.com/banyapon/linegodotbuild/blob/main/${file}">อ่านต้นฉบับ Markdown บน GitHub</a></footer>
</body></html>\n`);
  console.log(`Generated /${slug} from ${file}`);
}
