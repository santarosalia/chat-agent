import { Module } from '@nestjs/common';
import { RagRetrieveClient } from './rag-retrieve.client';

@Module({
  providers: [RagRetrieveClient],
  exports: [RagRetrieveClient],
})
export class RagModule {}
