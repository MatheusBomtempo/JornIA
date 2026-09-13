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
