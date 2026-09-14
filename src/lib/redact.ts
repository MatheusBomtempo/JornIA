/**
 * Redação de dados pessoais por padrão (regex), aplicada ANTES do texto
 * chegar na IA — é uma segunda camada de proteção além da instrução no
 * prompt (defesa em profundidade): mesmo que o modelo ignorasse a regra,
 * o dado já não está mais no texto que ele recebe.
 *
 * Só cobre padrões com formato bem definido (baixo risco de falso positivo).
 * Nomes de pessoas em prosa livre não são cobertos aqui (exigiria NER pra
 * fazer com segurança) — isso continua sendo responsabilidade da instrução
 * no prompt. A EXCEÇÃO é o padrão "Nome, NN anos", comum o bastante em
 * boletins de ocorrência (condutor, vítima, testemunha) pra valer um regex
 * dedicado — ver NAME_WITH_AGE_RE abaixo.
 */

interface Pattern {
  label: string;
  re: RegExp;
}

const PATTERNS: Pattern[] = [
  { label: "[CPF removido]", re: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g },
  // CPF sem pontuação — é assim que sai do extrator de PDF de um BO real
  // ("06667812658"). 11 dígitos corridos nunca são notícia; se um dia for
  // outra coisa (protocolo), remover também não custa nada.
  { label: "[CPF removido]", re: /\b\d{11}\b/g },
  // Telefone com DDD entre parênteses, tolerante a agrupamentos regionais
  // fora do padrão — "(32)985-088-865" apareceu num BO real.
  { label: "[telefone removido]", re: /\(\d{2}\)\s?\d[\d\-. ]{6,11}\d/g },
  { label: "[placa removida]", re: /\b[A-Z]{3}-?\d[A-Z0-9]\d{2}\b/g }, // antiga e Mercosul
  { label: "[CEP removido]", re: /\b\d{5}-\d{3}\b/g },
];

/**
 * "Fulano de Tal, de 42 anos" / "Fulano, 42 anos" — o padrão mais comum de
 * identificação de pessoa em boletim de ocorrência. Não é NER de verdade,
 * mas a combinação "sequência de palavras capitalizadas" + "idade logo
 * depois" é específica o bastante pra ter baixo risco de falso positivo
 * (nomes de rua/bairro não vêm seguidos de "NN anos"). Mantém a idade —
 * isso é informação jornalística legítima ("um homem de 42 anos") — e só
 * remove o nome.
 */
const NAME_WORD = "[A-ZÀ-Ú][a-zà-ÿ]+";
const NAME_CONNECTOR = "(?:d[aeo]s?|e)";
const NAME_WITH_AGE_RE = new RegExp(
  `\\b(${NAME_WORD}(?:\\s+(?:${NAME_CONNECTOR}\\s+)?${NAME_WORD}){1,4})\\s*,?\\s*(?:de\\s+|com\\s+)?(\\d{1,3})\\s*anos\\b`,
  "g",
);
// Variante em CAIXA ALTA — boletins de ocorrência costumam vir inteiros em
// caps ("JOSE PAULO JUVENCIO, 42 ANOS"), o que escapa do padrão acima.
const CAPS_NAME_WORD = "[A-ZÀ-Ú]{2,}";
const CAPS_NAME_WITH_AGE_RE = new RegExp(
  `\\b(${CAPS_NAME_WORD}(?:\\s+(?:D[AEO]S?\\s+|E\\s+)?${CAPS_NAME_WORD}){1,5})\\s*,?\\s*(?:DE\\s+|COM\\s+|de\\s+|com\\s+)?(\\d{1,3})\\s*(?:anos|ANOS)\\b`,
  "g",
);

export interface RedactResult {
  text: string;
  redactedCount: number;
}

// Nome em CAIXA ALTA precedido de honorífico ou função — é como pessoas
// aparecem na prosa do histórico de um BO ("SR JOSÉ PAULO JUVENCIO", "PERITO
// ODAIR", "TÉCNICA DE ENFERMAGEM FRANCIELE"). A âncora do honorífico é o que
// mantém o risco de falso positivo baixo: caps soltas sem essa âncora podem
// ser rua, empresa ou sigla.
// "(?<!NOSSA )" protege topônimos religiosos ("NOSSA SENHORA APARECIDA" em
// nome de linha de ônibus/bairro — apareceu num BO real).
const HONORIFIC_NAME_RE = new RegExp(
  `\\b(?<!NOSSA )(SR\\.?|SRA\\.?|SENHORA?|DR\\.?|DRA\\.?|PERIT[OA]|T[ÉE]CNIC[OA] DE ENFERMAGEM|ENFERMEIR[OA]|SOLDADO|CABO|SARGENTO|TENENTE|POLICIAL)\\s+(${CAPS_NAME_WORD}(?:\\s+(?:D[AEO]S?\\s+|E\\s+)?${CAPS_NAME_WORD}){0,4})`,
  "g",
);

/** Palavra em caps com cara de verbo conjugado ("DIRECIONOU", "RELATARAM") —
 * num texto todo em caixa alta, o regex de nome não distingue nome de verbo
 * que vem logo depois; esta heurística devolve o verbo pro texto. */
const TRAILING_VERB_RE = /\s+[A-ZÀ-Ú]{3,}(OU|ARAM|ERAM|IRAM|AVA|AVAM|IA|IAM)$/;

export function redactSensitive(text: string): RedactResult {
  let redactedCount = 0;
  let out = text;
  for (const { label, re } of PATTERNS) {
    out = out.replace(re, () => {
      redactedCount++;
      return label;
    });
  }
  for (const re of [NAME_WITH_AGE_RE, CAPS_NAME_WITH_AGE_RE]) {
    out = out.replace(re, (_m, _name: string, age: string) => {
      redactedCount++;
      return `[nome removido], ${age} anos`;
    });
  }
  out = out.replace(HONORIFIC_NAME_RE, (_m, honorific: string, name: string) => {
    redactedCount++;
    let verbTail = "";
    const verb = name.match(TRAILING_VERB_RE);
    if (verb) verbTail = verb[0];
    return `${honorific} [nome removido]${verbTail}`;
  });
  return { text: out, redactedCount };
}
