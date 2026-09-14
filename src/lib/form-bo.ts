/**
 * Perfil de limpeza para FORMULÁRIOS oficiais (BO do SISP/PM-MG e similares).
 *
 * Nesses PDFs o extrator de texto despeja cada célula do formulário numa
 * linha solta: rótulos em CAIXA ALTA viram "## CABEÇALHO" no markdownify e o
 * valor flutua no parágrafo vizinho — às vezes DEPOIS do rótulo, às vezes
 * ANTES. Pior: rótulos que se repetem (um por envolvido, ex. "NOME
 * COMPLETO") são removidos pela dedup de cabeçalho/rodapé do markdownify, e
 * os valores ficam órfãos — remoção de dado pessoal ORIENTADA A RÓTULO
 * falha nos envolvidos 2+ (vazou nome de verdade em teste).
 *
 * Por isso a estratégia aqui é WHITELIST: em vez de tentar enumerar o que
 * remover (burocracia, ficha pessoal, viaturas, chassi…), o texto final é
 * montado SÓ com o que é reconhecidamente noticioso:
 *
 *   1. Campos destilados (natureza, causa presumida, local, município,
 *      datas, tipo/marca dos veículos, nº de ocupantes).
 *   2. Resumo dos envolvidos por CONTEÚDO (não por rótulo): tipo de
 *      envolvimento, grau de lesão, idades detectáveis.
 *   3. O HISTÓRICO completo, religando os fragmentos que a quebra de linha
 *      do PDF promoveu a "cabeçalho" ("## POSTE DE ILUMINAÇÃO.").
 *
 * Tudo que não for reconhecido é descartado — nome, filiação, CPF, RG,
 * endereço residencial, telefone, habilitação, chassi etc. nunca entram no
 * prompt por construção. 100% determinístico, zero IA.
 */

const NARRATIVE_HEADER_FORM =
  /^##?\s*(HIST[ÓO]RICO|RELATO|DESCRI[ÇC][ÃA]O DOS FATOS)\b/i;

/** Depois do histórico vêm seções de sistema — qualquer uma delas encerra. */
const NARRATIVE_TERMINATOR =
  /^(Per[íi]cia T[ée]cnica|PREFIXO|PLACA DA VIATURA|PERITO|VIATURAS?\b|MERCADORIAS?|OBJETOS?\b|ARMAS?\b|DIGITADOR|GERADO POR)/i;

interface NewsField {
  key: string;
  display: string;
  label: RegExp;
  /** O vizinho só vale como valor se tiver esta cara. */
  valueLooksLike: RegExp;
  collectAll?: boolean;
  /** Extrai só parte do vizinho (ex.: "5 FOI POSSÍVEL..." → "5"). */
  extract?: RegExp;
}

const ANY_TEXT = /^.{2,140}$/;
const DATE_TIME = /^[\d/: ]{4,25}$/;

const NEWS_FIELDS: NewsField[] = [
  {
    key: "causa",
    display: "Causa presumida (registrada no BO)",
    label: /^CAUSA PRESUMIDA$/,
    valueLooksLike: ANY_TEXT,
  },
  {
    key: "local",
    display: "Local do fato",
    label: /^LOCAL \(AV/,
    valueLooksLike: ANY_TEXT,
  },
  {
    key: "municipio",
    display: "Município",
    label: /^MUNIC[ÍI]PIO$/,
    valueLooksLike: /^[A-ZÀ-Ú][A-ZÀ-Ú ]{2,40}$/,
  },
  {
    key: "bairro",
    display: "Bairro",
    label: /^BAIRRO\b/,
    valueLooksLike: /^[A-ZÀ-Ú][A-ZÀ-Ú ]{2,40}$/,
  },
  {
    key: "data_comunicacao",
    display: "Data da comunicação",
    label: /^DATA DA COMUNICA[ÇC][ÃA]O/,
    valueLooksLike: /^\d{1,2}\/\d{1,2}\/\d{4}/,
  },
  {
    key: "hora_comunicacao",
    display: "Hora da comunicação",
    label: /^DATA DA COMUNICA[ÇC][ÃA]O HORA/,
    valueLooksLike: /^\d{1,2}:\d{2}$/,
  },
  {
    key: "data_registro",
    display: "Data e hora do registro",
    label: /^DATA DO REGISTRO$/,
    valueLooksLike: DATE_TIME,
  },
  {
    key: "tipo_veiculo",
    display: "Tipo de cada veículo envolvido, em ordem",
    label: /^TIPO DE VE[ÍI]CULO$/,
    valueLooksLike: /^[A-ZÀ-Ú][A-ZÀ-Ú /]{2,40}$/,
    collectAll: true,
  },
  {
    key: "marca_veiculo",
    display: "Marca/modelo de cada veículo, em ordem",
    label: /^MARCA ?\/ ?MODELO$/,
    valueLooksLike: /^[A-ZÀ-Ú0-9][A-ZÀ-Ú0-9 /.-]{2,50}$/,
    collectAll: true,
  },
  {
    key: "ocupantes",
    display: "Nº de ocupantes de cada veículo, em ordem",
    label: /^N[°º] OCUPANTES$/,
    valueLooksLike: /^\d{1,3}\b/,
    collectAll: true,
    extract: /^(\d{1,3})\b/,
  },
  {
    key: "idades",
    display: "Idades identificadas entre os envolvidos (em anos)",
    label: /^IDADE APARENTE$/,
    valueLooksLike: /^\d{1,3}$/,
    collectAll: true,
  },
];

/** Rótulos de formulário (qualquer um) — um vizinho assim nunca é valor. */
const FORM_LABELS = NEWS_FIELDS.map((f) => f.label).concat([
  /^N[ÚU]MERO|^COMPLEMENTO|^CEP$|^UF\b|^PA[ÍI]S|^KM$/,
  /^SITUA[ÇC][ÃA]O|^ESP[ÉE]CIE$|^CATEGORIA$|^CHASSI$|^RENAVAM$|^PLACA$/,
  /^COR |^ANO |^SEGURO|^NOME|^EMAIL|^DADOS|^TIPO\b|^GRAU DA LES/,
  /^IDADE APARENTE|^SEXO\b|^DESCRI[ÇC][ÃA]O/,
]);

// ── Conteúdos reconhecidos por PADRÃO (independem de rótulo vivo) ────────────
const NATUREZA_CODE = /^T\d{4,6} ?- ?(.{4,80})$/;
// Exige o prefixo de gênero — é como o SISP escreve ("MASCULINO CONDUTOR DO
// VEICULO"); sem ele, "PASSAGEIRO" solto (espécie do veículo) contaminava.
const ENVOLVIMENTO =
  /^(MASCULINO|FEMININO)\s+(CONDUTOR|V[ÍI]TIMA|TESTEMUNHA|PASSAGEIR|AUTOR|SUSPEIT)[A-ZÀ-Ú ()./]{0,60}$/;
const LESAO =
  /^(SEM LES[ÕO]ES APARENTES|LEVES?|GRAVES?|GRAV[ÍI]SSIMAS?|FATAL|FATAIS)$/;
const BIRTH_WITH_AGE = /^\d{1,2}\/\d{1,2}\/\d{4}\s+(\d{1,3})$/;

// ── Colheita de nomes das fichas descartadas ────────────────────────────────
// Um parágrafo de 2-6 palavras em CAIXA ALTA, só letras, que não é rótulo,
// valor reconhecido, endereço nem instituição, é quase sempre um nome de
// pessoa da ficha do envolvido. Esses nomes são colhidos e removidos do
// HISTÓRICO por correspondência exata (tolerante a acento) — a proteção mais
// precisa possível: remove exatamente as pessoas do documento, nada além.
const NAMEISH_PARAGRAPH = /^[A-ZÀ-Ú]{2,}(?:\s+[A-ZÀ-Ú]{2,}){1,5}$/;
const ADDRESSISH_START =
  /^(RUA|AV|AVENIDA|TRAVESSA|ALAMEDA|PRA[ÇC]A|ROD|RODOVIA|ESTRADA|BECO)\b/;
const INSTITUTION_WORDS =
  /\b(POLICIA|POL[ÍI]CIA|MILITAR|CIVIL|PENAL|BOMBEIRO|SAMU|SETRAN|COPOM|GUARDA|HOSPITAL|DELEGACIA|PERICIA|PER[ÍI]CIA|VIATURA|TRANSPORTE|COLETIVO|EMPRESA|LTDA|PREFEITURA|SECRETARIA|SEGURANCA|SEGURAN[ÇC]A|ESTADO|MINAS|GERAIS|BRASIL|BARBACENA|IGNORADO|DESCONHECIDA?|INFORMA[ÇC][ÃA]O|APLICA|PRIS[ÃA]O|REGISTRO|OCORR[ÊE]NCIA|NOSSA|SENHORA?|SANTA|SANTO|S[ÃA]O|ACIDENTE|TR[ÂA]NSITO|TRANSITO|V[ÍI]TIMA|VE[ÍI]CULO|DEFEITO|CONDUTOR|PASSAGEIROS?|TESTEMUNHA|ONIBUS|[ÔO]NIBUS|AUTOM[ÓO]VEL|REPASSAD[OA])\b/;

/** a→[aáàâã] etc., pra "JOSE PAULO" da ficha bater com "JOSÉ PAULO" da prosa. */
function accentClass(ch: string): string {
  const map: Record<string, string> = {
    A: "[AÁÀÂÃÄ]",
    E: "[EÉÈÊË]",
    I: "[IÍÌÎÏ]",
    O: "[OÓÒÔÕÖ]",
    U: "[UÚÙÛÜ]",
    C: "[CÇ]",
  };
  return map[ch] ?? ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function accentInsensitivePattern(words: string[]): RegExp {
  const base = words
    .map((w) =>
      w
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .split("")
        .map(accentClass)
        .join(""),
    )
    .join("\\s+");
  return new RegExp(`\\b${base}\\b`, "g");
}

function stripHeader(p: string): string {
  return p.replace(/^##\s*/, "").trim();
}

function isFormLabel(text: string): boolean {
  return FORM_LABELS.some((re) => re.test(text));
}

export interface FormCleanResult {
  /** Texto final: campos destilados + envolvidos + histórico. Nada além. */
  text: string;
  discardedParagraphs: number;
  foundNarrative: boolean;
}

/**
 * Detecta se o markdown tem cara de formulário (muitos cabeçalhos curtos em
 * sequência) — só aí vale aplicar o perfil whitelist.
 */
export function looksLikeFormDocument(markdown: string): boolean {
  const paragraphs = markdown.split(/\n\s*\n+/);
  const headers = paragraphs.filter((p) => p.trim().startsWith("## ")).length;
  return paragraphs.length >= 12 && headers / paragraphs.length > 0.4;
}

export function cleanFormDocument(markdown: string): FormCleanResult {
  // Tira marcadores de campo vazio ("XXXX") colados em valores reais.
  const paragraphs = markdown
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\bX{3,}\b/g, " ").replace(/\s{2,}/g, " ").trim())
    .filter(Boolean);

  // 1) Campos destilados: valor no vizinho (procura em i+1, i-1, i+2, i-2).
  const collected = new Map<string, string[]>();
  const addValue = (key: string, value: string, collectAll?: boolean) => {
    const list = collected.get(key) ?? [];
    if (!collectAll && list.length) return;
    if (list.includes(value)) return;
    list.push(value);
    collected.set(key, list);
  };

  for (let i = 0; i < paragraphs.length; i++) {
    const text = stripHeader(paragraphs[i]);
    for (const field of NEWS_FIELDS) {
      if (!field.label.test(text)) continue;
      // Vizinhos imediatos primeiro; depois -2 antes de +2 (no SISP o valor
      // órfão costuma vir ANTES do rótulo quando não vem logo depois).
      for (const j of [i + 1, i - 1, i - 2, i + 2]) {
        if (j < 0 || j >= paragraphs.length) continue;
        const neighbor = stripHeader(paragraphs[j]);
        if (isFormLabel(neighbor)) continue;
        if (!field.valueLooksLike.test(neighbor)) continue;
        const value = field.extract
          ? (neighbor.match(field.extract)?.[1] ?? neighbor)
          : neighbor;
        addValue(field.key, value, field.collectAll);
        break;
      }
    }
  }

  // 2) Conteúdo reconhecido por padrão, varrendo o documento inteiro —
  // sobrevive à dedup de rótulos repetidos do markdownify.
  for (const p of paragraphs) {
    const text = stripHeader(p);
    const nat = text.match(NATUREZA_CODE);
    if (nat) addValue("natureza", nat[1].trim());
    if (text.length <= 80 && ENVOLVIMENTO.test(text)) {
      addValue("envolvimentos", text, true);
    }
    if (LESAO.test(text)) addValue("lesoes", text, true);
    const birth = text.match(BIRTH_WITH_AGE);
    if (birth) addValue("idades", birth[1], true);
  }

  // 3) Colhe nomes de pessoa das fichas (parágrafos descartados) pra limpar
  // o histórico depois.
  const collectedValues = new Set(
    [...collected.values()].flat().map((v) => v.toUpperCase()),
  );
  const harvestedNames: string[][] = [];
  for (const p of paragraphs) {
    const text = stripHeader(p);
    if (!NAMEISH_PARAGRAPH.test(text)) continue;
    if (isFormLabel(text) || ADDRESSISH_START.test(text)) continue;
    if (ENVOLVIMENTO.test(text) || LESAO.test(text)) continue;
    if (INSTITUTION_WORDS.test(text)) continue;
    if (collectedValues.has(text.toUpperCase())) continue;
    const words = text.split(/\s+/);
    harvestedNames.push(words);
    // "SR JOSÉ PAULO" na prosa vs "JOSE PAULO JUVENCIO" na ficha: registra
    // também o prefixo de 2 palavras.
    if (words.length >= 3) harvestedNames.push(words.slice(0, 2));
  }

  // 4) Histórico: religa os fragmentos que viraram "cabeçalho" por quebra
  // de linha do PDF e para na primeira seção de sistema.
  const narrative: string[] = [];
  const NARRATIVE_MAX = 5000;
  outer: for (let i = 0; i < paragraphs.length; i++) {
    if (!NARRATIVE_HEADER_FORM.test(paragraphs[i])) continue;
    for (let j = i + 1; j < paragraphs.length; j++) {
      const raw = paragraphs[j];
      const text = stripHeader(raw);
      if (NARRATIVE_TERMINATOR.test(text)) break outer;
      const isFragment = raw.startsWith("## ");
      if (isFragment && !/[.!?]$/.test(text) && text.length < 60) break outer;
      if (isFragment && narrative.length) {
        // "## POSTE DE ILUMINAÇÃO." é continuação da frase anterior.
        narrative[narrative.length - 1] += ` ${text}`;
      } else {
        narrative.push(text);
      }
      if (narrative.join(" ").length > NARRATIVE_MAX) break outer;
    }
    break;
  }

  // 5) Remove do histórico os nomes colhidos (tolerante a acento) — nomes
  // maiores primeiro, pra "JOSE PAULO JUVENCIO" ganhar de "JOSE PAULO".
  let narrativeText = narrative.join("\n");
  harvestedNames.sort((a, b) => b.length - a.length);
  for (const words of harvestedNames) {
    narrativeText = narrativeText.replace(
      accentInsensitivePattern(words),
      "[nome removido]",
    );
  }
  narrativeText = narrativeText.replace(
    /\[nome removido\](\s+\[nome removido\])+/g,
    "[nome removido]",
  );

  const summaryOrder: { key: string; display: string }[] = [
    { key: "natureza", display: "Natureza da ocorrência" },
    ...NEWS_FIELDS.map(({ key, display }) => ({ key, display })),
    { key: "envolvimentos", display: "Tipos de envolvimento registrados" },
    { key: "lesoes", display: "Graus de lesão registrados entre os envolvidos" },
  ];

  const parts: string[] = [];
  const seen = new Set<string>();
  for (const { key, display } of summaryOrder) {
    if (seen.has(key)) continue;
    seen.add(key);
    const values = collected.get(key);
    if (values?.length) parts.push(`${display}: ${values.join("; ")}`);
  }
  if (narrative.length) {
    parts.push(`\nHistórico registrado no BO:\n${narrativeText}`);
  }

  return {
    text: parts.join("\n"),
    discardedParagraphs: paragraphs.length - narrative.length,
    foundNarrative: narrative.length > 0,
  };
}
