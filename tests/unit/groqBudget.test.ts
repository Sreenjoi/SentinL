import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reserveGroqBudget, __resetGroqBudgetForTest } from '../../src/utils/groqBudget.js';
import { logger } from '../../src/utils/logger.js';

describe('reserveGroqBudget', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __resetGroqBudgetForTest();
  });

  it('fails open without logging error if db is null', async () => {
    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const result = await reserveGroqBudget(null, 100);
    expect(result).toEqual({ allowed: true });
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it('fails open without logging error if db.runTransaction is not a function', async () => {
    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const mockDb = {} as any;
    const result = await reserveGroqBudget(mockDb, 100);
    expect(result).toEqual({ allowed: true });
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it('logs error and fails open if a real transaction fails unexpectedly', async () => {
    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const mockDb = {
      collection: () => ({
        doc: () => ({})
      }),
      runTransaction: vi.fn().mockRejectedValue(new Error('Transaction Failed'))
    } as any;
    
    const result = await reserveGroqBudget(mockDb, 100);
    
    expect(result).toEqual({ allowed: true });
    expect(loggerErrorSpy).toHaveBeenCalledWith({ err: expect.any(Error) }, "Groq budget transaction failed");
  });
});
