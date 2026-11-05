import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v2 as cloudinary } from "cloudinary";

const bucket = process.env.R2_BUCKET_NAME || process.env.S3_BUCKET || "";
const endpoint = process.env.R2_ENDPOINT || (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : process.env.S3_ENDPOINT);
const isProd = process.env.NODE_ENV === "production";
const secret = process.env.SESSION_SECRET || "classes-storage-secret-key-2026";
const uploadBase = path.resolve(process.cwd(), "uploads");

const r2 = new S3Client({
  region: process.env.R2_REGION || process.env.S3_REGION || "auto",
  ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  credentials: process.env.R2_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID ? {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY || "",
  } : undefined,
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export function r2Configured() {
  return !!(bucket && endpoint && (process.env.R2_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID));
}

export function cloudinaryConfigured() {
  return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

export function getUploadPath(subpath: string): string {
  const normalized = path.normalize(subpath).replace(/^(\.\.(\/|\\|$))+/, "");
  const full = path.resolve(uploadBase, normalized);
  if (!full.startsWith(uploadBase)) {
    throw new Error("Invalid path traversal detected");
  }
  return full;
}

export async function putPdf(key: string, body: Buffer): Promise<void> {
  if (r2Configured()) {
    await r2.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/pdf",
      ContentDisposition: "attachment"
    }));
    return;
  }
  if (isProd) {
    throw Object.assign(new Error("Cloudflare R2 is not configured"), { status: 503 });
  }
  const target = getUploadPath(key);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
}

export async function deletePdf(key: string): Promise<void> {
  if (r2Configured()) {
    await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return;
  }
  if (isProd) {
    throw Object.assign(new Error("Cloudflare R2 is not configured"), { status: 503 });
  }
  try {
    const target = getUploadPath(key);
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch {}
}

export function verifyDownloadToken(token: string): { key: string; filename: string } | null {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (Date.now() > data.expiresAt) return null;
    return { key: data.key, filename: data.filename };
  } catch {
    return null;
  }
}

export async function signPdfDownload(key: string, filename: string): Promise<string> {
  const expiry = Math.max(1, Math.min(600, Number(process.env.SIGNED_URL_EXPIRY_SECONDS) || 60));
  const safeName = filename.replace(/[\r\n"\\]/g, "");
  if (r2Configured()) {
    return getSignedUrl(r2, new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: "application/pdf",
      ResponseContentDisposition: `attachment; filename="${safeName}"`
    }), { expiresIn: expiry });
  }
  if (isProd) {
    throw Object.assign(new Error("Cloudflare R2 is not configured"), { status: 503 });
  }
  const expiresAt = Date.now() + expiry * 1000;
  const payload = Buffer.from(JSON.stringify({ key, filename: safeName, expiresAt })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const token = `${payload}.${sig}`;
  const apiPublic = process.env.BACKEND_URL
    ? `${process.env.BACKEND_URL.replace(/\/$/, "")}/api`
    : (process.env.API_PUBLIC_URL || "https://digital-bizware-1.onrender.com/api");
  return `${apiPublic}/downloads/${token}?filename=${encodeURIComponent(safeName)}`;
}

export async function streamLegacyObject(key: string, res: import("express").Response): Promise<void> {
  if (r2Configured()) {
    const file = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = file.Body as Readable;
    res.setHeader("Content-Type", file.ContentType || "application/octet-stream");
    res.setHeader("Cache-Control", "public,max-age=3600");
    body.pipe(res);
    return;
  }
  const target = getUploadPath(key);
  if (fs.existsSync(target)) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "public,max-age=3600");
    fs.createReadStream(target).pipe(res);
  } else {
    res.sendStatus(404);
  }
}

export async function uploadCover(buffer: Buffer, format: "png" | "jpg" | "webp"): Promise<{ url: string; publicId: string }> {
  if (cloudinaryConfigured()) {
    return new Promise<{ url: string; publicId: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        folder: "classes/books",
        resource_type: "image",
        allowed_formats: ["png", "jpg", "jpeg", "webp"],
        public_id: `cover-${crypto.randomUUID()}`,
        overwrite: false,
        unique_filename: true,
      }, (error, result) => {
        if (error || !result?.secure_url || !result.public_id) {
          return reject(error || new Error("Cloudinary did not return the uploaded image"));
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      });
      Readable.from([buffer]).pipe(stream);
    });
  }
  if (isProd) {
    throw Object.assign(new Error("Cloudinary is not configured"), { status: 503 });
  }
  const id = crypto.randomUUID();
  const filename = `cover-${id}.${format}`;
  const target = getUploadPath(path.join("covers", filename));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buffer);
  const apiPublic = process.env.BACKEND_URL
    ? `${process.env.BACKEND_URL.replace(/\/$/, "")}/api`
    : (process.env.API_PUBLIC_URL || "https://digital-bizware-1.onrender.com/api");
  return { url: `${apiPublic}/uploads/covers/${filename}`, publicId: `local:${filename}` };
}

export async function deleteCover(publicId: string): Promise<void> {
  if (!publicId) return;
  if (publicId.startsWith("local:")) {
    try {
      const filename = publicId.slice(6);
      const target = getUploadPath(path.join("covers", filename));
      if (fs.existsSync(target)) fs.unlinkSync(target);
    } catch {}
    return;
  }
  if (!cloudinaryConfigured()) return;
  const result = await cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true });
  if (!["ok", "not found"].includes(result.result)) {
    throw new Error("Cloudinary image cleanup failed");
  }
}
