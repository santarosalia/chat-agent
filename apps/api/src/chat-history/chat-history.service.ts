import {
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChatMessageDto, ChatRole } from '../chat/dto/chat-message.dto';
import { RagCitation } from '../rag/rag.types';

export interface AppendTurnInput {
  sessionId: string;
  userId?: string;
  userContent: string;
  assistantContent: string;
  ragUsed: boolean;
  citations?: unknown;
}

export type SessionHistoryMessage =
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string;
      rag_used: boolean;
      citations?: RagCitation[];
    };

export interface SessionHistory {
  session_id: string;
  user_id: string | null;
  messages: SessionHistoryMessage[];
}

@Injectable()
export class ChatHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanAppend(sessionId: string, userId?: string): Promise<void> {
    const deleted = await this.prisma.message.findFirst({
      where: { sessionId, deletedAt: { not: null } },
      select: { id: true },
    });
    if (deleted) {
      throw new GoneException('Session has been deleted');
    }

    const frozen = await this.prisma.message.findFirst({
      where: { sessionId, userId: { not: null } },
      select: { userId: true },
    });
    if (frozen?.userId != null && frozen.userId !== userId) {
      throw new ConflictException('user_id does not match frozen session owner');
    }
  }

  async appendTurn(input: AppendTurnInput): Promise<void> {
    await this.assertCanAppend(input.sessionId, input.userId);

    const userCreatedAt = new Date();
    const assistantCreatedAt = new Date(userCreatedAt.getTime() + 1);

    const assistantRow: Prisma.MessageCreateManyInput = {
      sessionId: input.sessionId,
      userId: input.userId ?? null,
      role: ChatRole.Assistant,
      content: input.assistantContent,
      ragUsed: input.ragUsed,
      createdAt: assistantCreatedAt,
    };
    if (input.ragUsed && input.citations !== undefined) {
      assistantRow.citations = input.citations as Prisma.InputJsonValue;
    }

    const rows: Prisma.MessageCreateManyInput[] = [
      {
        sessionId: input.sessionId,
        userId: input.userId ?? null,
        role: ChatRole.User,
        content: input.userContent,
        createdAt: userCreatedAt,
      },
      assistantRow,
    ];

    await this.prisma.message.createMany({ data: rows });
  }

  async softDeleteSession(sessionId: string): Promise<void> {
    await this.prisma.message.updateMany({
      where: { sessionId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  async getSession(sessionId: string): Promise<SessionHistory> {
    const deleted = await this.prisma.message.findFirst({
      where: { sessionId, deletedAt: { not: null } },
      select: { id: true },
    });
    if (deleted) {
      throw new GoneException('Session has been deleted');
    }

    const rows = await this.prisma.message.findMany({
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

    if (rows.length === 0) {
      throw new NotFoundException('Session not found');
    }

    const userId =
      rows.find((row) => row.userId != null)?.userId ?? null;

    return {
      session_id: sessionId,
      user_id: userId,
      messages: rows.map((row) => toHistoryMessage(row)),
    };
  }

  async listActiveMessages(sessionId: string): Promise<ChatMessageDto[]> {
    const rows = await this.prisma.message.findMany({
      where: { sessionId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { role: true, content: true },
    });

    return rows
      .filter(
        (row): row is { role: ChatRole.User | ChatRole.Assistant; content: string } =>
          row.role === ChatRole.User || row.role === ChatRole.Assistant,
      )
      .map((row) => ({
        role: row.role,
        content: row.content,
      }));
  }
}

function toHistoryMessage(row: {
  role: string;
  content: string;
  ragUsed: boolean | null;
  citations: Prisma.JsonValue;
}): SessionHistoryMessage {
  if (row.role === ChatRole.Assistant) {
    const message: SessionHistoryMessage = {
      role: 'assistant',
      content: row.content,
      rag_used: row.ragUsed ?? false,
    };
    if (row.citations != null) {
      message.citations = row.citations as unknown as RagCitation[];
    }
    return message;
  }

  return { role: 'user', content: row.content };
}
