import * as authService from '../services/auth.service.js';

// Express 5 forwards rejected promises from async handlers to the error middleware.
export async function register(req, res) {
  const { user, token } = await authService.register(req.body);
  res.status(201).json({ user, token });
}

export async function login(req, res) {
  const { user, token } = await authService.login(req.body);
  res.json({ user, token });
}

export async function me(req, res) {
  const user = await authService.getById(req.userId);
  res.json({ user });
}
