export const captureForm = {
  pt: {
    errors: {
      docTooLarge: "O documento passa de {max} MB.",
      photoWrongStep: "A foto entra no próximo passo, depois de gerar o texto.",
      unrecognizedFile: "Arquivo não reconhecido. Envie um PDF, .txt ou .md.",
    },
    busy: {
      readingLink: "Lendo o link e gerando o texto…",
      generatingText: "Gerando o texto com IA…",
    },
    dragOverlay: {
      title: "Solte o PDF aqui",
      subtitle: "A foto entra no próximo passo",
    },
    draftRestored: {
      message: "📝 Rascunho recuperado — o que você tinha preenchido continua aqui.",
      discard: "Descartar",
    },
    content: {
      heading: "O que você apurou",
      hint: "Cole o texto, o link da matéria ou anexe um PDF (boletim de ocorrência, nota oficial). A IA lê tudo e entende o contexto.",
      badgeLink: "🔗 Link",
      badgeText: "📝 Texto",
      textareaPlaceholder: "Cole aqui o texto que você apurou…\n\nou apenas o link: https://…",
      linkHint: "Vamos abrir o link e extrair o conteúdo automaticamente.",
    },
    doc: {
      extracted: "texto extraído ✓",
      pageCountOne: "página",
      pageCountOther: "páginas",
      charsLabel: "caracteres",
      truncated: "cortado no limite",
      remove: "Remover",
      readingDocument: "Lendo o documento…",
      attachButton: "📎 Anexar documento (PDF) ou arraste aqui",
      hint: "PDF com texto selecionável, até {max} MB. Documento escaneado (foto do papel) não funciona.",
    },
    credits: {
      heading: "Créditos e marcações",
      optional: "— opcional",
      hint: "Quer marcar alguém? Diga o que a pessoa fez e informe o @. Entra no fim da legenda, antes das hashtags — ex.:",
      example: "📸 @fotografo",
    },
    submit: {
      cta: "Gerar texto com IA →",
      slowHint: "A IA gratuita às vezes demora — ainda estamos tentando, não recarregue a página.",
      emptyHint: "Cole um texto, um link ou anexe um PDF para continuar",
      nextStepHint: "Depois você adiciona a foto e revisa antes de publicar.",
    },
  },
  en: {
    errors: {
      docTooLarge: "The document is over {max} MB.",
      photoWrongStep: "The photo goes in the next step, after generating the text.",
      unrecognizedFile: "File not recognized. Upload a PDF, .txt, or .md.",
    },
    busy: {
      readingLink: "Reading the link and generating the text…",
      generatingText: "Generating the text with AI…",
    },
    dragOverlay: {
      title: "Drop the PDF here",
      subtitle: "The photo goes in the next step",
    },
    draftRestored: {
      message: "📝 Draft recovered — what you had filled in is still here.",
      discard: "Discard",
    },
    content: {
      heading: "What you've gathered",
      hint: "Paste the text, the article link, or attach a PDF (police report, official statement). The AI reads it all and understands the context.",
      badgeLink: "🔗 Link",
      badgeText: "📝 Text",
      textareaPlaceholder: "Paste here the text you've gathered…\n\nor just the link: https://…",
      linkHint: "We'll open the link and extract the content automatically.",
    },
    doc: {
      extracted: "text extracted ✓",
      pageCountOne: "page",
      pageCountOther: "pages",
      charsLabel: "characters",
      truncated: "truncated at the limit",
      remove: "Remove",
      readingDocument: "Reading the document…",
      attachButton: "📎 Attach document (PDF) or drag it here",
      hint: "PDF with selectable text, up to {max} MB. Scanned documents (a photo of paper) don't work.",
    },
    credits: {
      heading: "Credits and mentions",
      optional: "— optional",
      hint: "Want to tag someone? Say what they did and give their @. It goes at the end of the caption, before the hashtags — e.g.:",
      example: "📸 @photographer",
    },
    submit: {
      cta: "Generate text with AI →",
      slowHint: "The free AI sometimes takes a while — still trying, don't reload the page.",
      emptyHint: "Paste a text, a link, or attach a PDF to continue",
      nextStepHint: "Afterwards you'll add the photo and review before publishing.",
    },
  },
};
