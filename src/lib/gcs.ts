import { Storage } from "@google-cloud/storage";

const storage = new Storage();

function getBucketName() {
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("GCS_BUCKET_NAME is not configured");
  }
  return bucketName;
}

export async function uploadImageBuffer(params: {
  buffer: Buffer;
  mimeType: string;
  objectName: string;
}) {
  const bucketName = getBucketName();
  const file = storage.bucket(bucketName).file(params.objectName);
  await file.save(params.buffer, {
    contentType: params.mimeType,
    resumable: false,
  });

  const baseUrl = getPublicBaseUrl();
  return `${baseUrl}/${params.objectName}`;
}

export function getPublicBaseUrl() {
  const bucketName = getBucketName();
  return (
    process.env.GCS_PUBLIC_BASE_URL ??
    `https://storage.googleapis.com/${bucketName}`
  );
}

function getObjectNameFromUrl(url: string) {
  const bucketName = getBucketName();
  const baseUrl = process.env.GCS_PUBLIC_BASE_URL;

  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/+/, "");

    if (baseUrl) {
      const basePath = new URL(baseUrl).pathname.replace(/^\/+/, "");
      if (path.startsWith(basePath)) {
        const trimmed = path.slice(basePath.length).replace(/^\/+/, "");
        return trimmed || null;
      }
      return path || null;
    }

    if (path.startsWith(`${bucketName}/`)) {
      return path.slice(bucketName.length + 1) || null;
    }
  } catch {
    return null;
  }

  return null;
}

export async function deleteImageByUrl(url: string) {
  const bucketName = getBucketName();
  const objectName = getObjectNameFromUrl(url);
  if (!objectName) {
    throw new Error("Unable to resolve GCS object name from URL");
  }

  const file = storage.bucket(bucketName).file(objectName);
  try {
    await file.delete();
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 404) return;
    throw error;
  }
}
