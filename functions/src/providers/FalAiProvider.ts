import { https, logger } from "firebase-functions/v2";
import {
  FalQueueSubmitResponse,
  FalQueueStatusResponse,
} from "../types/fal.types";

const FAL_BASE_URL = "https://queue.fal.run";

/**
 * FalAiProvider
 *
 * Fal.ai Queue API URL yapısı (resmi belgeye göre):
 *
 *   POST  /{modelId}/{subpath}                        → iş gönder   (subpath varsa dahil)
 *   GET   /{modelId}/requests/{id}/status?logs=1      → durum sorgula (subpath DAHİL DEĞİL!)
 *   GET   /{modelId}/requests/{id}                    → sonucu al    (subpath DAHİL DEĞİL!)
 *
 * ÖNEMLİ: Status ve result URL'lerinde subpath kullanılmaz.
 * Örnek:
 *   submitJob  → POST  queue.fal.run/fal-ai/nano-banana-2/edit
 *   getStatus  → GET   queue.fal.run/fal-ai/nano-banana-2/requests/{id}/status
 *   getResult  → GET   queue.fal.run/fal-ai/nano-banana-2/requests/{id}
 *
 * FAL_KEY constructor'da değil, ilk API çağrısında okunur (lazy).
 */
export class FalAiProvider {
  private readonly timeoutMs: number;

  constructor(timeoutMs = 30_000) {
    this.timeoutMs = timeoutMs;
  }

  private getApiKey(): string {
    const key = process.env.FAL_KEY;
    if (!key) {
      throw new https.HttpsError(
        "internal",
        "[FalAiProvider] FAL_KEY bulunamadı. functions/.env dosyasına FAL_KEY=xxx ekle."
      );
    }
    return key;
  }

  // ─────────────────────────────────────────
  //  URL Helpers
  // ─────────────────────────────────────────

  /**
   * modelId'yi endpointPath'ten çıkarır.
   * İlk 2 segment her zaman "{namespace}/{model}" formatındadır.
   *
   * Örnekler:
   *   "fal-ai/nano-banana-2/edit"                    → "fal-ai/nano-banana-2"
   *   "fal-ai/veo3.1/fast/first-last-frame-to-video" → "fal-ai/veo3.1"
   *   "fal-ai/flux/dev"                              → "fal-ai/flux"
   */
  private extractModelId(endpointPath: string): string {
    return endpointPath.split("/").slice(0, 2).join("/");
  }

  // ─────────────────────────────────────────
  //  Queue helpers
  // ─────────────────────────────────────────

  /**
   * Fal.ai kuyruğuna yeni bir iş gönderir.
   * URL: POST https://queue.fal.run/{endpointPath}
   */
  async submitJob<TInput extends Record<string, unknown>>(
    endpointPath: string,
    input: TInput,
    webhookUrl?: string
  ): Promise<FalQueueSubmitResponse> {
    const url = `${FAL_BASE_URL}/${endpointPath}`;
    const body: Record<string, unknown> = { ...input };
    if (webhookUrl) body._webhook_url = webhookUrl;

    logger.info(`[FalAiProvider.submitJob] POST ${url}`);

    const res = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    await this.assertOk(res, "submitJob");
    return res.json() as Promise<FalQueueSubmitResponse>;
  }

  /**
   * Kuyruktaki bir işin durumunu sorgular.
   * URL: GET https://queue.fal.run/{modelId}/requests/{id}/status?logs=1
   * NOT: Subpath (örn. /edit) bu URL'e dahil edilmez!
   */
  async getStatus(
    endpointPath: string,
    requestId: string,
    includeLogs = false
  ): Promise<FalQueueStatusResponse> {
    const modelId = this.extractModelId(endpointPath);
    const logParam = includeLogs ? "?logs=1" : "";
    const url = `${FAL_BASE_URL}/${modelId}/requests/${requestId}/status${logParam}`;

    logger.info(`[FalAiProvider.getStatus] GET ${url}`);

    const res = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: this.headers(),
    });

    await this.assertOk(res, "getStatus");
    return res.json() as Promise<FalQueueStatusResponse>;
  }

  /**
   * Tamamlanmış bir işin çıktısını alır.
   * URL: GET https://queue.fal.run/{modelId}/requests/{id}
   * NOT: Subpath (örn. /edit) bu URL'e dahil edilmez!
   */
  async getResult<TOutput>(
    endpointPath: string,
    requestId: string
  ): Promise<TOutput> {
    const modelId = this.extractModelId(endpointPath);
    const url = `${FAL_BASE_URL}/${modelId}/requests/${requestId}`;

    logger.info(`[FalAiProvider.getResult] GET ${url}`);

    const res = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: this.headers(),
    });

    await this.assertOk(res, "getResult");

    // Fal.ai result endpoint'i { response: TOutput } veya doğrudan TOutput döner
    const json = await res.json() as { response?: TOutput; data?: TOutput } & TOutput;
    return (json.response ?? json.data ?? json) as TOutput;
  }

  /**
   * İş gönderir, tamamlanana dek polling yapar ve sonucu döner.
   */
  async subscribeAndWait<TInput extends Record<string, unknown>, TOutput>(
    endpointPath: string,
    input: TInput,
    options: { pollIntervalMs?: number; maxWaitMs?: number } = {}
  ): Promise<{ data: TOutput; requestId: string }> {
    const { pollIntervalMs = 3_000, maxWaitMs = 300_000 } = options;

    const { request_id } = await this.submitJob(endpointPath, input);
    const deadline = Date.now() + maxWaitMs;

    logger.info(`[FalAiProvider.subscribeAndWait] Polling başladı — requestId: ${request_id}`);

    while (Date.now() < deadline) {
      await sleep(pollIntervalMs);

      const status = await this.getStatus(endpointPath, request_id, true);

      logger.info(`[FalAiProvider.subscribeAndWait] status=${status.status} requestId=${request_id}`);

      if (status.status === "COMPLETED") {
        const data = await this.getResult<TOutput>(endpointPath, request_id);
        return { data, requestId: request_id };
      }

      if (status.status === "FAILED") {
        throw new https.HttpsError(
          "internal",
          `FAL job failed: ${endpointPath} (requestId: ${request_id})`
        );
      }
    }

    throw new https.HttpsError(
      "deadline-exceeded",
      `FAL job timed out after ${maxWaitMs}ms (requestId: ${request_id})`
    );
  }

  // ─────────────────────────────────────────
  //  Internals
  // ─────────────────────────────────────────

  private headers(): Record<string, string> {
    return {
      Authorization: `Key ${this.getApiKey()}`,
      "Content-Type": "application/json",
    };
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") {
        throw new https.HttpsError(
          "deadline-exceeded",
          `FAL API isteği zaman aşımına uğradı (${this.timeoutMs}ms)`
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private async assertOk(res: Response, context: string): Promise<void> {
    if (!res.ok) {
      let raw = "";
      try {
        raw = await res.text();
      } catch {
        raw = "Body okunamadı";
      }

      logger.error(`[FalAiProvider.${context}] HTTP ${res.status}`, {
        url: res.url,
        detail: raw,
      });

      throw new https.HttpsError("internal", `FAL API error ${res.status}: ${raw}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}