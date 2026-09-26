import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Clerk's real <SignIn /> loads from Clerk's servers; E2E covers that. Here we check our page wiring.
vi.mock("@clerk/nextjs", () => ({ SignIn: () => <div data-testid="clerk-sign-in" /> }));

import SignInPage from "./page";

describe("Sign-in page", () => {
  it("renders Clerk's SignIn component inside the page's main area", () => {
    render(<SignInPage />);
    expect(screen.getByRole("main")).toContainElement(screen.getByTestId("clerk-sign-in"));
  });
});
