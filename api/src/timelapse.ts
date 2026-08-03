import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Baut aus den Wochenfotos ein MP4.
 *
 * MP4 statt GIF: Ein GIF aus 100 Fotos in brauchbarer Auflösung wird zweistellig
 * megabyteschwer und sieht durch die 256-Farben-Palette fleckig aus. Ein H.264-MP4 ist
 * um ein Vielfaches kleiner, schärfer, und jeder Messenger spielt es inline ab.
 *
 * Die Bilder werden auf ein Quadrat skaliert und beschnitten, weil Handyfotos zwischen
 * Hoch- und Querformat wechseln — ohne feste Zielgröße bricht ffmpeg beim ersten
 * Formatwechsel ab.
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
    // ffmpeg braucht eine lückenlose Nummernfolge. Kopieren statt symlinken, weil
    // ffmpeg in manchen Builds Symlinks über Dateisystemgrenzen nicht auflöst.
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
      // Ohne even-dimension-Garantie weigert sich libx264 bei ungeraden Größen.
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
      // Nur das Ende behalten — ffmpeg schreibt sehr viel Fortschritt auf stderr.
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on("error", (err) => reject(new Error(`${cmd} nicht startbar: ${err.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} beendet mit Code ${code}\n${stderr}`));
    });
  });
}
