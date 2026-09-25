import { describe, expect, it } from "vitest";
import { shrinkImage } from "./image.ts";
import { UnreadableImageError } from "./photoFailure.ts";

/**
 * The case from the gallery: an entry that is listed but has no bytes behind it — a
 * picture still syncing after an edit, or one that only lives in the cloud. It has to
 * come back as "unreadable" and not as a failed upload, because the advice differs.
 */
describe("A file the gallery could not fill", () => {
  it("is reported as unreadable before anything is uploaded", async () => {
    const empty = new Blob([], { type: "image/jpeg" });

    await expect(shrinkImage(empty)).rejects.toBeInstanceOf(UnreadableImageError);
    await expect(shrinkImage(empty)).rejects.toMatchObject({ reason: "empty" });
  });
});
