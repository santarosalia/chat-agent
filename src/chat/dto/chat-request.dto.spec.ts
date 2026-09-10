import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChatRequestDto } from './chat-request.dto';
import { ChatRole } from './chat-message.dto';

describe('ChatRequestDto', () => {
  function validateDto(body: Record<string, unknown>) {
    return validate(plainToInstance(ChatRequestDto, body));
  }

  it('passes validation without group_id', async () => {
    const errors = await validateDto({
      messages: [{ role: ChatRole.User, content: 'Hello' }],
    });

    expect(errors).toHaveLength(0);
  });

  it('passes validation with group_id and no top_k', async () => {
    const errors = await validateDto({
      messages: [{ role: ChatRole.User, content: 'Hello' }],
      group_id: 'team-a',
    });

    expect(errors).toHaveLength(0);
  });

  it('passes validation with group_id and top_k', async () => {
    const errors = await validateDto({
      messages: [{ role: ChatRole.User, content: 'Hello' }],
      group_id: 'team-a',
      top_k: 10,
    });

    expect(errors).toHaveLength(0);
  });

  it('fails validation when top_k is less than 1', async () => {
    const errors = await validateDto({
      messages: [{ role: ChatRole.User, content: 'Hello' }],
      top_k: 0,
    });

    expect(errors.some((error) => error.property === 'top_k')).toBe(true);
  });
});
