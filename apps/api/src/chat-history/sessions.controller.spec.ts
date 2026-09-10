import { Test, TestingModule } from '@nestjs/testing';
import { ChatHistoryService } from './chat-history.service';
import { SessionsController } from './sessions.controller';

describe('SessionsController', () => {
  let controller: SessionsController;
  let chatHistory: { softDeleteSession: jest.Mock };

  beforeEach(async () => {
    chatHistory = { softDeleteSession: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionsController],
      providers: [
        { provide: ChatHistoryService, useValue: chatHistory },
      ],
    }).compile();

    controller = module.get(SessionsController);
  });

  it('DELETE always resolves without body for unknown session id', async () => {
    const sessionId = '550e8400-e29b-41d4-a716-446655440000';

    await expect(controller.deleteSession(sessionId)).resolves.toBeUndefined();
    expect(chatHistory.softDeleteSession).toHaveBeenCalledWith(sessionId);
  });
});
