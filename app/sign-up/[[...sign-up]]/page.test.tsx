import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Clerk's real <SignUp /> loads from Clerk's servers; E2E covers that. Here we check our page wiring.
vi.mock("@clerk/nextjs", () => ({ SignUp: () => <div data-testid="clerk-sign-up" /> }));

import SignUpPage from "./page";

describe("Sign-up page", () => {
  it("renders Clerk's SignUp component inside the page's main area", () => {
    render(<SignUpPage />);
    expect(screen.getByRole("main")).toContainElement(screen.getByTestId("clerk-sign-up"));
  });
});
