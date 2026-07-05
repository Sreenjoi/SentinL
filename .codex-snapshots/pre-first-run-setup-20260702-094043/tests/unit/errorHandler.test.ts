import { describe, it, expect, vi, beforeEach } from 'vitest';
import { globalErrorHandler } from '../../src/utils/errorHandler';

// Mock logger to prevent tests from spamming the console
vi.mock('../../src/utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('globalErrorHandler', () => {
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    req = {};
    res = {
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    next = vi.fn();
    delete process.env.NODE_ENV;
    delete process.env.TEST_MODE;
  });

  it('in production without test mode, it should redact the error details', () => {
    process.env.NODE_ENV = 'production';
    process.env.TEST_MODE = 'false';

    const error = new Error('Secret database connection error leaking credentials: user:pass');

    globalErrorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('in development, it should include error details', () => {
    process.env.NODE_ENV = 'development';
    
    const errorDetails = 'Cannot read properties of undefined';
    const error = new Error(errorDetails);

    globalErrorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error', details: errorDetails });
  });
  
  it('in test mode even during production, it should not redact to help debugging tests', () => {
    process.env.NODE_ENV = 'production';
    process.env.TEST_MODE = 'true';
    
    const errorDetails = 'Cannot read properties of undefined';
    const error = new Error(errorDetails);

    globalErrorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error', details: errorDetails });
  });
});
