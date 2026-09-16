import { Logger } from "@nestjs/common";
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
import { withAnswerSystemPrompt } from "./answer-system-prompt";
import {
  runAnswerWithRetrieveTool,
  streamAnswerWithRetrieveTool,
} from "./answer-with-retrieve-tool";
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
  evaluator: RetrieveSufficiencyEvaluatorPort;
}

export interface ChatGraphStreamCallbacks {
  onMeta?: (retrieval: RagRetrieveResult) => void;
  onDelta?: (content: string) => void;
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

export function createChatGraph(deps: ChatGraphDeps) {
  const logger = new Logger("ChatGraph");
  return new StateGraph(ChatState)
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
    .addNode("llm", async (state: ChatGraphState, config) => {
      const callbacks = config?.configurable as
        | ChatGraphStreamCallbacks
        | undefined;
      const signal = config?.signal as AbortSignal | undefined;
      const messages = toLangChainMessages(state.truncatedMessages);
      const result = callbacks?.onDelta
        ? await streamAnswerWithRetrieveTool({
            model: deps.model,
            evaluator: deps.evaluator,
            ragClient: deps.ragClient,
            messages,
            groupId: state.groupId,
            signal,
            onMeta: callbacks.onMeta ?? (() => undefined),
            onDelta: callbacks.onDelta,
          })
        : await runAnswerWithRetrieveTool({
            model: deps.model,
            evaluator: deps.evaluator,
            ragClient: deps.ragClient,
            messages,
            groupId: state.groupId,
            signal,
          });
      return {
        response: result.content,
        retrieval: result.retrieval,
      };
    })
    .addEdge(START, "load_history")
    .addEdge("load_history", "prepare")
    .addEdge("prepare", "llm")
    .addEdge("llm", END)
    .compile();
}
