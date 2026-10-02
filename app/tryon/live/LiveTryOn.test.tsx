import { act, fireEvent, render, screen } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LANDMARK, type Landmark } from "./bodyPose";

// The camera, MediaPipe, the photo loader and WebGL are faked; the pose math and the 3D garment are real.
// Animation frames are run by hand (runFrame), so each test controls exactly what the tracker "sees".
const m = vi.hoisted(() => ({
  createPoseTracker: vi.fn(),
  detect: vi.fn(),
  closeTracker: vi.fn(),
  loadGarmentLook: vi.fn(),
  createLiveScene: vi.fn(),
  resize: vi.fn(),
  renderScene: vi.fn(),
  disposeScene: vi.fn(),
}));
vi.mock("./poseTracker", () => ({ createPoseTracker: m.createPoseTracker }));
vi.mock("./garmentLook", () => ({ loadGarmentLook: m.loadGarmentLook }));
vi.mock("./liveScene", () => ({ createLiveScene: m.createLiveScene }));

import LiveTryOn, { type LiveProduct } from "./LiveTryOn";

const PRODUCT: LiveProduct = { name: "Linen Shirt", imageUrl: "https://res.cloudinary.com/demo/image/upload/shirt.png", category: "UPPER" };
const track = { stop: vi.fn() };
const stream = { getTracks: () => [track] } as unknown as MediaStream;
const getUserMedia = vi.fn();
let frames: FrameRequestCallback[] = [];

/** A person standing straight, facing the camera (33 landmarks). */
function standing(): Landmark[] {
  const points: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
  const at: Partial<Record<keyof typeof LANDMARK, [number, number]>> = {
    rightShoulder: [0.4, 0.3], leftShoulder: [0.6, 0.3], rightElbow: [0.38, 0.45], leftElbow: [0.62, 0.45],
    rightWrist: [0.38, 0.58], leftWrist: [0.62, 0.58], rightHip: [0.43, 0.6], leftHip: [0.57, 0.6],
    rightKnee: [0.43, 0.78], leftKnee: [0.57, 0.78], rightAnkle: [0.43, 0.95], leftAnkle: [0.57, 0.95],
  };
  for (const [name, [x, y]] of Object.entries(at) as [keyof typeof LANDMARK, [number, number]][]) {
    points[LANDMARK[name]] = { x, y, z: 0, visibility: 0.99 };
  }
  return points;
}

/** Runs the pending animation frame(s), like the browser would. */
async function runFrame() {
  await act(async () => {
    const pending = frames;
    frames = [];
    pending.forEach((callback) => callback(performance.now()));
  });
}

async function renderLive() {
  const onCapture = vi.fn();
  const onCancel = vi.fn();
  const view = render(<LiveTryOn product={PRODUCT} onCapture={onCapture} onCancel={onCancel} />);
  await act(async () => {}); // camera, tracker, look and scene start
  return { ...view, onCapture, onCancel };
}

/** The garment mesh Live 3D handed to the scene. */
const garmentMesh = () => m.createLiveScene.mock.calls[0][1] as THREE.SkinnedMesh;

describe("LiveTryOn", () => {
  beforeEach(() => {
    frames = [];
    getUserMedia.mockResolvedValue(stream);
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { mediaDevices: { getUserMedia } }));
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(640);
    vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(480);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
    m.detect.mockReturnValue(null);
    m.createPoseTracker.mockResolvedValue({ detect: m.detect, close: m.closeTracker });
    m.loadGarmentLook.mockResolvedValue({ color: "#123456", print: null });
    m.createLiveScene.mockReturnValue({ resize: m.resize, render: m.renderScene, dispose: m.disposeScene });
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("starts the front camera (video only), the tracker, and the product's 3D garment", async () => {
    await renderLive();
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1440 } },
      audio: false,
    });
    expect(m.createPoseTracker).toHaveBeenCalled();
    expect(m.loadGarmentLook).toHaveBeenCalledWith(PRODUCT.imageUrl);
    expect(garmentMesh().name).toBe("garment-UPPER"); // the product's category
    expect(garmentMesh().visible).toBe(false); // until a body is found
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("says to step back while no body is in view, with Take photo usable", async () => {
    await renderLive();
    await runFrame();
    expect(screen.getByRole("status")).toHaveTextContent("Step back until we can see your shoulders.");
    expect(screen.getByRole("button", { name: "Take photo" })).toBeEnabled();
    expect(m.renderScene).toHaveBeenCalled();
  });

  it("with a body in view: shows the garment, poses it, sizes the scene to the preview, and says it follows", async () => {
    await renderLive();
    m.detect.mockReturnValue({ image: standing(), world: undefined });
    await runFrame();
    expect(garmentMesh().visible).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("Move around: the Linen Shirt follows you.");
    expect(m.resize).toHaveBeenCalledWith(300, 400, expect.any(Number));
    // Posed in the 3:4 preview: the 640×480 video is cropped to 360×480 and scaled to 300×400.
    const spine = garmentMesh().skeleton.bones.find((b) => b.name === "Spine") as THREE.Bone;
    expect(spine.position.x).toBeCloseTo(150, 0); // centered
    expect(spine.scale.x).toBeGreaterThan(0);
  });

  it("hides the garment again when the body leaves the frame", async () => {
    await renderLive();
    m.detect.mockReturnValue({ image: standing(), world: undefined });
    await runFrame();
    m.detect.mockReturnValue(null);
    await runFrame();
    expect(garmentMesh().visible).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent("Step back until we can see your shoulders.");
  });

  it("prints the photo on the garment as an sRGB texture when the look has a print", async () => {
    m.loadGarmentLook.mockResolvedValue({ color: "#123456", print: document.createElement("canvas") });
    await renderLive();
    const printed = (garmentMesh().material as THREE.MeshStandardMaterial[])[0];
    expect(printed.map).toBeInstanceOf(THREE.CanvasTexture);
    expect(printed.map?.colorSpace).toBe(THREE.SRGBColorSpace);
  });

  it("Take photo captures the camera's 3:4 view only (not the 3D garment), stops the camera, and hands over a JPEG", async () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["x"], { type: "image/jpeg" })));
    const { onCapture } = await renderLive();
    fireEvent.click(screen.getByRole("button", { name: "Take photo" }));
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledWith(screen.getByLabelText("Live 3D camera"), 140, 0, 360, 480, 0, 0, 360, 480);
    expect(track.stop).toHaveBeenCalled();
    expect((onCapture.mock.calls[0][0] as File).name).toBe("camera.jpg");
  });

  it.each([
    ["the browser can't draw the frame", () => vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)],
    [
      "the frame can't be encoded",
      () => {
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
        vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(null));
      },
    ],
  ])("if %s: says so, keeps the camera on, and Take photo stays usable", async (_case, breakIt) => {
    breakIt();
    const { onCapture } = await renderLive();
    await runFrame();
    fireEvent.click(screen.getByRole("button", { name: "Take photo" }));
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't take the photo. Try again, or choose a photo instead.");
    expect(onCapture).not.toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Take photo" })).toBeEnabled();
  });

  it("Cancel stops the camera", async () => {
    const { onCancel } = await renderLive();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(track.stop).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it("closing frees everything: the frame loop, the camera, the tracker and the 3D scene", async () => {
    const { unmount } = await renderLive();
    await runFrame();
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
    expect(m.closeTracker).toHaveBeenCalled();
    expect(m.disposeScene).toHaveBeenCalled();
  });

  it("frees a tracker that finishes loading after Live 3D was closed", async () => {
    let finish: (tracker: unknown) => void = () => {};
    m.createPoseTracker.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { unmount } = render(<LiveTryOn product={PRODUCT} onCapture={vi.fn()} onCancel={vi.fn()} />);
    await act(async () => {});
    unmount();
    await act(async () => finish({ detect: m.detect, close: m.closeTracker }));
    expect(m.closeTracker).toHaveBeenCalled();
    expect(m.createLiveScene).not.toHaveBeenCalled();
  });

  it("explains a blocked camera, with Take photo disabled", async () => {
    getUserMedia.mockRejectedValue(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    await renderLive();
    expect(screen.getByRole("alert")).toHaveTextContent("Camera access is blocked.");
    expect(screen.getByRole("button", { name: "Take photo" })).toBeDisabled();
    expect(m.createPoseTracker).not.toHaveBeenCalled();
  });

  it.each([
    ["the tracker can't load", () => m.createPoseTracker.mockRejectedValue(new Error("no WASM"))],
    ["WebGL isn't available", () => m.createLiveScene.mockImplementation(() => { throw new Error("no WebGL"); })],
  ])("when %s: says Live 3D isn't available here, stops the camera, frees the tracker", async (_case, breakIt) => {
    breakIt();
    await renderLive();
    expect(screen.getByRole("alert")).toHaveTextContent("Live 3D isn't available on this device. You can still take or choose a photo.");
    expect(screen.getByRole("button", { name: "Take photo" })).toBeDisabled();
    expect(track.stop).toHaveBeenCalled();
  });

  it("says it's starting, with Take photo disabled, until everything is ready", () => {
    m.createPoseTracker.mockReturnValue(new Promise(() => {}));
    render(<LiveTryOn product={PRODUCT} onCapture={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Starting Live 3D…");
    expect(screen.getByRole("button", { name: "Take photo" })).toBeDisabled();
  });
});
