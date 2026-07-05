import pino from 'pino';

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? (process.env.DEBUG_AI_LOGS === 'true' ? 'debug' : 'info') : 'debug',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  } : undefined,
  base: null, // Avoid setting `pid` and `hostname` as it spams the console
});
