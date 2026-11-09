import generalKnowledge from './general-knowledge.js';
import history from './history.js';
import maths from './maths.js';
import programming from './programming.js';
import science from './science.js';

// category id (see src/constants/library.js) -> 6 quizzes of 10 questions each
export default {
  science,
  maths,
  history,
  'general-knowledge': generalKnowledge,
  programming,
};
