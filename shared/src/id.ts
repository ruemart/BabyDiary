/**
 * UUIDv7 — zeitsortierte Ids, auf dem Client erzeugt.
 *
 * Auf dem Client erzeugt, damit ein Eintrag offline sofort seine endgültige Id hat und
 * beim späteren Sync keine Id-Umschreibung nötig ist. Version 7 statt 4, weil die
 * ersten 48 Bit der Zeitstempel sind: Ids sortieren sich damit chronologisch, was
 * B-Tree-Indizes in SQLite freundlich stimmt und die Outbox-Reihenfolge stabil hält.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // 48-Bit-Zeitstempel, big endian. Division statt Bit-Shift, weil >>> bei 32 Bit abschneidet.
  bytes[0] = Math.floor(now / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(now / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(now / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(now / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;

  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // Version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC-4122-Variante

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
