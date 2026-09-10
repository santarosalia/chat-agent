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

  @ApiProperty({ example: 'What is in the employee handbook?' })
  @IsString()
  @MinLength(1)
  content!: string;
}
