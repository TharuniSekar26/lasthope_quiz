# Live Quiz

A Kahoot-style live quiz platform on the MERN stack with Socket.IO.
Hosts register, build quizzes (by hand or with AI) and run live games; students join at `/join` with a 6-digit PIN and a nickname, no account needed.

- `client/`: React (Vite), Tailwind CSS, React Router
- `server/`: Node.js, Express, Mongoose (MongoDB Atlas), Socket.IO

## Setup

```bash
npm run install:all        # installs root, server and client dependencies
cp server/.env.example server/.env
cp client/.env.example client/.env   # optional, the defaults work locally
npm run dev                # server on :5000, client on :5173
```

### Environment (`server/.env`)

| Variable | Required | Description |
|---|---|---|
| `MONGO_URI` | yes | MongoDB Atlas connection string (include a database name) |
| `JWT_SECRET` | yes | Long random string (16+ chars) used to sign host tokens |
| `JWT_EXPIRES_IN` | no | Token lifetime, default `7d` |
| `PORT` | no | Default `5000` (Render sets it automatically) |
| `CLIENT_URL` | in production | Allowed frontend origin(s), comma-separated. Defaults to `http://localhost:5173` outside production. `CLIENT_ORIGIN` still works as the old name |
| `NODE_ENV` | no | Set `production` when deployed |

To deploy (Vercel + Render + Atlas), see [DEPLOYMENT.md](DEPLOYMENT.md).
| `GEMINI_API_KEY` | for AI | Google Gemini API key. Leave blank to disable AI generation |
| `GEMINI_MODEL` | no | Defaults to `gemini-flash-latest` (Google's alias for the current Flash model). If it is overloaded, use `gemini-flash-lite-latest` (faster, more available). Old versions like `gemini-2.5-flash` are retired for new API keys |
| `GEMINI_FALLBACK_MODEL` | no | If the main model is overloaded (503/504), over quota (429) or times out, the server retries once on this model. Defaults to `gemini-flash-lite-latest`; set `off` to disable |
| `GEMINI_TIMEOUT_MS` | no | Give up on a stuck Gemini call after this many ms, default `45000` |
| `AI_LIMIT_PER_HOUR` | no | Max AI generations per host per hour, default `10` |
| `AI_LIMIT_PER_DAY` | no | Max AI generations per host per day, default `30` |

The Gemini key lives only on the server and is never sent to the browser.

## Quiz library (Explore)

Hosts can share quizzes publicly and reuse other people's.

- **Library settings** (in the quiz editor): visibility (private / public), category, tags and language. A quiz appears in Explore only when it is **public and published**.
- **Explore** (`/explore`, no login needed): search (title, tags, description; handles word forms like "planet" / "planets"), category chips with counts, sort (best match, most played, newest), pagination, and a **preview** (title, question count, author, a few sample questions). The URL keeps your search and page, so it can be shared.
- **Duplicate to my account:** copies a library quiz (or one of your own, from the dashboard) into your account as a **private draft** with `clonedFrom` pointing at the original. The copy is independent; editing it never changes the original. Visitors who aren't logged in are sent to log in first.
- **Correct answers are never exposed by Explore.** The list and preview responses are built from explicit field whitelists and contain no `correctIndex`. Duplicating happens on the server, so the answers reach only the person who copies the quiz. Quiz authors are told this when they make a quiz public.
- **Play count:** goes up when a game is *started* from a quiz (opening a lobby doesn't count) and drives the "Most played" sort. `isOfficial`, `playCount` and `clonedFrom` can never be set by clients.
- **Limits:** 200 quizzes per account, 30 duplicates per hour, Explore throttled per IP.

API: `GET /api/explore?q=&category=&language=&sort=popular|newest|relevance&page=&limit=` (limit up to 24), `GET /api/explore/categories`, `GET /api/explore/:id` (preview), `POST /api/quizzes/:id/duplicate` (login required).

### Seeding official quizzes

```bash
cd server
npm run seed                # 30 official quizzes (5 categories x 6 quizzes x 10 questions) by the "Official" user
npm run seed -- --dry-run   # validate the data without touching the database
npm run seed -- --remove    # delete the Official quizzes and user again
```

Safe to run repeatedly: the Official user is found by e-mail, each quiz is upserted by title (a unique database index backs this up), option order uses a fixed shuffle so every run produces identical data, and real `playCount` values are kept. Re-running restores any official quiz that was edited by hand. The Official account has a random password nobody knows, so it can't be logged into. Quiz content lives in `server/scripts/seed-data/`.

## AI quiz generation

In the quiz editor, open **Generate with AI**, enter a topic or paste text, pick the number of questions (1-20), difficulty and question types. The server asks Gemini for JSON that matches a response schema, validates every question against the quiz schema (discarding invalid or duplicate ones), and returns an **unsaved draft** to the editor so you can review and edit before saving.

`POST /api/quizzes/generate` (host auth required)

```json
{ "topic": "The solar system", "numQuestions": 5, "difficulty": "medium", "questionTypes": "mixed" }
```
or `{ "text": "<pasted notes, 50-12000 chars>", ... }`. Returns `{ "quiz": { title, description, questions[] }, "meta": { requested, returned } }`.

| Status | Meaning |
|---|---|
| 400 | Invalid request (missing topic/text, bad count, text too long) |
| 422 | Gemini blocked the request (safety filters) or returned an invalid or empty quiz |
| 429 | Per-user rate limit reached, or a generation is already in progress |
| 503 | AI not configured, or Gemini is overloaded / over quota / timed out / unreachable |
| 502 | Unexpected error from Gemini (for example a bad key); details are in the server log only |

Failed requests (400, 422, 5xx) do not count against the rate limit. Counters are in memory and reset when the server restarts.

## Podium reveal (end of game)

When a game finishes, the host's screen shows an animated podium and the winners are revealed bottom-up (5th, 4th, 3rd, 2nd, then 1st with a drumroll and confetti). With fewer than 5 players it adapts (3 players = 3 steps, 1 player = just the winner). Phones follow in sync and show each player's own result at the moment their place is revealed ("You finished 3rd!", or "You finished 12th of 40" for players outside the top 5).

- **Host controls:** **Next** button, **Space** or **Enter**, plus an **Auto-play reveal** toggle (2.5 s per step) and a **sound** toggle (off by default; the drumroll and cheer are synthesised, so there are no audio files).
- **Accessibility:** `prefers-reduced-motion` skips the animations and confetti; the revealed place is announced to screen readers.
- **Avatars:** every player gets a random emoji avatar from our own set of 20 (`server/src/game/avatars.js`).
- **Ranking:** computed once by the server when the game ends. Equal scores share a rank (1, 2, 2, 4); the order among tied players is decided by total answer time (an unanswered question counts as the full time limit). Clients never calculate ranks.

Socket events (see `GameManager.finalPayload` / `revealNext` for the exact payloads):

| Event | Direction | Payload |
|---|---|---|
| `game:finished` | server → room | `{ reason, quizTitle, totalPlayers, top[≤5], revealTotal, revealStep, you? }` (`you` for players, `quizId` + `sessionId` for the host) |
| `host:reveal_next` | host → server | none; host only, game must be finished. Ack `{ ok, step }` |
| `reveal:step` | server → room | `{ step, total }` (`step` = places revealed so far) |

A player or host who joins or reconnects mid-reveal receives the current `revealStep` in the state snapshot. If the host disconnects for good, the whole podium is shown immediately.

Components: `Podium`, `RunnersUp`, hook `useRevealSequence`, screens `reveal/HostReveal` and `reveal/PlayerReveal`.

### Trying it with fake players

- **Visual preview, no server needed (dev only):** run `npm run dev` and open `http://localhost:5173/dev/podium`. Use the panel at the bottom to pick 1, 2, 3, 5, 8 or 12 players, toggle ties, switch between the host screen and a phone, choose which place "you" finished, and click **Restart** to replay.
- **Real game with bots:** host a game and note the PIN, then run `node scripts/simulate-players.mjs <PIN> 8` in `server/`. Press **Start game** in the browser and play through; the bots answer at random.
- **Automated:** `node scripts/test-podium-flow.mjs` (full-stack with 1, 3 and 8 bots), `node scripts/test-ranking.mjs` (ties and reveal counter), and `node scripts/test-reveal-render.mjs` in `client/` (who is visible at each step).

## Reports

Every finished game becomes a report at **Dashboard → Reports** (`/host/reports`), like Kahoot's:

- A list with the report name, number of participants, correct-answer percentage and end date, with **Show more** paging and checkboxes for bulk actions.
- Each row's ⋮ menu: **Open report**, **Play again** (starts a new game from the same quiz, which must still be published), **Download report** (CSV, opens in Excel), **Rename**, **Move to trash**.
- **Trash** tab: **Restore** or **Delete permanently**. Permanent deletion is only possible from the trash.
- The report page shows summary cards plus a **Players** tab (rank, score, correct / incorrect / unanswered, average time) and a **Questions** tab (percent correct and how many players picked each option).

Questions are copied into the report when a game starts, so reports stay accurate if the quiz is edited later. Games played before this feature fall back to the current quiz and show a notice.

API (host auth required, under `/api/games/reports`): `GET /` (`?trashed=1&page=2`), `GET /:id`, `GET /:id/download`, `PATCH /:id` (`{name}`), `POST /bulk` (`{action: "trash"|"restore"|"delete", ids}`). CSV cells starting with `=`, `+`, `-` or `@` are neutralised so a malicious nickname can't run as a spreadsheet formula.

## Tests

The scripts need the server's `.env` (they use your Atlas database and create throwaway test accounts).

```bash
cd server
node scripts/test-ai-generate.mjs   # AI generation against a local fake Gemini API (free, no key needed)
node scripts/e2e-game.mjs           # live game flow; needs `npm run dev` running
node scripts/test-library.mjs       # Explore, search, answer hiding, duplicate (starts its own server, cleans up after itself)
node scripts/test-seed.mjs          # seed idempotency and content quality (re-seeds the Official quizzes when done)
```
