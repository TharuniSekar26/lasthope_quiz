// Quiz library constants shared by the model, validators, Explore API and seed script.
export const CATEGORIES = [
  { id: 'science', label: 'Science' },
  { id: 'maths', label: 'Maths' },
  { id: 'history', label: 'History' },
  { id: 'geography', label: 'Geography' },
  { id: 'general-knowledge', label: 'General Knowledge' },
  { id: 'programming', label: 'Programming' },
  { id: 'arts', label: 'Arts & Entertainment' },
  { id: 'sports', label: 'Sports' },
  { id: 'other', label: 'Other' },
];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

// Stops anyone filling the database by creating or duplicating quizzes in a loop.
export const MAX_QUIZZES_PER_USER = 200;

// How many sample questions the public Explore preview shows (never with answers).
export const PREVIEW_QUESTIONS = 3;
