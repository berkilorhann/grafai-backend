// types/app.types.ts
// ─────────────────────────────────────────────────────────────
//  APP TYPES  —  Firestore şema + Client request/response tipleri
// ─────────────────────────────────────────────────────────────

// ── Ortak ────────────────────────────────────────────────────

export type MediaType = "image" | "video";
export type JobStatus = "pending" | "processing" | "completed" | "failed";

// ── Template Firestore Dökümanı ───────────────────────────────
// Koleksiyon: templates/{templateId}

export interface TemplateDoc {
  id: string;
  type: MediaType;
  title: string;
  description: string;
  thumbnailUrl: string;
  prompt: string;
  promptVariables?: string[];
  category: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

// ── Job Firestore Dökümanı ────────────────────────────────────
// Koleksiyon: users/{deviceId}/jobs/{jobId}

export interface JobDoc {
  id: string;
  deviceId: string;           // uid → deviceId (auth yok, deviceId ile çalışır)
  type: MediaType;
  templateId: string;
  status: JobStatus;
  falRequestId?: string;
  inputImageUrl?: string;
  inputFirstFrameUrl?: string;
  inputLastFrameUrl?: string;
  resolvedPrompt: string;
  outputImageUrl?: string;
  outputVideoUrl?: string;
  errorMessage?: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

// ── Device Firestore Dökümanı ─────────────────────────────────
// Koleksiyon: devices/{deviceId}

export interface DeviceDoc {
  deviceId: string;
  platform: string;
  appVersion?: string;
  createdAt: FirebaseFirestore.Timestamp;
  lastSeenAt: FirebaseFirestore.Timestamp;
}

// ── User Firestore Dökümanı ───────────────────────────────────
// Koleksiyon: users/{deviceId}

export interface LoginLog {
  timestamp: FirebaseFirestore.Timestamp;
  date: string;     // "2026-03-28"
  time: string;     // "19:45:00"
  day: string;      // "Friday"
  platform: string;
}

export interface UserDoc {
  deviceId: string;
  coins: number;
  isPremium: boolean;
  premiumExpiresAt?: FirebaseFirestore.Timestamp;
  loginLogs: LoginLog[];
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

// ── Storage Upload Paths ──────────────────────────────────────
// uploads/{deviceId}/images/{filename}
// uploads/{deviceId}/videos/{filename}
// outputs/{deviceId}/images/{jobId}/{filename}
// outputs/{deviceId}/videos/{jobId}/{filename}

// ── Client → Backend Request/Response Tipleri ─────────────────

// Upload
export interface GetUploadUrlRequest {
  deviceId: string;
  fileName: string;
  contentType: string;
  mediaType: MediaType;
}

export interface GetUploadUrlResponse {
  uploadUrl: string;
  storageUrl: string;
  filePath: string;
}

// Job-based Image
export interface StartImageEditRequest {
  deviceId: string;
  templateId: string;
  imageStoragePath: string;
  promptVariables?: Record<string, string>;
}

// Job-based Video
export interface StartVideoGenerationRequest {
  deviceId: string;
  templateId: string;
  firstFrameStoragePath: string;
  lastFrameStoragePath: string;
  promptVariables?: Record<string, string>;
}

export interface StartJobResponse {
  jobId: string;
  falRequestId: string;
  status: JobStatus;
}

export interface GetJobStatusRequest {
  deviceId: string;
  jobId: string;
}

export interface GetJobStatusResponse {
  jobId: string;
  status: JobStatus;
  outputImageUrl?: string;
  outputVideoUrl?: string;
  errorMessage?: string;
  queuePosition?: number;
}

// Templates
export interface GetTemplatesRequest {
  type?: MediaType;
  category?: string;
}

export interface GetTemplatesResponse {
  templates: TemplateDoc[];
}

// Device Auth
export interface RegisterDeviceRequest {
  platform: string;
  appVersion?: string;
}

export interface RegisterDeviceResponse {
  deviceId: string;
  isNewDevice: boolean;
  coins: number;
}

export interface PingDeviceRequest {
  deviceId: string;
  platform?: string;
}

export interface PingDeviceResponse {
  deviceId: string;
  exists: boolean;
  coins: number;
}

// User
export interface GetUserRequest {
  deviceId: string;
}

export interface LoginLogResponse {
  timestamp: string;
  date: string;
  time: string;
  day: string;
  platform: string;
}

export interface GetUserResponse {
  deviceId: string;
  coins: number;
  isPremium: boolean;
  premiumExpiresAt?: string;
  createdAt: string;
  loginLogs: LoginLogResponse[];
}

export interface UpdateCoinsRequest {
  deviceId: string;
  amount: number;   // pozitif → ekle, negatif → çıkar
}

export interface UpdateCoinsResponse {
  deviceId: string;
  coins: number;
}