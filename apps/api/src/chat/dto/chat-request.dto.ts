import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { ChatMessageDto } from './chat-message.dto';

export const DEFAULT_RAG_TOP_K = 5;

export class ChatRequestDto {
  @ApiProperty({
    type: [ChatMessageDto],
    description: '대화 기록; 최소 한 개의 메시지가 필요합니다',
    example: [{ role: 'user', content: '직원 핸드북에는 무엇이 있나요?' }],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @ApiPropertyOptional({
    description:
      'RAG 문서 그룹; 생략 시 전체 문서 검색 (retrieve 요청에 group_id 미포함)',
    example: 'hr-docs',
  })
  @IsOptional()
  @IsString()
  group_id?: string;

  @ApiPropertyOptional({
    description: '검색할 청크 개수 (생략 시 기본값 5)',
    example: 5,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  top_k?: number;

  @ApiPropertyOptional({
    description:
      '클라이언트 생성 session UUID. 생략 시 채팅 기록 영속화를 건너뜁니다.',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  session_id?: string;

  @ApiPropertyOptional({
    description:
      '선택적 사용자 식별자(문자열, FK 없음). 첫 append 시 제공되면 세션에 고정됩니다.',
    example: 'user-abc-123',
  })
  @IsOptional()
  @IsString()
  user_id?: string;
}
