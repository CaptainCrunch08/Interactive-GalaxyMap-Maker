const MAX_BYTES = 512 * 1024;
const MAX_EDGE = 128;
const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
]);

/**
 * Safely import a faction/army symbol: validate type/size, decode, and
 * normalize to a 128×128 PNG data URL so map markers stay stable.
 */
export async function importFactionSymbol(file: File): Promise<{
  name: string;
  imageDataUrl: string;
}> {
  if (file.size > MAX_BYTES) {
    throw new Error("Image must be 512 KB or smaller.");
  }
  const type = (file.type || "").toLowerCase();
  if (type && !ALLOWED.has(type) && !type.startsWith("image/")) {
    throw new Error("Use PNG, JPEG, WebP, or SVG.");
  }
  if (type && !ALLOWED.has(type) && type !== "image/gif") {
    // allow generic image/* except we still try decode
    if (!type.startsWith("image/")) {
      throw new Error("Use PNG, JPEG, WebP, or SVG.");
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error("Could not decode that image.");
    }
    const imageDataUrl = rasterizeToPngDataUrl(img);
    const name = file.name.replace(/\.[^.]+$/, "") || "Symbol";
    return { name, imageDataUrl };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode that image."));
    img.src = src;
  });
}

function rasterizeToPngDataUrl(img: HTMLImageElement): string {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const dw = Math.max(1, Math.round(w * scale));
  const dh = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = MAX_EDGE;
  canvas.height = MAX_EDGE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image.");
  ctx.clearRect(0, 0, MAX_EDGE, MAX_EDGE);
  const ox = Math.floor((MAX_EDGE - dw) / 2);
  const oy = Math.floor((MAX_EDGE - dh) / 2);
  ctx.drawImage(img, ox, oy, dw, dh);
  return canvas.toDataURL("image/png");
}
