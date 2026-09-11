export type HttpLogFields = {
  method: string;
  path: string;
  sessionId?: string;
  userId?: string;
  groupId?: string;
  topK?: number;
};

export type HttpLogLineInput = HttpLogFields & {
  statusCode: number;
  durationMs: number;
};

export function formatHttpLogLine(input: HttpLogLineInput): string {
  const parts = [
    input.method,
    input.path,
    String(input.statusCode),
    `${input.durationMs}ms`,
  ];
  if (input.sessionId) {
    parts.push(`session_id=${input.sessionId}`);
  }
  if (input.userId) {
    parts.push(`user_id=${input.userId}`);
  }
  if (input.groupId) {
    parts.push(`group_id=${input.groupId}`);
  }
  if (input.topK != null) {
    parts.push(`top_k=${input.topK}`);
  }
  return parts.join(' ');
}

export function httpLogFieldsFromRequest(req: {
  method: string;
  url: string;
  originalUrl?: string;
  body?: unknown;
}): HttpLogFields {
  const body = isRecord(req.body) ? req.body : {};
  const fields: HttpLogFields = {
    method: req.method,
    path: req.originalUrl ?? req.url,
  };
  const sessionId = asNonEmptyString(body.session_id);
  if (sessionId) {
    fields.sessionId = sessionId;
  }
  const userId = asNonEmptyString(body.user_id);
  if (userId) {
    fields.userId = userId;
  }
  const groupId = asNonEmptyString(body.group_id);
  if (groupId) {
    fields.groupId = groupId;
  }
  const topK = asPositiveInt(body.top_k);
  if (topK != null) {
    fields.topK = topK;
  }
  return fields;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asPositiveInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
    ? value
    : undefined;
}
