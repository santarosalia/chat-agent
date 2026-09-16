import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { END, START, StateGraph, Annotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { ChatHistoryService } from "../chat-history/chat-history.service";
import { RagRetrieveClient } from "../rag/rag-retrieve.client";
import { RagRetrieveResult } from "../rag/rag.types";
import { truncateMessagesForLlm } from "./context-truncate";
import { ChatMessageDto, ChatRole } from "./dto/chat-message.dto";
import { DEFAULT_RAG_TOP_K } from "./dto/chat-request.dto";
import { withAnswerSystemPrompt } from "./answer-system-prompt";
import { runAnswerWithRetrieveTool } from "./answer-with-retrieve-tool";
import { RetrieveSufficiencyEvaluatorPort } from "./retrieve-evaluate-loop";

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
  chatHistory: Pick<ChatHistoryService, "listActiveMessages">;
  config: ConfigService;
  evaluator: RetrieveSufficiencyEvaluatorPort;
}

export interface ChatGraphOptions {
  includeLlm?: boolean;
}

export function toLangChainMessages(messages: ChatMessageDto[]): BaseMessage[] {
  return messages.map((message) => {
    switch (message.role) {
      case "system":
        return new SystemMessage(message.content);
      case "assistant":
        return new AIMessage(message.content);
      case "user":
      default:
        return new HumanMessage(message.content);
    }
  });
}

export function getLastUserMessage(
  messages: ChatMessageDto[]
): ChatMessageDto | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === ChatRole.User) {
      return messages[i];
    }
  }
  return undefined;
}

async function resolveConversation(
  requestMessages: ChatMessageDto[],
  sessionId: string | undefined,
  historyEnabled: boolean,
  chatHistory: Pick<ChatHistoryService, "listActiveMessages">,
  logger: Logger
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
      `Chat history load failed; using request messages only: ${message}`
    );
    return requestMessages;
  }
}

export function createChatGraph(
  deps: ChatGraphDeps,
  options: ChatGraphOptions = {}
) {
  const includeLlm = options.includeLlm !== false;
  const logger = new Logger("ChatGraph");
  const graph = new StateGraph(ChatState)
    .addNode("load_history", async (state: ChatGraphState) => ({
      conversation: await resolveConversation(
        state.requestMessages,
        state.sessionId,
        state.historyEnabled,
        deps.chatHistory,
        logger
      ),
    }))
    .addNode("prepare", async (state: ChatGraphState) => ({
      truncatedMessages: truncateMessagesForLlm(
        withAnswerSystemPrompt(state.conversation)
      ),
    }))
    .addEdge(START, "load_history")
    .addEdge("load_history", "prepare");

  if (includeLlm) {
    return graph
      .addNode("llm", async (state: ChatGraphState, config) => {
        const result = await runAnswerWithRetrieveTool({
          model: deps.model,
          evaluator: deps.evaluator,
          ragClient: deps.ragClient,
          messages: toLangChainMessages(state.truncatedMessages),
          groupId: state.groupId,
          signal: config?.signal as AbortSignal | undefined,
        });
        return {
          response: result.content,
          retrieval: result.retrieval,
        };
      })
      .addEdge("prepare", "llm")
      .addEdge("llm", END)
      .compile();
  }

  return graph.addEdge("prepare", END).compile();
}
