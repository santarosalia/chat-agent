import { Controller, Delete, HttpCode, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ChatHistoryService } from './chat-history.service';

@ApiTags('v1')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly chatHistory: ChatHistoryService) {}

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
