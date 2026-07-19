import { Client } from "minio";
import { randomUUID } from "crypto";

const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT,
  port: Number(process.env.MINIO_PORT || 9000),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

const bucket = process.env.MINIO_BUCKET || "lgs-soru-bot";
let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;
  const exists = await minioClient.bucketExists(bucket).catch(() => false);
  if (!exists) await minioClient.makeBucket(bucket);
  bucketReady = true;
}

export async function uploadPhoto(buffer, mimeType) {
  await ensureBucket();
  const ext = mimeType.split("/")[1] || "jpg";
  const objectName = `${randomUUID()}.${ext}`;
  await minioClient.putObject(bucket, objectName, buffer, buffer.length, {
    "Content-Type": mimeType,
  });
  return `s3://${bucket}/${objectName}`;
}
