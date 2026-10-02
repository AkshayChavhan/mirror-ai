import * as THREE from "three";

// Live 3D (task 66): the three.js scene drawn over the camera. A transparent canvas the size of the preview,
// with an orthographic camera in preview pixels (the scene's y points up, so screen y is -y: see
// applyGarmentPose), and soft lighting so the garment reads as 3D.

/** What the scene needs from a renderer (WebGLRenderer in the browser; a fake in unit tests). */
export type SceneRenderer = Pick<THREE.WebGLRenderer, "setSize" | "setPixelRatio" | "setClearColor" | "render" | "dispose">;

export type LiveScene = {
  /** Matches the canvas and camera to the preview's size (in CSS pixels). Cheap when nothing changed. */
  resize(width: number, height: number, pixelRatio?: number): void;
  render(): void;
  /** Frees the renderer (the garment is disposed by its owner). */
  dispose(): void;
  readonly camera: THREE.OrthographicCamera;
  readonly scene: THREE.Scene;
};

const defaultRenderer = (canvas: HTMLCanvasElement): SceneRenderer =>
  new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });

/** Builds the scene around `object` (the garment). Throws if WebGL isn't available; the caller shows a message. */
export function createLiveScene(
  canvas: HTMLCanvasElement,
  object: THREE.Object3D,
  makeRenderer: (canvas: HTMLCanvasElement) => SceneRenderer = defaultRenderer,
): LiveScene {
  const renderer = makeRenderer(canvas);
  renderer.setClearColor(0x000000, 0); // transparent: the camera shows through

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(0.3, 1, 1).normalize(); // from the front, above, a little to the side
  scene.add(key, object);

  // Preview pixels: x 0..width to the right, y 0..-height downwards; garments sit around z 0.
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, 1, 4000);
  camera.position.z = 2000;

  let size = { width: 0, height: 0, pixelRatio: 0 };
  return {
    camera,
    scene,
    resize(width, height, pixelRatio = 1) {
      if (width === size.width && height === size.height && pixelRatio === size.pixelRatio) return;
      size = { width, height, pixelRatio };
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false); // the canvas's CSS size comes from the layout
      camera.right = width;
      camera.bottom = -height;
      camera.updateProjectionMatrix();
    },
    render() {
      renderer.render(scene, camera);
    },
    dispose() {
      scene.remove(object);
      renderer.dispose();
    },
  };
}
