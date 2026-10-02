// @vitest-environment node
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createLiveScene, type SceneRenderer } from "./liveScene";

// WebGL isn't available in tests, so a fake renderer records what the scene asks of it.
function fakeRenderer() {
  return { setSize: vi.fn(), setPixelRatio: vi.fn(), setClearColor: vi.fn(), render: vi.fn(), dispose: vi.fn() };
}
/** Hands the fake to createLiveScene (it only uses these five methods). */
const use = (renderer: ReturnType<typeof fakeRenderer>) => () => renderer as unknown as SceneRenderer;
const canvas = {} as HTMLCanvasElement;

describe("createLiveScene", () => {
  it("draws on a transparent canvas, with the garment and soft lighting in the scene", () => {
    const renderer = fakeRenderer();
    const garment = new THREE.Object3D();
    const live = createLiveScene(canvas, garment, use(renderer));
    expect(renderer.setClearColor).toHaveBeenCalledWith(0x000000, 0);
    expect(live.scene.children).toContain(garment);
    expect(live.scene.children.some((c) => c instanceof THREE.AmbientLight)).toBe(true);
    expect(live.scene.children.some((c) => c instanceof THREE.DirectionalLight)).toBe(true);
  });

  it("sizes the canvas and an orthographic camera in preview pixels (scene y points up)", () => {
    const renderer = fakeRenderer();
    const live = createLiveScene(canvas, new THREE.Object3D(), use(renderer));
    live.resize(300, 400, 2);
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(2);
    expect(renderer.setSize).toHaveBeenCalledWith(300, 400, false); // CSS size comes from the layout
    expect([live.camera.left, live.camera.right, live.camera.top, live.camera.bottom]).toEqual([0, 300, 0, -400]);
  });

  it("only resizes when the size actually changes (it's called every frame)", () => {
    const renderer = fakeRenderer();
    const live = createLiveScene(canvas, new THREE.Object3D(), use(renderer));
    live.resize(300, 400, 1);
    live.resize(300, 400, 1);
    expect(renderer.setSize).toHaveBeenCalledTimes(1);
    live.resize(320, 400, 1);
    expect(renderer.setSize).toHaveBeenCalledTimes(2);
  });

  it("renders the scene through its camera, and dispose() frees the renderer and lets go of the garment", () => {
    const renderer = fakeRenderer();
    const garment = new THREE.Object3D();
    const live = createLiveScene(canvas, garment, use(renderer));
    live.render();
    expect(renderer.render).toHaveBeenCalledWith(live.scene, live.camera);
    live.dispose();
    expect(renderer.dispose).toHaveBeenCalled();
    expect(live.scene.children).not.toContain(garment);
  });

  it("lets a missing WebGL throw, for the caller's friendly message", () => {
    expect(() =>
      createLiveScene(canvas, new THREE.Object3D(), () => {
        throw new Error("WebGL unavailable");
      }),
    ).toThrow("WebGL unavailable");
  });
});
