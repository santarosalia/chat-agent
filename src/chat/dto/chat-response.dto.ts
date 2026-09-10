import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RagCitation } from '../../rag/rag.types';

export interface ChatResponseMessage {
  role: 'assistant';
  content: string;
}

export interface ChatResponseDto {
  message: ChatResponseMessage;
  rag_used: boolean;
  citations?: RagCitation[];
}

export class ChatResponseMessageSchema {
  @ApiProperty({ enum: ['assistant'], example: 'assistant' })
  role!: 'assistant';

  @ApiProperty({ example: 'According to the handbook, employees receive 20 days of PTO annually.' })
  content!: string;
}

export class RagCitationSchema {
  @ApiProperty({ example: 'handbook.pdf' })
  filename!: string;

  @ApiProperty({ example: 3 })
  page!: number;

  @ApiProperty({ example: 'Employees are entitled to 20 days of paid time off per year.' })
  snippet!: string;
}

export class ChatResponseSchema {
  @ApiProperty({ type: ChatResponseMessageSchema })
  message!: ChatResponseMessageSchema;

  @ApiProperty({ example: true, description: 'Whether RAG retrieval was used for this response' })
  rag_used!: boolean;

  @ApiPropertyOptional({
    type: [RagCitationSchema],
    description: 'Present when rag_used is true; omitted otherwise',
  })
  citations?: RagCitationSchema[];
}
