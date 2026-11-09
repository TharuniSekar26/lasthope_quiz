import http from 'node:http';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import { GameSession } from './models/GameSession.js';
import { initSockets } from './sockets/index.js';

async function main() {
  await connectDB();

  // Live games only exist in this process's memory, so any session still marked
  // active in the DB was orphaned by a restart. Close them out.
  const { modifiedCount } = await GameSession.updateMany(
    { status: { $ne: 'finished' } },
    { $set: { status: 'finished', finishedAt: new Date() } }
  );
  if (modifiedCount) console.log(`Closed ${modifiedCount} orphaned game session(s)`);

  const app = createApp();
  const server = http.createServer(app);
  initSockets(server);
  server.listen(env.PORT, () => console.log(`Server listening on http://localhost:${env.PORT}`));
}

main().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
