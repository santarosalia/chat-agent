import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestLoggingMiddleware } from './request-logging.middleware';

describe('RequestLoggingMiddleware', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs one line when the response finishes', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const middleware = new RequestLoggingMiddleware();
    const listeners: Record<string, () => void> = {};
    const req = {
      method: 'POST',
      url: '/chat',
      body: {
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: 'user-a',
        group_id: 'hr-docs',
        top_k: 10,
      },
    } as Request;
    const res = {
      statusCode: 200,
      on: (event: string, handler: () => void) => {
        listeners[event] = handler;
      },
    } as unknown as Response;
    const next = jest.fn() as NextFunction;

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();

    listeners.finish();

    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(
        /^POST \/chat 200 \d+ms session_id=550e8400-e29b-41d4-a716-446655440000 user_id=user-a group_id=hr-docs top_k=10$/,
      ),
    );
  });
});
