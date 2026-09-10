import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

function parseCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN ?? 'http://localhost:3001';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: parseCorsOrigins(),
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('chat-agent')
    .setDescription(
      'RAG 기반 채팅 에이전트 API (v1). RAG는 POST /v1/retrieve만 사용하며, 최종 답변 LLM은 chat-agent에서 실행됩니다. RAG /v1/query에 위임하는 것은 범위 밖입니다(Contract A). LLM 프로토콜은 OpenAI 호환을 유지하며, 설정용 환경 변수 이름은 VLLM_* (VLLM_API_KEY, VLLM_BASE_URL, VLLM_MODEL)입니다.',
    )
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap();
