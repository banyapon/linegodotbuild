import { mentionCommand } from './mentions.js';
const messageButton = (label, text, primary = false) => ({ type: 'button', style: primary ? 'primary' : 'secondary', color: primary ? '#2C7754' : '#233D31', height: 'sm', action: { type: 'message', label, text: mentionCommand(text) } });
export function lineCard(text, env = {}, kind = 'result') {
  const content = String(text).slice(0, 4900), id = content.match(/\bp_[a-f0-9]{16}\b/)?.[0];
  const base = (env.PUBLIC_BASE_URL || 'https://linegodotbuild.vercel.app').replace(/\/$/, '');
  const links = content.match(/https:\/\/[^\s]+/g) || [];
  const play = links.find(link => { try { const url = new URL(link); return url.origin === new URL(base).origin && /^\/play\/[a-z0-9]+\/[a-z0-9_-]+$/.test(url.pathname); } catch { return false; } });
  const buttons = [];
  if (play) buttons.push({ type: 'button', style: 'primary', color: '#2C7754', height: 'sm', action: { type: 'uri', label: 'เล่นเกม ↗', uri: play } });
  if (play && env.GITHUB_OWNER && env.GITHUB_REPO) {
    const [, , owner, project] = new URL(play).pathname.split('/');
    buttons.push({ type: 'button', style: 'secondary', height: 'sm', action: { type: 'uri', label: 'ดูไฟล์เกม ↗', uri: `https://github.com/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/tree/${encodeURIComponent(`game/${owner}/${project}`)}` } });
  }
  if (id && !/ลบเกม .*แล้ว|ถูกลบแล้ว/.test(content)) {
    buttons.push(messageButton('แก้ไขต่อ', `open ${id}`));
    buttons.push(messageButton('พอแล้ว · เผยแพร่', `publish ${id}`, !play));
    buttons.push(messageButton('ลบเกมนี้', `x-delete "${id}"`));
  } else if (kind !== 'progress') {
    buttons.push(messageButton('สร้างเกมใหม่', 'new game', true), messageButton('เกมของฉัน', 'projects'));
  } else buttons.push(messageButton('ดูสถานะ', 'status'));
  const chunks = content.match(/[\s\S]{1,1400}/g) || [''];
  const bubbles = chunks.slice(0, 4).map((chunk, index) => ({ type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', backgroundColor: '#17372A', paddingAll: '16px', contents: [{ type: 'text', text: kind === 'error' ? 'ตรวจพบปัญหา' : kind === 'progress' ? 'กำลังจัดการเกมของคุณ' : 'LINE GAME STUDIO', color: '#C2F4D1', size: 'sm', weight: 'bold' }, { type: 'text', text: 'ใช้ @gamecreator นำหน้าทุกคำสั่ง', size: 'xs', color: '#B1C9BA', wrap: true, margin: 'sm' }] },
    body: { type: 'box', layout: 'vertical', backgroundColor: '#10241C', paddingAll: '18px', contents: [{ type: 'text', text: chunk, color: '#EBF4E7', size: 'sm', wrap: true }] },
    ...(index === 0 ? { footer: { type: 'box', layout: 'vertical', backgroundColor: '#10241C', spacing: 'sm', paddingAll: '14px', contents: buttons } } : {}),
  }));
  return [{ type: 'flex', altText: content.slice(0, 400), contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles } }];
}
