import { ConflictException, GoneException, NotFoundException } from '@nestjs/common';
import { ChatHistoryService } from './chat-history.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ChatHistoryService', () => {
  const sessionId = '550e8400-e29b-41d4-a716-446655440000';

  let prisma: {
    message: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      createMany: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let service: ChatHistoryService;

  beforeEach(() => {
    prisma = {
      message: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
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

      const rows = prisma.message.createMany.mock.calls[0][0].data as Array<{
        role: string;
        content: string;
        createdAt: Date;
      }>;

      expect(rows).toEqual([
        expect.objectContaining({
          sessionId,
          userId: 'user-a',
          role: 'user',
          content: 'Hello',
        }),
        expect.objectContaining({
          sessionId,
          userId: 'user-a',
          role: 'assistant',
          content: 'Hi there',
          ragUsed: true,
          citations: [{ filename: 'a.pdf', page: 1, snippet: 'ctx' }],
        }),
      ]);
      expect(rows[1].createdAt.getTime()).toBeGreaterThan(
        rows[0].createdAt.getTime(),
      );
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

  describe('getSession', () => {
    it('throws 410 when the session is soft-deleted', async () => {
      prisma.message.findFirst.mockResolvedValueOnce({ id: 'deleted-row' });

      await expect(service.getSession(sessionId)).rejects.toBeInstanceOf(
        GoneException,
      );
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });

    it('throws 404 when no messages exist for the session', async () => {
      prisma.message.findFirst.mockResolvedValueOnce(null);
      prisma.message.findMany.mockResolvedValueOnce([]);

      await expect(service.getSession(sessionId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns ordered turns with frozen user_id', async () => {
      prisma.message.findFirst.mockResolvedValueOnce(null);
      prisma.message.findMany.mockResolvedValueOnce([
        {
          role: 'user',
          content: 'Hello',
          ragUsed: null,
          citations: null,
          userId: 'user-a',
        },
        {
          role: 'assistant',
          content: 'Hi',
          ragUsed: true,
          citations: [{ filename: 'a.pdf', page: 1, snippet: 'ctx' }],
          userId: 'user-a',
        },
      ]);

      await expect(service.getSession(sessionId)).resolves.toEqual({
        session_id: sessionId,
        user_id: 'user-a',
        messages: [
          { role: 'user', content: 'Hello' },
          {
            role: 'assistant',
            content: 'Hi',
            rag_used: true,
            citations: [{ filename: 'a.pdf', page: 1, snippet: 'ctx' }],
          },
        ],
      });

      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { sessionId, deletedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          role: true,
          content: true,
          ragUsed: true,
          citations: true,
          userId: true,
        },
      });
    });
  });

  describe('listActiveMessages', () => {
    it('returns an empty list when the session has no rows', async () => {
      prisma.message.findMany.mockResolvedValueOnce([]);

      await expect(service.listActiveMessages(sessionId)).resolves.toEqual([]);
    });

    it('returns role and content in created_at order without failing on empty', async () => {
      prisma.message.findMany.mockResolvedValueOnce([
        { role: 'user', content: 'old question' },
        { role: 'assistant', content: 'old reply' },
      ]);

      await expect(service.listActiveMessages(sessionId)).resolves.toEqual([
        { role: 'user', content: 'old question' },
        { role: 'assistant', content: 'old reply' },
      ]);

      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { sessionId, deletedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { role: true, content: true },
      });
    });
  });
});
