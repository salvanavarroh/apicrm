// Transcodifica audio a m4a/AAC (audio/mp4), el único formato de audio que
// aceptan a la vez WhatsApp e Instagram para envío. Chrome graba webm/opus, que
// ninguno acepta; Safari ya graba mp4/AAC (no hace falta convertir).
//
// Usa ffmpeg.wasm cargado on-demand desde CDN (worker + core), así no infla el
// bundle inicial ni requiere binarios en el server. La primera vez baja el core
// (~30MB) y queda cacheado. Corre 100% en el browser.

import type { FFmpeg } from "@ffmpeg/ffmpeg";

const FFMPEG_VERSION = "0.12.15";
const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
const WORKER_URL = `https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm/worker.js`;

// Formatos de audio que ya sirven para enviar tal cual (no transcodificar).
const SENDABLE = ["audio/mp4", "audio/aac", "audio/x-m4a", "audio/m4a"];

let ffmpegPromise: Promise<FFmpeg> | null = null;

async function loadFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import("@ffmpeg/ffmpeg"),
        import("@ffmpeg/util"),
      ]);
      const ff = new FFmpeg();
      await ff.load({
        classWorkerURL: await toBlobURL(WORKER_URL, "text/javascript"),
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      });
      return ff;
    })();
  }
  return ffmpegPromise;
}

export function needsAudioTranscode(mime: string): boolean {
  return !SENDABLE.some((m) => mime.startsWith(m));
}

/**
 * Devuelve un File de audio listo para enviar (m4a/AAC). Si ya viene en un
 * formato compatible, lo deja igual. Lanza si la conversión falla.
 */
export async function toSendableAudio(file: File): Promise<File> {
  if (!needsAudioTranscode(file.type)) return file;
  const ff = await loadFFmpeg();
  const input = "input";
  const output = "output.m4a";
  await ff.writeFile(input, new Uint8Array(await file.arrayBuffer()));
  await ff.exec(["-i", input, "-vn", "-c:a", "aac", "-b:a", "128k", output]);
  const out = (await ff.readFile(output)) as Uint8Array;
  ff.deleteFile(input).catch(() => {});
  ff.deleteFile(output).catch(() => {});
  // Copia a un ArrayBuffer propio (evita el conflicto ArrayBufferLike de TS).
  const ab = new ArrayBuffer(out.byteLength);
  new Uint8Array(ab).set(out);
  return new File([ab], "nota-de-voz.m4a", { type: "audio/mp4" });
}
