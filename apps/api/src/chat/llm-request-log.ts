export function formatLlmRequestLog(input: {
  model: string;
  baseUrl?: string;
  messages: Array<{ role: string; content: string }>;
}): string {
  return JSON.stringify(
    {
      event: 'llm_request',
      model: input.model,
      ...(input.baseUrl ? { base_url: input.baseUrl } : {}),
      messages: input.messages,
    },
    null,
    2,
  );
}
