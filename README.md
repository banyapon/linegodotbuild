# LINE Game Studio

Create and revise browser games from LINE. TypeScript + Phaser for 2D, Three.js for a 3D arcade arena, and a DOM visual novel player. Godot is no longer used.

Live: https://linegodotbuild.vercel.app

## Try it

- [2D coin collector](https://linegodotbuild.vercel.app/play/demo/2d)
- [3D arcade arena](https://linegodotbuild.vercel.app/play/demo/3d)
- [Visual Novel](https://linegodotbuild.vercel.app/play/demo/vn)

These demos do not need any external credentials. Use arrows/WASD or touch controls, collect every star, avoid moving enemies, and finish before the deadline. P pauses. Visual novels provide branching choices and save the current scene locally in the browser.

## LINE commands

| Message | Result |
| --- | --- |
| `new 2d` | New 2D project (default) |
| `new vn` / `new 3d` | Visual Novel / Three.js project |
| Send PNG/JPEG image | Copy actual LINE image bytes into signed Cloudinary upload |
| `ภาพ ล่าสุด ฉาก` | Use latest image as background |
| `ภาพ a2 ตัวละคร` | Assign asset a2 as player; also used as VN character fallback |
| `asset a3 coin` / `asset a4 enemy` | Assign collectible / hazard |
| A Cloudinary PNG/JPEG URL | Reference an existing asset in the configured cloud (not copied or deleted) |
| Free text | Ask Gemini to revise game design and ask a follow-up question |
| `พอแล้ว` / `publish` / `build` | Save branch snapshot and publish a playable URL |
| `projects` / `status` | List own projects / inspect active project |
| `open project_id` | Resume an existing own project |
| `x-delete "project_id"` | Revoke URL, delete game branch and game-owned Cloudinary assets |

The first image defaults to background; later images default to player. Assign roles explicitly to control usage. Up to 20 PNG/JPEG images, 8 MB each, and 30 projects per user. Commands are limited to 20/minute/user and accepted only from allowlisted direct LINE chats. A first ordinary message or image starts a 2D draft automatically.

## Design and persistence

Each project gets a random `p_...` ID, a hashed user namespace, branch `game/<namespace>/<project_id>`, and URL `/play/<namespace>/<project_id>`. These namespaces are identifiers, not authentication. Only the signed, allowlisted LINE owner can edit or delete their projects. Public game links are shareable.

Drafts, published snapshots and per-user active projects are stored in Redis. Each successful design/image change also commits `studio/project.json` on the project branch, including the latest 40 conversation entries and asset references. Raw LINE User IDs and reply tokens are not committed. Redis must remain available and persistent; branches do not automatically restore a lost Redis registry. Configure backups in the Redis provider.

Editing a published game leaves its last published snapshot playable until `พอแล้ว` publishes again. Generic, prebuilt TypeScript players render the JSON design, so each game does not need a separate Vercel deployment. `game/**` branches do not trigger automatic Vercel builds.

Gemini receives the current design, recent conversation and up to three most recent image previews from Cloudinary. Its structured JSON is validated; it cannot execute code or invent asset URLs. Supported changes are title/story, palette, difficulty counts/speed/time, asset roles, and VN scene choices. It does **not** implement arbitrary new mechanics, generate images, or generate runnable TypeScript. Without `GEMINI_API_KEY`, the bot clearly labels template mode and supports `ชื่อ ...`, `เหรียญ 12`, `ศัตรู 4`, `เวลา 90` plus genre changes (`2d`, `3d`, `vn`).

## Environment variables

Set secrets directly in Vercel → Project → Settings → Environment Variables → Production, then redeploy. Never paste secrets into chat or source control.

| Name | Purpose |
| --- | --- |
| `LINE_CHANNEL_SECRET` | Verify webhook signature |
| `LINE_CHANNEL_ACCESS_TOKEN` | Get image content; reply and push results |
| `LINE_ALLOWED_USER_IDS` | Comma-separated allowed LINE User IDs |
| `GITHUB_TOKEN` | Fine-grained PAT for this repository with **Contents: Read and write** (the old Actions-only token is insufficient) |
| `GITHUB_OWNER` | `banyapon` |
| `GITHUB_REPO` | `linegodotbuild` |
| `GITHUB_REF` | Trusted base branch, defaults to `main` |
| `UPSTASH_REDIS_REST_URL` | Redis HTTPS REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Read/write REST token |
| `CLOUDINARY_CLOUD_NAME` | Cloud name; legacy spelling `CLOUDINARY_CLOUNDNAME` is also accepted |
| `CLOUDINARY_API_KEY` | Server-side Cloudinary key |
| `CLOUDINARY_API_SECRET` | Server-side signature secret |
| `GEMINI_API_KEY` | Gemini API key; optional template mode without it |
| `GEMINI_MODEL` | Configurable structured-output model; defaults to `gemini-3.5-flash-lite` |
| `PUBLIC_BASE_URL` | Defaults to `https://linegodotbuild.vercel.app` |

`GET /api/health` reports missing **names only**, with separate image/Gemini readiness. Presence checks do not validate credentials. `GITHUB_WORKFLOW` is obsolete. GitHub Actions now validates web code; no Godot workflow or notification secrets in Actions are needed.

Vercel: Other framework, Node 24, `npm run build`, output `public`, region Singapore. Production must allow unauthenticated LINE requests; webhook authentication uses LINE's HMAC. LINE webhook: `https://linegodotbuild.vercel.app/api/webhook`. Enable webhook and Verify in LINE Developers.

## Deletion, privacy and operational limits

Deletion checks ownership and immediately revokes the game JSON route before external cleanup. If cleanup fails, send the same `x-delete` command again. Only images uploaded by this project are destroyed; URL-only references are not destroyed. Cloudinary CDN invalidation is not instantaneous. Git history, forks, browser-loaded pages and downloaded copies may retain data; branch deletion is not a secure history purge.

This repository is public: project branch content, conversation snapshots and asset URLs can be visible on GitHub. Do not send confidential information; use a private repository before accepting private user content. Public game data exposes only the published design, not conversations, tokens, Cloudinary public IDs, or raw LINE IDs.

Webhook events are deduplicated for seven days and serialized per user with an expiring lock. Vercel `waitUntil` returns webhook acknowledgment early and continues processing; it is **not a durable job queue**. If a function terminates, a response may not arrive; inspect `status` and resend the instruction as a new message. Reply/push APIs consume LINE quota. External failures do not guarantee exactly-once operations. Monitor Vercel runtime logs and provider billing/quotas.

## Development and verification

```powershell
npm ci
npm test
npm run typecheck
npm run build
Copy-Item .env.example .env.local
npm run dev
```

```powershell
npx playwright install chromium
npm run test:e2e
```

Browser tests launch a local server, exercise the 2D objective/pause/restart, VN choices, 3D boot, mobile touch controls, and capture screenshots in ignored `artifacts/`. `BASE_URL` can target a deployed site. Policy sources [PRIVACY.md](PRIVACY.md) and [TERMS.md](TERMS.md) generate static `/privacy` and `/terms` during build.
