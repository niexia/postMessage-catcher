import type { JsonValue } from './protocol';

/**
 * SDKs and widgets often post a JSON-encoded *string* instead of an object.
 * Showing that as one escaped line is unreadable, so the panel detects it and
 * offers a parsed tree plus the original text.
 */

export interface JsonStringPayload {
  kind: 'json';
  value: JsonValue;
  text: string;
}

const MAX_PARSE_LENGTH = 2_000_000;

/**
 * Returns `null` when the value is not a string holding a JSON object/array.
 * Scalars (`"123"`, `"null"`) are deliberately not treated as JSON payloads.
 */
export function parseJsonString(data: JsonValue): JsonStringPayload | null {
  if (typeof data !== 'string') return null;
  if (data.length > MAX_PARSE_LENGTH) return null;

  const trimmed = data.trim();
  if (trimmed.length < 2) return null;
  const first = trimmed[0];
  if (first !== '{' && first !== '[') return null;

  try {
    const value = JSON.parse(trimmed) as JsonValue;
    if (value === null || typeof value !== 'object') return null;
    return { kind: 'json', value, text: data };
  } catch {
    return null;
  }
}
