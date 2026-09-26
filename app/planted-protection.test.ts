// PLANTED: temporary failing test to prove branch protection blocks the merge (task 14). This PR is closed, never merged.
import { expect, it } from "vitest";

it("fails on purpose so the merge is blocked", () => {
  expect(1 + 1).toBe(3);
});
