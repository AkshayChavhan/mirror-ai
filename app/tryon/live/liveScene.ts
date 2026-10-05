import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// Live 3D (task 66): the three.js scene drawn over the camera. A transparent canvas the size of the preview,
// with an orthographic camera in preview pixels (the scene's y points up, so screen y is -y: see
// applyGarmentPose), and soft lighting so the garment reads as 3D. Task 74: the garment also reflects soft
// surroundings (three.js's built-in RoomEnvironment), and its lighting follows the camera's brightness.

/** What the scene needs from a renderer (WebGLRenderer in the browser; a fake in unit tests). */
export type SceneRenderer = Pick<THREE.WebGLRenderer, "setSize" | "setPixelRatio" | "setClearColor" | "render" | "dispose">;

export type LiveScene = {
  /** Matches the canvas and camera to the preview's size (in CSS pixels). Cheap when nothing changed. */
  resize(width: number, height: number, pixelRatio?: number): void;
  render(): void;
  /** Scales all the garment's lighting (1 = normal), to follow the room's brightness (task 74). */
  setBrightness(factor: number): void;
  /** Frees the renderer and the environment (the garment is disposed by its owner). */
  dispose(): void;
  readonly camera: THREE.OrthographicCamera;
  readonly scene: THREE.Scene;
};

const defaultRenderer = (canvas: HTMLCanvasElement): SceneRenderer =>
  new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });

/** Makes the surroundings the garment reflects (a fake in unit tests, which have no WebGL). Null: none. */
export type EnvironmentMaker = (renderer: SceneRenderer) => THREE.Texture | null;

/**
 * three.js's RoomEnvironment (a soft, evenly lit room) prepared for lighting: fabrics then get gentle highlights and
 * shading from every side instead of looking flat. Needs a real WebGLRenderer; null otherwise.
 */
const roomEnvironment: EnvironmentMaker = (renderer) => {
  if (!(renderer instanceof THREE.WebGLRenderer)) return null;
  const generator = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const texture = generator.fromScene(room, 0.04).texture;
  room.dispose();
  generator.dispose();
  return texture;
};

/** Normal light levels. The environment gives soft light from all around, so the two lights are gentler. */
export const LIGHTING = { environment: 1, ambient: 0.35, key: 0.9 } as const;

/** Builds the scene around `object` (the garment). Throws if WebGL isn't available; the caller shows a message. */
export function createLiveScene(
  canvas: HTMLCanvasElement,
  object: THREE.Object3D,
  makeRenderer: (canvas: HTMLCanvasElement) => SceneRenderer = defaultRenderer,
  makeEnvironment: EnvironmentMaker = roomEnvironment,
): LiveScene {
  const renderer = makeRenderer(canvas);
  renderer.setClearColor(0x000000, 0); // transparent: the camera shows through

  const scene = new THREE.Scene();
  // Soft surroundings are a nice-to-have: if they can't be made (e.g. the GPU context was lost), Live 3D carries
  // on with the two lights instead of failing.
  let environment: THREE.Texture | null = null;
  try {
    environment = makeEnvironment(renderer);
  } catch (environmentError) {
    console.warn("[live] Soft lighting isn't available here; using plain lights.", environmentError);
  }
  scene.environment = environment;
  const ambient = new THREE.AmbientLight(0xffffff, LIGHTING.ambient);
  const key = new THREE.DirectionalLight(0xffffff, LIGHTING.key);
  key.position.set(0.3, 1, 1).normalize(); // from the front, above, a little to the side
  scene.add(ambient, key, object);

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
    setBrightness(factor) {
      scene.environmentIntensity = LIGHTING.environment * factor;
      ambient.intensity = LIGHTING.ambient * factor;
      key.intensity = LIGHTING.key * factor;
    },
    dispose() {
      scene.remove(object);
      environment?.dispose();
      renderer.dispose();
    },
  };
}
