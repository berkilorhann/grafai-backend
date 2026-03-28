import { FirestoreProvider } from "../providers/FirestoreProvider";
import {
  GetTemplatesRequest,
  GetTemplatesResponse,
  TemplateDoc,
} from "../types/app.types";

/**
 * TemplateService
 *
 * Template listeleme ve prompt çözümleme işlemleri.
 *
 * Prompt değişkeni sistemi:
 *   Template prompt: "Edit the {subject} in {style} style"
 *   promptVariables: { subject: "cat", style: "oil painting" }
 *   Çözümlenen: "Edit the cat in oil painting style"
 */
export class TemplateService {
  constructor(private readonly firestore: FirestoreProvider) {}

  // ─────────────────────────────────────────
  //  Public API
  // ─────────────────────────────────────────

  async getTemplates(req: GetTemplatesRequest): Promise<GetTemplatesResponse> {
    const templates = await this.firestore.getTemplates(req.type, req.category);
    return { templates };
  }

  async getTemplateById(templateId: string): Promise<TemplateDoc> {
    return this.firestore.getTemplateById(templateId);
  }

  /**
   * Template prompt'una değişkenleri yerleştirerek
   * API'ye gönderilecek son prompt'u üretir.
   *
   * Örnek:
   *   prompt = "Make the {subject} look like {style}"
   *   variables = { subject: "dog", style: "a cartoon" }
   *   → "Make the dog look like a cartoon"
   */
  resolvePrompt(
    template: TemplateDoc,
    variables?: Record<string, string>
  ): string {
    if (!variables || Object.keys(variables).length === 0) {
      return template.prompt;
    }

    let resolved = template.prompt;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{${key}}`;
      resolved = resolved.replace(placeholder, value.trim());
    }

    // Doldurulmamış değişken kaldıysa temizle
    resolved = resolved.replace(/\{[^}]+\}/g, "").replace(/\s+/g, " ").trim();

    return resolved;
  }
}