import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Builds an MP4 from the weekly photos.
 *
 * MP4 rather than GIF: a GIF of 100 photos at a usable resolution runs into double-digit
 * megabytes and looks blotchy because of the 256-colour palette. An H.264 MP4 is many
 * times smaller, sharper, and every messenger plays it inline.
 *
 * The images are scaled and cropped to a square because phone photos alternate between
 * portrait and landscape — without a fixed target size ffmpeg aborts at the first change
 * of orientation.
 */
export async function renderTimelapse(
  imagePaths: string[],
  dataDir: string,
  opts: { size?: number; framerate?: number } = {},
): Promise<string> {
  const size = opts.size ?? 1080;
  const framerate = opts.framerate ?? 2;

  const work = await mkdtemp(join(tmpdir(), "bm-timelapse-"));
  const outDir = join(dataDir, "exports");
  await mkdir(outDir, { recursive: true });
  const output = join(outDir, "zeitraffer.mp4");

  try {
    // ffmpeg needs a gapless number sequence. Copying rather than symlinking, because
    // in some builds ffmpeg does not resolve symlinks across file system boundaries.
    await Promise.all(
      imagePaths.map((src, i) => copyFile(src, join(work, `${String(i + 1).padStart(5, "0")}.jpg`))),
    );

    await run("ffmpeg", [
      "-y",
      "-framerate", String(framerate),
      "-i", join(work, "%05d.jpg"),
      "-vf",
      `scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size},format=yuv420p`,
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "23",
      // Without guaranteeing even dimensions, libx264 refuses odd sizes.
      "-movflags", "+faststart",
      output,
    ]);

    return output;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      // Keep only the tail — ffmpeg writes a great deal of progress to stderr.
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on("error", (err) => reject(new Error(`${cmd} nicht startbar: ${err.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} beendet mit Code ${code}\n${stderr}`));
    });
  });
}
