// @vitest-environment node
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LIGHTING, createLiveScene, type SceneRenderer } from "./liveScene";

// WebGL isn't available in tests, so a fake renderer records what the scene asks of it.
function fakeRenderer() {
  return { setSize: vi.fn(), setPixelRatio: vi.fn(), setClearColor: vi.fn(), render: vi.fn(), dispose: vi.fn() };
}
/** Hands the fake to createLiveScene (it only uses these five methods). */
const use = (renderer: ReturnType<typeof fakeRenderer>) => () => renderer as unknown as SceneRenderer;
const canvas = {} as HTMLCanvasElement;

describe("createLiveScene", () => {
  afterEach(() => vi.restoreAllMocks()); // e.g. the console.warn spy, even when a test fails early

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

  describe("realistic lighting (task 74)", () => {
    it("lights the garment with soft surroundings (an environment), made with the scene's renderer", () => {
      const renderer = fakeRenderer();
      const environment = new THREE.Texture();
      const makeEnvironment = vi.fn(() => environment);
      const live = createLiveScene(canvas, new THREE.Object3D(), use(renderer), makeEnvironment);
      expect(makeEnvironment).toHaveBeenCalledWith(renderer);
      expect(live.scene.environment).toBe(environment);
    });

    it("works without an environment when none can be made (no WebGL: a fake renderer)", () => {
      const live = createLiveScene(canvas, new THREE.Object3D(), use(fakeRenderer()));
      expect(live.scene.environment).toBeNull();
      expect(() => live.render()).not.toThrow();
    });

    it("follows the room's brightness: setBrightness scales the environment and both lights together", () => {
      const live = createLiveScene(canvas, new THREE.Object3D(), use(fakeRenderer()), () => new THREE.Texture());
      const ambient = live.scene.children.find((c) => c instanceof THREE.AmbientLight) as THREE.AmbientLight;
      const key = live.scene.children.find((c) => c instanceof THREE.DirectionalLight) as THREE.DirectionalLight;
      expect([live.scene.environmentIntensity, ambient.intensity, key.intensity]).toEqual([LIGHTING.environment, LIGHTING.ambient, LIGHTING.key]);
      live.setBrightness(0.5);
      expect(live.scene.environmentIntensity).toBeCloseTo(LIGHTING.environment * 0.5);
      expect(ambient.intensity).toBeCloseTo(LIGHTING.ambient * 0.5);
      expect(key.intensity).toBeCloseTo(LIGHTING.key * 0.5);
    });

    it("carries on with plain lights (and a warning) when the environment can't be made", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const live = createLiveScene(canvas, new THREE.Object3D(), use(fakeRenderer()), () => {
        throw new Error("WebGL context lost");
      });
      expect(live.scene.environment).toBeNull();
      expect(live.scene.children.some((c) => c instanceof THREE.DirectionalLight)).toBe(true);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("using plain lights"), expect.any(Error));
      expect(() => live.setBrightness(0.8)).not.toThrow();
    });

    it("dispose() frees the environment too", () => {
      const environment = new THREE.Texture();
      const freed = vi.spyOn(environment, "dispose");
      createLiveScene(canvas, new THREE.Object3D(), use(fakeRenderer()), () => environment).dispose();
      expect(freed).toHaveBeenCalled();
    });
  });

  it("lets a missing WebGL throw, for the caller's friendly message", () => {
    expect(() =>
      createLiveScene(canvas, new THREE.Object3D(), () => {
        throw new Error("WebGL unavailable");
      }),
    ).toThrow("WebGL unavailable");
  });
});
