import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CameraCapture, { CAMERA_STOPPED, cameraErrorMessage, coverCrop } from "./CameraCapture";

// jsdom has no camera, video playback or canvas drawing, so those are faked here. No real camera is used.
/** A camera track that can fire "ended" like a real one (unplugged, access turned off). New for each test. */
const newTrack = () => Object.assign(new EventTarget(), { stop: vi.fn() });
let track = newTrack();
const stream = { getTracks: () => [track] } as unknown as MediaStream;
const getUserMedia = vi.fn();
const drawImage = vi.fn();
let blob: Blob | null = new Blob(["frame"], { type: "image/jpeg" });

function named(name: string): Error {
  return Object.assign(new Error(name), { name }); // how getUserMedia's DOMExceptions look
}

async function renderCamera() {
  const onCapture = vi.fn();
  const onCancel = vi.fn();
  const view = render(<CameraCapture onCapture={onCapture} onCancel={onCancel} />);
  await act(async () => {}); // let the camera start
  return { ...view, onCapture, onCancel };
}

describe("CameraCapture", () => {
  beforeEach(() => {
    getUserMedia.mockResolvedValue(stream);
    blob = new Blob(["frame"], { type: "image/jpeg" });
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { mediaDevices: { getUserMedia } }));
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(640);
    vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(480);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(blob));
    track = newTrack();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("asks for the front camera, video only, and shows it with the pose guide", async () => {
    await renderCamera();
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1440 } },
      audio: false,
    });
    expect(screen.getByLabelText("Camera preview")).toHaveProperty("srcObject", stream);
    expect(screen.getByText("Stand back until your body fits the outline, facing the camera.")).toBeInTheDocument();
    expect(document.querySelector("svg[aria-hidden='true']")).not.toBeNull(); // the outline is decorative
    expect(screen.getByRole("button", { name: "Take photo" })).toBeEnabled();
  });

  it("says it's starting, with Take photo disabled, until the camera is on", () => {
    getUserMedia.mockReturnValue(new Promise(() => {})); // the permission prompt is still open
    render(<CameraCapture onCapture={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Starting camera…" })).toBeDisabled();
  });

  it("puts keyboard focus on Cancel when it opens (a button that always works)", async () => {
    await renderCamera();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("Take photo draws what the preview shows (the 3:4 middle), turns the camera off, and hands over a JPEG", async () => {
    const { onCapture } = await renderCamera();
    fireEvent.click(screen.getByRole("button", { name: "Take photo" }));
    // 640×480 is wider than 3:4, so the sides are trimmed: 360×480 from x = 140.
    expect(drawImage).toHaveBeenCalledWith(screen.getByLabelText("Camera preview"), 140, 0, 360, 480, 0, 0, 360, 480);
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.9);
    expect(track.stop).toHaveBeenCalled();
    const photo: File = onCapture.mock.calls[0][0];
    expect(photo).toBeInstanceOf(File);
    expect(photo.name).toBe("camera.jpg");
    expect(photo.type).toBe("image/jpeg");
  });

  it("if the frame can't be encoded: says so, keeps the camera on, and Take photo works again", async () => {
    blob = null;
    const { onCapture } = await renderCamera();
    fireEvent.click(screen.getByRole("button", { name: "Take photo" }));
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't take the photo. Try again, or choose a photo instead.");
    expect(onCapture).not.toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();

    blob = new Blob(["frame"], { type: "image/jpeg" });
    fireEvent.click(screen.getByRole("button", { name: "Take photo" })); // still enabled
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(); // the old error is cleared
    expect(onCapture).toHaveBeenCalledWith(expect.any(File));
  });

  it("if the browser can't draw the frame: says so, and Take photo stays usable", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    const { onCapture } = await renderCamera();
    fireEvent.click(screen.getByRole("button", { name: "Take photo" }));
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't take the photo.");
    expect(screen.getByRole("button", { name: "Take photo" })).toBeEnabled();
    expect(onCapture).not.toHaveBeenCalled();
  });

  it("ignores a second click while the photo is being made, and a photo that finishes after Cancel", async () => {
    let finish: (b: Blob | null) => void = () => {};
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) => (finish = callback));
    const { onCapture, onCancel } = await renderCamera();
    fireEvent.click(screen.getByRole("button", { name: "Take photo" }));
    expect(screen.getByRole("button", { name: "Take photo" })).toBeDisabled(); // encoding
    fireEvent.click(screen.getByRole("button", { name: "Take photo" }));
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    act(() => finish(new Blob(["frame"], { type: "image/jpeg" })));
    expect(onCancel).toHaveBeenCalled();
    expect(onCapture).not.toHaveBeenCalled();
  });

  it("if the camera stops by itself (unplugged, access turned off): says so and disables Take photo (task 69)", async () => {
    const { onCapture } = await renderCamera();
    act(() => void track.dispatchEvent(new Event("ended")));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your camera stopped (was it unplugged, or was access turned off?). Cancel and try again, or choose a photo instead.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(CAMERA_STOPPED);
    expect(screen.getByRole("button", { name: "Take photo" })).toBeDisabled(); // a frozen frame can't be saved
    fireEvent.click(screen.getByRole("button", { name: "Take photo" }));
    expect(onCapture).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled(); // the way out still works
  });

  it("drops a photo that was being made when the camera stopped (it could be the frozen frame)", async () => {
    let finish: (b: Blob | null) => void = () => {};
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) => (finish = callback));
    const { onCapture } = await renderCamera();
    fireEvent.click(screen.getByRole("button", { name: "Take photo" }));
    act(() => void track.dispatchEvent(new Event("ended")));
    act(() => finish(new Blob(["frame"], { type: "image/jpeg" })));
    expect(onCapture).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(CAMERA_STOPPED);
  });

  it("keeps the camera-stopped message if showing the picture then fails too (the first problem is the real one)", async () => {
    let failPlay: (error: Error) => void = () => {};
    vi.mocked(HTMLMediaElement.prototype.play).mockReturnValue(new Promise((_resolve, reject) => (failPlay = reject)));
    render(<CameraCapture onCapture={vi.fn()} onCancel={vi.fn()} />);
    await act(async () => {});
    act(() => void track.dispatchEvent(new Event("ended")));
    await act(async () => failPlay(new Error("The play() request was interrupted")));
    expect(screen.getByRole("alert")).toHaveTextContent(CAMERA_STOPPED);
    expect(screen.getByRole("alert")).not.toHaveTextContent("couldn't show");
  });

  it("if the picture can't be shown after permission was given: turns the camera off and says so", async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(named("NotAllowedError")); // e.g. autoplay rules
    await renderCamera();
    expect(track.stop).toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't show your camera. Cancel and try again, or choose a photo instead.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("blocked"); // permission was granted
    expect(screen.getByRole("button", { name: "Take photo" })).toBeDisabled();
  });

  it("Cancel turns the camera off", async () => {
    const { onCancel } = await renderCamera();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(track.stop).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it("turns the camera off when it closes (e.g. leaving the page)", async () => {
    const { unmount } = await renderCamera();
    unmount();
    expect(track.stop).toHaveBeenCalled();
  });

  it("turns the camera off if it's closed while the browser is still asking for permission", async () => {
    let allow: (s: MediaStream) => void = () => {};
    getUserMedia.mockReturnValue(new Promise<MediaStream>((resolve) => (allow = resolve)));
    const { unmount } = render(<CameraCapture onCapture={vi.fn()} onCancel={vi.fn()} />);
    unmount();
    await act(async () => allow(stream));
    expect(track.stop).toHaveBeenCalled();
  });

  it("explains a blocked camera in words, with Take photo disabled and Cancel still there", async () => {
    getUserMedia.mockRejectedValue(named("NotAllowedError"));
    await renderCamera();
    expect(screen.getByRole("alert")).toHaveTextContent("Camera access is blocked.");
    expect(screen.getByRole("button", { name: "Take photo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });
});

describe("cameraErrorMessage", () => {
  it.each([
    ["NotAllowedError", "Camera access is blocked. Allow it for this site in your browser settings, or choose a photo instead."],
    ["SecurityError", "Camera access is blocked. Allow it for this site in your browser settings, or choose a photo instead."],
    ["NotFoundError", "No camera was found on this device. Choose a photo instead."],
    ["OverconstrainedError", "No camera was found on this device. Choose a photo instead."],
    ["NotReadableError", "Another app is using the camera. Close it and try again, or choose a photo instead."],
    ["TypeError", "We couldn't start your camera. Cancel and try again, or choose a photo instead."],
  ])("%s → %s", (name, message) => {
    expect(cameraErrorMessage(named(name))).toBe(message);
  });

  it("handles something that isn't an Error at all", () => {
    expect(cameraErrorMessage("boom")).toBe("We couldn't start your camera. Cancel and try again, or choose a photo instead.");
  });
});

describe("coverCrop (what a 3:4 object-cover view shows)", () => {
  it.each([
    ["a landscape webcam: trims the sides", 1280, 720, { sx: 370, sy: 0, sw: 540, sh: 720 }],
    ["exactly 3:4: the whole frame", 1080, 1440, { sx: 0, sy: 0, sw: 1080, sh: 1440 }],
    ["a tall phone frame: trims top and bottom", 1080, 1920, { sx: 0, sy: 240, sw: 1080, sh: 1440 }],
  ])("%s", (_case, width, height, crop) => {
    expect(coverCrop(width, height)).toEqual(crop);
  });
});
