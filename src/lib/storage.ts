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
  /** Remove o objeto (idempotente — não deve lançar se já não existir). */
  delete(key: string): Promise<void>;
  /** Extrai a key a partir de uma URL pública, ou null se a URL não pertence a este backend. */
  keyFromUrl(url: string): string | null;
}

// ── Local (dev) ──────────────────────────────────────────────
class LocalStorage implements StorageBackend {
  private dir = path.join(process.cwd(), "public", "uploads");

  private prefix(): string {
    return `${env.storage.publicBaseUrl.replace(/\/$/, "")}/uploads/`;
  }

  async put(key: string, body: Buffer): Promise<PutResult> {
    const dest = path.join(this.dir, key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, body);
    return { key, url: `${this.prefix()}${key}` };
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(path.join(this.dir, key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  keyFromUrl(url: string): string | null {
    const prefix = this.prefix();
    return url.startsWith(prefix) ? url.slice(prefix.length) : null;
  }
}

// ── S3 / R2 / Supabase ───────────────────────────────────────
class S3Storage implements StorageBackend {
  private async client() {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const cfg = env.storage.s3;
    if (!cfg.bucket) throw new Error("S3_BUCKET não configurado.");
    return new S3Client({
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
  }

  async put(key: string, body: Buffer, contentType: string): Promise<PutResult> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    await client.send(
      new PutObjectCommand({
        Bucket: env.storage.s3.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    const base = env.storage.s3.publicUrl?.replace(/\/$/, "");
    if (!base) {
      throw new Error(
        "S3_PUBLIC_URL não configurado — necessário para a URL pública da arte.",
      );
    }
    return { key, url: `${base}/${key}` };
  }

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    await client.send(
      new DeleteObjectCommand({ Bucket: env.storage.s3.bucket, Key: key }),
    );
  }

  keyFromUrl(url: string): string | null {
    const base = env.storage.s3.publicUrl?.replace(/\/$/, "");
    if (!base || !url.startsWith(`${base}/`)) return null;
    return url.slice(base.length + 1);
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

/** Apaga o objeto por trás de uma URL pública salva no banco. Não lança se a URL não pertencer ao backend configurado — só avisa (ex.: sobrou de uma migração de provider). */
export async function deleteObjectByUrl(url: string): Promise<void> {
  const storage = getStorage();
  const key = storage.keyFromUrl(url);
  if (!key) {
    console.warn(`[JornAI] URL fora do storage configurado, ignorando: ${url}`);
    return;
  }
  await storage.delete(key);
}
