import { Logger } from "@nestjs/common";
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { END, START, StateGraph, Annotation } from "@langchain/langgraph";
import { ChatHistoryService } from "../chat-history/chat-history.service";
import { truncateMessagesForLlm } from "./context-truncate";
import { ChatMessageDto, ChatRole } from "./dto/chat-message.dto";
import { withAnswerSystemPrompt } from "./answer-system-prompt";

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
  truncatedMessages: Annotation<ChatMessageDto[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
});

export type ChatGraphState = typeof ChatState.State;

export interface ChatGraphDeps {
  chatHistory: Pick<ChatHistoryService, "listActiveMessages">;
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
    .addEdge(START, "load_history")
    .addEdge("load_history", "prepare")
    .addEdge("prepare", END)
    .compile();
}
