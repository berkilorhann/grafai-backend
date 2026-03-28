import { https, logger } from "firebase-functions/v2";
import { FalAiProvider } from "../providers/FalAiProvider";
import {
  EditImageRequest,
  EditImageResponse,
  ImageEditStatusResponse,
  NanoBananaEditInput,
  NanoBananaEditOutput,
  FalQueueStatus,
} from "../types/fal.types";

const ENDPOINT_ID = "fal-ai/nano-banana-2/edit";

/**
 * NanoBananaImageService
 *
 * Handles all business logic for the Nano Banana 2 image editing endpoint.
 *
 * Two usage modes for mobile clients:
 *  1. submitEdit   → fire-and-forget, returns requestId (recommended)
 *  2. editAndWait  → blocking poll (suitable for sync_mode / fast edits)
 */
export class NanoBananaImageService {
  constructor(private readonly fal: FalAiProvider) {}

  // ─────────────────────────────────────────
  //  Public API
  // ─────────────────────────────────────────

  async submitEdit(req: EditImageRequest): Promise<EditImageResponse> {
    this.validateRequest(req);

    const input = this.toFalInput(req);

    logger.info("[NanoBananaImageService] Submitting edit job", {
      prompt: req.prompt.substring(0, 80),
      imageCount: req.imageUrls.length,
      resolution: req.resolution,
    });

    const queued = await this.fal.submitJob<NanoBananaEditInput>(ENDPOINT_ID, input);

    return {
      requestId: queued.request_id,
      status: queued.status as FalQueueStatus,
    };
  }

  async getEditStatus(requestId: string): Promise<ImageEditStatusResponse> {
    if (!requestId?.trim()) {
      throw new https.HttpsError("invalid-argument", "requestId is required");
    }

    const statusRes = await this.fal.getStatus(ENDPOINT_ID, requestId, true);

    if (statusRes.status === "COMPLETED") {
      const result = await this.fal.getResult<NanoBananaEditOutput>(ENDPOINT_ID, requestId);

      logger.info("[NanoBananaImageService] Edit completed", {
        requestId,
        imageCount: result.images.length,
      });

      return {
        requestId,
        status: "COMPLETED",
        images: result.images,
        description: result.description,
        logs: statusRes.logs,
      };
    }

    return {
      requestId,
      status: statusRes.status as FalQueueStatus,
      queuePosition: statusRes.queue_position,
      logs: statusRes.logs,
    };
  }

  async editAndWait(req: EditImageRequest): Promise<EditImageResponse> {
    this.validateRequest(req);

    const input: NanoBananaEditInput = {
      ...this.toFalInput(req),
      sync_mode: true,
    };

    const { data, requestId } =
      await this.fal.subscribeAndWait<NanoBananaEditInput, NanoBananaEditOutput>(
        ENDPOINT_ID,
        input,
        { pollIntervalMs: 2_000, maxWaitMs: 120_000 }
      );

    return {
      requestId,
      images: data.images,
      description: data.description,
      status: "COMPLETED",
    };
  }

  // ─────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────

  private validateRequest(req: EditImageRequest): void {
    if (!req.prompt?.trim()) {
      throw new https.HttpsError("invalid-argument", "prompt is required");
    }
    if (!req.imageUrls?.length) {
      throw new https.HttpsError("invalid-argument", "imageUrls must contain at least one URL");
    }
    if (req.imageUrls.length > 10) {
      throw new https.HttpsError("invalid-argument", "imageUrls cannot exceed 10 items");
    }
    for (const url of req.imageUrls) {
      if (!isValidUrl(url)) {
        throw new https.HttpsError("invalid-argument", `Invalid image URL: ${url}`);
      }
    }
    if (req.numImages !== undefined && (req.numImages < 1 || req.numImages > 4)) {
      throw new https.HttpsError("invalid-argument", "numImages must be between 1 and 4");
    }
  }

  /**
   * FIX: null/undefined olan opsiyonel alanları input'a dahil etme.
   * Fal.ai null değerleri 422 invalid_request ile reddeder.
   * safety_tolerance her zaman string olarak gönderilmeli (number değil).
   */
  private toFalInput(req: EditImageRequest): NanoBananaEditInput {
    const input: NanoBananaEditInput = {
      prompt:            req.prompt.trim(),
      image_urls:        req.imageUrls,
      num_images:        req.numImages ?? 1,
      aspect_ratio:      req.aspectRatio ?? "auto",
      output_format:     req.outputFormat ?? "png",
      resolution:        req.resolution ?? "1K",
      limit_generations: true,
      safety_tolerance:  "4",   // ← string olmalı, number değil
      enable_web_search: req.enableWebSearch ?? false,
    };

    // Opsiyonel alanlar: null/undefined ise hiç gönderme
    if (req.seed != null)          input.seed           = req.seed;
    if (req.thinkingLevel != null) input.thinking_level = req.thinkingLevel;

    return input;
  }
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}