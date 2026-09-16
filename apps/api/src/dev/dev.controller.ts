import { Controller, Get, Header, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChatService } from '../chat/chat.service';

@ApiTags('dev')
@Controller('dev')
export class DevController {
  constructor(
    private readonly chatService: ChatService,
    private readonly config: ConfigService,
  ) {}

  @Get('graph')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({
    summary: '채팅 LangGraph mermaid dump (개발용)',
    description: 'NODE_ENV=production 이면 404.',
  })
  @ApiOkResponse({
    description: 'Mermaid flowchart 텍스트',
    content: { 'text/plain': { schema: { type: 'string' } } },
  })
  @ApiNotFoundResponse({ description: '프로덕션에서는 제공하지 않음' })
  async graph(): Promise<string> {
    if (this.config.get('NODE_ENV') === 'production') {
      throw new NotFoundException();
    }
    return this.chatService.dumpGraphMermaid();
  }
}
