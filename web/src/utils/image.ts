/**
 * Verkleinert ein Foto vor dem Hochladen.
 *
 * Ein Handyfoto ist heute 4–8 MB groß. Bei einem Bild pro Woche über zwei Jahre wären
 * das rund 800 MB — auf dem Pi kein Problem, über eine Mobilfunkverbindung im
 * Wartezimmer aber sehr wohl, und in der Galerie später zäh. 1600 px lange Kante
 * reicht für Bildschirm und Zeitraffer-Video vollständig aus und landet bei ~300 KB.
 */
const MAX_EDGE = 1600;
const QUALITY = 0.82;

export async function shrinkImage(file: File | Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    // Lieber das Original hochladen als den Nutzer mit einem Fehler abweisen.
    return file;
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  return blob ?? file;
}
