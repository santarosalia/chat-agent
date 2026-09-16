import { Module } from '@nestjs/common';
import { ChatHistoryModule } from '../chat-history/chat-history.module';
import { RagModule } from '../rag/rag.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { RetrieveSufficiencyEvaluator } from './retrieve-sufficiency-evaluator.service';

@Module({
  imports: [RagModule, ChatHistoryModule],
  controllers: [ChatController],
  providers: [ChatService, RetrieveSufficiencyEvaluator],
  exports: [ChatService],
})
export class ChatModule {}
