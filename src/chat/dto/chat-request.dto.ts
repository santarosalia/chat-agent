import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ChatMessageDto } from './chat-message.dto';

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

  @ApiPropertyOptional({
    description: 'RAG document group; falls back to RAG_GROUP_ID when omitted',
    example: 'hr-docs',
  })
  @IsOptional()
  @IsString()
  group_id?: string;
}
