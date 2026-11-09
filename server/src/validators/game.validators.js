import { z } from 'zod';

export const pinSchema = z.string().regex(/^\d{6}$/, 'PIN must be 6 digits');

export const createGameSchema = z.object({ quizId: z.string().min(1, 'quizId is required') });

export const renameReportSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long (max 100)'),
});

export const bulkReportsSchema = z.object({
  action: z.enum(['trash', 'restore', 'delete']),
  ids: z
    .array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid report id'))
    .min(1, 'Select at least one report')
    .max(100, 'Too many reports selected'),
});

// Socket payloads
export const hostJoinSchema = z.object({ pin: pinSchema });

export const playerJoinSchema = z.object({
  pin: pinSchema,
  nickname: z
    .string()
    .trim()
    .min(1, 'Enter a nickname')
    .max(20, 'Nickname must be at most 20 characters')
    .regex(/^[^\p{C}]+$/u, 'Nickname contains invalid characters')
    .transform((s) => s.replace(/\s+/g, ' ')),
});

export const playerRejoinSchema = z.object({
  pin: pinSchema,
  playerToken: z.string().min(1).max(64),
});

export const kickSchema = z.object({ playerId: z.string().min(1).max(64) });

export const answerSchema = z.object({
  questionIndex: z.number().int().min(0),
  choice: z.number().int().min(0).max(3),
});
