import { io } from 'socket.io-client';
import { tokenStore } from '../api/client.js';
import { SOCKET_URL } from '../config.js';

let socket;

// One shared connection. The host JWT (if any) is read on every (re)connect;
// students have no token and connect anonymously.
export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      auth: (cb) => cb({ token: tokenStore.get() }),
    });
  }
  return socket;
}

// Players keep their reconnect token per tab so a refresh puts them back in the game.
const key = (pin) => `quiz_player_${pin}`;

export const playerSession = {
  get(pin) {
    try {
      return JSON.parse(sessionStorage.getItem(key(pin)));
    } catch {
      return null;
    }
  },
  set(pin, value) {
    try {
      sessionStorage.setItem(key(pin), JSON.stringify(value));
    } catch {
      /* storage unavailable: refresh will require re-joining */
    }
  },
  clear(pin) {
    try {
      sessionStorage.removeItem(key(pin));
    } catch {
      /* ignore */
    }
  },
};
