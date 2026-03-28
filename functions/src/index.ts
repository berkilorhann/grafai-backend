// index.ts
import * as admin from "firebase-admin";
admin.initializeApp();

import { onCall, CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { logger } from "firebase-functions/v2";

import { FalAiProvider }          from "./providers/FalAiProvider";
import { FirestoreProvider }      from "./providers/FirestoreProvider";
import { StorageProvider }        from "./providers/StorageProvider";
import { DeviceAuthProvider }     from "./providers/DeviceAuthProvider";
import { UserProvider }           from "./providers/UserProvider";
import { TemplateService }        from "./services/TemplateService";
import { MediaUploadService }     from "./services/MediaUploadService";
import { ImageJobService }        from "./services/ImageJobService";
import { VideoJobService }        from "./services/VideoJobService";
import { Veo31VideoService }      from "./services/Veo31VideoService";
import { NanoBananaImageService } from "./services/NanoBananaImageService";

import { GenerateVideoRequest, EditImageRequest } from "./types/fal.types";
import {
  GetUploadUrlRequest,
  GetTemplatesRequest,
  StartImageEditRequest,
  StartVideoGenerationRequest,
  GetJobStatusRequest,
  RegisterDeviceRequest,
  RegisterDeviceResponse,
  PingDeviceRequest,
  PingDeviceResponse,
  GetUserRequest,
  GetUserResponse,
  UpdateCoinsRequest,
  UpdateCoinsResponse,
} from "./types/app.types";

// ─────────────────────────────────────────────────────────────
//  Global defaults
// ─────────────────────────────────────────────────────────────
setGlobalOptions({
  region:         "us-central1",
  memory:         "256MiB",
  timeoutSeconds: 60,
});

// ─────────────────────────────────────────────────────────────
//  Dependency Injection
// ─────────────────────────────────────────────────────────────
const falProvider        = new FalAiProvider();
const veo31Service       = new Veo31VideoService(falProvider);
const nanoBananaService  = new NanoBananaImageService(falProvider);
const firestoreProvider  = new FirestoreProvider();
const storageProvider    = new StorageProvider();
const templateService    = new TemplateService(firestoreProvider);
const mediaUploadService = new MediaUploadService(storageProvider);
const imageJobService    = new ImageJobService(falProvider, firestoreProvider, storageProvider, templateService);
const videoJobService    = new VideoJobService(falProvider, firestoreProvider, storageProvider, templateService);
const deviceAuthProvider = new DeviceAuthProvider();
const userProvider       = new UserProvider();

// ─────────────────────────────────────────────────────────────
//  Helper: deviceId doğrula
// ─────────────────────────────────────────────────────────────
function requireDeviceId(deviceId: unknown): string {
  if (typeof deviceId !== "string" || !deviceId.trim()) {
    throw new HttpsError("invalid-argument", "deviceId gerekli");
  }
  return deviceId.trim();
}

// ─────────────────────────────────────────────────────────────
//  VIDEO ENDPOINTS  (Fal.ai direkt — job sistemi dışı)
// ─────────────────────────────────────────────────────────────

export const submitVideoGeneration = onCall(
  { timeoutSeconds: 60, memory: "256MiB" },
  async (request: CallableRequest<GenerateVideoRequest>) => {
    logger.info("[submitVideoGeneration] called");
    return veo31Service.submitGeneration(request.data);
  }
);

export const getVideoGenerationStatus = onCall(
  { timeoutSeconds: 60, memory: "256MiB" },
  async (request: CallableRequest<{ requestId: string }>) => {
    return veo31Service.getGenerationStatus(request.data.requestId);
  }
);

export const generateVideoAndWait = onCall(
  { timeoutSeconds: 540, memory: "512MiB" },
  async (request: CallableRequest<GenerateVideoRequest>) => {
    logger.info("[generateVideoAndWait] called", { duration: request.data.duration });
    return veo31Service.generateAndWait(request.data);
  }
);

// ─────────────────────────────────────────────────────────────
//  IMAGE EDIT ENDPOINTS  (Fal.ai direkt — job sistemi dışı)
// ─────────────────────────────────────────────────────────────

export const submitImageEdit = onCall(
  { timeoutSeconds: 60, memory: "256MiB" },
  async (request: CallableRequest<EditImageRequest>) => {
    logger.info("[submitImageEdit] called", { imageCount: request.data.imageUrls?.length });
    return nanoBananaService.submitEdit(request.data);
  }
);

export const getImageEditStatus = onCall(
  { timeoutSeconds: 60, memory: "256MiB" },
  async (request: CallableRequest<{ requestId: string }>) => {
    return nanoBananaService.getEditStatus(request.data.requestId);
  }
);

export const editImageAndWait = onCall(
  { timeoutSeconds: 120, memory: "256MiB" },
  async (request: CallableRequest<EditImageRequest>) => {
    logger.info("[editImageAndWait] called");
    return nanoBananaService.editAndWait(request.data);
  }
);

// ─────────────────────────────────────────────────────────────
//  TEMPLATE ENDPOINTS
// ─────────────────────────────────────────────────────────────

export const getTemplates = onCall(
  { timeoutSeconds: 30, memory: "256MiB" },
  async (request: CallableRequest<GetTemplatesRequest>) => {
    return templateService.getTemplates(request.data ?? {});
  }
);

// ─────────────────────────────────────────────────────────────
//  UPLOAD ENDPOINTS
// ─────────────────────────────────────────────────────────────

export const getUploadUrl = onCall(
  { timeoutSeconds: 30, memory: "256MiB" },
  async (request: CallableRequest<GetUploadUrlRequest>) => {
    logger.info("[getUploadUrl] called");
    requireDeviceId(request.data?.deviceId);
    return mediaUploadService.getUploadUrl(request.data);
  }
);

// ─────────────────────────────────────────────────────────────
//  JOB-BASED IMAGE ENDPOINTS
// ─────────────────────────────────────────────────────────────

export const startImageEdit = onCall(
  { timeoutSeconds: 60, memory: "256MiB" },
  async (request: CallableRequest<StartImageEditRequest>) => {
    const deviceId = requireDeviceId(request.data?.deviceId);
    logger.info("[startImageEdit] called", { deviceId, templateId: request.data.templateId });
    return imageJobService.startImageEdit(deviceId, request.data);
  }
);

export const getImageJobStatus = onCall(
  { timeoutSeconds: 60, memory: "256MiB" },
  async (request: CallableRequest<GetJobStatusRequest>) => {
    const deviceId = requireDeviceId(request.data?.deviceId);
    return imageJobService.getImageJobStatus(deviceId, request.data);
  }
);

// ─────────────────────────────────────────────────────────────
//  JOB-BASED VIDEO ENDPOINTS
// ─────────────────────────────────────────────────────────────

export const startVideoGeneration = onCall(
  { timeoutSeconds: 60, memory: "256MiB" },
  async (request: CallableRequest<StartVideoGenerationRequest>) => {
    const deviceId = requireDeviceId(request.data?.deviceId);
    logger.info("[startVideoGeneration] called", { deviceId, templateId: request.data.templateId });
    return videoJobService.startVideoGeneration(deviceId, request.data);
  }
);

export const getVideoJobStatus = onCall(
  { timeoutSeconds: 60, memory: "256MiB" },
  async (request: CallableRequest<GetJobStatusRequest>) => {
    const deviceId = requireDeviceId(request.data?.deviceId);
    return videoJobService.getVideoJobStatus(deviceId, request.data);
  }
);

// ─────────────────────────────────────────────────────────────
//  DEVICE AUTH ENDPOINTS
// ─────────────────────────────────────────────────────────────

export const registerDevice = onCall(
  { timeoutSeconds: 30, memory: "256MiB" },
  async (request: CallableRequest<RegisterDeviceRequest>): Promise<RegisterDeviceResponse> => {
    const { platform, appVersion } = request.data;
    logger.info("[registerDevice] called", { platform });
    return deviceAuthProvider.registerDevice(platform, appVersion);
  }
);

export const pingDevice = onCall(
  { timeoutSeconds: 30, memory: "256MiB" },
  async (request: CallableRequest<PingDeviceRequest>): Promise<PingDeviceResponse> => {
    const { deviceId, platform } = request.data;
    logger.info("[pingDevice] called", { deviceId });
    return deviceAuthProvider.pingDevice(deviceId, platform ?? "android");
  }
);

// ─────────────────────────────────────────────────────────────
//  USER ENDPOINTS
// ─────────────────────────────────────────────────────────────

export const getUser = onCall(
  { timeoutSeconds: 30, memory: "256MiB" },
  async (request: CallableRequest<GetUserRequest>): Promise<GetUserResponse> => {
    const deviceId = requireDeviceId(request.data?.deviceId);
    logger.info("[getUser] called", { deviceId });

    const user = await userProvider.getUser(deviceId);

    return {
      deviceId:         user.deviceId,
      coins:            user.coins,
      isPremium:        user.isPremium,
      premiumExpiresAt: user.premiumExpiresAt?.toDate().toISOString(),
      createdAt:        user.createdAt.toDate().toISOString(),
      loginLogs:        user.loginLogs.map((log) => ({
        timestamp: log.timestamp.toDate().toISOString(),
        date:      log.date,
        time:      log.time,
        day:       log.day,
        platform:  log.platform,
      })),
    };
  }
);

export const updateCoins = onCall(
  { timeoutSeconds: 30, memory: "256MiB" },
  async (request: CallableRequest<UpdateCoinsRequest>): Promise<UpdateCoinsResponse> => {
    const deviceId = requireDeviceId(request.data?.deviceId);
    const { amount } = request.data;
    logger.info("[updateCoins] called", { deviceId, amount });
    const coins = await userProvider.updateCoins(deviceId, amount);
    return { deviceId, coins };
  }
);