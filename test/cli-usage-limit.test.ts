import { describe, expect, it } from 'vitest';
import {
  detectCliUsageLimit,
  detectCliUsageLimitState,
  staleRetryReadyUsageLimitKey,
} from '../src/utils/cli-usage-limit.js';

describe('detectCliUsageLimit', () => {
  it('detects blocking usage and rate limit terminal output only when a retry time is present', () => {
    expect(detectCliUsageLimit(
      'You have hit your usage limit. Try again at 10:36 PM.',
      new Date(2026, 4, 19, 22, 0),
    )).toMatchObject({
      limited: true,
      kind: 'usage',
      retryLabel: '10:36 PM',
    });

    expect(detectCliUsageLimit(
      'Rate limit reached. Try again at 10:36 PM.',
      new Date(2026, 4, 19, 22, 0),
    )).toMatchObject({
      limited: true,
      kind: 'rate',
      retryLabel: '10:36 PM',
    });
  });

  it('does not treat the normal Codex percent-left prompt as a limit', () => {
    expect(detectCliUsageLimit('› 97% left')).toEqual({ limited: false });
  });

  it('does not match unrelated quota or model-switch text', () => {
    expect(detectCliUsageLimit('Update the quota documentation before release.')).toEqual({ limited: false });
    expect(detectCliUsageLimit('Explain what a usage limit means to users.')).toEqual({ limited: false });
    expect(detectCliUsageLimit('Document how the API should handle rate limits.')).toEqual({ limited: false });
    expect(detectCliUsageLimit('Usage limits reset at midnight.')).toEqual({ limited: false });
    expect(detectCliUsageLimit('Document usage limits later.')).toEqual({ limited: false });
    expect(detectCliUsageLimit('Switch to gpt-5.4-mini in the example config.')).toEqual({ limited: false });
    expect(detectCliUsageLimit('You have hit your usage limit. Try again later.')).toEqual({ limited: false });
    expect(detectCliUsageLimit('Rate limit reached. Try again later.')).toEqual({ limited: false });
    expect(detectCliUsageLimit('Heads up, you have less than 5% of your 5h limit left. Run /status for a breakdown.')).toEqual({ limited: false });
    expect(detectCliUsageLimit('Heads up, you have less than 5% of your 5-hour limit left. Run /status for a breakdown.')).toEqual({ limited: false });
    expect(detectCliUsageLimit('Approaching rate limits. Switch to gpt-5.4-mini for lower credit usage?')).toEqual({ limited: false });
  });

  it('parses the Codex retry time as local wall-clock time', () => {
    const result = detectCliUsageLimit(
      'You have hit your usage limit. Upgrade to Pro or try again at 12:11 PM',
      new Date('2026-05-19T09:00:00.000Z'),
    );

    expect(result).toMatchObject({
      limited: true,
      kind: 'usage',
      retryLabel: '12:11 PM',
    });
    expect(new Date(result.limited ? result.retryAvailableAt! : '').getHours()).toBe(12);
    expect(new Date(result.limited ? result.retryAvailableAt! : '').getMinutes()).toBe(11);
  });

  it('parses the retry time from the full Codex limit message', () => {
    const result = detectCliUsageLimit(
      "You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at 10:36 PM.",
      new Date('2026-05-19T22:00:00.000Z'),
    );

    expect(result).toMatchObject({
      limited: true,
      kind: 'usage',
      retryLabel: '10:36 PM',
    });
    expect(new Date(result.limited ? result.retryAvailableAt! : '').getHours()).toBe(22);
    expect(new Date(result.limited ? result.retryAvailableAt! : '').getMinutes()).toBe(36);
  });

  it('parses the reset time from Claude limit messages', () => {
    const result = detectCliUsageLimit(
      "You've hit your limit · resets 6:20pm (Asia/Calcutta)",
      new Date(2026, 4, 19, 17, 30),
    );

    expect(result).toMatchObject({
      limited: true,
      kind: 'usage',
      retryLabel: '6:20pm',
    });
    expect(new Date(result.limited ? result.retryAvailableAt! : '').getHours()).toBe(18);
    expect(new Date(result.limited ? result.retryAvailableAt! : '').getMinutes()).toBe(20);
  });

  it('treats an already-passed same-day retry time as immediately available', () => {
    const result = detectCliUsageLimit(
      'You have hit your usage limit. Try again at 12:11 PM',
      new Date('2026-05-19T12:20:00.000Z'),
    );

    expect(result).toMatchObject({
      limited: true,
      retryLabel: '12:11 PM',
    });
    expect(new Date(result.limited ? result.retryAvailableAt! : '').getDate()).toBe(19);
  });

  it('marks stale retry-ready limit text so a new turn can ignore old visible output', () => {
    const content = 'You have hit your usage limit. Try again at 12:11 PM';
    const now = new Date(2026, 4, 19, 12, 20);

    expect(detectCliUsageLimitState(content, now)).toMatchObject({
      retryReady: true,
      retryLabel: '12:11 PM',
    });
    expect(staleRetryReadyUsageLimitKey(content, now)).not.toBe('');
  });

  it('does not mark a future retry time as stale', () => {
    expect(staleRetryReadyUsageLimitKey(
      'You have hit your usage limit. Try again at 12:11 PM',
      new Date(2026, 4, 19, 9, 0),
    )).toBe('');
  });

  it('rolls an AM retry time to the next day when reported after noon', () => {
    const result = detectCliUsageLimit(
      'You have hit your usage limit. Try again at 12:11 AM',
      new Date('2026-05-19T23:30:00.000Z'),
    );

    expect(result).toMatchObject({
      limited: true,
      retryLabel: '12:11 AM',
    });
    expect(new Date(result.limited ? result.retryAvailableAt! : '').getDate()).toBe(20);
    expect(new Date(result.limited ? result.retryAvailableAt! : '').getHours()).toBe(0);
  });
});
