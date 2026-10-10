const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_EDGE = 1600;

function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(blob);
  });
}

/** Compress teacher uploads locally before sending them to Apps Script/Drive. */
export async function imageFileToDataUrl(file?: File): Promise<string> {
  if (!file) return "";
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Usa una imagen PNG, JPG o WebP.");
  if (file.size > MAX_FILE_BYTES) throw new Error("La imagen debe pesar menos de 5 MB.");

  if (typeof createImageBitmap !== "function") return readDataUrl(file);
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return readDataUrl(file);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const compressed = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.82));
    if (!compressed || compressed.size >= file.size) return readDataUrl(file);
    return await readDataUrl(compressed);
  } catch {
    return readDataUrl(file);
  } finally {
    bitmap?.close();
  }
}
