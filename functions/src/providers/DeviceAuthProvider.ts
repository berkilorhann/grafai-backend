// providers/DeviceAuthProvider.ts
import * as admin from "firebase-admin";
import { https, logger } from "firebase-functions/v2";
import { v4 as uuidv4 } from "uuid";
import { UserProvider } from "./UserProvider";
import { DeviceDoc, RegisterDeviceResponse, PingDeviceResponse } from "../types/app.types";

const COL_DEVICES = "devices";

export class DeviceAuthProvider {
  private readonly userProvider = new UserProvider();

  // ── Yeni cihaz kaydı ──────────────────────────────────────
  async registerDevice(
    platform: string,
    appVersion?: string
  ): Promise<RegisterDeviceResponse> {
    if (!platform?.trim()) {
      throw new https.HttpsError("invalid-argument", "platform gerekli");
    }

    const deviceId = uuidv4();
    const now = admin.firestore.Timestamp.now();

    const deviceDoc: DeviceDoc = {
      deviceId,
      platform,
      ...(appVersion ? { appVersion } : {}),
      createdAt: now,
      lastSeenAt: now,
    };

    // Batch: devices + users aynı anda oluşturulur
    const batch = admin.firestore().batch();
    batch.set(
      admin.firestore().collection(COL_DEVICES).doc(deviceId),
      deviceDoc
    );
    await batch.commit();

    // User dokümanını oluştur (50 başlangıç coin)
    const user = await this.userProvider.getOrCreateUser(deviceId, platform);

    logger.info("[DeviceAuth] New device registered", { deviceId, platform });
    return { deviceId, isNewDevice: true, coins: user.coins };
  }

  // ── Cihaz ping — lastSeenAt + login log güncelle ──────────
  async pingDevice(
    deviceId: string,
    platform: string = "android"
  ): Promise<PingDeviceResponse> {
    if (!deviceId?.trim()) {
      throw new https.HttpsError("invalid-argument", "deviceId gerekli");
    }

    const ref = admin
      .firestore()
      .collection(COL_DEVICES)
      .doc(deviceId);

    const doc = await ref.get();

    if (!doc.exists) {
      logger.warn("[DeviceAuth] Ping for unknown deviceId", { deviceId });
      return { deviceId, exists: false, coins: 0 };
    }

    // lastSeenAt güncelle + login log ekle — paralel
    const [, user] = await Promise.all([
      ref.update({ lastSeenAt: admin.firestore.Timestamp.now() }),
      this.userProvider.getOrCreateUser(deviceId, platform),
    ]);

    logger.info("[DeviceAuth] Device ping", { deviceId });
    return { deviceId, exists: true, coins: user.coins };
  }
}