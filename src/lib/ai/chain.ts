import type { AiProvider, GenerateInput, GeneratedContent } from "./types";

/**
 * Erros de limite de taxa/cota — nesses casos vale a pena pular pro próximo
 * elo da corrente na hora (não adianta insistir no mesmo provider).
 */
function describe(err: unknown): string {
  return (err as Error)?.message ?? String(err);
}

/**
 * Encadeia vários provedores de IA: tenta o primeiro e, se falhar por
 * QUALQUER motivo (limite de taxa, modelo fora do ar, timeout, chave
 * inválida...), passa pro próximo — cada um com conta e cota independentes,
 * então um provedor inteiro fora do ar não trava a geração do post.
 *
 * Diferente do retry dentro de um único provider (que não adianta pra erro
 * de limite de taxa), aqui trocar de provider é exatamente a solução certa.
 */
export class ChainProvider implements AiProvider {
  readonly name = "chain";
  private links: AiProvider[];

  constructor(links: AiProvider[]) {
    if (links.length === 0) {
      throw new Error(
        "Nenhum provedor de IA configurado (verifique as chaves de API no .env).",
      );
    }
    this.links = links;
  }

  async generate(input: GenerateInput): Promise<GeneratedContent> {
    const failures: string[] = [];

    for (const provider of this.links) {
      try {
        return await provider.generate(input);
      } catch (err) {
        const msg = describe(err);
        failures.push(`${provider.name}: ${msg}`);
        console.warn(`[JornAI] IA (${provider.name}) falhou, tentando próximo da corrente: ${msg}`);
      }
    }

    throw new Error(
      `Todos os provedores de IA falharam. Tentativas:\n${failures.join("\n")}`,
    );
  }
}
