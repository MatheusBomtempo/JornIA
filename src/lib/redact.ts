/**
 * Redação de dados pessoais por padrão (regex), aplicada ANTES do texto
 * chegar na IA — é uma segunda camada de proteção além da instrução no
 * prompt (defesa em profundidade): mesmo que o modelo ignorasse a regra,
 * o dado já não está mais no texto que ele recebe.
 *
 * Só cobre padrões com formato bem definido (baixo risco de falso positivo).
 * Nomes de pessoas não são cobertos aqui — isso continua sendo
 * responsabilidade da instrução no prompt, pois exigiria reconhecimento de
 * entidades (NER) para fazer com segurança via regex.
 */

interface Pattern {
  label: string;
  re: RegExp;
}

const PATTERNS: Pattern[] = [
  { label: "[CPF removido]", re: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g },
  { label: "[telefone removido]", re: /\(\d{2}\)\s?9?\d{4}-?\d{4}\b/g },
  { label: "[placa removida]", re: /\b[A-Z]{3}-?\d[A-Z0-9]\d{2}\b/g }, // antiga e Mercosul
  { label: "[CEP removido]", re: /\b\d{5}-\d{3}\b/g },
];

export interface RedactResult {
  text: string;
  redactedCount: number;
}

export function redactSensitive(text: string): RedactResult {
  let redactedCount = 0;
  let out = text;
  for (const { label, re } of PATTERNS) {
    out = out.replace(re, () => {
      redactedCount++;
      return label;
    });
  }
  return { text: out, redactedCount };
}
