import { describe, expect, it } from "vitest";
import { timeAgo } from "./timeAgo";

const NOW = new Date("2026-09-28T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60_000;

describe("timeAgo", () => {
  it.each([
    [0, "just now"],
    [59_999, "just now"],
    [MIN, "1 min ago"],
    [59 * MIN, "59 min ago"],
    [60 * MIN, "1 h ago"],
    [23 * 60 * MIN + 59 * MIN, "23 h ago"],
  ])("%i ms ago reads %j", (ms, text) => {
    expect(timeAgo(ago(ms), NOW)).toBe(text);
  });
});
