import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RagCitationSchema } from '../../chat/dto/chat-response.dto';

export class SessionHistoryUserMessageSchema {
  @ApiProperty({ enum: ['user'], example: 'user' })
  role!: 'user';

  @ApiProperty({ example: '직원 핸드북에는 무엇이 있나요?' })
  content!: string;
}

export class SessionHistoryAssistantMessageSchema {
  @ApiProperty({ enum: ['assistant'], example: 'assistant' })
  role!: 'assistant';

  @ApiProperty({ example: '핸드북에 따르면 연차는 20일입니다.' })
  content!: string;

  @ApiProperty({ example: true })
  rag_used!: boolean;

  @ApiPropertyOptional({ type: [RagCitationSchema] })
  citations?: RagCitationSchema[];
}

export class SessionHistorySchema {
  @ApiProperty({ format: 'uuid' })
  session_id!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'user-abc-123',
  })
  user_id!: string | null;

  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [
        { $ref: '#/components/schemas/SessionHistoryUserMessageSchema' },
        { $ref: '#/components/schemas/SessionHistoryAssistantMessageSchema' },
      ],
    },
  })
  messages!: Array<
    SessionHistoryUserMessageSchema | SessionHistoryAssistantMessageSchema
  >;
}
