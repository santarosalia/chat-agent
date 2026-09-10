import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat-request.dto';
import { ChatResponseDto, ChatResponseSchema } from './dto/chat-response.dto';

@ApiTags('v1')
@ApiExtraModels(ChatResponseSchema)
@Controller()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Send a chat message with optional RAG retrieval' })
  @ApiBody({
    type: ChatRequestDto,
    examples: {
      withTopK: {
        summary: 'With explicit top_k',
        value: {
          messages: [
            { role: 'user', content: 'What is in the employee handbook?' },
          ],
          group_id: 'hr-docs',
          top_k: 10,
        },
      },
      defaultTopK: {
        summary: 'Default top_k (5 when omitted)',
        value: {
          messages: [
            { role: 'user', content: 'What is in the employee handbook?' },
          ],
          group_id: 'hr-docs',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Assistant reply with optional RAG citations',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ChatResponseSchema) },
        examples: {
          ragUsed: {
            summary: 'RAG retrieval used',
            value: {
              message: {
                role: 'assistant',
                content:
                  'According to the handbook, employees receive 20 days of PTO annually.',
              },
              rag_used: true,
              citations: [
                {
                  filename: 'handbook.pdf',
                  page: 3,
                  snippet:
                    'Employees are entitled to 20 days of paid time off per year.',
                },
              ],
            },
          },
          ragNotUsed: {
            summary: 'RAG not used (citations omitted)',
            value: {
              message: {
                role: 'assistant',
                content: 'I can help with that based on general knowledge.',
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
}
