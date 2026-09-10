import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ChatMessageDto } from './chat-message.dto';

export const DEFAULT_RAG_TOP_K = 5;

export class ChatRequestDto {
  @ApiProperty({
    type: [ChatMessageDto],
    description: 'Conversation history; at least one message is required',
    example: [{ role: 'user', content: 'What is in the employee handbook?' }],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @ApiProperty({
    description: 'RAG document group for retrieval',
    example: 'hr-docs',
  })
  @IsString()
  @MinLength(1)
  group_id!: string;

  @ApiPropertyOptional({
    description: 'Number of chunks to retrieve (default 5 when omitted)',
    example: 5,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  top_k?: number;
}
