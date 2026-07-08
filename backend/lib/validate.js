const { z } = require('zod');

function validate(schema) {
  return (req, res, next) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params
      });
      if (parsed.body !== undefined) req.body = parsed.body;
      if (parsed.query !== undefined) req.query = parsed.query;
      if (parsed.params !== undefined) req.params = parsed.params;
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const msg = err.issues?.[0]?.message || 'Invalid input';
        return res.status(400).json({ error: msg, issues: err.issues });
      }
      return res.status(400).json({ error: 'Invalid input' });
    }
  };
}

const emailSchema = z.string().email();
const passwordSchema = z.string().min(8);
const monthSchema = z.string().regex(
  /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/,
  'month must be in the form "June 2026"'
);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');
const empIdSchema = z.string().regex(/^EMP\d{3,}$/);

module.exports = {
  z,
  validate,
  emailSchema,
  passwordSchema,
  monthSchema,
  dateSchema,
  empIdSchema
};
