import mongoose from 'mongoose';
import { CATEGORY_IDS } from '../constants/library.js';

// Embedded in Quiz. No _id: a question is addressed by its index in the quiz,
// which is also how the live game refers to it.
const questionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 300 },
    type: { type: String, enum: ['MCQ', 'TRUE_FALSE'], required: true },
    options: { type: [String], required: true },
    correctIndex: { type: Number, required: true, min: 0 },
    timeLimit: { type: Number, default: 20, min: 5, max: 120 }, // seconds
    points: { type: Number, default: 1000, min: 0, max: 10000 },
  },
  { _id: false }
);

const quizSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    questions: { type: [questionSchema], default: [] },
    isPublished: { type: Boolean, default: false },
    // "ai" is used by Phase 5 quiz generation.
    createdVia: { type: String, enum: ['manual', 'ai'], default: 'manual' },

    // ---- Quiz library ----
    // A quiz shows up in Explore only when it is BOTH public and published.
    visibility: { type: String, enum: ['private', 'public'], default: 'private' },
    category: { type: String, enum: CATEGORY_IDS, default: 'other' },
    tags: { type: [String], default: [] },
    language: { type: String, default: 'en', lowercase: true, trim: true }, // BCP-47-ish, e.g. "en", "hi", "pt-br"
    playCount: { type: Number, default: 0, min: 0 }, // games started from this quiz
    clonedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', default: null },
    isOfficial: { type: Boolean, default: false }, // only the seed script sets this
  },
  { timestamps: true }
);

// Full-text search over title, tags and description (title counts most).
// IMPORTANT: Mongo reads a document field called "language" as the text-search language and
// rejects values it doesn't know. Our `language` is just a label, so point the override at a
// field that doesn't exist; otherwise saving a quiz in e.g. Hindi would fail.
quizSchema.index(
  { title: 'text', tags: 'text', description: 'text' },
  { name: 'quiz_text_search', weights: { title: 10, tags: 5, description: 1 }, default_language: 'english', language_override: '__textLanguage' }
);
// Database-level guard that makes seeding idempotent even if two seed runs overlap:
// an owner can't have two OFFICIAL quizzes with the same title. Regular quizzes are unaffected.
quizSchema.index({ owner: 1, title: 1 }, { name: 'official_unique_title', unique: true, partialFilterExpression: { isOfficial: true } });
// Explore listings: filter by visibility/published/category, sort by popularity or recency.
quizSchema.index({ visibility: 1, isPublished: 1, category: 1, playCount: -1 });
quizSchema.index({ visibility: 1, isPublished: 1, createdAt: -1 });

quizSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Quiz = mongoose.model('Quiz', quizSchema);
