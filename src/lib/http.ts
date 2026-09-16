import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Erro de API com status HTTP associado. */
export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg: string, details?: unknown) =>
  new ApiError(400, msg, details);
export const unauthorized = (msg = "Não autenticado") => new ApiError(401, msg);
export const forbidden = (msg = "Sem permissão") => new ApiError(403, msg);
export const notFound = (msg = "Não encontrado") => new ApiError(404, msg);
export const conflict = (msg: string) => new ApiError(409, msg);

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function created<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

/**
 * Converte qualquer erro lançado num handler em uma resposta JSON coerente.
 * Uso: `return handleError(err)` dentro do catch de um route handler.
 */
export function handleError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: err.message, details: err.details },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Dados inválidos", details: err.flatten() },
      { status: 400 },
    );
  }
  console.error("[JornAI] Erro não tratado:", err);
  return NextResponse.json(
    { error: "Erro interno do servidor" },
    { status: 500 },
  );
}

/** Envolve um handler de rota com tratamento de erro padronizado. */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (err) {
      return handleError(err);
    }
  };
}
