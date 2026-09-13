import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "./env";

/**
 * Abstração de storage de mídia. A arte final precisa terminar numa URL
 * pública HTTPS (exigência do Instagram Graph API). Dois backends:
 *  - "local": grava em ./public/uploads (só para desenvolvimento).
 *  - "s3":   S3 / Cloudflare R2 / Supabase Storage compatíveis com S3.
 */

export interface PutResult {
  key: string;
  url: string;
}

export interface StorageBackend {
  put(key: string, body: Buffer, contentType: string): Promise<PutResult>;
}

// ── Local (dev) ──────────────────────────────────────────────
class LocalStorage implements StorageBackend {
  private dir = path.join(process.cwd(), "public", "uploads");

  async put(key: string, body: Buffer): Promise<PutResult> {
    const dest = path.join(this.dir, key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, body);
    return {
      key,
      url: `${env.storage.publicBaseUrl.replace(/\/$/, "")}/uploads/${key}`,
    };
  }
}

// ── S3 / R2 / Supabase ───────────────────────────────────────
class S3Storage implements StorageBackend {
  async put(key: string, body: Buffer, contentType: string): Promise<PutResult> {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const cfg = env.storage.s3;
    if (!cfg.bucket) throw new Error("S3_BUCKET não configurado.");

    const client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      credentials:
        cfg.accessKeyId && cfg.secretAccessKey
          ? {
              accessKeyId: cfg.accessKeyId,
              secretAccessKey: cfg.secretAccessKey,
            }
          : undefined,
    });

    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    const base = cfg.publicUrl?.replace(/\/$/, "");
    if (!base) {
      throw new Error(
        "S3_PUBLIC_URL não configurado — necessário para a URL pública da arte.",
      );
    }
    return { key, url: `${base}/${key}` };
  }
}

let backend: StorageBackend | null = null;

export function getStorage(): StorageBackend {
  if (backend) return backend;
  backend = env.storage.provider === "s3" ? new S3Storage() : new LocalStorage();
  return backend;
}

/** Helper de alto nível para gravar um buffer e obter a URL pública. */
export function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<PutResult> {
  return getStorage().put(key, body, contentType);
}
