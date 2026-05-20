export type CliUsageLimitDetection =
  | { limited: false }
  | { limited: true; kind: 'usage' | 'rate'; retryAvailableAt?: string; retryLabel?: string };

export interface CliUsageLimitState {
  retryAvailableAt?: string;
  retryLabel?: string;
  retryReady?: boolean;
}

const USAGE_LIMIT_PATTERNS = [
  /\bhit (?:your )?(?:usage )?limits?\b/i,
  /\busage limits?.*(?:reached|exceeded|try again)\b/i,
  /\b(?:quota|limit) (?:reached|exceeded)\b/i,
  /\b(?:reached|exceeded) (?:your )?(?:usage )?(?:limit|quota)\b/i,
];

const RATE_LIMIT_PATTERNS = [
  /\brate limits?.*(?:reached|exceeded|try again|later)\b/i,
  /\brate limited\b/i,
];

const RETRY_TIME_PATTERNS = [
  /\btry again at\s+(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)\b/i,
  /\bresets?(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)\b/i,
];

function parseMeridiemTime(content: string, now: Date): { retryAvailableAt: string; retryLabel: string } | undefined {
  const match = RETRY_TIME_PATTERNS.map(pattern => pattern.exec(content)).find(Boolean);
  if (!match) return undefined;

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3].replace(/\./g, '').toUpperCase();

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return undefined;
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return undefined;

  if (meridiem === 'AM') {
    if (hour === 12) hour = 0;
  } else if (meridiem === 'PM') {
    if (hour !== 12) hour += 12;
  } else {
    return undefined;
  }

  const retryAt = new Date(now);
  retryAt.setHours(hour, minute, 0, 0);
  if (retryAt.getTime() < now.getTime() && hour < 12 && now.getHours() >= 12) {
    retryAt.setDate(retryAt.getDate() + 1);
  }

  return {
    retryAvailableAt: retryAt.toISOString(),
    retryLabel: match[0].replace(/^(?:try again at|resets?(?:\s+at)?)\s+/i, '').trim(),
  };
}

export function detectCliUsageLimit(content: string, now = new Date()): CliUsageLimitDetection {
  if (RATE_LIMIT_PATTERNS.some(pattern => pattern.test(content))) {
    const retry = parseMeridiemTime(content, now);
    return retry ? { limited: true, kind: 'rate', ...retry } : { limited: false };
  }
  if (USAGE_LIMIT_PATTERNS.some(pattern => pattern.test(content))) {
    const retry = parseMeridiemTime(content, now);
    return retry ? { limited: true, kind: 'usage', ...retry } : { limited: false };
  }
  return { limited: false };
}

export function detectCliUsageLimitState(content: string, now = new Date()): CliUsageLimitState | undefined {
  const detection = detectCliUsageLimit(content, now);
  if (!detection.limited) return undefined;
  const retryMs = detection.retryAvailableAt ? Date.parse(detection.retryAvailableAt) : NaN;
  return {
    retryAvailableAt: detection.retryAvailableAt,
    retryLabel: detection.retryLabel,
    retryReady: Number.isFinite(retryMs) ? retryMs <= now.getTime() : false,
  };
}

export function usageLimitStateKey(state?: CliUsageLimitState): string {
  return state ? JSON.stringify(state) : '';
}

export function staleRetryReadyUsageLimitKey(content: string, now = new Date()): string {
  const state = detectCliUsageLimitState(content, now);
  return state?.retryReady ? usageLimitStateKey(state) : '';
}
