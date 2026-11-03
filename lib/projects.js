import { createHash, randomBytes } from 'node:crypto';
import { template, design, wantsTicTacToe } from './designer.js';
import { sanitizeDesign } from './designer.js';
import { UserError } from './config.js';
import { validAssetUrl } from './services.js';
import { generateSource, spaceSource, sourceDocument } from './game-source.js';

export const ownerId = userId => createHash('sha256').update(userId).digest('hex').slice(0, 20);
const key = id => `studio:project:${id}`;
const validId = id => /^p_[a-f0-9]{16}$/.test(id);
export function command(text) {
  const value = text.trim();
  const publishId = value.match(/^(?:publish|พอแล้ว)\s+(p_[a-f0-9]{16})$/i);
  if (publishId) return { type: 'publish', id: publishId[1] };
  const build = value.match(/^(?:build\s+web|publish|สร้างเกม)\s+(.+)$/is);
  if (build) return { type: 'generate', text: build[1].slice(0, 4000) };
  const deletion = value.match(/^x-delete\s+["“]?([\w-]+)["”]?$/i);
  if (deletion) return { type: 'delete', id: deletion[1] };
  if (/^x-delete\b/i.test(value)) return { type: 'help', text: 'รูปแบบคำสั่ง: x-delete "project_id"' };
  const use = value.match(/^(?:open|เปิด)\s+([\w-]+)$/i);
  if (use) return { type: 'open', id: use[1] };
  const fresh = value.match(/^(?:new|สร้างเกมใหม่|เกมใหม่)(?:\s+(2d|3d|vn|visual novel|ttt|xo|game|space|collector))?$/i);
  if (fresh) { const kind = (fresh[1] || 'game').toLowerCase(); return { type: 'new', genre: kind === '3d' ? '3d' : /^(vn|visual novel)$/.test(kind) ? 'vn' : '2d', mode: /^(ttt|xo)$/.test(kind) ? 'tictactoe' : /^(collector|vn|visual novel)$/.test(kind) ? 'collector' : 'custom', space: kind === 'space' }; }
  if (/^(พอแล้ว|เสร็จแล้ว|publish|build|build web)$/i.test(value)) return { type: 'publish' };
  if (/^(status|สถานะ|logs)$/i.test(value)) return { type: 'status' };
  if (/^(projects|โปรเจกต์|เกมของฉัน)$/i.test(value)) return { type: 'list' };
  if (/^(help|ช่วยเหลือ|เริ่มต้น)$/i.test(value)) return { type: 'help' };
  const role = value.match(/^(?:asset|ภาพ)\s+(a\d+|ล่าสุด)\s+(background|player|coin|enemy|character|ฉาก|ตัวละคร|เหรียญ|ศัตรู)$/i);
  if (role) return { type: 'asset', id: role[1].toLowerCase(), role: ({ ฉาก: 'background', ตัวละคร: 'player', เหรียญ: 'coin', ศัตรู: 'enemy' })[role[2]] || role[2].toLowerCase() };
  if (/^https:\/\//i.test(value)) return { type: 'url', url: value };
  return { type: 'design', text: value.slice(0, 4000) };
}
export const HELP = 'LINE Game Studio · 9:16 + Virtual Joystick\nแชตส่วนตัวสั่งได้เลย · ในกลุ่มต้องมี @gamecreator\nnew game — สร้างเกมอิสระ\nnew space — เกมยานอวกาศ\nnew ttt / new vn / new 3d\nbuild web สร้างเกมยานอวกาศยิงเอเลี่ยน\nแชตส่วนตัวส่ง PNG/JPEG ได้เลย\nในกลุ่มพิมพ์ @gamecreator upload แล้วส่งภาพ 1 ภาพใน 2 นาที\nภาพ ล่าสุด ฉาก\nพอแล้ว — เผยแพร่\nprojects / open project_id / status\nx-delete "project_id"';

export function projectManager(env, svc) {
  const base = (env.PUBLIC_BASE_URL || 'https://linegodotbuild.vercel.app').replace(/\/$/, '');
  const url = project => `${base}/play/${project.owner}/${project.id}`;
  async function owned(id, owner) {
    if (!validId(id)) throw new UserError('project_id ไม่ถูกต้อง');
    const project = await svc.get(key(id));
    if (!project || project.owner !== owner) throw new UserError('ไม่พบโปรเจกต์นี้ในบัญชีของคุณ');
    return project;
  }
  async function persist(project) {
    project.updatedAt = new Date().toISOString();
    project.design = sanitizeDesign(project.design, project.design, project.assets);
    await svc.put(key(project.id), project); // Do not lose uploaded assets if GitHub is unavailable.
    try {
      if (!project.branchCreated) {
        const head = await svc.github(`/git/ref/heads/${encodeURIComponent(env.GITHUB_REF || 'main')}`);
        try { await svc.github('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${project.branch}`, sha: head.object.sha }) }); }
        catch (e) { if (e.status !== 422) throw e; await svc.github(`/git/ref/heads/${encodeURIComponent(project.branch)}`); }
        project.branchCreated = true;
      }
      const snapshot = { version: 2, id: project.id, owner: project.owner, status: project.status, updatedAt: project.updatedAt, design: project.design,
        files: project.source ? ['index.html', 'index.js'] : [], conversation: project.history, assets: project.assets.map(({ id, url, role }) => ({ id, url, role })) };
      const branchPath = encodeURIComponent(project.branch);
      const head = await svc.github(`/git/ref/heads/${branchPath}`);
      const parent = await svc.github(`/git/commits/${head.object.sha}`);
      const entries = [{ path: 'studio/project.json', mode: '100644', type: 'blob', content: JSON.stringify(snapshot, null, 2) }];
      if (project.source) entries.push({ path: 'index.html', mode: '100644', type: 'blob', content: sourceDocument(project.source, './index.js', base) }, { path: 'index.js', mode: '100644', type: 'blob', content: project.source.js });
      const tree = await svc.github('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: parent.tree.sha, tree: entries }) });
      const commit = await svc.github('/git/commits', { method: 'POST', body: JSON.stringify({ message: `Save game ${project.id}`, tree: tree.sha, parents: [head.object.sha] }) });
      await svc.github(`/git/refs/heads/${branchPath}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
      await svc.put(key(project.id), project);
    } catch (e) {
      if (e.service === 'GitHub' && [403, 404].includes(e.status)) throw new UserError('บันทึกฉบับร่างใน Redis แล้ว แต่เขียน branch ไม่ได้: ตั้ง GITHUB_TOKEN ให้มี Contents: Read and write ของ repo นี้ แล้วส่งคำสั่งอีกครั้ง');
      throw e;
    }
  }
  async function create(owner, genre, mode = 'collector') {
    if (Number(await svc.redis('SCARD', `studio:projects:${owner}`)) >= 30) throw new UserError('มีได้สูงสุด 30 โปรเจกต์ กรุณาลบเกมที่ไม่ใช้ก่อน');
    const id = `p_${randomBytes(8).toString('hex')}`;
    const project = { id, owner, branch: `game/${owner}/${id}`, status: 'draft', assets: [], history: [], design: template(genre, mode), published: null, createdAt: new Date().toISOString() };
    if (mode === 'custom') { project.source = spaceSource(); project.design.title = 'Starward Patrol'; project.design.description = 'เกมหน้าเดียว 9:16 · ลากจอยหลบและยิงยานศัตรู'; }
    await svc.redis('SADD', `studio:projects:${owner}`, id);
    await svc.put(`studio:active:${owner}`, id);
    await persist(project);
    return project;
  }
  async function current(owner) {
    const id = await svc.get(`studio:active:${owner}`);
    return id ? owned(id, owner) : null;
  }
  async function publish(project) {
    project.status = 'published';
    await persist(project);
    project.published = structuredClone(project.design);
    project.publishedSource = project.design.mode === 'custom' && project.source ? structuredClone(project.source) : null;
    await svc.put(key(project.id), project);
    return `เกมพร้อมเล่นแล้ว ✅\n${project.design.title}\n${url(project)}\nproject_id: ${project.id}\nแก้เพิ่มโดยส่งรายละเอียด แล้วพิมพ์ “พอแล้ว” อีกครั้ง\nลบด้วย x-delete "${project.id}"`;
  }
  async function remove(project) {
    project.status = 'deleting'; project.published = null; project.publishedSource = null;
    await svc.put(key(project.id), project); // Revoke the public route BEFORE external cleanup.
    for (const asset of project.assets) {
      if (asset.owned && !asset.removed) {
        const result = await svc.destroy(asset);
        if (!['ok', 'not found'].includes(result.result)) throw new UserError('ปิดลิงก์แล้ว แต่ลบภาพ Cloudinary ยังไม่สำเร็จ ส่งคำสั่งลบเดิมอีกครั้งเพื่อทำต่อ');
        asset.removed = true; await svc.put(key(project.id), project);
      }
    }
    if (project.branchCreated) {
      try { await svc.github(`/git/refs/heads/${encodeURIComponent(project.branch)}`, { method: 'DELETE' }); }
      catch (e) { if (e.status !== 404) throw e; }
    }
    await svc.redis('SREM', `studio:projects:${project.owner}`, project.id);
    if (await svc.get(`studio:active:${project.owner}`) === project.id) await svc.redis('DEL', `studio:active:${project.owner}`);
    await svc.put(key(project.id), { id: project.id, owner: project.owner, status: 'deleted', deletedAt: new Date().toISOString() });
    return `ลบเกม ${project.id} แล้ว ลิงก์เล่นถูกปิดและลบ branch/ภาพที่เกมนี้อัปโหลดแล้ว\nประวัติ Git และสำเนาที่ดาวน์โหลดไปอาจยังคงอยู่`;
  }
  async function process(event) {
    const owner = ownerId(event.source.userId);
    if (event.message.type === 'image') {
      let project = await current(owner);
      if (!project) project = await create(owner, '2d', 'custom');
      if (['deleting', 'deleted'].includes(project.status)) throw new UserError('โปรเจกต์กำลังลบ กรุณาทำการลบให้เสร็จก่อน');
      if (project.assets.length >= 20) throw new UserError('รองรับสูงสุด 20 ภาพต่อโปรเจกต์');
      const asset = await svc.upload(event, project);
      project.assets.push(asset); project.status = 'draft';
      project.history.push({ role: 'user', text: `เพิ่มภาพ ${asset.id} (${asset.role})` });
      await persist(project);
      return `คัดลอกภาพเข้า Cloudinary แล้ว: ${asset.id}\n${asset.url}\nบทบาทตอนนี้: ${asset.role}\nเปลี่ยนด้วย “ภาพ ${asset.id} ฉาก” หรือ “ภาพ ${asset.id} ตัวละคร”\nอยากทำอะไรต่อ หรือพิมพ์ “พอแล้ว” เพื่อเผยแพร่เกม?`;
    }
    const action = command(event.message.text);
    if (action.type === 'help') return action.text || HELP;
    if (action.type === 'list') {
      const ids = await svc.redis('SMEMBERS', `studio:projects:${owner}`);
      if (!ids.length) return 'ยังไม่มีเกม พิมพ์ new 2d เพื่อเริ่มสร้าง';
      const items = [];
      for (const id of ids) { const p = await owned(id, owner); items.push(`${p.id} — ${p.design?.title || p.status} (${p.status})${p.published ? `\n${url(p)}` : ''}`); }
      return items.join('\n\n').slice(0, 4500);
    }
    if (action.type === 'delete') {
      const project = await owned(action.id, owner);
      return project.status === 'deleted' ? `เกม ${project.id} ถูกลบแล้ว` : remove(project);
    }
    if (action.type === 'open') {
      const project = await owned(action.id, owner);
      if (['deleting', 'deleted'].includes(project.status)) throw new UserError('โปรเจกต์นี้ถูกปิดแล้ว');
      await svc.put(`studio:active:${owner}`, project.id);
      return `เปิดโปรเจกต์ ${project.id}: ${project.design.title}\nอยากแก้อะไรต่อ หรือพิมพ์ “พอแล้ว”?`;
    }
    if (action.type === 'new') {
      const p = await create(owner, action.genre, action.mode);
      return `สร้างโปรเจกต์ ${p.id} (${p.design.genre}) แล้ว\nอยากได้ธีมหรือเรื่องราวแบบไหน? แชตส่วนตัวพิมพ์ได้เลย ในกลุ่มให้เรียก @gamecreator\nแชตส่วนตัวส่ง PNG/JPEG ได้เลย; ในกลุ่มพิมพ์ @gamecreator upload ก่อน\nพิมพ์ “พอแล้ว” เมื่อต้องการลิงก์เล่น (ในกลุ่มใช้ @gamecreator พอแล้ว)`;
    }
    let project = action.type === 'publish' && action.id ? await owned(action.id, owner) : await current(owner);
    if (!project && action.type === 'status') return 'ยังไม่มีเกม พิมพ์ new 2d เพื่อเริ่มสร้าง';
    if (!project) project = await create(owner, '2d', action.text && wantsTicTacToe(action.text) ? 'tictactoe' : 'custom');
    if (['deleting', 'deleted'].includes(project.status)) throw new UserError('โปรเจกต์กำลังลบ กรุณาส่ง x-delete คำสั่งเดิมเพื่อทำต่อ');
    if (action.type === 'status') return `${project.id}: ${project.design.title}\nสถานะ: ${project.status}\nภาพ: ${project.assets.length}\n${project.published ? url(project) : 'พิมพ์ “พอแล้ว” เพื่อเผยแพร่'}\nBranch: ${project.branch}`;
    if (action.type === 'publish') {
      return publish(project);
    }
    if (action.type === 'asset') {
      const asset = action.id === 'ล่าสุด' ? project.assets.at(-1) : project.assets.find(a => a.id === action.id);
      if (!asset) throw new UserError('ไม่พบภาพ ส่งภาพเข้ามาก่อนครับ');
      asset.role = action.role;
    } else if (action.type === 'url') {
      if (!validAssetUrl(action.url, env)) throw new UserError('ส่ง URL PNG/JPEG ของ Cloudinary cloud เดียวกับระบบ หรือส่งรูปเข้า LINE เพื่อคัดลอกไฟล์ให้ครับ');
      if (project.assets.length >= 20) throw new UserError('รองรับสูงสุด 20 ภาพต่อโปรเจกต์');
      project.assets.push({ id: `a${project.assets.length + 1}`, url: action.url, role: project.assets.length ? 'player' : 'background', owned: false });
    } else {
      let result;
      try {
        const custom = !wantsTicTacToe(action.text) && project.design.genre !== 'vn' && (action.type === 'generate' || project.design.mode === 'custom');
        result = custom ? await generateSource(project, action.text, env, svc) : await design(project, action.text, env, svc);
      }
      catch (e) {
        if (action.type !== 'generate' || !wantsTicTacToe(action.text) || (e.service !== 'Gemini' && !(e instanceof UserError))) throw e;
        result = await design(project, action.text, { ...env, GEMINI_API_KEY: '' }, svc);
        result.reply = 'สร้างจากต้นแบบ Monster Tic Tac Toe แล้ว (Gemini ยังปรับรายละเอียดไม่สำเร็จ)';
      }
      project.design = result.design;
      if (result.source) project.source = result.source;
      project.history.push({ role: 'user', text: action.text }, { role: 'assistant', text: result.reply });
      project.history = project.history.slice(-40); project.status = 'draft';
      if (action.type === 'generate') return `${result.reply}\n\n${await publish(project)}`;
      await persist(project);
      return `${result.reply}\n\nอยากทำอะไรต่อ หรือพิมพ์ “พอแล้ว” เพื่อเผยแพร่?`;
    }
    project.status = 'draft';
    await persist(project);
    return 'บันทึกภาพและบทบาทลง branch แล้ว อยากทำอะไรต่อ หรือพิมพ์ “พอแล้ว” เพื่อเผยแพร่?';
  }
  async function publicGame(owner, id) {
    if (!/^[a-f0-9]{20}$/.test(owner) || !validId(id)) return null;
    const p = await svc.get(key(id));
    if (!p || p.owner !== owner || !p.published || ['deleting', 'deleted'].includes(p.status)) return null;
    return { ...p.published, id: p.id };
  }
  async function publicSource(owner, id) {
    if (!/^[a-f0-9]{20}$/.test(owner) || !validId(id)) return null;
    const p = await svc.get(key(id));
    if (!p || p.owner !== owner || !p.publishedSource || ['deleting', 'deleted'].includes(p.status)) return null;
    return p.publishedSource;
  }
  return { process, publicGame, publicSource };
}
