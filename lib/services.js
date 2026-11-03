import { createHash } from 'node:crypto';
import { cloudName, UpstreamError, UserError } from './config.js';

export function services(env, fetcher = fetch) {
  const lineToken = (env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
  async function call(service, url, options = {}, timeout = 12000) {
    const r = await fetcher(url, { ...options, signal: AbortSignal.timeout(timeout) });
    if (!r.ok) throw new UpstreamError(service, r.status);
    return r;
  }
  const redis = async (...command) => {
    const r = await call('Redis', env.UPSTASH_REDIS_REST_URL, { method: 'POST', headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
    const data = await r.json();
    if (data.error) throw new UpstreamError('Redis', 'command');
    return data.result;
  };
  const get = async key => { const value = await redis('GET', key); return value ? JSON.parse(value) : null; };
  const put = (key, value) => redis('SET', key, JSON.stringify(value));
  const github = async (path, options = {}) => {
    const r = await call('GitHub', `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}${path}`, {
      ...options, headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    });
    return r.status === 204 ? null : r.json();
  };
  const line = async (mode, data, retryKey) => {
    const r = await call(`LINE ${mode}`, `https://api.line.me/v2/bot/message/${mode}`, { method: 'POST', headers: { Authorization: `Bearer ${lineToken}`, 'Content-Type': 'application/json', ...(retryKey ? { 'X-Line-Retry-Key': retryKey } : {}) }, body: JSON.stringify(data) });
    return r.json();
  };
  async function upload(event, project) {
    if (!cloudName(env) || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) throw new UserError('ยังไม่ได้ตั้งค่า Cloudinary ใน Production: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET (รองรับ CLOUDINARY_CLOUNDNAME ด้วย)');
    if (!/^[\w-]+$/.test(event.message.id)) throw new UserError('รหัสภาพไม่ถูกต้อง');
    const r = await call('LINE image', `https://api-data.line.me/v2/bot/message/${event.message.id}/content`, { headers: { Authorization: `Bearer ${lineToken}` } });
    const bytes = await readLimited(r, 8 * 1024 * 1024);
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpg) throw new UserError('รับเฉพาะภาพ PNG หรือ JPEG ขนาดไม่เกิน 8 MB');
    const publicId = `line-studio/${project.owner}/${project.id}/${createHash('sha256').update(event.webhookEventId).digest('hex').slice(0, 20)}`;
    const result = await cloudCall('upload', { public_id: publicId, overwrite: 'false' }, new Blob([bytes], { type: png ? 'image/png' : 'image/jpeg' }));
    if (!validAssetUrl(result.secure_url, env)) throw new UserError('Cloudinary ส่ง URL ภาพที่ไม่รองรับ');
    return { id: `a${project.assets.length + 1}`, url: result.secure_url, role: project.assets.length ? 'player' : 'background', publicId, owned: true };
  }
  async function cloudCall(action, params, file) {
    const values = { ...params, timestamp: String(Math.floor(Date.now() / 1000)) };
    const signature = createHash('sha1').update(Object.keys(values).sort().map(key => `${key}=${values[key]}`).join('&') + env.CLOUDINARY_API_SECRET).digest('hex');
    const form = new FormData();
    for (const [key, value] of Object.entries(values)) form.set(key, value);
    form.set('api_key', env.CLOUDINARY_API_KEY); form.set('signature', signature);
    if (file) form.set('file', file, 'image');
    const r = await call('Cloudinary', `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName(env))}/image/${action}`, { method: 'POST', body: form }, 20000);
    return r.json();
  }
  const destroy = asset => cloudCall('destroy', { public_id: asset.publicId, invalidate: 'true' });
  return { redis, get, put, github, line, upload, destroy, call };
}

export function validAssetUrl(value, env) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' && !url.username && !url.password && !url.port && !url.search && !url.hash && url.pathname.startsWith(`/${cloudName(env)}/image/upload/`) && /\.(png|jpe?g)$/i.test(url.pathname);
  } catch { return false; }
}
export async function readLimited(response, limit) {
  if (Number(response.headers.get('content-length')) > limit) throw new UserError('ภาพใหญ่เกิน 8 MB');
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > limit) throw new UserError('ภาพใหญ่เกิน 8 MB');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}
