import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

const BCRYPT_COST = 12;

function signToken(userId) {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

export async function register({ name, email, password }) {
  if (await User.exists({ email })) {
    throw new ApiError(409, 'An account with this email already exists');
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  try {
    const user = await User.create({ name, email, passwordHash });
    return { user, token: signToken(user.id) };
  } catch (err) {
    // Race with the unique index
    if (err.code === 11000) throw new ApiError(409, 'An account with this email already exists');
    throw err;
  }
}

export async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash');
  // Same message for unknown email and wrong password to avoid user enumeration.
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) throw new ApiError(401, 'Invalid email or password');
  return { user, token: signToken(user.id) };
}

export async function getById(id) {
  const user = await User.findById(id);
  if (!user) throw new ApiError(401, 'Account no longer exists');
  return user;
}
