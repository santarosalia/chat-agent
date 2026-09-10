import { ConflictException, GoneException } from '@nestjs/common';
import { ChatHistoryService } from './chat-history.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ChatHistoryService', () => {
  const sessionId = '550e8400-e29b-41d4-a716-446655440000';

  let prisma: {
    message: {
      findFirst: jest.Mock;
      createMany: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let service: ChatHistoryService;

  beforeEach(() => {
    prisma = {
      message: {
        findFirst: jest.fn(),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    service = new ChatHistoryService(prisma as unknown as PrismaService);
  });

  describe('assertCanAppend', () => {
    it('throws 410 when any row for session is soft-deleted', async () => {
      prisma.message.findFirst.mockResolvedValueOnce({ id: 'deleted-row' });

      await expect(service.assertCanAppend(sessionId)).rejects.toBeInstanceOf(
        GoneException,
      );
    });

    it('throws 409 when frozen user_id differs from request', async () => {
      prisma.message.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ userId: 'user-a' });

      await expect(
        service.assertCanAppend(sessionId, 'user-b'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws 409 when frozen user_id exists but request omits user_id', async () => {
      prisma.message.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ userId: 'user-a' });

      await expect(service.assertCanAppend(sessionId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('allows append when no frozen user_id and session is active', async () => {
      prisma.message.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await expect(service.assertCanAppend(sessionId)).resolves.toBeUndefined();
    });
  });

  describe('appendTurn', () => {
    it('persists user and assistant rows', async () => {
      prisma.message.findFirst.mockResolvedValue(null);

      await service.appendTurn({
        sessionId,
        userId: 'user-a',
        userContent: 'Hello',
        assistantContent: 'Hi there',
        ragUsed: true,
        citations: [{ filename: 'a.pdf', page: 1, snippet: 'ctx' }],
      });

      expect(prisma.message.createMany).toHaveBeenCalledWith({
        data: [
          {
            sessionId,
            userId: 'user-a',
            role: 'user',
            content: 'Hello',
          },
          {
            sessionId,
            userId: 'user-a',
            role: 'assistant',
            content: 'Hi there',
            ragUsed: true,
            citations: [{ filename: 'a.pdf', page: 1, snippet: 'ctx' }],
          },
        ],
      });
    });
  });

  describe('softDeleteSession', () => {
    it('marks active rows deleted without requiring existing session', async () => {
      await service.softDeleteSession(sessionId);

      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: { sessionId, deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
