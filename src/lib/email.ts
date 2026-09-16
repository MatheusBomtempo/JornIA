import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    if (!env.email.gmailUser || !env.email.gmailAppPassword) {
      throw new Error(
        "GMAIL_USER/GMAIL_APP_PASSWORD não configurados — veja .env.example.",
      );
    }
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: env.email.gmailUser, pass: env.email.gmailAppPassword },
    });
  }
  return transporter;
}

/**
 * E-mail com o login (e-mail + senha nova) de um usuário, disparado por um
 * admin/manager ao criar conta ou resetar senha (ver /api/users routes).
 * A senha só existe em texto puro aqui, de passagem — nunca é salva.
 *
 * Via Gmail SMTP: diferente do Resend em modo sandbox, não existe endereço
 * de teste "seguro" — todo envio é real, pra qualquer destinatário, mesmo
 * em dev. Testando local com e-mail de verdade, a pessoa recebe de verdade.
 */
export async function sendCredentialsEmail(params: {
  to: string;
  name: string;
  password: string;
}): Promise<{ deliveredTo: string }> {
  const loginUrl = `${env.storage.publicBaseUrl.replace(/\/$/, "")}/login`;

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">JornAI</h2>
      <p>Olá, ${escapeHtml(params.name)}.</p>
      <p>Seu acesso ao JornAI foi (re)definido. Use os dados abaixo para entrar:</p>
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
          Entrar no JornAI
        </a>
      </p>
      <p style="color: #666; font-size: 13px;">
        Essa senha é temporária. Depois de entrar, o app sugere cadastrar uma senha sua.
      </p>
      <p style="color: #888; font-size: 13px; margin-top: 24px;">
        Se você não esperava este e-mail, avise quem administra o JornAI na sua redação.
      </p>
    </div>
  `;

  await getTransporter().sendMail({
    from: `"JornAI" <${env.email.gmailUser}>`,
    to: params.to,
    subject: "Seu acesso ao JornAI",
    html,
  });

  return { deliveredTo: params.to };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
