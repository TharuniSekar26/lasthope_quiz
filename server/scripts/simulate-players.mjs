// DEV ONLY: joins fake players to a lobby and has them answer questions, so you can test a whole
// game (and the podium reveal) alone.
//
//   1. In the browser: host a game and note the PIN (stay on the lobby screen).
//   2. node scripts/simulate-players.mjs <PIN> [count=8] [--url=http://localhost:5000] [--stay]
//   3. Back in the browser, press "Start game". The bots answer at random speeds with random picks
//      (they can't see the correct answer, same as real players), so scores and ranks vary.
//   4. Play through to the end and use the host's Next button / Space to run the podium reveal.
//
// The script prints what each bot's phone would show and exits once the reveal is complete
// (or keep it open with --stay, e.g. to test a page refresh mid-reveal).
import { io } from 'socket.io-client';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const positional = args.filter((a) => !a.startsWith('--'));
const pin = positional[0];
const count = Math.min(Math.max(Number(positional[1] ?? 8), 1), 50);
const url = flag('url') ?? 'http://localhost:5000';
const stay = args.includes('--stay');

if (!/^\d{6}$/.test(pin ?? '')) {
  console.error('Usage: node scripts/simulate-players.mjs <6-digit PIN> [count=8] [--url=http://localhost:5000] [--stay]');
  process.exit(1);
}

const NAMES = ['Ava', 'Ben', 'Chloe', 'Dev', 'Ella', 'Finn', 'Gia', 'Hugo', 'Iris', 'Jon', 'Kira', 'Leo',
  'Mia', 'Noah', 'Omar', 'Pia', 'Quin', 'Rosa', 'Sam', 'Tara', 'Uma', 'Vik', 'Wren', 'Xavi', 'Yara', 'Zed'];
const rand = (min, max) => min + Math.random() * (max - min);
const bots = [];
let finished = 0;

function startBot(i) {
  const nickname = NAMES[i % NAMES.length] + (i >= NAMES.length ? Math.floor(i / NAMES.length) + 1 : '');
  const socket = io(url, { transports: ['websocket'] });
  const bot = { nickname, socket, avatar: '?' };
  bots.push(bot);

  socket.on('connect', () => {
    socket.timeout(8000).emit('player:join', { pin, nickname }, (err, res) => {
      if (err || !res?.ok) return console.error(`✗ ${nickname}: ${err ? 'no response' : res.message}`);
      bot.avatar = res.snapshot.you.avatar;
      console.log(`+ ${nickname} joined ${bot.avatar}`);
    });
  });

  // Answer after a random think time; occasionally don't answer at all.
  socket.on('question:show', (q) => {
    if (Math.random() < 0.08) return;
    const delay = rand(400, Math.max(800, q.remainingMs * 0.85));
    setTimeout(() => socket.emit('player:answer', { questionIndex: q.index, choice: Math.floor(Math.random() * q.options.length) }), delay);
  });

  socket.on('game:finished', (f) => {
    finished += 1;
    const y = f.you;
    if (y) console.log(`🏁 ${nickname.padEnd(8)} ${bot.avatar}  rank ${String(y.rank).padStart(2)} of ${y.totalPlayers}  score ${String(y.score).padStart(5)}  (phone shows result at reveal step ${y.revealAt}/${f.revealTotal})`);
    if (finished === bots.length) console.log(`\nGame over. Podium has ${f.revealTotal} place(s). Run the reveal on the host screen (Next / Space).`);
  });

  // Only the first bot narrates the reveal.
  if (i === 0) {
    socket.on('reveal:step', ({ step, total }) => {
      console.log(`🥁 reveal step ${step}/${total}`);
      if (step >= total && !stay) setTimeout(() => process.exit(0), 6000);
    });
  }
  socket.on('player:kicked', () => console.log(`- ${nickname} was removed`));
}

console.log(`Joining ${count} bot(s) to game ${pin} at ${url} …`);
for (let i = 0; i < count; i++) setTimeout(() => startBot(i), i * 150);
