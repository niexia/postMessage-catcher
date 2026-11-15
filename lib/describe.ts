import { MARKER, type JsonValue } from './protocol';

/** Field names that conventionally carry a message's discriminator. */
const TYPE_FIELDS = ['type', 'action', 'event', 'method', 'command', 'kind', 'name'] as const;

const TYPE_MAX = 48;

export function isMarker(value: JsonValue): value is { [key: string]: JsonValue } & {
  [MARKER]: string;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)[MARKER] === 'string'
  );
}

/**
 * Best-effort message type for the list column. Returns `null` when the payload
 * has no obvious discriminator, so the UI can fall back to the value's shape.
 */
export function describeType(data: JsonValue): string | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  if (isMarker(data)) return null;
  for (const field of TYPE_FIELDS) {
    const value = (data as Record<string, JsonValue>)[field];
    if (typeof value === 'string' && value.trim() !== '') {
      const trimmed = value.trim();
      return trimmed.length > TYPE_MAX ? `${trimmed.slice(0, TYPE_MAX)}…` : trimmed;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

/** Short single-line preview used in the message list. */
export function previewOf(data: JsonValue, limit = 120): string {
  let text: string;
  try {
    text = JSON.stringify(data);
  } catch {
    text = String(data);
  }
  if (text === undefined) return 'undefined';
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > limit ? `${oneLine.slice(0, limit)}…` : oneLine;
}

/** Human label for the value's shape, used when no type field exists. */
export function shapeOf(data: JsonValue): string {
  if (data === null) return 'null';
  if (Array.isArray(data)) return `Array(${data.length})`;
  if (isMarker(data)) return String(data[MARKER]);
  return typeof data === 'string' ? 'string' : typeof data === 'object' ? 'Object' : typeof data;
}

/**
 * The panel's primary label for a message: a discriminator when there is one,
 * otherwise `<Shape>`.
 */
export function labelOf(data: JsonValue): string {
  return describeType(data) ?? `<${shapeOf(data)}>`;
}
