export function formatLlmRequestLog(input: {
  model: string;
  baseUrl?: string;
  messages: Array<{ role: string; content: string }>;
}): string {
  const header = [
    'LLM request',
    `model=${input.model}`,
    input.baseUrl ? `base_url=${input.baseUrl}` : undefined,
    `messages=${input.messages.length}`,
  ]
    .filter((part): part is string => part != null)
    .join(' ');

  const body = input.messages.map(
    (message, index) => `[${index}] ${message.role}\n${message.content}`,
  );

  return [header, ...body].join('\n');
}
