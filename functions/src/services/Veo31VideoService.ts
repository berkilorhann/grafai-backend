import { https, logger } from "firebase-functions/v2";
import { FalAiProvider } from "../providers/FalAiProvider";
import {
  GenerateVideoRequest,
  GenerateVideoResponse,
  VideoStatusResponse,
  Veo31VideoInput,
  Veo31VideoOutput,
  FalQueueStatus,
} from "../types/fal.types";

const ENDPOINT_ID = "fal-ai/veo3.1/fast/first-last-frame-to-video";

/**
 * Veo31VideoService
 *
 * Handles all business logic for the Veo 3.1 Fast
 * First-Last-Frame → Video endpoint.
 *
 * Two usage modes for mobile clients:
 *  1. submitGeneration  → fire-and-forget, returns requestId (recommended)
 *  2. generateAndWait   → blocking poll (suitable only for very short jobs)
 */
export class Veo31VideoService {
  constructor(private readonly fal: FalAiProvider) {}

  // ─────────────────────────────────────────
  //  Public API
  // ─────────────────────────────────────────

  /**
   * Submit a video generation job and return immediately with a requestId.
   * The mobile client should poll getGenerationStatus() until COMPLETED.
   */
  async submitGeneration(
    req: GenerateVideoRequest
  ): Promise<GenerateVideoResponse> {
    this.validateRequest(req);

    const input = this.toFalInput(req);

    logger.info("[Veo31VideoService] Submitting generation job", {
      prompt: req.prompt.substring(0, 80),
      duration: req.duration,
      resolution: req.resolution,
    });

    const queued = await this.fal.submitJob<Veo31VideoInput>(
      ENDPOINT_ID,
      input
    );

    return {
      requestId: queued.request_id,
      status: queued.status as FalQueueStatus,
    };
  }

  /**
   * Poll the status of a previously submitted job.
   * Returns videoUrl when status === "COMPLETED".
   */
  async getGenerationStatus(
    requestId: string
  ): Promise<VideoStatusResponse> {
    if (!requestId?.trim()) {
      throw new https.HttpsError(
        "invalid-argument",
        "requestId is required"
      );
    }

    const statusRes = await this.fal.getStatus(ENDPOINT_ID, requestId, true);

    if (statusRes.status === "COMPLETED") {
      const result = await this.fal.getResult<Veo31VideoOutput>(
        ENDPOINT_ID,
        requestId
      );

      logger.info("[Veo31VideoService] Generation completed", {
        requestId,
        videoUrl: result.video.url,
      });

      return {
        requestId,
        status: "COMPLETED",
        videoUrl: result.video.url,
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

  /**
   * Blocking submit-and-wait. Use only when the caller can tolerate
   * a long-running Cloud Function (up to 9 min timeout).
   */
  async generateAndWait(
    req: GenerateVideoRequest
  ): Promise<GenerateVideoResponse> {
    this.validateRequest(req);

    const input = this.toFalInput(req);

    const { data, requestId } =
      await this.fal.subscribeAndWait<Veo31VideoInput, Veo31VideoOutput>(
        ENDPOINT_ID,
        input,
        { pollIntervalMs: 5_000, maxWaitMs: 480_000 }
      );

    return {
      requestId,
      videoUrl: data.video.url,
      status: "COMPLETED",
    };
  }

  // ─────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────

  private validateRequest(req: GenerateVideoRequest): void {
    if (!req.prompt?.trim()) {
      throw new https.HttpsError(
        "invalid-argument",
        "prompt is required"
      );
    }
    if (!req.firstFrameUrl?.trim()) {
      throw new https.HttpsError(
        "invalid-argument",
        "firstFrameUrl is required"
      );
    }
    if (!req.lastFrameUrl?.trim()) {
      throw new https.HttpsError(
        "invalid-argument",
        "lastFrameUrl is required"
      );
    }
    if (!isValidUrl(req.firstFrameUrl) || !isValidUrl(req.lastFrameUrl)) {
      throw new https.HttpsError(
        "invalid-argument",
        "firstFrameUrl and lastFrameUrl must be valid HTTP/HTTPS URLs"
      );
    }
  }

  private toFalInput(req: GenerateVideoRequest): Veo31VideoInput {
    return {
      prompt: req.prompt.trim(),
      first_frame_url: req.firstFrameUrl,
      last_frame_url: req.lastFrameUrl,
      aspect_ratio: req.aspectRatio ?? "auto",
      duration: req.duration ?? "8s",
      resolution: req.resolution ?? "720p",
      generate_audio: req.generateAudio ?? true,
      negative_prompt: req.negativePrompt,
      seed: req.seed,
      safety_tolerance: "4",
    };
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