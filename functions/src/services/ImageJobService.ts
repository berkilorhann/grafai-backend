// services/ImageJobService.ts
import { https, logger } from "firebase-functions/v2";
import { FalAiProvider } from "../providers/FalAiProvider";
import { FirestoreProvider } from "../providers/FirestoreProvider";
import { StorageProvider } from "../providers/StorageProvider";
import { TemplateService } from "./TemplateService";
import { NanoBananaImageService } from "./NanoBananaImageService";
import {
  StartImageEditRequest,
  StartJobResponse,
  GetJobStatusRequest,
  GetJobStatusResponse,
} from "../types/app.types";

/**
 * ImageJobService
 *
 * Görsel düzenleme iş akışının tamamını yönetir:
 *
 *  1. startImageEdit()
 *     - Template'i Firestore'dan çeker
 *     - Prompt'u değişkenlerle çözümler
 *     - Storage path'inden download URL alır
 *     - FAL'a iş gönderir
 *     - Firestore'a job kaydeder
 *     - jobId + falRequestId döner
 *
 *  2. getImageJobStatus()
 *     - FAL durumunu sorgular
 *     - Tamamlandıysa: sonucu Storage'a kopyalar
 *     - Firestore job'unu günceller
 *     - Client'a output URL döner
 *     - FIX: FAL hatası olursa job'u failed işaretle, retry etme
 */
export class ImageJobService {
  private readonly nanoBanana: NanoBananaImageService;

  constructor(
    fal: FalAiProvider,
    private readonly firestore: FirestoreProvider,
    private readonly storage: StorageProvider,
    private readonly templates: TemplateService
  ) {
    this.nanoBanana = new NanoBananaImageService(fal);
  }

  // ─────────────────────────────────────────
  //  Start
  // ─────────────────────────────────────────

  async startImageEdit(
    deviceId: string,
    req: StartImageEditRequest
  ): Promise<StartJobResponse> {
    const template = await this.templates.getTemplateById(req.templateId);

    if (template.type !== "image") {
      throw new https.HttpsError(
        "invalid-argument",
        "Bu template görsel düzenleme için değil"
      );
    }

    const resolvedPrompt = this.templates.resolvePrompt(template, req.promptVariables);
    const imageUrl = await this.storage.getDownloadUrl(req.imageStoragePath);

    const { requestId: falRequestId } = await this.nanoBanana.submitEdit({
      prompt:     resolvedPrompt,
      imageUrls:  [imageUrl],
      resolution: "1K",
    });

    const jobId = await this.firestore.createJob({
      deviceId,
      type:           "image",
      templateId:     req.templateId,
      status:         "processing",
      falRequestId,
      inputImageUrl:  imageUrl,
      resolvedPrompt,
    });

    logger.info("[ImageJobService] Image edit job started", { jobId, falRequestId, deviceId });

    return { jobId, falRequestId, status: "processing" };
  }

  // ─────────────────────────────────────────
  //  Poll Status
  // ─────────────────────────────────────────

  async getImageJobStatus(
    deviceId: string,
    req: GetJobStatusRequest
  ): Promise<GetJobStatusResponse> {
    const job = await this.firestore.getJob(deviceId, req.jobId);

    // Zaten tamamlanmış veya hatalıysa Firestore'daki değeri döndür
    if (job.status === "completed" || job.status === "failed") {
      return {
        jobId:          job.id,
        status:         job.status,
        outputImageUrl: job.outputImageUrl,
        errorMessage:   job.errorMessage,
      };
    }

    if (!job.falRequestId) {
      throw new https.HttpsError("internal", "FAL request ID eksik");
    }

    // FAL durumunu sorgula
    // FIX: Hata gelirse (422, 404 vb.) job'u failed işaretle — sonsuz retry'ı engelle
    let falStatus: Awaited<ReturnType<typeof this.nanoBanana.getEditStatus>>;

    try {
      falStatus = await this.nanoBanana.getEditStatus(job.falRequestId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      logger.error("[ImageJobService] FAL status/result error, marking job as failed", {
        jobId:        req.jobId,
        falRequestId: job.falRequestId,
        error:        message,
      });

      await this.firestore.updateJob(deviceId, req.jobId, {
        status:       "failed",
        errorMessage: `FAL hatası: ${message}`,
      });

      return {
        jobId:        req.jobId,
        status:       "failed",
        errorMessage: `FAL hatası: ${message}`,
      };
    }

    if (falStatus.status === "COMPLETED" && falStatus.images?.length) {
      const firstImage = falStatus.images[0];
      const { storageUrl } = await this.storage.copyExternalUrlToStorage(
        firstImage.url,
        deviceId,
        req.jobId,
        "image",
        firstImage.content_type ?? "image/jpeg"
      );

      await this.firestore.updateJob(deviceId, req.jobId, {
        status:         "completed",
        outputImageUrl: storageUrl,
      });

      logger.info("[ImageJobService] Image job completed", { jobId: req.jobId });

      return {
        jobId:          req.jobId,
        status:         "completed",
        outputImageUrl: storageUrl,
      };
    }

    if (falStatus.status === "FAILED") {
      await this.firestore.updateJob(deviceId, req.jobId, {
        status:       "failed",
        errorMessage: "FAL işlemi başarısız oldu",
      });

      return {
        jobId:        req.jobId,
        status:       "failed",
        errorMessage: "FAL işlemi başarısız oldu",
      };
    }

    // Hâlâ işleniyor
    return {
      jobId:         req.jobId,
      status:        "processing",
      queuePosition: falStatus.queuePosition,
    };
  }
}