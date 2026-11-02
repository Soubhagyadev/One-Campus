export const PHOTO_BYTES = 200 * 1024;
/** Re-encoding strips metadata; keep the longest edge <=800px and bytes <=200KB. */
export async function compressPhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPEG, PNG, or WebP photo.");
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 10 MB.");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("This photo could not be opened. Try another image.");
  });
  try {
    if (bitmap.width * bitmap.height > 40000000)
      throw new Error(
        "This image is too large to process. Choose a smaller photo.",
      );
    const canvas = document.createElement("canvas"),
      scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error("Photo compression is not supported in this browser.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.58, 0.46, 0.32]) {
      const url = canvas.toDataURL("image/jpeg", quality);
      if (
        Math.ceil(((url.length - url.indexOf(",") - 1) * 3) / 4) <= PHOTO_BYTES
      )
        return url;
    }
    throw new Error(
      "This photo is still too large. Try a simpler or smaller image.",
    );
  } finally {
    bitmap.close();
  }
}
