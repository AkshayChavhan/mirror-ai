import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { E2E_USERS, redactClerkTokensInConsole } from "../scripts/e2e-clerk";

// The CI log is public: hide Clerk's short-lived session tokens in anything this worker prints (task 71).
redactClerkTokensInConsole();

// Task 67 in the real app: the admin form's optional 3D model field, and the server refusing unusable models.
// Safe to run against any database: each case also sends a "garment image" that isn't an image. The model is
// checked FIRST, so its message shows; and if that check ever broke, the action would still stop at the image
// check, before anything is uploaded or saved. No traces (session cookies; the repo is public).
test.use({ trace: "off" });

/** A .glb file's bytes: the 12-byte header, then the JSON chunk (no BIN chunk needed for these checks). */
function glb(json: unknown): Buffer {
  const text = Buffer.from(JSON.stringify(json));
  const jsonChunk = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + jsonChunk.length, 8);
  header.writeUInt32LE(jsonChunk.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16); // "JSON"
  return Buffer.concat([header, jsonChunk]);
}

test.describe("admin: garment 3D models", () => {
  test.skip(!process.env.CLERK_TESTING_TOKEN, "needs Clerk development keys (see e2e/global-setup.ts)");

  async function openNewProductForm(page: Page) {
    await page.goto("/"); // a public page that loads Clerk
    await clerk.signIn({ page, emailAddress: E2E_USERS.admin });
    await page.goto("/admin/products/new");
    await page.getByLabel("Name").fill("E2E model check (never saved)");
    await page.getByLabel("Category").selectOption("UPPER");
    await page.getByLabel("Garment image").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
  }

  /** The form's error (Next's route announcer is an alert too, outside the form). */
  const formAlert = (page: Page) => page.locator("form").getByRole("alert");

  async function submitWithModel(page: Page, model: { name: string; mimeType: string; buffer: Buffer }) {
    await page.getByLabel("3D model (.glb, optional)").setInputFiles(model);
    await page.getByRole("button", { name: "Create product" }).click();
  }

  test("the form offers an optional .glb model, and refuses a file that isn't one", async ({ page }) => {
    await openNewProductForm(page);
    const field = page.getByLabel("3D model (.glb, optional)");
    await expect(field).toHaveAttribute("accept", ".glb,model/gltf-binary");
    await expect(field).not.toHaveAttribute("required");

    await submitWithModel(page, { name: "shirt.glb", mimeType: "model/gltf-binary", buffer: Buffer.from("just text, renamed") });
    await expect(formAlert(page)).toHaveText(
      "The 3D model isn't a valid .glb file. Export it from Blender as glTF Binary (.glb).",
    );
    await expect(page).toHaveURL(/\/admin\/products\/new$/); // nothing saved
  });

  test("a form at the size limit (5 MB image + 5 MB model) reaches the checks, not cut off by the proxy", async ({ page }) => {
    await openNewProductForm(page);
    const fiveMb = 5 * 1024 * 1024; // each file at its limit: together over 10 MB, the proxy's default
    await page.getByLabel("Garment image").setInputFiles({ name: "big.txt", mimeType: "text/plain", buffer: Buffer.alloc(fiveMb, 0x61) });
    await submitWithModel(page, { name: "big.glb", mimeType: "model/gltf-binary", buffer: Buffer.alloc(fiveMb, 0x62) });
    await expect(formAlert(page)).toHaveText(
      "The 3D model isn't a valid .glb file. Export it from Blender as glTF Binary (.glb).",
    );
  });

  test("refuses a real .glb that isn't rigged, saying how to fix it", async ({ page }) => {
    await openNewProductForm(page);
    const unrigged = glb({ asset: { version: "2.0" }, nodes: [{ name: "Shirt", mesh: 0 }], meshes: [{ primitives: [] }] });
    await submitWithModel(page, { name: "shirt.glb", mimeType: "model/gltf-binary", buffer: unrigged });
    await expect(formAlert(page)).toHaveText(
      "The 3D model has no rigged (skinned) mesh. Rig the garment to a Mixamo skeleton, then export it again.",
    );
    await expect(page).toHaveURL(/\/admin\/products\/new$/);
  });
});
