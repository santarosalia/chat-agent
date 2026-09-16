import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { DevController } from './dev.controller';

@Module({
  imports: [ChatModule],
  controllers: [DevController],
})
export class DevModule {}
