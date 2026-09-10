import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MinLength } from 'class-validator';

export enum ChatRole {
  User = 'user',
  Assistant = 'assistant',
  System = 'system',
}

export class ChatMessageDto {
  @ApiProperty({ enum: ChatRole, example: ChatRole.User })
  @IsEnum(ChatRole)
  role!: ChatRole;

  @ApiProperty({ example: '직원 핸드북에는 무엇이 있나요?' })
  @IsString()
  @MinLength(1)
  content!: string;
}
