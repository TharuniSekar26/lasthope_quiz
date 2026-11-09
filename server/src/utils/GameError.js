// Expected, user-facing failure in live-game logic. `code` is machine readable
// (the client switches on it); `message` is safe to show to players.
export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
