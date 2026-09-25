import { UnreadableImageError } from "./photoFailure.ts";

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

/**
 * Turn the picked file into something drawable, or say plainly that it is not.
 *
 * A gallery does not always hand over what it shows. On Android a photo that lives in
 * the cloud, or one edited seconds ago and still syncing, comes through the picker as a
 * file of zero bytes — the entry exists, the bytes do not. That has to be told apart
 * from "the upload failed", because no amount of trying again will make those bytes
 * appear; the picture has to be downloaded or saved as a copy first.
 *
 * `createImageBitmap` is the fast path and the fussy one. Where it refuses, an
 * <img> with an object URL sometimes still decodes the same file — different code inside
 * the browser, and on Android not always the same answer. Worth one second attempt
 * before giving up on a photo somebody just chose.
 */
async function decode(file: File | Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (file.size === 0) throw new UnreadableImageError("empty");

  try {
    return await createImageBitmap(file);
  } catch {
    // Second attempt through the other decoder.
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new UnreadableImageError("undecodable"));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function shrinkImage(file: File | Blob): Promise<Blob> {
  const bitmap = await decode(file);

  const source = bitmap instanceof HTMLImageElement
    ? { width: bitmap.naturalWidth, height: bitmap.naturalHeight }
    : bitmap;
  const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    close(bitmap);
    // Better to upload the original than to turn the user away with an error.
    return file;
  }

  context.drawImage(bitmap, 0, 0, width, height);
  close(bitmap);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  return blob ?? file;
}

function close(bitmap: ImageBitmap | HTMLImageElement): void {
  if (!(bitmap instanceof HTMLImageElement)) bitmap.close();
}
