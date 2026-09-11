import { Test, TestingModule } from '@nestjs/testing';
import { ChatHistoryService } from './chat-history.service';
import { SessionsController } from './sessions.controller';

describe('SessionsController', () => {
  let controller: SessionsController;
  let chatHistory: { softDeleteSession: jest.Mock; getSession: jest.Mock };

  beforeEach(async () => {
    chatHistory = {
      softDeleteSession: jest.fn().mockResolvedValue(undefined),
      getSession: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionsController],
      providers: [
        { provide: ChatHistoryService, useValue: chatHistory },
      ],
    }).compile();

    controller = module.get(SessionsController);
  });

  it('GET returns session history from the service', async () => {
    const sessionId = '550e8400-e29b-41d4-a716-446655440000';
    const history = {
      session_id: sessionId,
      user_id: null,
      messages: [{ role: 'user' as const, content: 'Hello' }],
    };
    chatHistory.getSession.mockResolvedValue(history);

    await expect(controller.getSession(sessionId)).resolves.toEqual(history);
    expect(chatHistory.getSession).toHaveBeenCalledWith(sessionId);
  });

  it('DELETE always resolves without body for unknown session id', async () => {
    const sessionId = '550e8400-e29b-41d4-a716-446655440000';

    await expect(controller.deleteSession(sessionId)).resolves.toBeUndefined();
    expect(chatHistory.softDeleteSession).toHaveBeenCalledWith(sessionId);
  });
});
