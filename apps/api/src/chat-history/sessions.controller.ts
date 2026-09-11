import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiGoneResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ChatHistoryService } from './chat-history.service';
import {
  SessionHistoryAssistantMessageSchema,
  SessionHistorySchema,
  SessionHistoryUserMessageSchema,
} from './dto/session-history.dto';

@ApiTags('v1')
@ApiExtraModels(
  SessionHistoryUserMessageSchema,
  SessionHistoryAssistantMessageSchema,
)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly chatHistory: ChatHistoryService) {}

  @Get(':id')
  @ApiOperation({
    summary: '세션 채팅 기록 조회',
    description:
      'deleted_at이 없는 메시지를 created_at 순으로 반환합니다. 기록이 없으면 404, 소프트 삭제된 세션은 410입니다.',
  })
  @ApiParam({
    name: 'id',
    description: '클라이언트가 생성한 session UUID',
    format: 'uuid',
  })
  @ApiOkResponse({ type: SessionHistorySchema })
  @ApiNotFoundResponse({ description: '해당 session_id의 기록이 없음' })
  @ApiGoneResponse({ description: '소프트 삭제된 세션' })
  async getSession(
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<SessionHistorySchema> {
    return this.chatHistory.getSession(sessionId);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: '세션 채팅 기록 소프트 삭제',
    description:
      'session_id에 해당하는 모든 메시지에 deleted_at을 설정합니다. 존재하지 않거나 이미 삭제된 세션도 항상 HTTP 204를 반환합니다.',
  })
  @ApiParam({
    name: 'id',
    description: '클라이언트가 생성한 session UUID',
    format: 'uuid',
  })
  @ApiNoContentResponse({ description: '소프트 삭제 완료 (또는 대상 없음)' })
  async deleteSession(
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<void> {
    await this.chatHistory.softDeleteSession(sessionId);
  }
}
