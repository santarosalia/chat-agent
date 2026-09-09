import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { END, START, StateGraph, Annotation } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { ChatMessageDto } from './dto/chat-message.dto';

const ChatState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  response: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
});

export type ChatGraphState = typeof ChatState.State;

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

export function createChatGraph(model: ChatOpenAI) {
  const graph = new StateGraph(ChatState)
    .addNode('llm', async (state: ChatGraphState) => {
      const result = await model.invoke(state.messages);
      const content =
        typeof result.content === 'string'
          ? result.content
          : JSON.stringify(result.content);
      return { response: content };
    })
    .addEdge(START, 'llm')
    .addEdge('llm', END);

  return graph.compile();
}
