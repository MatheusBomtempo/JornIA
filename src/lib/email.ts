import "server-only";
import { Resend } from "resend";
import { env } from "./env";

let client: Resend | null = null;

function getClient(): Resend {
  if (!client) {
    if (!env.email.resendApiKey) {
      throw new Error(
        "RESEND_API_KEY não configurado — veja .env.example.",
      );
    }
    client = new Resend(env.email.resendApiKey);
  }
  return client;
}

// Endereço oficial de teste da Resend: sempre "entrega" com sucesso na API,
// sem cair numa caixa de entrada real. Fora de produção, mandamos pra ele em
// vez do e-mail real do usuário — testa o fluxo inteiro sem precisar de
// domínio verificado nem do e-mail pessoal de quem está desenvolvendo.
const RESEND_TEST_ADDRESS = "delivered@resend.dev";

/**
 * E-mail com o login (e-mail + senha nova) de um usuário, disparado por um
 * admin/manager ao resetar a senha (ver /api/users/:id/reset-password).
 * A senha só existe em texto puro aqui, de passagem — nunca é salva.
 * Devolve o endereço que realmente recebeu (útil pra UI avisar quando foi
 * redirecionado pro endereço de teste, em dev).
 */
export async function sendCredentialsEmail(params: {
  to: string;
  name: string;
  password: string;
}): Promise<{ deliveredTo: string }> {
  const deliveredTo = env.isProd ? params.to : RESEND_TEST_ADDRESS;
  if (deliveredTo !== params.to) {
    console.log(
      `[JornIA] Fora de produção: e-mail de login redirecionado de ${params.to} para ${deliveredTo}.`,
    );
  }
  const loginUrl = `${env.storage.publicBaseUrl.replace(/\/$/, "")}/login`;

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">JornIA</h2>
      <p>Olá, ${escapeHtml(params.name)}.</p>
      <p>Seu acesso ao JornIA foi (re)definido. Use os dados abaixo para entrar:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px 0; color: #666;">E-mail</td>
          <td style="padding: 8px 0; font-weight: 600;">${escapeHtml(params.to)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Senha</td>
          <td style="padding: 8px 0; font-weight: 600; font-family: monospace;">${escapeHtml(params.password)}</td>
        </tr>
      </table>
      <p>
        <a href="${loginUrl}" style="display: inline-block; background: #4d7cff; color: #fff; padding: 10px 18px; border-radius: 10px; text-decoration: none; font-weight: 600;">
          Entrar no JornIA
        </a>
      </p>
      <p style="color: #888; font-size: 13px; margin-top: 24px;">
        Se você não esperava este e-mail, avise quem administra o JornIA na sua redação.
      </p>
    </div>
  `;

  // O SDK da Resend NÃO lança exceção em erro da API — devolve
  // { data, error }. Sem checar `error` aqui, uma falha (ex.: destinatário
  // bloqueado pelo modo sandbox) passa como sucesso silencioso.
  const { error } = await getClient().emails.send({
    from: env.email.from,
    to: deliveredTo,
    subject: "Seu acesso ao JornIA",
    html,
  });
  if (error) {
    throw new Error(`${error.name}: ${error.message}`);
  }
  return { deliveredTo };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
