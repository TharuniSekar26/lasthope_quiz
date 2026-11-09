// Compact question builders for the seed data.
//   q(text, correct, [wrong, wrong, wrong])   multiple choice; seed.js shuffles the options
//   t(text, true|false)                       true / false
export const q = (text, correct, wrong, timeLimit = 20) => ({ type: 'MCQ', text, correct, wrong, timeLimit });
export const t = (text, isTrue, timeLimit = 10) => ({ type: 'TRUE_FALSE', text, isTrue, timeLimit });
