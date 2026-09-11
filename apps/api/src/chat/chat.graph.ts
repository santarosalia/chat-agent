import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { END, START, StateGraph, Annotation } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { ChatHistoryService } from '../chat-history/chat-history.service';
import { injectRetrievedContext } from '../rag/rag-context.injector';
import { RagRetrieveClient } from '../rag/rag-retrieve.client';
import { RagRetrieveResult } from '../rag/rag.types';
import { truncateMessagesForLlm } from './context-truncate';
import { ChatMessageDto, ChatRole } from './dto/chat-message.dto';
import { DEFAULT_RAG_TOP_K } from './dto/chat-request.dto';
import { formatLlmRequestLog } from './llm-request-log';
import { RetrieveQueryRewriter } from './retrieve-query-rewriter.service';

const emptyRetrieval = (): RagRetrieveResult => ({
  ragUsed: false,
  citations: [],
  contextBlock: null,
});

const ChatState = Annotation.Root({
  requestMessages: Annotation<ChatMessageDto[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  sessionId: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  groupId: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  topK: Annotation<number>({
    reducer: (_, next) => next,
    default: () => DEFAULT_RAG_TOP_K,
  }),
  historyEnabled: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
  conversation: Annotation<ChatMessageDto[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  retrieveQuery: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  retrieval: Annotation<RagRetrieveResult>({
    reducer: (_, next) => next,
    default: () => emptyRetrieval(),
  }),
  truncatedMessages: Annotation<ChatMessageDto[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  response: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
});

export type ChatGraphState = typeof ChatState.State;

export interface ChatGraphDeps {
  model: ChatOpenAI;
  ragClient: RagRetrieveClient;
  chatHistory: Pick<ChatHistoryService, 'listActiveMessages'>;
  queryRewriter: Pick<RetrieveQueryRewriter, 'rewrite'>;
  config: ConfigService;
}

export interface ChatGraphOptions {
  includeLlm?: boolean;
}

export function toLangChainMessages(messages: ChatMessageDto[]): BaseMessage[] {
  return messages.map((message) => {
    switch (message.role) {
      case 'system':
        return new SystemMessage(message.content);
      case 'assistant':
        return new AIMessage(message.content);
      case 'user':
      default:
        return new HumanMessage(message.content);
    }
  });
}

export function getLastUserMessage(
  messages: ChatMessageDto[],
): ChatMessageDto | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === ChatRole.User) {
      return messages[i];
    }
  }
  return undefined;
}

export function llmContentToText(content: unknown): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

async function resolveConversation(
  requestMessages: ChatMessageDto[],
  sessionId: string | undefined,
  historyEnabled: boolean,
  chatHistory: Pick<ChatHistoryService, 'listActiveMessages'>,
  logger: Logger,
): Promise<ChatMessageDto[]> {
  if (!historyEnabled || !sessionId) {
    return requestMessages;
  }

  try {
    const stored = await chatHistory.listActiveMessages(sessionId);
    const incoming = getLastUserMessage(requestMessages);
    return incoming ? [...stored, incoming] : [...stored, ...requestMessages];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      `Chat history load failed; using request messages only: ${message}`,
    );
    return requestMessages;
  }
}

export function createChatGraph(
  deps: ChatGraphDeps,
  options: ChatGraphOptions = {},
) {
  const includeLlm = options.includeLlm !== false;
  const logger = new Logger('ChatGraph');

  const graph = new StateGraph(ChatState)
    .addNode('load_history', async (state: ChatGraphState) => ({
      conversation: await resolveConversation(
        state.requestMessages,
        state.sessionId,
        state.historyEnabled,
        deps.chatHistory,
        logger,
      ),
    }))
    .addNode('rewrite', async (state: ChatGraphState) => ({
      retrieveQuery: await deps.queryRewriter.rewrite(state.conversation),
    }))
    .addNode('retrieve', async (state: ChatGraphState) => ({
      retrieval: await deps.ragClient.retrieve(
        state.retrieveQuery,
        state.groupId,
        state.topK,
      ),
    }))
    .addNode('prepare', async (state: ChatGraphState) => {
      const messagesForLlm =
        state.retrieval.ragUsed && state.retrieval.contextBlock
          ? injectRetrievedContext(state.conversation, state.retrieval.contextBlock)
          : state.conversation;
      const truncatedMessages = truncateMessagesForLlm(messagesForLlm);
      logger.log(
        formatLlmRequestLog({
          model: deps.config.get<string>('VLLM_MODEL') ?? 'gpt-4o-mini',
          baseUrl: deps.config.get<string>('VLLM_BASE_URL'),
          messages: truncatedMessages,
        }),
      );
      return { truncatedMessages };
    })
    .addEdge(START, 'load_history')
    .addEdge('load_history', 'rewrite')
    .addEdge('rewrite', 'retrieve')
    .addEdge('retrieve', 'prepare');

  if (includeLlm) {
    return graph
      .addNode('llm', async (state: ChatGraphState, config) => {
        const result = await deps.model.invoke(
          toLangChainMessages(state.truncatedMessages),
          { signal: config?.signal },
        );
        return { response: llmContentToText(result.content) };
      })
      .addEdge('prepare', 'llm')
      .addEdge('llm', END)
      .compile();
  }

  return graph.addEdge('prepare', END).compile();
}
