/**
 * Shrinks a photo before uploading.
 *
 * A phone photo today is 4–8 MB. At one image per week over two years that would be
 * around 800 MB — no problem on the Pi, but very much one over a mobile connection in a
 * waiting room, and sluggish in the gallery later. A 1600 px long edge is entirely
 * enough for the screen and the time-lapse video and comes out at ~300 KB.
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
    // Better to upload the original than to turn the user away with an error.
    return file;
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  return blob ?? file;
}
