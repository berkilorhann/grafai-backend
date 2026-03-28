// ─────────────────────────────────────────────
//  Shared FAL AI Types
// ─────────────────────────────────────────────

export interface FalFile {
  url: string;
  content_type?: string;
  file_name?: string;
  file_size?: number;
}

export interface FalImageFile extends FalFile {
  width?: number;
  height?: number;
}

export type FalQueueStatus =
  | "IN_QUEUE"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED";

export interface FalQueueSubmitResponse {
  request_id: string;
  status: FalQueueStatus;
  queue_position?: number;
}

export interface FalQueueStatusResponse {
  request_id: string;
  status: FalQueueStatus;
  queue_position?: number;
  logs?: Array<{ message: string; timestamp: string }>;
}

// ─────────────────────────────────────────────
//  Veo 3.1 First-Last-Frame → Video Types
// ─────────────────────────────────────────────

export type Veo31AspectRatio = "auto" | "16:9" | "9:16";
export type Veo31Duration = "4s" | "6s" | "8s";
export type Veo31Resolution = "720p" | "1080p" | "4k";
export type SafetyTolerance = "1" | "2" | "3" | "4" | "5" | "6";

export interface Veo31VideoInput extends Record<string, unknown> {
  prompt: string;
  first_frame_url: string;
  last_frame_url: string;
  aspect_ratio?: Veo31AspectRatio;
  duration?: Veo31Duration;
  negative_prompt?: string;
  resolution?: Veo31Resolution;
  generate_audio?: boolean;
  seed?: number;
  auto_fix?: boolean;
  safety_tolerance?: SafetyTolerance;
}

export interface Veo31VideoOutput {
  video: FalFile;
}

// Request payloads from mobile client
export interface GenerateVideoRequest {
  prompt: string;
  firstFrameUrl: string;
  lastFrameUrl: string;
  aspectRatio?: Veo31AspectRatio;
  duration?: Veo31Duration;
  resolution?: Veo31Resolution;
  generateAudio?: boolean;
  negativePrompt?: string;
  seed?: number;
}

export interface GenerateVideoResponse {
  requestId: string;
  videoUrl?: string;
  status: FalQueueStatus;
}

export interface VideoStatusResponse {
  requestId: string;
  status: FalQueueStatus;
  videoUrl?: string;
  queuePosition?: number;
  logs?: Array<{ message: string; timestamp: string }>;
}

// ─────────────────────────────────────────────
//  Nano Banana 2 Image Edit Types
// ─────────────────────────────────────────────

export type NanoBananaAspectRatio =
  | "auto" | "21:9" | "16:9" | "3:2" | "4:3" | "5:4" | "1:1"
  | "4:5" | "3:4" | "2:3" | "9:16" | "4:1" | "1:4" | "8:1" | "1:8";

export type NanoBananaOutputFormat = "jpeg" | "png" | "webp";
export type NanoBananaResolution = "0.5K" | "1K" | "2K" | "4K";
export type NanoBananaThinkingLevel = "minimal" | "high";

export interface NanoBananaEditInput extends Record<string, unknown> {
  prompt: string;
  image_urls: string[];
  num_images?: number;
  seed?: number;
  aspect_ratio?: NanoBananaAspectRatio;
  output_format?: NanoBananaOutputFormat;
  safety_tolerance?: SafetyTolerance;
  sync_mode?: boolean;
  resolution?: NanoBananaResolution;
  limit_generations?: boolean;
  enable_web_search?: boolean;
  thinking_level?: NanaBananaThinkingLevel;
}

// typo alias kept for internal compat
type NanaBananaThinkingLevel = NanoBananaThinkingLevel;

export interface NanoBananaEditOutput {
  images: FalImageFile[];
  description: string;
}

// Request payloads from mobile client
export interface EditImageRequest {
  prompt: string;
  imageUrls: string[];
  numImages?: number;
  aspectRatio?: NanoBananaAspectRatio;
  outputFormat?: NanoBananaOutputFormat;
  resolution?: NanoBananaResolution;
  seed?: number;
  enableWebSearch?: boolean;
  thinkingLevel?: NanoBananaThinkingLevel;
}

export interface EditImageResponse {
  requestId: string;
  images?: FalImageFile[];
  description?: string;
  status: FalQueueStatus;
}

export interface ImageEditStatusResponse {
  requestId: string;
  status: FalQueueStatus;
  images?: FalImageFile[];
  description?: string;
  queuePosition?: number;
  logs?: Array<{ message: string; timestamp: string }>;
}