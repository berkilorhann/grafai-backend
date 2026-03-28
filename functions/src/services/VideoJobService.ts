// services/VideoJobService.ts
import { https, logger } from "firebase-functions/v2";
import { FalAiProvider } from "../providers/FalAiProvider";
import { FirestoreProvider } from "../providers/FirestoreProvider";
import { StorageProvider } from "../providers/StorageProvider";
import { TemplateService } from "./TemplateService";
import { Veo31VideoService } from "./Veo31VideoService";
import {
  StartVideoGenerationRequest,
  StartJobResponse,
  GetJobStatusRequest,
  GetJobStatusResponse,
} from "../types/app.types";

/**
 * VideoJobService
 *
 * Video üretim iş akışının tamamını yönetir:
 *
 *  1. startVideoGeneration()
 *     - Template'i Firestore'dan çeker
 *     - Prompt'u değişkenlerle çözümler
 *     - Storage'dan ilk/son kare URL'lerini alır
 *     - FAL Veo3.1'e iş gönderir
 *     - Firestore'a job kaydeder
 *
 *  2. getVideoJobStatus()
 *     - FAL durumunu sorgular
 *     - Tamamlandıysa: videoyu Storage'a kopyalar
 *     - Firestore job'unu günceller
 *     - Client'a output video URL döner
 */
export class VideoJobService {
  private readonly veo31: Veo31VideoService;

  constructor(
    fal: FalAiProvider,
    private readonly firestore: FirestoreProvider,
    private readonly storage: StorageProvider,
    private readonly templates: TemplateService
  ) {
    this.veo31 = new Veo31VideoService(fal);
  }

  // ─────────────────────────────────────────
  //  Start
  // ─────────────────────────────────────────

  async startVideoGeneration(
    deviceId: string,
    req: StartVideoGenerationRequest
  ): Promise<StartJobResponse> {
    // 1. Template'i al
    const template = await this.templates.getTemplateById(req.templateId);

    if (template.type !== "video") {
      throw new https.HttpsError(
        "invalid-argument",
        "Bu template video üretimi için değil"
      );
    }

    // 2. Prompt'u çöz
    const resolvedPrompt = this.templates.resolvePrompt(
      template,
      req.promptVariables
    );

    // 3. Storage'dan download URL'leri paralel al
    const [firstFrameUrl, lastFrameUrl] = await Promise.all([
      this.storage.getDownloadUrl(req.firstFrameStoragePath),
      this.storage.getDownloadUrl(req.lastFrameStoragePath),
    ]);

    // 4. FAL'a gönder
    const result = await this.veo31.submitGeneration({
      prompt: resolvedPrompt,
      firstFrameUrl,
      lastFrameUrl,
      duration:      "8s",
      resolution:    "720p",
      generateAudio: true,
    });

    // 5. Firestore'a job kaydet
    const jobId = await this.firestore.createJob({
      deviceId,
      type:               "video",
      templateId:         req.templateId,
      status:             "processing",
      falRequestId:       result.requestId,
      inputFirstFrameUrl: firstFrameUrl,
      inputLastFrameUrl:  lastFrameUrl,
      resolvedPrompt,
    });

    logger.info("[VideoJobService] Video job started", {
      jobId,
      falRequestId: result.requestId,
      deviceId,
    });

    return { jobId, falRequestId: result.requestId, status: "processing" };
  }

  // ─────────────────────────────────────────
  //  Poll Status
  // ─────────────────────────────────────────

  async getVideoJobStatus(
    deviceId: string,
    req: GetJobStatusRequest
  ): Promise<GetJobStatusResponse> {
    // Firestore'dan job'u al
    const job = await this.firestore.getJob(deviceId, req.jobId);

    // Zaten tamamlanmış veya hatalıysa Firestore'daki değeri döndür
    if (job.status === "completed" || job.status === "failed") {
      return {
        jobId:          job.id,
        status:         job.status,
        outputVideoUrl: job.outputVideoUrl,
        errorMessage:   job.errorMessage,
      };
    }

    if (!job.falRequestId) {
      throw new https.HttpsError("internal", "FAL request ID eksik");
    }

    // FAL durumunu sorgula
    const falStatus = await this.veo31.getGenerationStatus(job.falRequestId);

    if (falStatus.status === "COMPLETED" && falStatus.videoUrl) {
      // Videoyu Storage'a kopyala
      const { storageUrl } = await this.storage.copyExternalUrlToStorage(
        falStatus.videoUrl,
        deviceId,
        req.jobId,
        "video",
        "video/mp4"
      );

      // Firestore'u güncelle
      await this.firestore.updateJob(deviceId, req.jobId, {
        status:         "completed",
        outputVideoUrl: storageUrl,
      });

      logger.info("[VideoJobService] Video job completed", { jobId: req.jobId });

      return {
        jobId:          req.jobId,
        status:         "completed",
        outputVideoUrl: storageUrl,
      };
    }

    if (falStatus.status === "FAILED") {
      await this.firestore.updateJob(deviceId, req.jobId, {
        status:       "failed",
        errorMessage: "FAL video işlemi başarısız oldu",
      });

      return {
        jobId:        req.jobId,
        status:       "failed",
        errorMessage: "FAL video işlemi başarısız oldu",
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