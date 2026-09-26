import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// Clerk's server ClerkProvider is an async Server Component (Vitest can't render those),
// and next/font only works inside Next's compiler. Mock both; E2E covers the real thing.
vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: function ClerkProvider({ children }: { children: ReactNode }) {
    return children;
  },
}));
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-geist-sans" }),
  Geist_Mono: () => ({ variable: "font-geist-mono" }),
}));

import { ClerkProvider } from "@clerk/nextjs";
import RootLayout, { metadata } from "./layout";

type Element = ReactElement<{ children?: ReactNode; className?: string; lang?: string }>;

function renderLayout(children: ReactNode): Element {
  // Call the layout as a function and inspect the element tree (rendering <html> into jsdom isn't valid).
  return RootLayout({ children } as Parameters<typeof RootLayout>[0]) as Element;
}

describe("RootLayout", () => {
  it("renders <html lang='en'> with the font variables", () => {
    const html = renderLayout(null);
    expect(html.type).toBe("html");
    expect(html.props.lang).toBe("en");
    expect(html.props.className).toContain("font-geist-sans");
  });

  it("wraps the page in ClerkProvider inside <body>", () => {
    const page = <main>page</main>;
    const body = renderLayout(page).props.children as Element;
    expect(body.type).toBe("body");

    const provider = body.props.children as Element;
    expect(isValidElement(provider)).toBe(true);
    expect(provider.type).toBe(ClerkProvider);
    expect(provider.props.children).toBe(page);
  });

  it("keeps the Mirror AI metadata", () => {
    expect(metadata.title).toBe("Mirror AI");
  });
});
