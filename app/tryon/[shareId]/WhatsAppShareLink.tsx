"use client";

import { useSyncExternalStore } from "react";

/** WhatsApp's share link: it opens the app (phone) or WhatsApp Web (computer) with the message filled in. */
export function whatsAppShareUrl(message: string, link: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${message} ${link}`)}`;
}

// The site's address only exists in the browser, so the server render has none (no env var needed).
const subscribe = () => () => {}; // the origin never changes while the page is open
const getOrigin = () => window.location.origin;
const getServerOrigin = () => null;

type Props = { path: string; productName: string };

export default function WhatsAppShareLink({ path, productName }: Props) {
  const origin = useSyncExternalStore(subscribe, getOrigin, getServerOrigin);
  if (!origin) return null; // server render: the link appears once the page is in the browser

  return (
    <a
      href={whatsAppShareUrl(`See this ${productName} try-on on Mirror AI:`, new URL(path, origin).href)}
      target="_blank"
      rel="noopener noreferrer" // the new tab can't control this page or see its private address
      className="rounded border border-black px-5 py-3 dark:border-white"
    >
      Share on WhatsApp
    </a>
  );
}
