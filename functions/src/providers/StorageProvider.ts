// providers/StorageProvider.ts
import * as admin from "firebase-admin";
import { https, logger } from "firebase-functions/v2";
import { Bucket } from "@google-cloud/storage";
import { MediaType } from "../types/app.types";

export class StorageProvider {
  private readonly bucket: Bucket;

  constructor() {
    const bucketName =
      process.env.STORAGE_BUCKET ??
      `${process.env.GCLOUD_PROJECT}.firebasestorage.app`;
    this.bucket = admin.storage().bucket(bucketName);
    logger.info("[StorageProvider] bucket:", bucketName);
  }

  // ── Upload URL üret ───────────────────────────────────────
  // Boş dosya YAZILMAZ — Signed URL ile client doğrudan PUT atar.
  // Service Account'un "iam.serviceAccounts.signBlob" yetkisi olmalı.
  async getUploadUrl(
    deviceId: string,
    fileName: string,
    contentType: string,
    mediaType: MediaType
  ): Promise<{ uploadUrl: string; filePath: string; storageUrl: string }> {
    const ext      = fileName.split(".").pop()?.toLowerCase() ?? "bin";
    const filePath = `uploads/${deviceId}/${mediaType}s/${Date.now()}.${ext}`;

    // V4 Signed URL — 15 dakika geçerli, yalnızca bu path'e PUT izni
    const [uploadUrl] = await this.bucket.file(filePath).getSignedUrl({
      version     : "v4",
      action      : "write",
      expires     : Date.now() + 15 * 60 * 1000,
      contentType,
    });

    logger.info("[StorageProvider] Signed upload URL created", { deviceId, filePath });
    return {
      uploadUrl,
      filePath,
      storageUrl: this.toPublicUrl(filePath),
    };
  }

  // ── Public download URL ───────────────────────────────────
  async getDownloadUrl(filePath: string): Promise<string> {
    await this.bucket.file(filePath).makePublic();
    return this.toPublicUrl(filePath);
  }

  // ── Dış URL'den Storage'a kopyala ────────────────────────
  async copyExternalUrlToStorage(
    externalUrl: string,
    deviceId: string,
    jobId: string,
    mediaType: MediaType,
    contentType: string
  ): Promise<{ filePath: string; storageUrl: string }> {
    const ext = mediaType === "video" ? "mp4" : "jpg";
    const filePath = `outputs/${deviceId}/${mediaType}s/${jobId}/result.${ext}`;

    logger.info("[StorageProvider] Copying external URL", { externalUrl, filePath });

    const response = await fetch(externalUrl);
    if (!response.ok) {
      throw new https.HttpsError(
        "internal",
        `External URL fetch failed: ${response.status}`
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    await this.bucket.file(filePath).save(buffer, {
      metadata: { contentType },
      predefinedAcl: "publicRead",
      resumable: false,
    });

    const storageUrl = this.toPublicUrl(filePath);
    logger.info("[StorageProvider] File saved", { filePath });
    return { filePath, storageUrl };
  }

  // ─────────────────────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────────────────────

  private toPublicUrl(filePath: string): string {
    const encoded = encodeURIComponent(filePath);
    return `https://firebasestorage.googleapis.com/v0/b/${this.bucket.name}/o/${encoded}?alt=media`;
  }
}