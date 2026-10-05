import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitRecord>();

export function clearRateLimitStore(): void {
  store.clear();
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of store.entries()) {
    if (now > record.resetTime) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
  keyPrefix?: string;
  skipDevRelaxation?: boolean;
}) {
  const {
    windowMs,
    max,
    message = 'Too many requests. Please try again later.',
    keyPrefix = 'rl',
    skipDevRelaxation = false,
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.DISABLE_RATE_LIMITING === 'true') {
      return next();
    }

    const clientIp = req.ip || req.socket.remoteAddress || 'unknown-ip';
    const key = `${keyPrefix}:${clientIp}`;
    const now = Date.now();
    const record = store.get(key);

    if (!record || now > record.resetTime) {
      store.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    const effectiveMax = (process.env.NODE_ENV === 'production' || skipDevRelaxation) ? max : Math.max(max, 500);

    if (record.count >= effectiveMax) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        error: message,
        retryAfter: retryAfterSeconds,
      });
    }

    record.count += 1;
    next();
  };
}

export const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: 'Too many login attempts from this network. Please wait a few minutes before trying again.',
  keyPrefix: 'login',
});

export const passwordResetLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many password reset requests. Please wait 15 minutes before trying again.',
  keyPrefix: 'pwd_reset',
});

export const registrationLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many registration attempts. Please wait 15 minutes before trying again.',
  keyPrefix: 'reg',
});

export const tokenValidationLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many token verification requests. Please wait 15 minutes before trying again.',
  keyPrefix: 'token_val',
});

export const admissionsLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many admission applications submitted from this network. Please wait 15 minutes before trying again.',
  keyPrefix: 'admissions',
});

export const applicationTrackLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many application status lookups. Please wait a few minutes before trying again.',
  keyPrefix: 'app_track',
});
