import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok', description: '서비스 생존(liveness) 상태' })
  status!: string;
}
