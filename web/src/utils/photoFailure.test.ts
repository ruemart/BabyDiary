import { describe, expect, it } from "vitest";
import {
  UnreadableImageError,
  UploadRejectedError,
  classifyPhotoFailure,
} from "./photoFailure.ts";

/**
 * The advice a parent gets depends on this, and it was wrong in both directions before:
 * the check looked for a German word that only the HTTP path put in its message, so
 * being offline read as "please try again" and a refused file read as "no connection".
 */

describe("Why a photo did not go through", () => {
  it("tells an empty file from a file the decoder refused", () => {
    expect(classifyPhotoFailure(new UnreadableImageError("empty"))).toEqual({
      kind: "unreadable",
      reason: "empty",
    });
    expect(classifyPhotoFailure(new UnreadableImageError("undecodable"))).toEqual({
      kind: "unreadable",
      reason: "undecodable",
    });
  });

  /** A failed fetch rejects with a TypeError and nothing else to go on. */
  it("reads a failed fetch as being offline", () => {
    expect(classifyPhotoFailure(new TypeError("Failed to fetch"))).toEqual({ kind: "offline" });
    // Safari and Firefox word it differently; the type is what carries the meaning.
    expect(classifyPhotoFailure(new TypeError("Load failed"))).toEqual({ kind: "offline" });
    expect(classifyPhotoFailure(new TypeError("NetworkError"))).toEqual({ kind: "offline" });
  });

  /**
   * The case that used to claim there was no connection, while the server had just
   * answered — with a refusal.
   */
  it("keeps a refusal by the server apart from a missing connection", () => {
    expect(classifyPhotoFailure(new UploadRejectedError(415))).toEqual({
      kind: "rejected",
      status: 415,
    });
    expect(classifyPhotoFailure(new UploadRejectedError(413))).toEqual({
      kind: "rejected",
      status: 413,
    });
  });

  it("does not guess at anything else", () => {
    expect(classifyPhotoFailure(new Error("something"))).toEqual({ kind: "unknown" });
    expect(classifyPhotoFailure("a string")).toEqual({ kind: "unknown" });
    expect(classifyPhotoFailure(undefined)).toEqual({ kind: "unknown" });
  });

  /** The old check keyed on this word; nothing may depend on wording again. */
  it("does not depend on the wording of a message", () => {
    expect(classifyPhotoFailure(new Error("Upload fehlgeschlagen (415)"))).toEqual({
      kind: "unknown",
    });
  });
});
