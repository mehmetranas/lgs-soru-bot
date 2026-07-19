import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const photosDir = process.env.PHOTOS_DIR || "./data/photos";

export async function uploadPhoto(buffer, mimeType) {
  await mkdir(photosDir, { recursive: true });
  const ext = mimeType.split("/")[1] || "jpg";
  const fileName = `${randomUUID()}.${ext}`;
  const filePath = path.join(photosDir, fileName);
  await writeFile(filePath, buffer);
  return filePath;
}
