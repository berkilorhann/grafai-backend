// providers/UserProvider.ts
import * as admin from "firebase-admin";
import { https, logger } from "firebase-functions/v2";
import { UserDoc, LoginLog } from "../types/app.types";

const COL_USERS = "users";
const MAX_LOGIN_LOGS = 50;

export class UserProvider {

  // ── Kullanıcıyı getir veya oluştur ───────────────────────
  async getOrCreateUser(deviceId: string, platform: string): Promise<UserDoc> {
    const ref = admin.firestore().collection(COL_USERS).doc(deviceId);
    const doc = await ref.get();
    const now = admin.firestore.Timestamp.now();

    const loginLog = this.buildLoginLog(now, platform);

    if (doc.exists) {
      const data = doc.data() as UserDoc;

      // Login log ekle — max 50 tut
      const logs = [...(data.loginLogs ?? []), loginLog].slice(-MAX_LOGIN_LOGS);

      await ref.update({ loginLogs: logs, updatedAt: now });

      logger.info("[UserProvider] User login logged", { deviceId });
      return { ...data, loginLogs: logs, updatedAt: now };
    } else {
      const newUser: UserDoc = {
        deviceId,
        coins: 50,
        isPremium: false,
        loginLogs: [loginLog],
        createdAt: now,
        updatedAt: now,
      };

      await ref.set(newUser);
      logger.info("[UserProvider] New user created", { deviceId });
      return newUser;
    }
  }

  // ── Kullanıcıyı getir ─────────────────────────────────────
  async getUser(deviceId: string): Promise<UserDoc> {
    const doc = await admin
      .firestore()
      .collection(COL_USERS)
      .doc(deviceId)
      .get();

    if (!doc.exists) {
      throw new https.HttpsError("not-found", `Kullanıcı bulunamadı: ${deviceId}`);
    }

    return doc.data() as UserDoc;
  }

  // ── Coin güncelle ─────────────────────────────────────────
  async updateCoins(deviceId: string, amount: number): Promise<number> {
    const ref = admin.firestore().collection(COL_USERS).doc(deviceId);
    const doc = await ref.get();

    if (!doc.exists) {
      throw new https.HttpsError("not-found", `Kullanıcı bulunamadı: ${deviceId}`);
    }

    const data = doc.data() as UserDoc;
    const newCoins = Math.max(0, data.coins + amount);

    await ref.update({
      coins: newCoins,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    logger.info("[UserProvider] Coins updated", { deviceId, amount, newCoins });
    return newCoins;
  }

  // ── Premium güncelle ──────────────────────────────────────
  async setPremium(
    deviceId: string,
    expiresAt?: admin.firestore.Timestamp
  ): Promise<void> {
    await admin.firestore().collection(COL_USERS).doc(deviceId).update({
      isPremium: true,
      premiumExpiresAt: expiresAt ?? null,
      updatedAt: admin.firestore.Timestamp.now(),
    });
    logger.info("[UserProvider] Premium set", { deviceId });
  }

  // ─────────────────────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────────────────────

  private buildLoginLog(
    timestamp: admin.firestore.Timestamp,
    platform: string
  ): LoginLog {
    const date = timestamp.toDate();
    const pad = (n: number) => n.toString().padStart(2, "0");

    return {
      timestamp,
      date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      time: `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
      day: date.toLocaleDateString("en-US", { weekday: "long" }),
      platform,
    };
  }
}