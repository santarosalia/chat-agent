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

  @ApiProperty({ example: '핸드북에 따르면 직원은 연간 20일의 유급 휴가를 받습니다.' })
  content!: string;
}

export class RagCitationSchema {
  @ApiProperty({ example: 'handbook.pdf' })
  filename!: string;

  @ApiProperty({ example: 3 })
  page!: number;

  @ApiProperty({ example: '직원은 연간 20일의 유급 휴가를 받을 자격이 있습니다.' })
  snippet!: string;
}

export class ChatResponseSchema {
  @ApiProperty({ type: ChatResponseMessageSchema })
  message!: ChatResponseMessageSchema;

  @ApiProperty({ example: true, description: '이 응답에 RAG 검색이 사용되었는지 여부' })
  rag_used!: boolean;

  @ApiPropertyOptional({
    type: [RagCitationSchema],
    description: 'rag_used가 true일 때 포함; 그렇지 않으면 생략',
  })
  citations?: RagCitationSchema[];
}
