// providers/FirestoreProvider.ts
import * as admin from "firebase-admin";
import { https, logger } from "firebase-functions/v2";
import { TemplateDoc, JobDoc, MediaType } from "../types/app.types";

const db = () => admin.firestore();

const COL_TEMPLATES = "templates";
const COL_USERS = "users";
const COL_JOBS = "jobs";

export class FirestoreProvider {

  // ─────────────────────────────────────────
  //  Templates
  // ─────────────────────────────────────────

  async getTemplates(type?: MediaType, category?: string): Promise<TemplateDoc[]> {
    let query: admin.firestore.Query = db()
      .collection(COL_TEMPLATES)
      .where("isActive", "==", true);

    if (type) query = query.where("type", "==", type);
    if (category) query = query.where("category", "==", category);

    const snap = await query.get();
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TemplateDoc));

    // Composite index gerekmeden JS tarafında sırala
    return docs.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getTemplateById(templateId: string): Promise<TemplateDoc> {
    const doc = await db().collection(COL_TEMPLATES).doc(templateId).get();

    if (!doc.exists) {
      throw new https.HttpsError("not-found", `Template bulunamadı: ${templateId}`);
    }

    return { id: doc.id, ...doc.data() } as TemplateDoc;
  }

  // ─────────────────────────────────────────
  //  Jobs  (users/{deviceId}/jobs/{jobId})
  // ─────────────────────────────────────────

  async createJob(
    data: Omit<JobDoc, "id" | "createdAt" | "updatedAt">
  ): Promise<string> {
    const now = admin.firestore.Timestamp.now();

    const ref = await db()
      .collection(COL_USERS)
      .doc(data.deviceId)           // uid → deviceId
      .collection(COL_JOBS)
      .add({ ...data, createdAt: now, updatedAt: now });

    logger.info("[FirestoreProvider] Job created", { jobId: ref.id, deviceId: data.deviceId });
    return ref.id;
  }

  async getJob(deviceId: string, jobId: string): Promise<JobDoc> {
    const doc = await db()
      .collection(COL_USERS)
      .doc(deviceId)
      .collection(COL_JOBS)
      .doc(jobId)
      .get();

    if (!doc.exists) {
      throw new https.HttpsError("not-found", `Job bulunamadı: ${jobId}`);
    }

    return { id: doc.id, ...doc.data() } as JobDoc;
  }

  async updateJob(
    deviceId: string,
    jobId: string,
    updates: Partial<Omit<JobDoc, "id" | "deviceId" | "createdAt">>
  ): Promise<void> {
    await db()
      .collection(COL_USERS)
      .doc(deviceId)
      .collection(COL_JOBS)
      .doc(jobId)
      .update({
        ...updates,
        updatedAt: admin.firestore.Timestamp.now(),
      });

    logger.info("[FirestoreProvider] Job updated", { jobId, status: updates.status });
  }

  async getUserJobs(deviceId: string, limit = 20): Promise<JobDoc[]> {
    const snap = await db()
      .collection(COL_USERS)
      .doc(deviceId)
      .collection(COL_JOBS)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as JobDoc));
  }

  async getJobByFalRequestId(
    deviceId: string,
    falRequestId: string
  ): Promise<JobDoc | null> {
    const snap = await db()
      .collection(COL_USERS)
      .doc(deviceId)
      .collection(COL_JOBS)
      .where("falRequestId", "==", falRequestId)
      .limit(1)
      .get();

    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() } as JobDoc;
  }
}