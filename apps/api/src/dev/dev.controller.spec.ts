import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from '../chat/chat.service';
import { DevController } from './dev.controller';

describe('DevController', () => {
  function createModule(nodeEnv?: string) {
    return Test.createTestingModule({
      controllers: [DevController],
      providers: [
        {
          provide: ChatService,
          useValue: {
            dumpGraphMermaid: jest
              .fn()
              .mockResolvedValue('flowchart TD\n  retrieve --> evaluate'),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'NODE_ENV' ? nodeEnv : undefined),
          },
        },
      ],
    }).compile();
  }

  it('GET /dev/graph returns mermaid when not production', async () => {
    const module: TestingModule = await createModule('development');
    const controller = module.get(DevController);
    const chatService = module.get(ChatService);

    await expect(controller.graph()).resolves.toBe(
      'flowchart TD\n  retrieve --> evaluate',
    );
    expect(chatService.dumpGraphMermaid).toHaveBeenCalledTimes(1);
  });

  it('GET /dev/graph is not found in production', async () => {
    const module: TestingModule = await createModule('production');
    const controller = module.get(DevController);

    await expect(controller.graph()).rejects.toBeInstanceOf(NotFoundException);
  });
});
