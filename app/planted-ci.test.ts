// PLANTED: temporary failing test to prove CI turns red (task 13). Removed in the next commit.
import { expect, it } from "vitest";

it("fails on purpose so CI goes red", () => {
  expect(1 + 1).toBe(3);
});
