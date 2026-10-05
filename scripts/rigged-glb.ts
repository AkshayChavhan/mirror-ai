// Test fixture (task 72): a small rigged garment model as real .glb bytes, built here instead of committing a
// binary file. A box "shirt" around the torso, skinned to a Mixamo-style T-pose skeleton facing +Z (metres),
// optionally with an embedded PNG texture (as an artist's model would have).

type Joint = { name: string; parent?: string; at: [number, number, number] };

/** The skeleton's joints at rest, in world space (a T-pose), parents before children. */
export const RIGGED_GLB_JOINTS: readonly Joint[] = [
  { name: "Hips", at: [0, 1, 0] },
  { name: "Spine", parent: "Hips", at: [0, 1.1, 0] },
  { name: "Spine1", parent: "Spine", at: [0, 1.25, 0] },
  { name: "Spine2", parent: "Spine1", at: [0, 1.4, 0] },
  { name: "Neck", parent: "Spine2", at: [0, 1.55, 0] },
  { name: "LeftShoulder", parent: "Spine2", at: [0.05, 1.5, 0] },
  { name: "LeftArm", parent: "LeftShoulder", at: [0.18, 1.5, 0] },
  { name: "LeftForeArm", parent: "LeftArm", at: [0.46, 1.5, 0] },
  { name: "LeftHand", parent: "LeftForeArm", at: [0.71, 1.5, 0] },
  { name: "RightShoulder", parent: "Spine2", at: [-0.05, 1.5, 0] },
  { name: "RightArm", parent: "RightShoulder", at: [-0.18, 1.5, 0] },
  { name: "RightForeArm", parent: "RightArm", at: [-0.46, 1.5, 0] },
  { name: "RightHand", parent: "RightForeArm", at: [-0.71, 1.5, 0] },
  { name: "LeftUpLeg", parent: "Hips", at: [0.1, 0.95, 0] },
  { name: "LeftLeg", parent: "LeftUpLeg", at: [0.1, 0.5, 0] },
  { name: "LeftFoot", parent: "LeftLeg", at: [0.1, 0.08, 0] },
  { name: "RightUpLeg", parent: "Hips", at: [-0.1, 0.95, 0] },
  { name: "RightLeg", parent: "RightUpLeg", at: [-0.1, 0.5, 0] },
  { name: "RightFoot", parent: "RightLeg", at: [-0.1, 0.08, 0] },
];

/** A 1×1 red PNG, the smallest valid embedded texture. */
const RED_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
  "base64",
);

const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_BYTE = 5121;

/** Builds the model. `prefix` is put before every bone name (Blender's Mixamo exports use "mixamorig:"). */
export function riggedGarmentGlb({ texture = false, prefix = "mixamorig:" } = {}): Uint8Array {
  const joints = RIGGED_GLB_JOINTS;
  const index = (name: string) => joints.findIndex((j) => j.name === name);
  const spine2 = index("Spine2");

  // The shirt: a box around the chest, every vertex bound to Spine2.
  const [x0, x1, y0, y1, z0, z1] = [-0.17, 0.17, 1.05, 1.5, -0.1, 0.1];
  const positions = new Float32Array([
    x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1,
  ]);
  const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0]);
  const jointIndices = new Uint8Array(8 * 4);
  for (let v = 0; v < 8; v++) jointIndices[v * 4] = spine2;
  const weights = new Float32Array(8 * 4);
  for (let v = 0; v < 8; v++) weights[v * 4] = 1;
  const triangles = new Uint16Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
  ]);
  // Inverse bind matrices: the joints rest unrotated, so each is a translation by minus its position.
  const inverseBind = new Float32Array(joints.length * 16);
  joints.forEach((joint, i) => {
    inverseBind.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -joint.at[0], -joint.at[1], -joint.at[2], 1], i * 16);
  });

  // One binary buffer, each part 4-byte aligned (glTF requires it).
  const parts: Uint8Array[] = [];
  const views: { buffer: 0; byteOffset: number; byteLength: number }[] = [];
  let offset = 0;
  const addView = (bytes: Uint8Array) => {
    const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4);
    padded.set(bytes);
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength });
    parts.push(padded);
    offset += padded.byteLength;
    return views.length - 1;
  };
  const bytes = (array: ArrayBufferView) => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  const positionView = addView(bytes(positions));
  const jointView = addView(bytes(jointIndices));
  const weightView = addView(bytes(weights));
  const indexView = addView(bytes(triangles));
  const bindView = addView(bytes(inverseBind));
  const uvView = texture ? addView(bytes(uvs)) : -1;
  const imageView = texture ? addView(RED_PIXEL_PNG) : -1;

  const accessors: Record<string, unknown>[] = [
    { bufferView: positionView, componentType: FLOAT, count: 8, type: "VEC3", min: [x0, y0, z0], max: [x1, y1, z1] },
    { bufferView: jointView, componentType: UNSIGNED_BYTE, count: 8, type: "VEC4" },
    { bufferView: weightView, componentType: FLOAT, count: 8, type: "VEC4" },
    { bufferView: indexView, componentType: UNSIGNED_SHORT, count: triangles.length, type: "SCALAR" },
    { bufferView: bindView, componentType: FLOAT, count: joints.length, type: "MAT4" },
  ];
  if (texture) accessors.push({ bufferView: uvView, componentType: FLOAT, count: 8, type: "VEC2" });

  // Nodes: the joints (0…n-1, translations relative to their parents), then the mesh, then the armature.
  const nodes: Record<string, unknown>[] = joints.map((joint) => {
    const parentAt = joint.parent ? joints[index(joint.parent)].at : [0, 0, 0];
    const children = joints.flatMap((child, i) => (child.parent === joint.name ? [i] : []));
    return {
      name: `${prefix}${joint.name}`,
      translation: joint.at.map((value, axis) => value - parentAt[axis]),
      ...(children.length > 0 ? { children } : {}),
    };
  });
  const meshNode = nodes.push({ name: "Shirt", mesh: 0, skin: 0 }) - 1;
  const armature = nodes.push({ name: "Armature", children: [index("Hips")] }) - 1;

  const json = {
    asset: { version: "2.0", generator: "mirror-ai test fixture" },
    scene: 0,
    scenes: [{ nodes: [armature, meshNode] }],
    nodes,
    skins: [{ joints: joints.map((_, i) => i), inverseBindMatrices: 4, skeleton: index("Hips") }],
    meshes: [
      {
        name: "Shirt",
        primitives: [
          {
            attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2, ...(texture ? { TEXCOORD_0: 5 } : {}) },
            indices: 3,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: "Fabric",
        pbrMetallicRoughness: { baseColorFactor: [0.2, 0.3, 0.8, 1], ...(texture ? { baseColorTexture: { index: 0 } } : {}) },
      },
    ],
    ...(texture ? { textures: [{ source: 0 }], images: [{ bufferView: imageView, mimeType: "image/png" }] } : {}),
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: offset }],
  };

  // The .glb container: header, JSON chunk (padded with spaces), BIN chunk (padded with zeros).
  const jsonText = new TextEncoder().encode(JSON.stringify(json));
  const jsonChunk = new Uint8Array(Math.ceil(jsonText.byteLength / 4) * 4).fill(0x20);
  jsonChunk.set(jsonText);
  const binChunk = new Uint8Array(offset);
  let at = 0;
  for (const part of parts) {
    binChunk.set(part, at);
    at += part.byteLength;
  }
  const total = 12 + 8 + jsonChunk.byteLength + 8 + binChunk.byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonChunk.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(jsonChunk, 20);
  view.setUint32(20 + jsonChunk.byteLength, binChunk.byteLength, true);
  view.setUint32(24 + jsonChunk.byteLength, 0x004e4942, true); // "BIN\0"
  out.set(binChunk, 28 + jsonChunk.byteLength);
  return out;
}
