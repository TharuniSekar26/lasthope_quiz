import { z } from 'zod';
import { CATEGORY_IDS } from '../constants/library.js';

const TRUE_FALSE_OPTIONS = ['True', 'False'];

export const questionSchema = z
  .object({
    text: z.string().trim().min(1, 'Question text is required').max(300, 'Question text is too long (max 300)'),
    type: z.enum(['MCQ', 'TRUE_FALSE']),
    options: z
      .array(z.string().trim().min(1, 'Options cannot be empty').max(120, 'Option is too long (max 120)'))
      .min(2, 'At least 2 options are required')
      .max(4, 'At most 4 options are allowed'),
    correctIndex: z.number().int().min(0),
    timeLimit: z.number().int().min(5, 'Time limit must be 5-120 seconds').max(120, 'Time limit must be 5-120 seconds').default(20),
    points: z.number().int().min(0, 'Points must be 0-10000').max(10000, 'Points must be 0-10000').default(1000),
  })
  .superRefine((q, ctx) => {
    const optionCount = q.type === 'TRUE_FALSE' ? 2 : q.options.length;
    if (q.correctIndex >= optionCount) {
      ctx.addIssue({ code: 'custom', path: ['correctIndex'], message: 'Select a valid correct answer' });
    }
  })
  // True/false options are fixed so every client renders them identically.
  .transform((q) => (q.type === 'TRUE_FALSE' ? { ...q, options: TRUE_FALSE_OPTIONS } : q));

const base = {
  title: z.string().trim().min(1, 'Title is required').max(100, 'Title is too long (max 100)'),
  description: z.string().trim().max(500, 'Description is too long (max 500)').default(''),
  questions: z.array(questionSchema).max(100, 'A quiz can have at most 100 questions').default([]),
  // Provenance only: set to "ai" by the editor when the draft came from generation. Ignored on update.
  createdVia: z.enum(['manual', 'ai']).default('manual'),

  // Library settings. Optional with NO defaults on purpose: on update, "not sent" must mean
  // "leave unchanged" (the model supplies defaults when a quiz is created).
  // isOfficial, playCount and clonedFrom are deliberately absent: clients can never set them.
  visibility: z.enum(['private', 'public']).optional(),
  category: z.enum(CATEGORY_IDS, { error: 'Choose a valid category' }).optional(),
  tags: z
    .array(z.string().trim().toLowerCase().min(1, 'Tags cannot be empty').max(30, 'Tags can be at most 30 characters'))
    .max(10, 'Use at most 10 tags')
    .transform((tags) => [...new Set(tags)])
    .optional(),
  language: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/, 'Language must be a code like "en" or "pt-br"')
    .optional(),
};

export const quizSchema = z.object(base);

export const generateSchema = z
  .object({
    topic: z.string().trim().max(200, 'Topic is too long (max 200 characters)').default(''),
    // Capped to bound input-token cost.
    text: z.string().trim().max(12000, 'Pasted text is too long (max 12,000 characters)').default(''),
    numQuestions: z.number().int().min(1, 'Choose 1-20 questions').max(20, 'Choose 1-20 questions').default(5),
    difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
    questionTypes: z.enum(['mixed', 'mcq', 'true_false']).default('mixed'),
  })
  .refine((d) => d.topic.length >= 3 || d.text.length >= 50, {
    path: ['topic'],
    message: 'Enter a topic (3+ characters) or paste at least 50 characters of text',
  });

// Query string of GET /api/explore
export const exploreQuerySchema = z.object({
  q: z.string().trim().max(100, 'Search is too long (max 100 characters)').optional(),
  category: z.enum(CATEGORY_IDS, { error: 'Unknown category' }).optional(),
  language: z.string().trim().toLowerCase().regex(/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/, 'Invalid language').optional(),
  sort: z.enum(['popular', 'newest', 'relevance']).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(24).default(12),
});

export const publishSchema =z.object({ isPublished: z.boolean() });
