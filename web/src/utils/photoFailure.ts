/**
 * Why a photo did not make it, told apart by cause rather than by wording.
 *
 * This used to be one `message.includes("fehlgeschlagen")`, and it got both cases
 * backwards: only the HTTP path put that word in the message, so a server that refused
 * the file reported "no connection", while actually being offline — where `fetch` throws
 * a TypeError — reported "please try again". A German word, in a repository that is
 * otherwise English, deciding which advice a parent gets.
 *
 * The distinction earns its keep because the three cases need three different actions:
 * wait for a connection, pick a different picture, or genuinely try again.
 */

/** The gallery handed over something that is not a readable image. */
export class UnreadableImageError extends Error {
  constructor(
    /** For the report: empty file, or a decoder that refused it. */
    readonly reason: "empty" | "undecodable",
  ) {
    super(`Image could not be read (${reason})`);
    this.name = "UnreadableImageError";
  }
}

/** The server answered, and said no. */
export class UploadRejectedError extends Error {
  constructor(readonly status: number) {
    super(`Upload rejected (${status})`);
    this.name = "UploadRejectedError";
  }
}

export type PhotoFailure =
  | { kind: "unreadable"; reason: "empty" | "undecodable" }
  | { kind: "rejected"; status: number }
  | { kind: "offline" }
  | { kind: "unknown" };

export function classifyPhotoFailure(error: unknown): PhotoFailure {
  if (error instanceof UnreadableImageError) return { kind: "unreadable", reason: error.reason };
  if (error instanceof UploadRejectedError) return { kind: "rejected", status: error.status };
  /**
   * A failed `fetch` rejects with a TypeError and nothing else to go on — no status, no
   * code. That is the one case where "you appear to be offline" is the right thing to
   * say, and it is exactly the case the old check missed.
   */
  if (error instanceof TypeError) return { kind: "offline" };
  return { kind: "unknown" };
}
