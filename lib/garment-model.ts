import type { Category } from "@prisma/client";
import { normalizeBoneName } from "@/app/tryon/live/skeleton";

// Task 67: checks an admin's 3D garment model (.glb) BEFORE it's uploaded, so Live 3D (task 72) only ever
// gets files it can load and fit to the body. Pure: it reads the file's bytes, nothing else.
// A .glb (glTF 2.0 binary) is a 12-byte header, then a JSON chunk (the scene: nodes, meshes, skins…), then
// usually a BIN chunk (vertex data, textures). Only the header and the JSON are needed for these checks.

/** The Cloudinary folder for garment models (raw files). */
export const MODEL_FOLDER = "mirror-ai/models";
/** The largest model an admin may upload: 5 MB, chosen by the developer on 2026-10-02 (quick on phones). */
export const MAX_MODEL_BYTES = 5 * 1024 * 1024;

/** The Mixamo bones Live 3D needs to fit each kind of garment (Hips is the skeleton's root). */
export const REQUIRED_BONES: Record<Category, readonly string[]> = {
  UPPER: ["Hips", "Spine", "LeftArm", "RightArm"],
  LOWER: ["Hips", "LeftUpLeg", "RightUpLeg"],
  OVERALL: ["Hips", "Spine", "LeftUpLeg", "RightUpLeg"],
};

const CATEGORY_LABEL: Record<Category, string> = { UPPER: "Top", LOWER: "Bottom", OVERALL: "Dress" };

/**
 * Required extensions that need a separate decoder (Draco, Meshopt, KTX2/Basis). Live 3D's loader has none
 * configured: those decoders would be extra downloads, and the page's security policy blocks outside files.
 */
const NEEDS_DECODER = ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_meshopt_compression", "KHR_texture_basisu"];

const GLB_MAGIC = 0x46546c67; // "glTF", little-endian
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;

/** A model that can't be used. `message` is safe to show admins: it says what's wrong and how to fix it. */
export class GarmentModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GarmentModelError";
  }
}

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const records = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isRecord) : []);

const notGlb = () => new GarmentModelError("The 3D model isn't a valid .glb file. Export it from Blender as glTF Binary (.glb).");

/** The JSON chunk of a .glb file. Throws a GarmentModelError when the bytes aren't a complete glTF 2.0 binary. */
export function readGlbJson(bytes: Uint8Array): Json {
  if (bytes.byteLength < HEADER_BYTES + CHUNK_HEADER_BYTES) throw notGlb();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw notGlb();
  if (view.getUint32(4, true) !== 2) {
    throw new GarmentModelError("The 3D model must be glTF 2.0. Export it again as glTF Binary (.glb).");
  }
  if (view.getUint32(8, true) !== bytes.byteLength) throw notGlb(); // cut short (or extra bytes)
  const jsonLength = view.getUint32(12, true);
  const jsonStart = HEADER_BYTES + CHUNK_HEADER_BYTES;
  if (view.getUint32(16, true) !== CHUNK_JSON || jsonStart + jsonLength > bytes.byteLength) throw notGlb();

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(jsonStart, jsonStart + jsonLength)));
  } catch {
    throw notGlb();
  }
  if (!isRecord(json)) throw notGlb();
  return json;
}

/**
 * Checks that `bytes` is a garment model Live 3D can use for a garment of `category`. Throws a
 * GarmentModelError with a friendly message for the first problem found:
 * 1. a complete glTF 2.0 binary (.glb);
 * 2. no compression that needs a decoder (Draco, Meshopt, KTX2);
 * 3. everything inside the file: no links to outside files (or to `data:` URLs, which the page's security
 *    policy would also block when loading);
 * 4. a rigged (skinned) mesh;
 * 5. the Mixamo bones that `category` needs (with or without Mixamo's "mixamorig:" prefix).
 */
export function checkGarmentModel(bytes: Uint8Array, category: Category): void {
  const gltf = readGlbJson(bytes);

  const asset = isRecord(gltf.asset) ? gltf.asset : {};
  if (typeof asset.version !== "string" || !asset.version.startsWith("2.")) {
    throw new GarmentModelError("The 3D model must be glTF 2.0. Export it again as glTF Binary (.glb).");
  }

  const required = Array.isArray(gltf.extensionsRequired) ? gltf.extensionsRequired : [];
  if (required.some((name) => NEEDS_DECODER.includes(String(name)))) {
    throw new GarmentModelError(
      "The 3D model uses compression (Draco, Meshopt or KTX2) that Live 3D can't read. Export it again without compression.",
    );
  }

  if ([...records(gltf.buffers), ...records(gltf.images)].some((item) => item.uri !== undefined)) {
    throw new GarmentModelError(
      "The 3D model links to separate files. Export it as a single glTF Binary (.glb) with everything inside.",
    );
  }

  // Raw arrays for lookups by index (filtering would shift the indexes nodes refer to).
  const nodes: unknown[] = Array.isArray(gltf.nodes) ? gltf.nodes : [];
  const skinList: unknown[] = Array.isArray(gltf.skins) ? gltf.skins : [];
  const skins = records(skinList);
  const skinned = nodes.some(
    (node) => isRecord(node) && typeof node.mesh === "number" && typeof node.skin === "number" && isRecord(skinList[node.skin]),
  );
  if (!skinned) {
    throw new GarmentModelError(
      "The 3D model has no rigged (skinned) mesh. Rig the garment to a Mixamo skeleton, then export it again.",
    );
  }

  const bones = new Set<string>();
  for (const skin of skins) {
    for (const joint of Array.isArray(skin.joints) ? skin.joints : []) {
      const node: unknown = typeof joint === "number" ? nodes[joint] : undefined;
      if (isRecord(node) && typeof node.name === "string") bones.add(normalizeBoneName(node.name));
    }
  }
  const missing = REQUIRED_BONES[category].filter((bone) => !bones.has(bone));
  if (missing.length > 0) {
    throw new GarmentModelError(
      `The 3D model is missing the Mixamo bones a ${CATEGORY_LABEL[category]} needs: ${missing.join(", ")}. Rig it to a Mixamo skeleton.`,
    );
  }
}
