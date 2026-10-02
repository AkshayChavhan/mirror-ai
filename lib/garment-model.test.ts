// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GarmentModelError, MAX_MODEL_BYTES, REQUIRED_BONES, checkGarmentModel, readGlbJson } from "./garment-model";

// Real .glb bytes, built by hand: a 12-byte header, a JSON chunk (padded with spaces to 4 bytes) and a BIN chunk.
function glb(json: unknown, { version = 2, length }: { version?: number; length?: number } = {}): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonBytes = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20);
  jsonBytes.set(text);
  const bin = new Uint8Array(4);
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, version, true);
  view.setUint32(8, length ?? total, true);
  view.setUint32(12, jsonBytes.length, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(jsonBytes, 20);
  view.setUint32(20 + jsonBytes.length, bin.length, true);
  view.setUint32(24 + jsonBytes.length, 0x004e4942, true); // "BIN\0"
  return out;
}

const MIXAMO = ["Hips", "Spine", "Spine1", "LeftArm", "LeftForeArm", "RightArm", "RightForeArm", "LeftUpLeg", "LeftLeg", "RightUpLeg", "RightLeg"];

/** A garment mesh skinned to a Mixamo skeleton, as Blender exports it ("mixamorig:" bone names). */
function rigged(bones = MIXAMO.map((name) => `mixamorig:${name}`), extra: Record<string, unknown> = {}) {
  return {
    asset: { version: "2.0", generator: "Khronos glTF Blender I/O" },
    nodes: [{ name: "Shirt", mesh: 0, skin: 0 }, ...bones.map((name) => ({ name }))],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    skins: [{ joints: bones.map((_, i) => i + 1) }],
    buffers: [{ byteLength: 4 }],
    ...extra,
  };
}

const problem = (bytes: Uint8Array, category: "UPPER" | "LOWER" | "OVERALL" = "UPPER") => {
  try {
    checkGarmentModel(bytes, category);
  } catch (error) {
    if (error instanceof GarmentModelError) return error.message;
    throw error;
  }
  return null;
};

describe("checkGarmentModel", () => {
  it.each(["UPPER", "LOWER", "OVERALL"] as const)("accepts a Mixamo-rigged model for a %s garment", (category) => {
    expect(problem(glb(rigged()), category)).toBeNull();
  });

  it("accepts bone names with or without Mixamo's prefix", () => {
    expect(problem(glb(rigged(MIXAMO)))).toBeNull(); // "Hips", "Spine"…
    expect(problem(glb(rigged(MIXAMO.map((name) => `mixamorig_${name}`))))).toBeNull();
  });

  it("works on bytes that are a view into a bigger buffer (as uploads can be)", () => {
    const bytes = glb(rigged());
    const padded = new Uint8Array(bytes.length + 7);
    padded.set(bytes, 7);
    expect(problem(padded.subarray(7))).toBeNull();
  });

  it.each([
    ["a PNG", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...new Uint8Array(40)])],
    ["a file too short to be a .glb", new Uint8Array([0x67, 0x6c, 0x54, 0x46])],
    ["a cut-short file (the header's length doesn't match)", glb(rigged(), { length: 9999 })],
    ["text renamed to .glb", new TextEncoder().encode("this is not a 3D model, just text in a file")],
  ])("refuses %s as not a .glb", (_case, bytes) => {
    expect(problem(bytes)).toBe("The 3D model isn't a valid .glb file. Export it from Blender as glTF Binary (.glb).");
  });

  it("refuses a JSON chunk that isn't valid JSON, or isn't an object", () => {
    const bytes = glb(rigged());
    bytes[20] = 0x7b; // "{" …
    bytes[21] = 0x7b; // "{{" is not JSON
    expect(problem(bytes)).toMatch(/isn't a valid \.glb file/);
    expect(problem(glb([1, 2, 3]))).toMatch(/isn't a valid \.glb file/);
  });

  it("refuses glTF 1.0 (in the header or the asset version)", () => {
    expect(problem(glb(rigged(), { version: 1 }))).toBe("The 3D model must be glTF 2.0. Export it again as glTF Binary (.glb).");
    expect(problem(glb({ ...rigged(), asset: { version: "1.0" } }))).toMatch(/must be glTF 2\.0/);
    expect(problem(glb({ ...rigged(), asset: undefined }))).toMatch(/must be glTF 2\.0/);
  });

  it.each(["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu"])(
    "refuses required %s (it needs a decoder Live 3D doesn't load)",
    (extension) => {
      const json = rigged(undefined, { extensionsUsed: [extension], extensionsRequired: [extension] });
      expect(problem(glb(json))).toMatch(/uses compression \(Draco, Meshopt or KTX2\)/);
    },
  );

  it("accepts compression that's only optional (the file has an uncompressed fallback)", () => {
    expect(problem(glb(rigged(undefined, { extensionsUsed: ["KHR_draco_mesh_compression"] })))).toBeNull();
  });

  it.each([
    ["a buffer in a separate file", { buffers: [{ byteLength: 4, uri: "shirt.bin" }] }],
    ["a texture on another website", { images: [{ uri: "https://example.com/print.png" }] }],
    ["a texture as a data: URL", { images: [{ uri: "data:image/png;base64,iVBORw0KGgo=" }] }],
  ])("refuses %s (everything must be inside the .glb)", (_case, extra) => {
    expect(problem(glb(rigged(undefined, extra)))).toBe(
      "The 3D model links to separate files. Export it as a single glTF Binary (.glb) with everything inside.",
    );
  });

  it("accepts textures stored inside the file (a bufferView, not a link)", () => {
    expect(problem(glb(rigged(undefined, { images: [{ bufferView: 0, mimeType: "image/png" }] })))).toBeNull();
  });

  it.each([
    ["a mesh with no skin", { nodes: [{ name: "Shirt", mesh: 0 }, { name: "mixamorig:Hips" }], skins: [{ joints: [1] }] }],
    ["no skins at all", { nodes: [{ name: "Shirt", mesh: 0, skin: 0 }], skins: undefined }],
    ["a skin index that points at nothing", { nodes: [{ name: "Shirt", mesh: 0, skin: 3 }] }],
  ])("refuses %s as not rigged", (_case, extra) => {
    expect(problem(glb({ ...rigged(), ...extra }))).toBe(
      "The 3D model has no rigged (skinned) mesh. Rig the garment to a Mixamo skeleton, then export it again.",
    );
  });

  it("finds the skin by its real index, even after junk entries in the list", () => {
    const json = rigged();
    expect(problem(glb({ ...json, nodes: [{ ...json.nodes[0], skin: 1 }, ...json.nodes.slice(1)], skins: [null, ...json.skins] }))).toBeNull();
  });

  it("names the Mixamo bones a garment is missing, for its category", () => {
    const armsOnly = glb(rigged(["mixamorig:Hips", "mixamorig:Spine", "mixamorig:LeftArm", "mixamorig:RightArm"]));
    expect(problem(armsOnly, "UPPER")).toBeNull();
    expect(problem(armsOnly, "LOWER")).toBe(
      "The 3D model is missing the Mixamo bones a Bottom needs: LeftUpLeg, RightUpLeg. Rig it to a Mixamo skeleton.",
    );
    expect(problem(armsOnly, "OVERALL")).toMatch(/a Dress needs: LeftUpLeg, RightUpLeg\./);
    expect(problem(glb(rigged(["Bone", "Bone.001"])), "UPPER")).toMatch(/a Top needs: Hips, Spine, LeftArm, RightArm\./);
  });

  it("only counts bones that are in a skin (a stray node named like a bone doesn't count)", () => {
    const json = rigged(["mixamorig:Hips", "mixamorig:Spine"]);
    const withStrays = { ...json, nodes: [...json.nodes, { name: "mixamorig:LeftArm" }, { name: "mixamorig:RightArm" }] };
    expect(problem(glb(withStrays), "UPPER")).toMatch(/needs: LeftArm, RightArm\./);
  });

  it("the bones each category needs, and the 5 MB limit (the developer's choice)", () => {
    expect(REQUIRED_BONES).toEqual({
      UPPER: ["Hips", "Spine", "LeftArm", "RightArm"],
      LOWER: ["Hips", "LeftUpLeg", "RightUpLeg"],
      OVERALL: ["Hips", "Spine", "LeftUpLeg", "RightUpLeg"],
    });
    expect(MAX_MODEL_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe("readGlbJson", () => {
  it("returns the scene description from the JSON chunk", () => {
    expect(readGlbJson(glb({ asset: { version: "2.0" }, scene: 0 }))).toEqual({ asset: { version: "2.0" }, scene: 0 });
  });
});
