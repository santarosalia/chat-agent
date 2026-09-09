import { IsEnum, IsString, MinLength } from 'class-validator';

export enum ChatRole {
  User = 'user',
  Assistant = 'assistant',
  System = 'system',
}

export class ChatMessageDto {
  @IsEnum(ChatRole)
  role!: ChatRole;

  @IsString()
  @MinLength(1)
  content!: string;
}
