/**
 * UUIDv7 — time-sortable ids, generated on the client.
 *
 * Generated on the client so an entry has its final id immediately while offline and no
 * id rewriting is needed when it syncs later. Version 7 rather than 4 because the first
 * 48 bits are the timestamp: ids therefore sort chronologically, which keeps SQLite's
 * B-tree indexes happy and the outbox order stable.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // 48-bit timestamp, big endian. Division rather than a bit shift, because >>> truncates at 32 bits.
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
