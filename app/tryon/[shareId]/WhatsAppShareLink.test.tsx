import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import WhatsAppShareLink, { whatsAppShareUrl } from "./WhatsAppShareLink";

const PATH = "/tryon/Zm9vYmFyYmF6cXV4MTIzNA";

describe("whatsAppShareUrl", () => {
  it("puts the message and the link in wa.me's text, encoded", () => {
    expect(whatsAppShareUrl("Shirt & Tie?", "https://mirror.example/tryon/abc")).toBe(
      "https://wa.me/?text=Shirt%20%26%20Tie%3F%20https%3A%2F%2Fmirror.example%2Ftryon%2Fabc",
    );
  });
});

describe("WhatsAppShareLink", () => {
  it("links to WhatsApp with this page's full address and the product name", () => {
    render(<WhatsAppShareLink path={PATH} productName="Linen Shirt" />);
    const link = screen.getByRole("link", { name: "Share on WhatsApp" });
    const text = new URL(link.getAttribute("href") ?? "").searchParams.get("text");
    expect(link.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(text).toBe(`See this Linen Shirt try-on on Mirror AI: ${window.location.origin}${PATH}`);
  });

  it("opens in a new tab that can't control this page or see its address", () => {
    render(<WhatsAppShareLink path={PATH} productName="Linen Shirt" />);
    const link = screen.getByRole("link", { name: "Share on WhatsApp" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders nothing on the server, where there is no page address (and no window)", () => {
    expect(renderToString(<WhatsAppShareLink path={PATH} productName="Linen Shirt" />)).toBe("");
  });
});
