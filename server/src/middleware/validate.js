import { ApiError } from '../utils/ApiError.js';

// Validates req.body against a zod schema and replaces it with the parsed value.
export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const details = result.error.issues.map((i) => {
      // Point at the offending question: path is ['questions', index, ...]
      const qi = i.path[0] === 'questions' && typeof i.path[1] === 'number' ? i.path[1] + 1 : null;
      return {
        field: i.path.join('.'),
        message: qi ? `Question ${qi}: ${i.message}` : i.message,
      };
    });
    return next(new ApiError(400, 'Validation failed', details));
  }
  req.body = result.data;
  next();
};
