import type { ActivationRule } from "../toggle/rule.js";
import type { Evaluator } from "./strategy.js";

const HH_MM = /^(\d{2}):(\d{2})$/;

function parseHHMM(raw: string): number | null {
  const match = HH_MM.exec(raw.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

/** Minutes since midnight for `date`, read in `timeZone` (undefined = the runtime's own zone) —
 * `Intl.DateTimeFormat` (built into Node/V8, no dependency) resolves the absolute instant `date`
 * represents into that zone's wall-clock time. */
function minutesOfDay(date: Date, timeZone: string | undefined): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  return hour * 60 + minute;
}

/**
 * Matches a "HH:mm-HH:mm" 24h daily window against the current time. Needs no key — it reads the
 * clock instead. An overnight window (start > end, e.g. "22:00-06:00") wraps past midnight.
 */
export class TimeWindowEvaluator implements Evaluator {
  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly timeZone?: string,
  ) {}

  evaluate(rule: ActivationRule, _key: string | undefined): boolean {
    const dashIndex = rule.value.indexOf("-");
    if (dashIndex === -1) {
      return false;
    }
    const start = parseHHMM(rule.value.slice(0, dashIndex));
    const end = parseHHMM(rule.value.slice(dashIndex + 1));
    if (start === null || end === null) {
      return false;
    }

    const nowMinutes = minutesOfDay(this.now(), this.timeZone);
    if (start <= end) {
      return nowMinutes >= start && nowMinutes < end;
    }
    // Overnight window, e.g. 22:00-06:00.
    return nowMinutes >= start || nowMinutes < end;
  }
}
