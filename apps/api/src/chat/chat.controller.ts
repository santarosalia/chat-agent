import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat-request.dto';
import { ChatResponseDto, ChatResponseSchema } from './dto/chat-response.dto';

@ApiTags('v1')
@ApiExtraModels(ChatResponseSchema)
@Controller()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('chat')
  @ApiOperation({ summary: '선택적 RAG 검색과 함께 채팅 메시지 전송' })
  @ApiBody({
    type: ChatRequestDto,
    examples: {
      wholeCorpus: {
        summary: '전체 코퍼스 검색 (group_id 없음)',
        value: {
          messages: [
            { role: 'user', content: '직원 핸드북에는 무엇이 있나요?' },
          ],
        },
      },
      withGroupId: {
        summary: '문서 그룹 범위로 검색',
        value: {
          messages: [
            { role: 'user', content: '직원 핸드북에는 무엇이 있나요?' },
          ],
          group_id: 'hr-docs',
          top_k: 10,
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: '요청 유효성 검사 실패 (예: 빈 messages, 잘못된 top_k)',
    schema: {
      example: {
        statusCode: 400,
        message: ['top_k must not be less than 1'],
        error: 'Bad Request',
      },
    },
  })
  @ApiOkResponse({
    description: '선택적 RAG 인용(citations)이 포함된 assistant 응답',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ChatResponseSchema) },
        examples: {
          ragUsed: {
            summary: 'RAG 검색 사용',
            value: {
              message: {
                role: 'assistant',
                content:
                  '핸드북에 따르면 직원은 연간 20일의 유급 휴가를 받습니다.',
              },
              rag_used: true,
              citations: [
                {
                  filename: 'handbook.pdf',
                  page: 3,
                  snippet:
                    '직원은 연간 20일의 유급 휴가를 받을 자격이 있습니다.',
                },
              ],
            },
          },
          ragNotUsed: {
            summary: 'RAG 미사용 (citations 생략)',
            value: {
              message: {
                role: 'assistant',
                content: '일반적인 지식을 바탕으로 도와드릴 수 있습니다.',
              },
              rag_used: false,
            },
          },
        },
      },
    },
  })
  async chat(@Body() body: ChatRequestDto): Promise<ChatResponseDto> {
    return this.chatService.chat(body);
  }

  @Post('chat/stream')
  @ApiOperation({
    summary: '선택적 RAG 검색과 함께 SSE 스트리밍 채팅',
    description:
      'retrieve → inject → truncate → LLM 파이프라인은 POST /chat과 동일합니다. 이벤트 순서: meta → delta* → done (실패 시 error, done 없음).',
  })
  @ApiBody({ type: ChatRequestDto })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({
    description: 'SSE 스트림 (event: meta | delta | done | error)',
  })
  async chatStream(
    @Body() body: ChatRequestDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const abortController = new AbortController();
    const onClose = () => abortController.abort();
    req.on('close', onClose);

    try {
      await this.chatService.streamChat(
        body,
        (chunk) => {
          res.write(chunk);
        },
        abortController.signal,
      );
    } finally {
      req.off('close', onClose);
      res.end();
    }
  }
}
