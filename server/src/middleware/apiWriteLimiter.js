import rateLimit from 'express-rate-limit';

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.API_WRITE_RATE_LIMIT_MAX || 400),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method),
});

export function apiWriteLimiter(req, res, next) {
  return writeLimiter(req, res, next);
}
