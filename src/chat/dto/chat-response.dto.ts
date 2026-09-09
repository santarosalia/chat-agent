import { RagCitation } from '../../rag/rag.types';

export interface ChatResponseMessage {
  role: 'assistant';
  content: string;
}

export interface ChatResponseDto {
  message: ChatResponseMessage;
  rag_used: boolean;
  citations?: RagCitation[];
}
