/**
 * Central datetime utilities for COPE Agent
 *
 * Provides consistent timezone-aware datetime handling across all specialists.
 * Ensures local time calculations are correct (not UTC).
 */

const getTimezone = (): string =>
  process.env.TIME_ZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;

export interface DatetimeContext {
  timezone: string;
  localDate: string; // YYYY-MM-DD in local time
  localTime: string; // HH:MM in local time
  localDatetime: string; // YYYY-MM-DDTHH:MM in local time
  utcDatetime: string; // Full ISO string in UTC
  dayOfWeek: string; // Monday, Tuesday, etc.
}

/**
 * Get comprehensive datetime context for the current moment
 */
export function getDatetimeContext(): DatetimeContext {
  const now = new Date();
  const timezone = getTimezone();

  // YYYY-MM-DD format using en-CA locale (Canadian English uses ISO format)
  const localDate = now.toLocaleDateString('en-CA', { timeZone: timezone });

  // HH:MM format using en-GB locale (24-hour format)
  const localTime = now.toLocaleTimeString('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  });

  // Full weekday name
  const dayOfWeek = now.toLocaleDateString('en-US', {
    timeZone: timezone,
    weekday: 'long',
  });

  return {
    timezone,
    localDate,
    localTime,
    localDatetime: `${localDate}T${localTime}`,
    utcDatetime: now.toISOString(),
    dayOfWeek,
  };
}

/**
 * Get local date string in YYYY-MM-DD format
 *
 * Use this instead of: date.toISOString().split('T')[0]
 * which returns UTC date, not local date
 */
export function getLocalDateString(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', {
    timeZone: getTimezone(),
  });
}

/**
 * Format datetime context as a string for injection into prompts
 */
export function formatDatetimeForPrompt(): string {
  const ctx = getDatetimeContext();
  return `Current datetime: ${ctx.dayOfWeek}, ${ctx.localDate} ${ctx.localTime} (${ctx.timezone})`;
}
