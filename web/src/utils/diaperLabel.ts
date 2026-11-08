import type { DiaperKind } from "@babydiary/shared";

/**
 * Which message key names a nappy kind.
 *
 * This mapping lived in the home screen and in the history, spelled out identically in
 * both. The entry sheet needed it for a third time, which — by this project's own
 * experience with the feed flags — is the point at which copies start drifting apart.
 *
 * `both` is the legacy fourth kind. Nothing writes it any more (the UI offers three),
 * but old entries carry it and it reads as soiled wherever it still turns up.
 */
const KEYS: Record<string, string> = {
  empty: "diaper.empty",
  wet: "diaper.wet",
  soiled: "diaper.soiled",
  both: "diaper.soiled",
};

export function diaperKey(kind: DiaperKind | string | null): string {
  return KEYS[kind ?? "empty"] ?? "diaper.empty";
}
