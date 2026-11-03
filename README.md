# LINE × Godot build on Vercel

LINE → Vercel Functions (Node.js 24) → GitHub Actions → Godot export → LINE notification.

Repository: https://github.com/banyapon/linegodotbuild

## Current scope

Backend supports `build web`, `build windows`, `status`, `logs`. GitHub Actions exports a **Godot 4 stable / GDScript** game and uploads a ZIP artifact, then pushes the result and Actions URL to LINE. Web output is downloadable; publishing a playable game URL is a separate hosting step, not yet configured. C# and prerelease Godot versions require adapting the workflow.

The repository starts without a game. Add your actual project under `game/` (or set `GODOT_PROJECT_PATH`). Commit `project.godot` and `export_presets.cfg` with presets named exactly `Web` and `Windows`. Do not commit `.godot/`, export credentials, or secrets.

## Vercel configuration

Deploy repository with Framework Preset **Other**, root directory `.`, no build command, Node.js **24.x**. Static page is in `public/`; webhook is `/api/webhook`, health check is `/api/health`. Use the production HTTPS URL in LINE Developers. Ensure Deployment Protection allows LINE to reach that production webhook without login.

In Vercel → Project → Settings → Environment Variables, configure for Production:

| Variable | Value |
| --- | --- |
| `LINE_CHANNEL_SECRET` | LINE Messaging API channel secret |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE channel access token |
| `LINE_ALLOWED_USER_IDS` | Comma-separated permitted LINE user IDs |
| `GITHUB_TOKEN` | Fine-grained PAT restricted to `banyapon/linegodotbuild`, Actions read/write |
| `GITHUB_OWNER` | `banyapon` |
| `GITHUB_REPO` | `linegodotbuild` |
| `GITHUB_REF` | `main` (trusted branch only) |
| `GITHUB_WORKFLOW` | `godot-build.yml` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis HTTPS REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST write token |

Create/connect an Upstash Redis database using Vercel Marketplace or Upstash console. This is required for durable duplicate suppression. Store credentials directly in settings; never paste tokens into chat or commit them. Redeploy after configuring variables. `/api/health` reports `configured: true` when required variable names are present; it does not test credential validity.

## GitHub configuration

Settings → Secrets and variables → Actions:

- Variables: `GODOT_VERSION` = exact version used by your game, e.g. `4.5.1` (example only, choose your actual version). Optional `GODOT_PROJECT_PATH` defaults to `game`.
- Secrets: `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_ALLOWED_USER_IDS` (same values as backend).
- Keep `main` trusted: workflows execute the game project. Upload `.github/workflows/godot-build.yml` to the default branch before dispatching.

The build job has no LINE token. A separate notification job sends only to allowlisted recipients. Artifact downloads require GitHub login and expire after 14 days.

## LINE configuration

LINE Developers → Messaging API → Webhook URL: `https://YOUR-PRODUCTION-DOMAIN/api/webhook`. Click Verify, enable Use webhook, and disable the OA's automatic reply if it conflicts with bot replies. Commands are accepted only in direct user chats from the allowlist.

## Local verification

```powershell
npm test
Copy-Item .env.example .env.local
# Fill .env.local privately
npm run dev
```

Raw bytes are verified with HMAC-SHA256 before parsing JSON. Redis claims each event ID for seven days. Claims remain when GitHub times out or LINE reply fails: check Actions before issuing a new command, because dispatch outcomes can be ambiguous. This prioritizes avoiding duplicate builds and is not an exactly-once delivery guarantee. Notification failures appear in the `notify` job.

Docs: [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js), [LINE webhooks](https://developers.line.biz/en/docs/messaging-api/receiving-messages/), [GitHub workflow API](https://docs.github.com/en/rest/actions/workflows), [Godot exports](https://docs.godotengine.org/en/stable/tutorials/export/exporting_projects.html).
