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

  const baseUrl =
    process.env.GCS_PUBLIC_BASE_URL ??
    `https://storage.googleapis.com/${bucketName}`;
  return `${baseUrl}/${params.objectName}`;
}
