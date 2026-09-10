import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatHistoryModule } from './chat-history/chat-history.module';
import { ChatModule } from './chat/chat.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    ChatHistoryModule,
    ChatModule,
  ],
})
export class AppModule {}
