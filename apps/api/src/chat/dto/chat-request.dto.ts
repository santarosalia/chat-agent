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
    description:
      '이번 턴 메시지. session_id가 있으면 서버가 DB 히스토리를 앞에 붙이므로 보통 마지막 user 하나만 보냅니다. session_id가 없으면 이 배열이 LLM 입력입니다.',
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
    description:
      '검색할 청크 개수. group_id 유무와 관계없이 retrieve에 전달됩니다 (생략 시 기본값 5)',
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
      '클라이언트 생성 session UUID. 있으면 서버가 저장된 대화를 읽어 LLM에 붙이고, 성공 시 이번 턴을 저장합니다. 생략 시 기록 조회·저장을 건너뜁니다.',
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
