# Deployment: Vercel (client) + Render (server) + MongoDB Atlas

| Part | Where | Folder in the repo |
|---|---|---|
| React app (Vite) | Vercel | `client/` |
| Express + Socket.IO API | Render, Web Service | `server/` |
| Database | MongoDB Atlas | n/a |

> **Run exactly one server instance.** Live game state (rooms, timers) is kept in the server's memory.
> Don't scale Render beyond one instance, and expect any game in progress to end when the server restarts or redeploys.
> Render's free tier also sleeps when idle (see Troubleshooting).

## 0. Put the project in its own Git repository

`lasthope/` must be a GitHub repo of its own (don't push it inside another project's repo).

```bash
cd lasthope
git init
git add .
git status          # check that NO .env file is listed (only .env.example files)
git commit -m "Initial commit"
# create an empty repo on GitHub, then:
git remote add origin https://github.com/<you>/<repo>.git
git branch -M main
git push -u origin main
```

If `git status` ever shows a real `.env`, stop and don't commit. Real secrets must never be in Git.

## 1. MongoDB Atlas

1. **Database Access:** create a database user with a strong password and the *Read and write to any database* role (or `readWrite` on your database only).
2. **Network Access:** add IP address `0.0.0.0/0` ("allow access from anywhere"). Render's free tier has no fixed outbound IP, so this is required. The database user and password are what protect it.
3. **Connection string:** Atlas → Connect → Drivers. It must include your database name before the `?`:
   ```
   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/live-quiz?retryWrites=true&w=majority
   ```
   If the password has special characters (`@ : / ? # %`), URL-encode them.
4. Tip: use a separate database name for production (for example `live-quiz-prod`) so local testing doesn't touch live data.

## 2. Render: backend (deploy this first)

New → **Web Service** → connect your GitHub repo.

| Setting | Value |
|---|---|
| Root Directory | `server` |
| Runtime / Language | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Health Check Path | `/health` |
| Instances | 1 (do not scale out) |

Environment variables (Environment tab). **Do not set `PORT`**; Render provides it.

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGO_URI` | your Atlas connection string (step 1) |
| `JWT_SECRET` | a long random string. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CLIENT_URL` | your Vercel URL, e.g. `https://your-app.vercel.app`. **Temporary value for now:** `https://example.com`, replaced in step 4 |
| `GEMINI_API_KEY` | optional: your Google AI Studio key (AI quiz generation is disabled without it) |
| `JWT_EXPIRES_IN` | optional, default `7d` |
| `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `GEMINI_TIMEOUT_MS` | optional, see `server/.env.example` |
| `AI_LIMIT_PER_HOUR`, `AI_LIMIT_PER_DAY` | optional, defaults 10 and 30 |

After the first deploy, open `https://<your-service>.onrender.com/health`. It should show `{"status":"ok"}`. Note the service URL.

## 3. Vercel: frontend

Add New → **Project** → import the same repo.

| Setting | Value |
|---|---|
| Root Directory | `client` |
| Framework Preset | Vite |
| Build Command | `npm run build` (default) |
| Output Directory | `dist` (default) |
| Install Command | default |

Environment variable (add for Production, and for Preview if you want preview deployments to work):

| Name | Value |
|---|---|
| `VITE_API_URL` | `https://<your-service>.onrender.com/api` |

`VITE_*` variables are baked in at build time and visible in the browser, so only public URLs go here, never secrets.
If this variable is missing, the build fails on purpose with "VITE_API_URL must be set for production builds".
`client/vercel.json` makes page refreshes work on routes like `/explore` (otherwise they 404).

Deploy, then note your Vercel URL.

## 4. Connect the two (after both URLs exist)

1. Render → Environment → set `CLIENT_URL` to the real Vercel URL (`https://your-app.vercel.app`, no trailing path). Save; Render redeploys.
   - Several origins are allowed, comma-separated, e.g. `https://your-app.vercel.app,https://www.yourdomain.com`.
   - Vercel *preview* URLs differ per deployment and are blocked unless you list them.
2. Vercel → confirm `VITE_API_URL` points at the Render URL. If you change it, **redeploy** the project (build-time variable).

## 5. Verify

1. Open `https://<render>/health` (OK) and your Vercel URL (landing page loads).
2. Register a host account. It should work, with no CORS errors in the browser console.
3. Refresh on `/explore` or `/host`. It should not 404.
4. Create a quiz, host it, and join from a phone with the PIN. This proves Socket.IO works over `wss://`.
5. Optional: seed the 30 official quizzes into Atlas from your computer (never needs to run on Render):
   `cd server && npm run seed` with `MONGO_URI` in `server/.env` pointing at the database you want.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Browser console: "blocked by CORS policy" | `CLIENT_URL` on Render doesn't match the site's URL exactly (scheme + host). Fix it and let Render redeploy. |
| Server won't start: "CLIENT_URL is required in production" | Set `CLIENT_URL` on Render. |
| Vercel build fails: "VITE_API_URL must be set" | Add the variable in Vercel and redeploy. |
| Sockets fail / "mixed content" | `VITE_API_URL` must be `https://`, not `http://`. |
| API calls go to the wrong place after changing `VITE_API_URL` | It's a build-time variable. Redeploy Vercel. |
| First request takes ~30-60 s | Render free tier was asleep. Upgrade, or ping `/health` periodically. Games in progress end if the instance restarts or sleeps. |
| Render log: `MongooseServerSelectionError` / `ETIMEOUT` | Atlas Network Access doesn't allow `0.0.0.0/0`, or the connection string/password is wrong. |
| Everyone gets "Too many requests" quickly | Rate limits are per IP; the server trusts one proxy hop (`NODE_ENV=production`). If Render adds more proxy hops, tell me and I'll adjust. |
| Refresh on a route gives 404 | `client/vercel.json` missing from the deployed `client/` folder. |

## Environment variable reference

Server (`server/.env.example`): `NODE_ENV`, `PORT`, `CLIENT_URL`, `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `GEMINI_TIMEOUT_MS`, `AI_LIMIT_PER_HOUR`, `AI_LIMIT_PER_DAY` (`GEMINI_BASE_URL` is for tests/proxies only).
Client (`client/.env.example`): `VITE_API_URL`, `VITE_SOCKET_URL` (optional).
