// services/MediaUploadService.ts
import { https } from "firebase-functions/v2";
import { StorageProvider } from "../providers/StorageProvider";
import { GetUploadUrlRequest, GetUploadUrlResponse } from "../types/app.types";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

/**
 * MediaUploadService
 *
 * Client'ın Firebase Storage'a direkt yüklemesi için URL üretir.
 * deviceId üzerinden çalışır — Firebase Auth kullanılmaz.
 *
 * Akış:
 *   1. Client → getUploadUrl() → { uploadUrl, storageUrl, filePath }
 *   2. Client → uploadUrl'e PUT ile dosyayı yükler
 *   3. Client → storageUrl / filePath'i job başlatırken gönderir
 */
export class MediaUploadService {
  constructor(private readonly storage: StorageProvider) {}

  async getUploadUrl(req: GetUploadUrlRequest): Promise<GetUploadUrlResponse> {
    this.validate(req);

    const { uploadUrl, filePath, storageUrl } = await this.storage.getUploadUrl(
      req.deviceId,
      req.fileName,
      req.contentType,
      req.mediaType
    );

    return { uploadUrl, filePath, storageUrl };
  }

  // ─────────────────────────────────────────
  //  Validation
  // ─────────────────────────────────────────

  private validate(req: GetUploadUrlRequest): void {
    if (!req.deviceId?.trim()) {
      throw new https.HttpsError("invalid-argument", "deviceId gerekli");
    }
    if (!req.fileName?.trim()) {
      throw new https.HttpsError("invalid-argument", "fileName gerekli");
    }
    if (!req.contentType?.trim()) {
      throw new https.HttpsError("invalid-argument", "contentType gerekli");
    }
    if (!req.mediaType) {
      throw new https.HttpsError("invalid-argument", "mediaType gerekli");
    }

    const allowed =
      req.mediaType === "image" ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES;

    if (!allowed.includes(req.contentType)) {
      throw new https.HttpsError(
        "invalid-argument",
        `Desteklenmeyen contentType: ${req.contentType}. İzin verilenler: ${allowed.join(", ")}`
      );
    }
  }
}