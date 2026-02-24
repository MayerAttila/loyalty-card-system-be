import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";

type AppleWalletConfig = {
  passTypeIdentifier: string;
  teamIdentifier: string;
  p12Path: string;
  p12Password: string;
  organizationName: string;
  description: string;
  opensslPath: string;
};

export type AppleWalletPassInput = {
  cardId: string;
  serialNumber?: string;
  barcodeValue?: string;
  customerName: string;
  customerEmail?: string | null;
  programName: string;
  issuerName?: string | null;
  businessName?: string | null;
  templateName?: string | null;
  stampCount: number;
  maxPoints: number;
  rewardsEarned?: number;
  cardColor?: string | null;
  websiteUrl?: string | null;
  logoImageUrl?: string | null;
  stripImageUrl?: string | null;
  webServiceUrl?: string | null;
  authenticationToken?: string | null;
  notificationTitle?: string | null;
  notificationMessage?: string | null;
};

export type AppleWalletPassBundle = {
  fileName: string;
  serialNumber: string;
  mimeType: "application/vnd.apple.pkpass";
  buffer: Buffer;
};

type ZipEntry = {
  name: string;
  data: Buffer;
  mtime?: Date;
};

const DEFAULT_DESCRIPTION = "Loyale Loyalty Card";
const DEFAULT_ORGANIZATION_NAME = "Loyale";
const DEFAULT_COLOR = "#121826";
const MAX_NOTIFICATION_FIELD_LENGTH = 180;

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function resolveOpenSSLPath() {
  const configured = process.env.OPENSSL_PATH?.trim();
  if (configured) {
    return configured;
  }

  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe",
      "C:\\Program Files\\OpenSSL-Win32\\bin\\openssl.exe",
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return "openssl";
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function readConfig(): AppleWalletConfig {
  return {
    passTypeIdentifier: requiredEnv("APPLE_WALLET_PASS_TYPE_ID"),
    teamIdentifier: requiredEnv("APPLE_WALLET_TEAM_ID"),
    p12Path: path.resolve(requiredEnv("APPLE_WALLET_CERT_P12_PATH")),
    p12Password: requiredEnv("APPLE_WALLET_CERT_P12_PASSWORD"),
    organizationName:
      process.env.APPLE_WALLET_ORGANIZATION_NAME?.trim() ??
      DEFAULT_ORGANIZATION_NAME,
    description:
      process.env.APPLE_WALLET_DESCRIPTION?.trim() ?? DEFAULT_DESCRIPTION,
    opensslPath: resolveOpenSSLPath(),
  };
}

function toDosDateTime(date: Date) {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc = CRC32_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZipArchive(entries: ZipEntry[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  let centralSize = 0;
  const now = new Date();

  for (const entry of entries) {
    const fileName = entry.name.replace(/\\/g, "/");
    const fileNameBuffer = Buffer.from(fileName, "utf8");
    const data = entry.data;
    const checksum = crc32(data);
    const { dosDate, dosTime } = toDosDateTime(entry.mtime ?? now);
    const localOffset = offset;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(fileNameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, fileNameBuffer, data);
    offset += localHeader.length + fileNameBuffer.length + data.length;

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(fileNameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);

    centralParts.push(centralHeader, fileNameBuffer);
    centralSize += centralHeader.length + fileNameBuffer.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

function normalizeHexColor(value: string | null | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) {
    return DEFAULT_COLOR;
  }
  const normalized = raw.startsWith("#") ? raw.slice(1) : raw;
  if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `#${normalized.toLowerCase()}`;
  }
  if (/^[0-9a-fA-F]{3}$/.test(normalized)) {
    return `#${normalized
      .split("")
      .map((char) => `${char}${char}`)
      .join("")
      .toLowerCase()}`;
  }
  return DEFAULT_COLOR;
}

function hexToRgb(hexColor: string) {
  const normalized = normalizeHexColor(hexColor).slice(1);
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return { r, g, b };
}

function toPassRgb(hexColor: string) {
  const { r, g, b } = hexToRgb(hexColor);
  return `rgb(${r}, ${g}, ${b})`;
}

function getForegroundColor(hexColor: string) {
  const { r, g, b } = hexToRgb(hexColor);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "rgb(15, 23, 42)" : "rgb(255, 255, 255)";
}

function createFallbackImage(options: {
  width: number;
  height: number;
  backgroundHex: string;
  foregroundHex: string;
}) {
  const png = new PNG({ width: options.width, height: options.height });
  const bg = hexToRgb(options.backgroundHex);
  const fg = hexToRgb(options.foregroundHex);
  const radius = Math.floor(Math.min(options.width, options.height) * 0.22);
  const cx = Math.floor(options.width / 2);
  const cy = Math.floor(options.height / 2);

  for (let y = 0; y < options.height; y += 1) {
    for (let x = 0; x < options.width; x += 1) {
      const idx = (y * options.width + x) << 2;
      png.data[idx] = bg.r;
      png.data[idx + 1] = bg.g;
      png.data[idx + 2] = bg.b;
      png.data[idx + 3] = 255;

      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        png.data[idx] = fg.r;
        png.data[idx + 1] = fg.g;
        png.data[idx + 2] = fg.b;
      }
    }
  }

  return PNG.sync.write(png);
}

function scaleNearest(source: PNG, width: number, height: number) {
  const output = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const sy = Math.floor((y / height) * source.height);
    for (let x = 0; x < width; x += 1) {
      const sx = Math.floor((x / width) * source.width);
      const srcIdx = (sy * source.width + sx) << 2;
      const dstIdx = (y * width + x) << 2;
      output.data[dstIdx] = source.data[srcIdx];
      output.data[dstIdx + 1] = source.data[srcIdx + 1];
      output.data[dstIdx + 2] = source.data[srcIdx + 2];
      output.data[dstIdx + 3] = source.data[srcIdx + 3];
    }
  }
  return output;
}

function scaleToFitTransparent(
  source: PNG,
  width: number,
  height: number,
  options?: {
    alignX?: "left" | "center" | "right";
    alignY?: "top" | "center" | "bottom";
  },
) {
  const ratio = Math.min(width / source.width, height / source.height);
  const targetWidth = Math.max(1, Math.floor(source.width * ratio));
  const targetHeight = Math.max(1, Math.floor(source.height * ratio));
  const scaled = scaleNearest(source, targetWidth, targetHeight);
  const output = new PNG({ width, height });
  const alignX = options?.alignX ?? "center";
  const alignY = options?.alignY ?? "center";
  const startX =
    alignX === "left"
      ? 0
      : alignX === "right"
        ? width - targetWidth
        : Math.floor((width - targetWidth) / 2);
  const startY =
    alignY === "top"
      ? 0
      : alignY === "bottom"
        ? height - targetHeight
        : Math.floor((height - targetHeight) / 2);

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const srcIdx = (y * targetWidth + x) << 2;
      const dstIdx = ((y + startY) * width + (x + startX)) << 2;
      output.data[dstIdx] = scaled.data[srcIdx];
      output.data[dstIdx + 1] = scaled.data[srcIdx + 1];
      output.data[dstIdx + 2] = scaled.data[srcIdx + 2];
      output.data[dstIdx + 3] = scaled.data[srcIdx + 3];
    }
  }

  return output;
}

async function tryFetchPng(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const body = Buffer.from(await response.arrayBuffer());
    const contentType = (
      response.headers.get("content-type") ?? ""
    ).toLowerCase();

    if (contentType.includes("svg")) {
      const { Resvg } = await import("@resvg/resvg-js");
      const svg = body.toString("utf8");
      const rendered = new Resvg(svg, { fitTo: { mode: "width", value: 512 } });
      return Buffer.from(rendered.render().asPng());
    }

    try {
      PNG.sync.read(body);
      return body;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

async function runOpenSSL(
  opensslPath: string,
  args: string[],
  options?: { cwd?: string; input?: Buffer | string },
) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(opensslPath, args, {
      cwd: options?.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks));
        return;
      }

      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      reject(
        new Error(
          `OpenSSL command failed (exit ${code}): openssl ${args.join(" ")}${
            stderr ? `\n${stderr}` : ""
          }`,
        ),
      );
    });

    if (options?.input !== undefined) {
      child.stdin.write(options.input);
    }
    child.stdin.end();
  });
}

function buildPassJson(
  config: AppleWalletConfig,
  input: AppleWalletPassInput,
  serialNumber: string,
) {
  const safeMaxPoints = Math.max(1, Math.trunc(input.maxPoints));
  const safeStampCount = Math.min(
    safeMaxPoints,
    Math.max(0, Math.trunc(input.stampCount)),
  );
  const safeRewards = Math.max(0, Math.trunc(input.rewardsEarned ?? 0));
  const backgroundHex = normalizeHexColor(input.cardColor);
  const foreground = getForegroundColor(backgroundHex);
  const barcodeMessage = (input.barcodeValue ?? input.cardId).trim();
  const authenticationToken = input.authenticationToken?.trim() ?? "";
  const webServiceUrl = input.webServiceUrl?.trim() ?? "";
  const businessDisplayName =
    input.businessName?.trim() ||
    input.issuerName?.trim() ||
    config.organizationName;
  const notificationTitleText =
    typeof input.notificationTitle === "string"
      ? input.notificationTitle.trim()
      : "";
  const notificationMessageText =
    typeof input.notificationMessage === "string"
      ? input.notificationMessage.trim()
      : "";
  const notificationFieldValue = (
    notificationMessageText || notificationTitleText
  ).slice(0, MAX_NOTIFICATION_FIELD_LENGTH);
  const notificationChangeMessage =
    notificationTitleText && notificationMessageText
      ? `${notificationTitleText}\n%@`
      : "%@";

  const pass: Record<string, unknown> = {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeIdentifier,
    serialNumber,
    teamIdentifier: config.teamIdentifier,
    organizationName: businessDisplayName,
    description: config.description,
    // Keep logo-only on the left side.
    logoText: " ",
    backgroundColor: toPassRgb(backgroundHex),
    foregroundColor: foreground,
    labelColor: foreground,
    barcode: {
      format: "PKBarcodeFormatQR",
      message: barcodeMessage,
      messageEncoding: "iso-8859-1",
      altText: "Loyalty card",
    },
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: barcodeMessage,
        messageEncoding: "iso-8859-1",
      },
    ],
    storeCard: {
      // Top-right business name.
      headerFields: [
        {
          key: "business",
          label: "Business",
          value: businessDisplayName,
        },
      ],
      // Bottom row: progress (left) + rewards (right).
      auxiliaryFields: [
        {
          key: "stamps",
          label: "Stamps",
          value: `${safeStampCount}/${safeMaxPoints}`,
        },
        {
          key: "rewards",
          label: "Rewards",
          value: safeRewards,
        },
      ],
      ...(notificationFieldValue
        ? {
            backFields: [
              {
                key: "notif_message",
                label: "Latest update",
                value: notificationFieldValue,
                changeMessage: notificationChangeMessage,
              },
            ],
          }
        : {}),
    },
    suppressStripShine: true,
  };

  if (authenticationToken && webServiceUrl) {
    pass.authenticationToken = authenticationToken;
    pass.webServiceURL = webServiceUrl;
  }

  return pass;
}

function toSha1Hex(buffer: Buffer) {
  return createHash("sha1").update(buffer).digest("hex");
}

function toFileSlug(value: string | undefined | null) {
  const normalized = (value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "loyale";
}

export async function createAppleWalletPass(
  input: AppleWalletPassInput,
): Promise<AppleWalletPassBundle> {
  const config = readConfig();

  if (!existsSync(config.p12Path)) {
    throw new Error(
      `Apple Wallet certificate file not found: ${config.p12Path}`,
    );
  }

  const serialNumber = (
    input.serialNumber ??
    input.cardId ??
    randomUUID()
  ).trim();
  if (!serialNumber) {
    throw new Error("serial number is required");
  }

  const backgroundHex = normalizeHexColor(input.cardColor);
  const foregroundHex = getForegroundColor(backgroundHex).includes("255")
    ? "#ffffff"
    : "#0f172a";

  const logoRemote = await tryFetchPng(input.logoImageUrl);
  const logoSourcePng = logoRemote ? PNG.sync.read(logoRemote) : null;
  const icon = logoSourcePng
    ? PNG.sync.write(scaleToFitTransparent(logoSourcePng, 58, 58))
    : createFallbackImage({
        width: 58,
        height: 58,
        backgroundHex,
        foregroundHex,
      });
  const icon2x = logoSourcePng
    ? PNG.sync.write(scaleToFitTransparent(logoSourcePng, 116, 116))
    : createFallbackImage({
        width: 116,
        height: 116,
        backgroundHex,
        foregroundHex,
      });
  const logo = logoRemote
    ? PNG.sync.write(
        scaleToFitTransparent(logoSourcePng!, 320, 100, {
          alignX: "left",
          alignY: "top",
        }),
      )
    : createFallbackImage({
        width: 320,
        height: 100,
        backgroundHex,
        foregroundHex,
      });

  const stripRemote = await tryFetchPng(input.stripImageUrl);
  const strip = stripRemote
    ? PNG.sync.write(
        scaleToFitTransparent(PNG.sync.read(stripRemote), 624, 196),
      )
    : null;

  const passJson = buildPassJson(config, input, serialNumber);
  const passJsonBuffer = Buffer.from(JSON.stringify(passJson, null, 2), "utf8");

  const entries: ZipEntry[] = [
    { name: "pass.json", data: passJsonBuffer },
    { name: "icon.png", data: icon },
    { name: "icon@2x.png", data: icon2x },
    { name: "logo.png", data: logo },
  ];

  if (strip) {
    entries.push({ name: "strip.png", data: strip });
  }

  const manifestRecord: Record<string, string> = {};
  for (const entry of entries) {
    manifestRecord[entry.name] = toSha1Hex(entry.data);
  }
  const manifestBuffer = Buffer.from(
    JSON.stringify(manifestRecord, null, 2),
    "utf8",
  );

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "loyale-apple-pass-"));
  try {
    const manifestPath = path.join(tempDir, "manifest.json");
    const signaturePath = path.join(tempDir, "signature");
    const signerPath = path.join(tempDir, "signer-cert.pem");
    const signerKeyPath = path.join(tempDir, "signer-key.pem");
    const chainPath = path.join(tempDir, "chain.pem");

    await writeFile(manifestPath, manifestBuffer);

    await runOpenSSL(config.opensslPath, [
      "pkcs12",
      "-in",
      config.p12Path,
      "-passin",
      `pass:${config.p12Password}`,
      "-clcerts",
      "-nokeys",
      "-out",
      signerPath,
    ]);

    await runOpenSSL(config.opensslPath, [
      "pkcs12",
      "-in",
      config.p12Path,
      "-passin",
      `pass:${config.p12Password}`,
      "-nocerts",
      "-nodes",
      "-out",
      signerKeyPath,
    ]);

    await runOpenSSL(config.opensslPath, [
      "pkcs12",
      "-in",
      config.p12Path,
      "-passin",
      `pass:${config.p12Password}`,
      "-cacerts",
      "-nokeys",
      "-out",
      chainPath,
    ]);

    await runOpenSSL(config.opensslPath, [
      "smime",
      "-binary",
      "-sign",
      "-in",
      manifestPath,
      "-signer",
      signerPath,
      "-inkey",
      signerKeyPath,
      "-certfile",
      chainPath,
      "-out",
      signaturePath,
      "-outform",
      "DER",
    ]);

    const signatureBuffer = await readFile(signaturePath);
    entries.push({ name: "manifest.json", data: manifestBuffer });
    entries.push({ name: "signature", data: signatureBuffer });

    const fileName = `${toFileSlug(input.businessName || input.programName)}-${toFileSlug(
      serialNumber,
    )}.pkpass`;

    return {
      fileName,
      serialNumber,
      mimeType: "application/vnd.apple.pkpass",
      buffer: createZipArchive(entries),
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
