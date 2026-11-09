import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  email: z.string().trim().toLowerCase().pipe(z.email('Invalid email')),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'), // bcrypt limit
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Invalid email')),
  password: z.string().min(1, 'Password is required'),
});
