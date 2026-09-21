"use client";

/** Wrapper de fetch para os componentes client. Lança com a mensagem da API. */
export async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });

  const isJson = res.headers
    .get("content-type")
    ?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const message =
      (data as { error?: string })?.error ?? `Erro ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

export const apiGet = <T>(path: string) => api<T>(path);

export const apiPost = <T>(path: string, body?: unknown) =>
  api<T>(path, {
    method: "POST",
    body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
  });

export const apiPatch = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) });

export const apiPut = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) });

export const apiDelete = <T>(path: string) =>
  api<T>(path, { method: "DELETE" });

export type UploadProgress = (sentBytes: number, totalBytes: number) => void;

/**
 * Envio de arquivo com progresso. `fetch` não expõe o andamento do upload;
 * XMLHttpRequest sim — e num vídeo de 100 MB pra um servidor em outro
 * continente é a diferença entre "travou?" e "faltam 30%". Mesmo contrato
 * de erro do `api()`: lança com a mensagem da API (ou o <Message> do XML
 * que o S3/R2 devolve quando a URL assinada é recusada).
 */
export function uploadWithProgress<T = unknown>(
  url: string,
  init: { method: "POST" | "PUT"; body: FormData | Blob; headers?: Record<string, string> },
  onProgress?: UploadProgress,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(init.method, url);
    for (const [name, value] of Object.entries(init.headers ?? {})) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded, e.total);
    };
    xhr.onerror = () => reject(new Error("Falha de rede durante o envio."));
    xhr.onabort = () => reject(new Error("Envio cancelado."));
    xhr.ontimeout = () => reject(new Error("O envio demorou demais e foi interrompido."));
    xhr.onload = () => {
      const type = xhr.getResponseHeader("content-type") ?? "";
      let data: unknown = null;
      if (type.includes("application/json")) {
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          data = null;
        }
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const xmlMessage = type.includes("xml")
          ? /<Message>([\s\S]*?)<\/Message>/.exec(xhr.responseText)?.[1]
          : undefined;
        const message =
          (data as { error?: string })?.error ?? xmlMessage ?? `Erro ${xhr.status}`;
        reject(new Error(message));
        return;
      }
      resolve(data as T);
    };
    xhr.send(init.body);
  });
}
