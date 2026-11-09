import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema(
  {
    questionIndex: { type: Number, required: true },
    choice: { type: Number, default: null }, // null = no answer
    isCorrect: { type: Boolean, default: false },
    timeMs: { type: Number, default: null },
    pointsAwarded: { type: Number, default: 0 },
  },
  { _id: false }
);

const playerSchema = new mongoose.Schema(
  {
    playerId: { type: String, required: true },
    nickname: { type: String, required: true },
    avatar: String,
    score: { type: Number, default: 0 },
    answers: { type: [answerSchema], default: [] },
  },
  { _id: false }
);

// Copy of each question as it was played, so reports stay correct if the quiz is edited or deleted later.
const questionSnapshotSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    type: { type: String, required: true },
    options: { type: [String], default: [] },
    correctIndex: { type: Number, required: true },
    timeLimit: Number,
    points: Number,
  },
  { _id: false }
);

// Durable record of a game. Live state (timers, sockets) lives in GameManager;
// this is checkpointed at the start, after each question and at the end.
const gameSessionSchema = new mongoose.Schema(
  {
    pin: { type: String, required: true, index: true },
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
    quizTitle: { type: String, required: true }, // denormalised: the quiz may be edited or deleted later
    name: { type: String, trim: true, maxlength: 100 }, // report name; set by the host, defaults to quizTitle
    questions: { type: [questionSnapshotSchema], default: [] }, // absent on games played before reports existed
    deletedAt: { type: Date, default: null }, // set when the report is moved to trash
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ['lobby', 'in-progress', 'finished'], default: 'lobby' },
    players: { type: [playerSchema], default: [] },
    currentQuestionIndex: { type: Number, default: -1 },
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true }
);

gameSessionSchema.index({ host: 1, finishedAt: -1 });

export const GameSession =mongoose.model('GameSession', gameSessionSchema);
