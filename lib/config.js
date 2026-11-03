export const CORE_KEYS = ['LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN', 'LINE_ALLOWED_USER_IDS', 'GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
export function cloudName(env) { return env.CLOUDINARY_CLOUD_NAME || env.CLOUDINARY_CLOUNDNAME || ''; }
export function readiness(env) {
  const missing = CORE_KEYS.filter(key => !env[key]);
  const imageMissing = ['CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].filter(key => !env[key]);
  if (!cloudName(env)) imageMissing.push('CLOUDINARY_CLOUD_NAME (or CLOUDINARY_CLOUNDNAME)');
  return { ok: true, service: 'line-game-studio', configured: !missing.length, missing,
    capabilities: { images: { ready: !imageMissing.length, missing: imageMissing }, gemini: { ready: Boolean(env.GEMINI_API_KEY), missing: env.GEMINI_API_KEY ? [] : ['GEMINI_API_KEY'] } } };
}
export class UserError extends Error {}
export class UpstreamError extends Error {
  constructor(service, status) { super(`${service} HTTP ${status}`); this.service = service; this.status = status; }
}
