import { Module } from '@nestjs/common';
import { ChatHistoryModule } from '../chat-history/chat-history.module';
import { RagModule } from '../rag/rag.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { RetrieveQueryRewriter } from './retrieve-query-rewriter.service';

@Module({
  imports: [RagModule, ChatHistoryModule],
  controllers: [ChatController],
  providers: [ChatService, RetrieveQueryRewriter],
  exports: [ChatService],
})
export class ChatModule {}
