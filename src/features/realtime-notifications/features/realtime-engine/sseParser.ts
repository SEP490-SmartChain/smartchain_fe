import {
  type InAppNotificationDto,
  type RealtimeCategory,
  type RealtimeParams,
  type RealtimePrimitive,
  type RealtimeSeverity,
  type RealtimeUiSyncPayload,
  type SseConnectedEvent,
  type SseEnvelope,
  type SseHeartbeatEvent,
  type SseNotificationEvent,
  type SseUiSyncEvent,
} from '../../shared';

export interface SseFrame {
  readonly id?: string;
  readonly event: string;
  readonly data: string;
  readonly retry?: number;
}

export interface SseFrameParser {
  feed(chunk: string): void;
  flush(): void;
  getLastEventId(): string | null;
}

const VALID_CATEGORIES = new Set<RealtimeCategory>([
  'INBOUND',
  'OUTBOUND',
  'SHIPMENT',
  'INVENTORY',
  'ORDER',
  'COMMERCIAL',
  'FINANCE',
  'CLAIM',
  'SYSTEM',
]);

const VALID_SEVERITIES = new Set<RealtimeSeverity>(['INFO', 'SUCCESS', 'WARNING', 'CRITICAL']);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRealtimePrimitive(value: unknown): value is RealtimePrimitive {
  if (value === null) {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  return typeof value === 'string' || typeof value === 'boolean';
}

function sanitizeParams(value: unknown): RealtimeParams {
  if (!isPlainRecord(value)) {
    return {};
  }
  const result: Record<string, RealtimePrimitive> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isRealtimePrimitive(entry)) {
      result[key] = entry;
    }
  }
  return result;
}

function parseNotificationDto(value: unknown): InAppNotificationDto | null {
  if (!isPlainRecord(value)) {
    return null;
  }
  const {
    id,
    dedupKey,
    topic,
    category,
    severity,
    titleKey,
    bodyKey,
    params,
    targetPath,
    resourceType,
    resourceId,
    createdAt,
    isRead,
    readAt,
  } = value;

  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    typeof topic !== 'string' ||
    topic.length === 0 ||
    typeof titleKey !== 'string' ||
    typeof bodyKey !== 'string' ||
    typeof createdAt !== 'string' ||
    typeof isRead !== 'boolean'
  ) {
    return null;
  }

  const normalizedCategory: RealtimeCategory =
    typeof category === 'string' && VALID_CATEGORIES.has(category as RealtimeCategory)
      ? (category as RealtimeCategory)
      : 'SYSTEM';

  const normalizedSeverity: RealtimeSeverity =
    typeof severity === 'string' && VALID_SEVERITIES.has(severity as RealtimeSeverity)
      ? (severity as RealtimeSeverity)
      : 'INFO';

  return {
    id,
    dedupKey: typeof dedupKey === 'string' ? dedupKey : id,
    topic,
    category: normalizedCategory,
    severity: normalizedSeverity,
    titleKey,
    bodyKey,
    params: sanitizeParams(params),
    targetPath: typeof targetPath === 'string' ? targetPath : '/',
    resourceType: typeof resourceType === 'string' ? resourceType : '',
    resourceId: typeof resourceId === 'string' ? resourceId : null,
    createdAt,
    isRead,
    readAt: typeof readAt === 'string' ? readAt : null,
  };
}

function parseUiSyncPayload(value: unknown): RealtimeUiSyncPayload | null {
  if (!isPlainRecord(value)) {
    return null;
  }
  const { topic, syncAreas, resourceType, resourceId, status, occurredAt, meta } = value;
  if (
    typeof topic !== 'string' ||
    topic.length === 0 ||
    !Array.isArray(syncAreas) ||
    typeof resourceType !== 'string' ||
    typeof occurredAt !== 'string'
  ) {
    return null;
  }

  const normalizedAreas = syncAreas.filter(
    (area): area is string => typeof area === 'string' && area.length > 0,
  );
  if (normalizedAreas.length !== syncAreas.length) {
    return null;
  }

  return {
    topic,
    syncAreas: normalizedAreas,
    resourceType,
    resourceId: typeof resourceId === 'string' ? resourceId : null,
    ...(typeof status === 'string' || status === null ? { status } : {}),
    occurredAt,
    ...(isPlainRecord(meta) ? { meta: sanitizeParams(meta) } : {}),
  };
}

/**
 * Creates an incremental WHATWG-compatible SSE frame parser supporting
 * arbitrary chunk splits across `\r\n`, `\n`, and `\r`, comments, `event:`,
 * `id:`, `retry:`, and multi-line `data:` fields joined by `\n`.
 */
export function createSseFrameParser(onFrame: (frame: SseFrame) => void): SseFrameParser {
  let buffer = '';
  let hasStarted = false;
  let eventType = 'message';
  let dataLines: string[] = [];
  let frameId: string | undefined;
  let retryMs: number | undefined;
  let lastEventId: string | null = null;

  const resetFrameFields = () => {
    eventType = 'message';
    dataLines = [];
    frameId = undefined;
    retryMs = undefined;
  };

  const dispatchFrame = () => {
    if (dataLines.length === 0) {
      resetFrameFields();
      return;
    }

    const frame: SseFrame = {
      ...(frameId !== undefined ? { id: frameId } : {}),
      event: eventType || 'message',
      data: dataLines.join('\n'),
      ...(retryMs !== undefined ? { retry: retryMs } : {}),
    };
    resetFrameFields();
    onFrame(frame);
  };

  const processLine = (line: string) => {
    if (line === '') {
      dispatchFrame();
      return;
    }

    if (line.startsWith(':')) {
      return;
    }

    const colonIndex = line.indexOf(':');
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
    let value = colonIndex === -1 ? '' : line.slice(colonIndex + 1);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }

    switch (field) {
      case 'event':
        eventType = value;
        break;
      case 'data':
        dataLines.push(value);
        break;
      case 'id':
        if (!value.includes('\0')) {
          lastEventId = value;
          frameId = value;
        }
        break;
      case 'retry':
        if (/^\d+$/.test(value)) {
          retryMs = Number(value);
        }
        break;
      default:
        break;
    }
  };

  const consumeBuffer = (isEof: boolean) => {
    let lineStart = 0;
    let index = 0;

    while (index < buffer.length) {
      const char = buffer[index];
      if (char === '\n') {
        processLine(buffer.slice(lineStart, index));
        index += 1;
        lineStart = index;
      } else if (char === '\r') {
        if (index + 1 < buffer.length) {
          processLine(buffer.slice(lineStart, index));
          index += buffer[index + 1] === '\n' ? 2 : 1;
          lineStart = index;
        } else if (isEof) {
          processLine(buffer.slice(lineStart, index));
          index += 1;
          lineStart = index;
        } else {
          // Wait for the next chunk to determine if `\r` is part of `\r\n`.
          break;
        }
      } else {
        index += 1;
      }
    }

    buffer = buffer.slice(lineStart);
  };

  return {
    feed(chunk: string) {
      if (!chunk) {
        return;
      }
      let normalized = chunk;
      if (!hasStarted) {
        hasStarted = true;
        if (normalized.startsWith('\uFEFF')) {
          normalized = normalized.slice(1);
        }
      }
      buffer += normalized;
      consumeBuffer(false);
    },
    flush() {
      consumeBuffer(true);
      buffer = '';
      resetFrameFields();
    },
    getLastEventId() {
      return lastEventId;
    },
  };
}

/**
 * Parses a complete SSE text payload or pre-split line array into frames.
 */
export function parseSseLines(input: string | readonly string[]): SseFrame[] {
  const frames: SseFrame[] = [];
  const parser = createSseFrameParser((frame) => {
    frames.push(frame);
  });

  if (typeof input === 'string') {
    parser.feed(input);
    parser.flush();
    return frames;
  }

  for (const line of input) {
    parser.feed(`${line}\n`);
  }
  parser.flush();
  return frames;
}

/**
 * Safely parses an `SseFrame` into a typed `SseEnvelope`, returning `null`
 * for malformed JSON or unrecognized/invalid payloads.
 */
export function parseSseEnvelope(frame: SseFrame): SseEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(frame.data);
  } catch {
    return null;
  }

  if (!isPlainRecord(parsed)) {
    return null;
  }

  const envelopeType = typeof parsed.type === 'string' ? parsed.type : frame.event;

  switch (envelopeType) {
    case 'connected': {
      if (
        typeof parsed.serverTime !== 'string' ||
        typeof parsed.unreadCount !== 'number' ||
        !Number.isFinite(parsed.unreadCount)
      ) {
        return null;
      }
      const event: SseConnectedEvent = {
        type: 'connected',
        serverTime: parsed.serverTime,
        unreadCount: Math.max(0, parsed.unreadCount),
      };
      return event;
    }
    case 'heartbeat': {
      if (typeof parsed.serverTime !== 'string') {
        return null;
      }
      const event: SseHeartbeatEvent = {
        type: 'heartbeat',
        serverTime: parsed.serverTime,
      };
      return event;
    }
    case 'notification': {
      const notification = parseNotificationDto(parsed.notification);
      if (!notification) {
        return null;
      }
      const uiSync = parsed.uiSync !== undefined ? parseUiSyncPayload(parsed.uiSync) : null;
      const event: SseNotificationEvent = {
        type: 'notification',
        notification,
        ...(uiSync ? { uiSync } : {}),
      };
      return event;
    }
    case 'ui_sync': {
      const uiSync =
        parsed.uiSync !== undefined
          ? parseUiSyncPayload(parsed.uiSync)
          : parseUiSyncPayload(parsed);
      if (!uiSync) {
        return null;
      }
      const event: SseUiSyncEvent = {
        type: 'ui_sync',
        uiSync,
      };
      return event;
    }
    default:
      return null;
  }
}

/**
 * Convenience parser combining frame extraction with safe JSON envelope decoding.
 */
export function createSseEnvelopeParser(
  onEnvelope: (envelope: SseEnvelope, frame: SseFrame) => void,
  onInvalidFrame?: (frame: SseFrame) => void,
): SseFrameParser {
  return createSseFrameParser((frame) => {
    const envelope = parseSseEnvelope(frame);
    if (envelope) {
      onEnvelope(envelope, frame);
    } else {
      onInvalidFrame?.(frame);
    }
  });
}
