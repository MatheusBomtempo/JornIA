import type { GeneratedContent } from "./types";

/**
 * Validação factual determinística do texto gerado, comparando com a fonte.
 * Zero IA: só regras que podem ser checadas por código com certeza — cada
 * uma nasceu de um erro REAL que o modelo cometeu em produção. O objetivo
 * não é julgar estilo, e sim barrar desinformação: dia da semana errado,
 * boilerplate inventado (via interditada, "sendo investigado"), frases de
 * ausência ("não foi informado"), nome de envolvido exposto etc.
 *
 * Uso (ver index.ts): gera → valida → se violou, regenera UMA vez com as
 * correções como guidance → se ainda violar regra crítica, falha alto (o
 * post fica como FAILED) em vez de entregar notícia com fato inventado.
 */

export interface Violation {
  rule: string;
  /** Instrução de correção, em pt-BR, pronta pra virar guidance do modelo. */
  fix: string;
}

const WEEKDAYS_PT = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

/** Frases que NUNCA podem aparecer numa notícia gerada. */
const ALWAYS_FORBIDDEN: { pattern: RegExp; rule: string; fix: string }[] = [
  {
    pattern: /na altura d[oa] (n[úu]mero|acesso|km)/i,
    rule: 'fórmula de endereço "na altura de..."',
    fix: "Remova a fórmula \"na altura de...\" — localize só por rua, bairro e cidade.",
  },
  {
    pattern: /n[ãa]o foi (informad|divulgad|detalhad|revelad)/i,
    rule: 'frase de ausência ("não foi informado/divulgado")',
    fix: "Remova frases sobre informação ausente — se a fonte não traz um dado, simplesmente não mencione o assunto.",
  },
  {
    pattern: /n[ãa]o h[áa] informa[çc]/i,
    rule: 'frase de ausência ("não há informações")',
    fix: "Remova frases sobre informação ausente — se a fonte não traz um dado, simplesmente não mencione o assunto.",
  },
  {
    pattern: /identificad[oa] como/i,
    rule: 'pessoa identificada por nome ("identificado como...")',
    fix: "Nunca nomeie envolvidos — use forma genérica como \"um homem de 42 anos\".",
  },
  {
    pattern: /transfer[êe]ncia de valores/i,
    rule: 'campo administrativo do BO virou frase',
    fix: "Remova a menção a transferência de valores — é um campo de sistema do BO, não um fato da notícia.",
  },
  {
    pattern: /cr[ée]dito da imagem/i,
    rule: 'crédito de imagem inventado',
    fix: "Remova o crédito de imagem — só use créditos que vierem no bloco \"## Créditos\".",
  },
];

/**
 * Termos que só podem aparecer se a fonte também os sustentar.
 *
 * O regex de SAÍDA precisa cobrir todas as flexões — substantivo, adjetivo
 * E verbo. A primeira versão só pegava "interditada"/"interdição" e deixou
 * passar em produção o título "…tomba e interdita BR-040" (fonte: só
 * "trânsito lento"); do mesmo jeito passavam "morreu", "bloqueia",
 * "investiga". Por isso os radicais curtos ("interdi[tç]", "bloque",
 * "investig", "morr[e…]") em vez de palavras inteiras.
 */
const NEEDS_SOURCE_SUPPORT: {
  output: RegExp;
  source: RegExp;
  rule: string;
  fix: string;
}[] = [
  {
    output: /investig/i,
    source: /investiga/i,
    rule: "investigação inventada",
    fix: "Remova menções a investigação — a fonte não descreve investigação em andamento.",
  },
  {
    output: /interdi[tç]/i,
    source: /interdi/i,
    rule: "interdição de via inventada",
    fix: "Remova a interdição de via — a fonte não menciona isso.",
  },
  {
    output: /bloque/i,
    source: /bloque/i,
    rule: "bloqueio de via inventado",
    fix: "Remova o bloqueio de via — a fonte não menciona isso.",
  },
  {
    output: /desvio de tr[âa]nsito|rotas? alternativ/i,
    source: /desvio|rota/i,
    rule: "desvio de trânsito inventado",
    fix: "Remova o desvio/rota alternativa — a fonte não menciona isso.",
  },
  {
    // "morr" só seguido de flexão verbal — "morro" (Morro do Papagaio etc.)
    // é geografia de BH e não pode disparar a regra.
    output: /\bmorte|\bmort[oa]s?\b|\bmorr(e|eu|em|eram|er|endo|ia|iam)\b|[óo]bito|falec|\bfata(l|is)\b/i,
    source: /mort|\bmorr(e|eu|em|eram|er|endo|ia|iam)\b|[óo]bito|falec|fatal/i,
    rule: "morte inventada",
    fix: "Remova qualquer menção a morte — a fonte não registra óbito.",
  },
  {
    output: /apurar as circunst|circunst[âa]ncias (ser[ãa]o|est[ãa]o sendo) apurad/i,
    source: /apura/i,
    rule: 'frase de fechamento "apurar as circunstâncias" inventada',
    fix: "Remova a frase de fechamento sobre apuração — termine a legenda no último fato real da fonte.",
  },
  {
    output: /per[íi]cia/i,
    source: /per[íi]cia/i,
    rule: "perícia inventada",
    fix: "Remova a menção à perícia — a fonte não fala em perícia.",
  },
];

function combinedOutput(content: GeneratedContent): string {
  return [content.title, content.subtitle, content.instagramCaption]
    .filter(Boolean)
    .join("\n");
}

/** Dias da semana válidos segundo as datas dd/mm/aaaa presentes na fonte. */
function validWeekdays(sourceText: string): Set<string> {
  const valid = new Set<string>();
  for (const m of sourceText.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
    const date = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (!Number.isNaN(date.getTime())) valid.add(WEEKDAYS_PT[date.getDay()]);
  }
  return valid;
}

export function validateGeneratedContent(
  content: GeneratedContent,
  sourceText: string,
): Violation[] {
  const output = combinedOutput(content);
  const outputLower = output.toLowerCase();
  const source = sourceText ?? "";
  const violations: Violation[] = [];

  // 1) Dia da semana: se o texto cita um, ele precisa bater com alguma data
  // da fonte (calculada por código) ou estar literalmente escrito na fonte.
  const valid = validWeekdays(source);
  const sourceLower = source.toLowerCase();
  for (const weekday of WEEKDAYS_PT) {
    const short = weekday.replace("-feira", "");
    const re = new RegExp(`\\b${short}(-feira)?\\b`, "i");
    if (!re.test(outputLower)) continue;
    const supported = sourceLower.includes(short) || valid.has(weekday);
    if (!supported) {
      violations.push({
        rule: `dia da semana "${weekday}" sem sustentação na fonte`,
        fix: `Remova ou corrija o dia da semana — a fonte não sustenta "${weekday}". Use somente o campo "Dia da semana" fornecido, ou cite só a data.`,
      });
    }
  }

  // 2) Frases proibidas em qualquer circunstância.
  for (const f of ALWAYS_FORBIDDEN) {
    if (f.pattern.test(output)) violations.push({ rule: f.rule, fix: f.fix });
  }

  // 3) Afirmações que precisam de sustentação na fonte.
  for (const f of NEEDS_SOURCE_SUPPORT) {
    if (f.output.test(output) && !f.source.test(source)) {
      violations.push({ rule: f.rule, fix: f.fix });
    }
  }

  return violations;
}

/** Bloco de guidance corretivo pra segunda tentativa. */
export function violationsToGuidance(violations: Violation[]): string {
  const fixes = [...new Set(violations.map((v) => v.fix))];
  return (
    "ATENÇÃO — sua resposta anterior violou regras de fidelidade factual. " +
    "Reescreva corrigindo TODOS os pontos abaixo, sem introduzir novos:\n- " +
    fixes.join("\n- ")
  );
}
