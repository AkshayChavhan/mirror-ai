import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GIVE_UP_AFTER_MS,
  MAX_ERRORS_IN_A_ROW,
  POLL_MS,
  REQUEST_TIMEOUT_MS,
  SLOW_AFTER_MS,
  interpretStatus,
  useTryOnStatus,
} from "./useTryOnStatus";

// A fake fetch and fake timers: no server, and minutes of polling run instantly.
const ID = "65f0c0ffee0000000000abcd";
const SHARE = "Zm9vYmFyYmF6cXV4MTIzNA";
const fetchMock = vi.fn();
const reply = (status: number, body: unknown) => ({ status, json: async () => body });
const status = (s: string, extra: Record<string, unknown> = {}) => reply(200, { status: s, resultUrl: null, errorMessage: null, shareId: SHARE, ...extra });

async function flush() {
  await act(async () => {}); // let the pending fetch and state updates finish
}
async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useTryOnStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("does nothing without a try-on to watch", () => {
    const { result } = renderHook(() => useTryOnStatus(null));
    expect(result.current).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts as 'waiting' and asks the status endpoint right away, never from a cache", async () => {
    fetchMock.mockResolvedValue(status("PENDING"));
    const { result } = renderHook(() => useTryOnStatus(ID));
    expect(result.current).toEqual({ kind: "waiting", status: "PENDING", slow: false });
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(`/api/tryon/${ID}/status`, expect.objectContaining({ cache: "no-store" }));
  });

  it("follows PENDING → PROCESSING → DONE every few seconds, then stops asking", async () => {
    fetchMock
      .mockResolvedValueOnce(status("PENDING"))
      .mockResolvedValueOnce(status("PROCESSING"))
      .mockResolvedValueOnce(status("DONE", { resultUrl: "https://res.cloudinary.com/demo/image/upload/r.png" }));
    const { result } = renderHook(() => useTryOnStatus(ID));
    await flush();
    expect(result.current).toEqual({ kind: "waiting", status: "PENDING", slow: false });
    await wait(POLL_MS);
    expect(result.current).toEqual({ kind: "waiting", status: "PROCESSING", slow: false });
    await wait(POLL_MS);
    expect(result.current).toEqual({ kind: "done", shareId: SHARE });
    await wait(POLL_MS * 4);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reports a FAILED try-on with its message, and stops asking", async () => {
    fetchMock.mockResolvedValue(status("FAILED", { errorMessage: "Try-on is busy right now. Please try again later." }));
    const { result } = renderHook(() => useTryOnStatus(ID));
    await flush();
    expect(result.current).toEqual({ kind: "failed", message: "Try-on is busy right now. Please try again later." });
    await wait(POLL_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps asking through a server hiccup", async () => {
    fetchMock.mockResolvedValueOnce(reply(500, { error: "x" })).mockResolvedValueOnce(status("PROCESSING"));
    const { result } = renderHook(() => useTryOnStatus(ID));
    await flush();
    expect(result.current).toEqual({ kind: "waiting", status: "PENDING", slow: false }); // unchanged, not an error
    await wait(POLL_MS);
    expect(result.current).toEqual({ kind: "waiting", status: "PROCESSING", slow: false });
  });

  it(`gives up after ${MAX_ERRORS_IN_A_ROW} network errors in a row, pointing to the history page`, async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useTryOnStatus(ID));
    await flush();
    await wait(POLL_MS * (MAX_ERRORS_IN_A_ROW - 1));
    expect(result.current).toEqual({
      kind: "lost",
      message: "We couldn't check your try-on. It will be in your history when it's ready.",
    });
    await wait(POLL_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ERRORS_IN_A_ROW);
  });

  it("gives a hung request up after 10 s and asks again, so one stuck request can't stop polling", async () => {
    // The first request never answers (until it's cancelled); the next one does.
    fetchMock
      .mockImplementationOnce(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
      )
      .mockResolvedValue(status("PROCESSING"));
    const { result } = renderHook(() => useTryOnStatus(ID));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await wait(REQUEST_TIMEOUT_MS + POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual({ kind: "waiting", status: "PROCESSING", slow: false });
  });

  it("says it's slow after a minute, and gives up after 5 minutes", async () => {
    fetchMock.mockResolvedValue(status("PROCESSING"));
    const { result } = renderHook(() => useTryOnStatus(ID));
    await flush();
    await wait(SLOW_AFTER_MS);
    expect(result.current).toEqual({ kind: "waiting", status: "PROCESSING", slow: true });
    await wait(GIVE_UP_AFTER_MS - SLOW_AFTER_MS);
    expect(result.current).toMatchObject({ kind: "lost", message: expect.stringContaining("taking much longer than usual") });
    const calls = fetchMock.mock.calls.length;
    await wait(POLL_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(calls); // stopped
  });

  it("stops asking when the screen closes", async () => {
    fetchMock.mockResolvedValue(status("PENDING"));
    const { unmount } = renderHook(() => useTryOnStatus(ID));
    await flush();
    unmount();
    await wait(POLL_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("starts again from 'waiting' for a new try-on id", async () => {
    fetchMock.mockResolvedValueOnce(status("FAILED")).mockResolvedValue(status("PENDING"));
    const { result, rerender } = renderHook(({ id }) => useTryOnStatus(id), { initialProps: { id: ID } });
    await flush();
    expect(result.current?.kind).toBe("failed");
    const next = "65f0c0ffee0000000000abce";
    rerender({ id: next });
    expect(result.current).toEqual({ kind: "waiting", status: "PENDING", slow: false });
    await flush();
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/tryon/${next}/status`, expect.any(Object));
  });
});

describe("interpretStatus", () => {
  it.each([
    ["401 (signed out)", 401, {}, { kind: "lost", message: "Your session ended. Sign in again to see your try-on in your history." }],
    ["404 (missing, expired, or not yours)", 404, {}, { kind: "lost", message: "We couldn't find that try-on." }],
    ["500", 500, { error: "x" }, "retry"],
    ["an odd reply", 200, { hello: 1 }, "retry"],
    ["an unknown status", 200, { status: "WHATEVER" }, "retry"],
    ["FAILED without a message", 200, { status: "FAILED", errorMessage: null }, { kind: "failed", message: "This try-on didn't work." }],
    ["DONE without a share token", 200, { status: "DONE", shareId: null }, { kind: "lost", message: "Your try-on is ready. Find it in your history." }],
  ])("%s", (_case, httpStatus, body, expected) => {
    expect(interpretStatus(httpStatus, body)).toEqual(expected);
  });
});
