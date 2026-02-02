import { PNG } from "pngjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { uploadImageBuffer, getPublicBaseUrl } from "./gcs.js";

const HERO_WIDTH = 1032;
const HERO_HEIGHT = 420;
const HERO_PADDING = 28;
const HERO_GAP = 12;
const DEFAULT_STAMP_DIR =
  process.env.DEFAULT_STAMP_DIR ??
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/default-stamps");
let resvgPromise: Promise<typeof import("@resvg/resvg-js")> | null = null;

type StampHeroOptions = {
  templateId: string;
  maxPoints: number;
  stampRows?: number;
  stampOnUrl?: string;
  stampOffUrl?: string;
  useDefaultStamps?: boolean;
  stampOnUrls?: string[];
  stampOffUrls?: string[];
};

type StampGridLayout = {
  columns: number;
  rows: number;
  stampSize: number;
  gapX: number;
  gapY: number;
  startX: number;
  startY: number;
};

const clampMaxPoints = (value: number) => Math.min(Math.max(value, 1), 50);
const clampRows = (value: number) => Math.min(Math.max(value, 1), 2);

function getLayout(maxPoints: number, rows: number): StampGridLayout {
  const columns = Math.ceil(maxPoints / rows);
  const availableWidth = HERO_WIDTH - HERO_PADDING * 2;
  const availableHeight = HERO_HEIGHT - HERO_PADDING * 2;
  const minGap = HERO_GAP;

  const maxStampWidth =
    columns > 1
      ? (availableWidth - minGap * (columns - 1)) / columns
      : availableWidth;
  const maxStampHeight =
    rows > 1
      ? (availableHeight - minGap * (rows - 1)) / rows
      : availableHeight;
  const stampSize = Math.max(1, Math.floor(Math.min(maxStampWidth, maxStampHeight)));

  const gapX =
    columns > 1
      ? Math.max(0, Math.floor((availableWidth - stampSize * columns) / (columns - 1)))
      : 0;
  const gapY =
    rows > 1
      ? Math.max(0, Math.floor((availableHeight - stampSize * rows) / (rows - 1)))
      : 0;

  const startX = HERO_PADDING;
  const startY = HERO_PADDING;

  return { columns, rows, stampSize, gapX, gapY, startX, startY };
}

function ensurePng(buffer: Buffer) {
  const signature = buffer.subarray(0, 8);
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!signature.equals(pngSignature)) {
    throw new Error("Stamp images must be PNG files.");
  }
}

async function fetchImageBuffer(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to fetch stamp image: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function scaleNearest(src: PNG, targetWidth: number, targetHeight: number) {
  const dst = new PNG({ width: targetWidth, height: targetHeight });
  for (let y = 0; y < targetHeight; y += 1) {
    const sy = Math.floor((y / targetHeight) * src.height);
    for (let x = 0; x < targetWidth; x += 1) {
      const sx = Math.floor((x / targetWidth) * src.width);
      const sIdx = (sy * src.width + sx) << 2;
      const dIdx = (y * targetWidth + x) << 2;
      dst.data[dIdx] = src.data[sIdx];
      dst.data[dIdx + 1] = src.data[sIdx + 1];
      dst.data[dIdx + 2] = src.data[sIdx + 2];
      dst.data[dIdx + 3] = src.data[sIdx + 3];
    }
  }
  return dst;
}

function blendPixel(dst: PNG, dx: number, dy: number, src: PNG, sx: number, sy: number) {
  if (dx < 0 || dy < 0 || dx >= dst.width || dy >= dst.height) return;
  const sIdx = (sy * src.width + sx) << 2;
  const dIdx = (dy * dst.width + dx) << 2;

  const srcA = src.data[sIdx + 3] / 255;
  if (srcA === 0) return;
  const dstA = dst.data[dIdx + 3] / 255;

  const outA = srcA + dstA * (1 - srcA);
  const outR =
    (src.data[sIdx] * srcA + dst.data[dIdx] * dstA * (1 - srcA)) / outA;
  const outG =
    (src.data[sIdx + 1] * srcA + dst.data[dIdx + 1] * dstA * (1 - srcA)) /
    outA;
  const outB =
    (src.data[sIdx + 2] * srcA + dst.data[dIdx + 2] * dstA * (1 - srcA)) /
    outA;

  dst.data[dIdx] = Math.round(outR);
  dst.data[dIdx + 1] = Math.round(outG);
  dst.data[dIdx + 2] = Math.round(outB);
  dst.data[dIdx + 3] = Math.round(outA * 255);
}

const DEFAULT_STAMP_SIZE = 180;

function getContrastStampColor(hexColor?: string) {
  if (!hexColor) return "#ffffff";
  const normalized = hexColor.trim().replace("#", "");
  if (normalized.length !== 6) return "#ffffff";
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0f172a" : "#ffffff";
}

export function getStampHeroImagePath(templateId: string, stampCount: number) {
  const safeCount = Math.max(0, Math.floor(stampCount));
  return `templates/${templateId}/hero/stamps-${safeCount}.png`;
}

export function getStampHeroImageUrl(templateId: string, stampCount: number) {
  return `${getPublicBaseUrl()}/${getStampHeroImagePath(
    templateId,
    stampCount
  )}`;
}

export function getDefaultStampImagePath(
  templateId: string,
  filled: boolean,
  index: number
) {
  const safeIndex = Math.max(1, Math.floor(index));
  return `templates/${templateId}/default-stamps/${
    filled ? "on" : "off"
  }-${safeIndex}.png`;
}

export function getDefaultStampImageUrl(
  templateId: string,
  filled: boolean,
  index: number
) {
  return `${getPublicBaseUrl()}/${getDefaultStampImagePath(
    templateId,
    filled,
    index
  )}`;
}

async function renderDefaultStampSvg(
  filled: boolean,
  index: number,
  size = DEFAULT_STAMP_SIZE,
  color = "#ffffff"
) {
  if (!resvgPromise) {
    resvgPromise = import("@resvg/resvg-js");
  }
  const { Resvg } = await resvgPromise;
  const templatePath = path.join(
    DEFAULT_STAMP_DIR,
    filled ? "on.svg" : "off.svg"
  );
  const svgTemplate = await readFile(templatePath, "utf-8");
  const svg = svgTemplate
    .replace(/\{\{NUMBER\}\}/g, String(index))
    .replace(/\{\{SIZE\}\}/g, String(size))
    .replace(/\{\{COLOR\}\}/g, color);
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: size } });
  return Buffer.from(resvg.render().asPng());
}

export async function generateDefaultStampImages(options: {
  templateId: string;
  maxPoints: number;
  cardColor?: string;
}) {
  const maxPoints = clampMaxPoints(options.maxPoints);
  const color = getContrastStampColor(options.cardColor);
  for (let index = 1; index <= maxPoints; index += 1) {
    const [onBuffer, offBuffer] = await Promise.all([
      renderDefaultStampSvg(true, index, DEFAULT_STAMP_SIZE, color),
      renderDefaultStampSvg(false, index, DEFAULT_STAMP_SIZE, color),
    ]);
    await uploadImageBuffer({
      buffer: onBuffer,
      mimeType: "image/png",
      objectName: getDefaultStampImagePath(options.templateId, true, index),
    });
    await uploadImageBuffer({
      buffer: offBuffer,
      mimeType: "image/png",
      objectName: getDefaultStampImagePath(options.templateId, false, index),
    });
  }
}

async function renderStampHeroImage(options: StampHeroOptions, count: number) {
  const maxPoints = clampMaxPoints(options.maxPoints);
  const rows = clampRows(options.stampRows ?? 2);
  const layout = getLayout(maxPoints, rows);
  const useDefaultStamps =
    options.useDefaultStamps ||
    !options.stampOnUrl ||
    !options.stampOffUrl;
  const useIndexedStamps =
    Array.isArray(options.stampOnUrls) &&
    Array.isArray(options.stampOffUrls) &&
    options.stampOnUrls.length >= maxPoints &&
    options.stampOffUrls.length >= maxPoints;

  let stampOn: PNG | null = null;
  let stampOff: PNG | null = null;
  let stampOnByIndex: PNG[] | null = null;
  let stampOffByIndex: PNG[] | null = null;

  if (useIndexedStamps) {
    const onBuffers = await Promise.all(
      options.stampOnUrls!.slice(0, maxPoints).map(fetchImageBuffer)
    );
    const offBuffers = await Promise.all(
      options.stampOffUrls!.slice(0, maxPoints).map(fetchImageBuffer)
    );
    stampOnByIndex = onBuffers.map((buffer) => {
      ensurePng(buffer);
      return scaleNearest(PNG.sync.read(buffer), layout.stampSize, layout.stampSize);
    });
    stampOffByIndex = offBuffers.map((buffer) => {
      ensurePng(buffer);
      return scaleNearest(PNG.sync.read(buffer), layout.stampSize, layout.stampSize);
    });
  } else if (!useDefaultStamps) {
    const [stampOnRaw, stampOffRaw] = await Promise.all([
      fetchImageBuffer(options.stampOnUrl!),
      fetchImageBuffer(options.stampOffUrl!),
    ]);

    ensurePng(stampOnRaw);
    ensurePng(stampOffRaw);

    const stampOnDecoded = PNG.sync.read(stampOnRaw);
    const stampOffDecoded = PNG.sync.read(stampOffRaw);

    stampOn = scaleNearest(
      stampOnDecoded,
      layout.stampSize,
      layout.stampSize
    );
    stampOff = scaleNearest(
      stampOffDecoded,
      layout.stampSize,
      layout.stampSize
    );
  }

  const positions = Array.from({ length: maxPoints }, (_, index) => {
    const row = Math.floor(index / layout.columns);
    const col = index % layout.columns;
    return {
      left: layout.startX + col * (layout.stampSize + layout.gapX),
      top: layout.startY + row * (layout.stampSize + layout.gapY),
    };
  });

  const canvas = new PNG({ width: HERO_WIDTH, height: HERO_HEIGHT });

  for (let index = 0; index < maxPoints; index += 1) {
    const pos = positions[index];
    if (useIndexedStamps && stampOnByIndex && stampOffByIndex) {
      const src = index < count ? stampOnByIndex[index] : stampOffByIndex[index];
      for (let y = 0; y < src.height; y += 1) {
        const dy = pos.top + y;
        if (dy < 0 || dy >= HERO_HEIGHT) continue;
        for (let x = 0; x < src.width; x += 1) {
          const dx = pos.left + x;
          if (dx < 0 || dx >= HERO_WIDTH) continue;
          blendPixel(canvas, dx, dy, src, x, y);
        }
      }
      continue;
    }
    if (useDefaultStamps) {
      throw new Error("Default stamp images are missing.");
    }

    const src = index < count ? stampOn : stampOff;
    if (!src) continue;
    for (let y = 0; y < src.height; y += 1) {
      const dy = pos.top + y;
      if (dy < 0 || dy >= HERO_HEIGHT) continue;
      for (let x = 0; x < src.width; x += 1) {
        const dx = pos.left + x;
        if (dx < 0 || dx >= HERO_WIDTH) continue;
        blendPixel(canvas, dx, dy, src, x, y);
      }
    }
  }

  const buffer = PNG.sync.write(canvas);
  return { buffer, layout };
}

export async function generateStampHeroImageForCount(
  options: StampHeroOptions,
  count: number
) {
  const startedAt = Date.now();
  const { buffer } = await renderStampHeroImage(options, count);
  await uploadImageBuffer({
    buffer,
    mimeType: "image/png",
    objectName: getStampHeroImagePath(options.templateId, count),
  });
  console.log("[hero-image] single uploaded", {
    count,
    path: getStampHeroImagePath(options.templateId, count),
    ms: Date.now() - startedAt,
  });
}

export async function generateStampHeroImages(options: StampHeroOptions) {
  console.log(
    "[hero-image] start",
    JSON.stringify({
      templateId: options.templateId,
      maxPoints: options.maxPoints,
      stampRows: options.stampRows ?? 2,
      stampOnUrl: options.stampOnUrl,
      stampOffUrl: options.stampOffUrl,
      useDefaultStamps: options.useDefaultStamps ?? false,
    })
  );
  const maxPoints = clampMaxPoints(options.maxPoints);
  const rows = clampRows(options.stampRows ?? 2);
  const layout = getLayout(maxPoints, rows);
  console.log("[hero-image] layout", layout);

  for (let count = 0; count <= maxPoints; count += 1) {
    const startedAt = Date.now();
    console.log("[hero-image] render start", { count });
    const { buffer } = await renderStampHeroImage(options, count);
    console.log("[hero-image] rendered", {
      count,
      bytes: buffer.length,
      ms: Date.now() - startedAt,
    });

    await uploadImageBuffer({
      buffer,
      mimeType: "image/png",
      objectName: getStampHeroImagePath(options.templateId, count),
    });
    console.log("[hero-image] uploaded", {
      path: getStampHeroImagePath(options.templateId, count),
      ms: Date.now() - startedAt,
    });
  }
  console.log("[hero-image] complete");
}
