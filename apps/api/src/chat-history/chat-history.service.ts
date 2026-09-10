import {
  ConflictException,
  GoneException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChatRole } from '../chat/dto/chat-message.dto';

export interface AppendTurnInput {
  sessionId: string;
  userId?: string;
  userContent: string;
  assistantContent: string;
  ragUsed: boolean;
  citations?: unknown;
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

    const assistantRow: Prisma.MessageCreateManyInput = {
      sessionId: input.sessionId,
      userId: input.userId ?? null,
      role: ChatRole.Assistant,
      content: input.assistantContent,
      ragUsed: input.ragUsed,
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
}
