import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../../config/env.config.js";
import { ServiceUnavailableError } from "../errors/AppError.js";

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);

const configured = Boolean(env.GMAIL_USER && env.GMAIL_APP_PASSWORD);
const fromAddress = env.GMAIL_USER ? `Cira PM <${env.GMAIL_USER}>` : "";
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!configured || !env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
    throw new ServiceUnavailableError("Email belum dikonfigurasi. Lengkapi GMAIL_USER dan GMAIL_APP_PASSWORD pada backend environment.");
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transporter;
}

function layout(preheader: string, content: string): string {
  return `<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Cira PM</title></head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#172033;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5f8;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #e7e9ef;border-radius:16px;overflow:hidden">
<tr><td style="padding:26px 36px;background:#172554;color:#fff"><div style="font-size:20px;font-weight:700;letter-spacing:.2px">Cira <span style="color:#f5b544">PM</span></div><div style="margin-top:5px;font-size:12px;color:#dbe3f6">Project Management Workspace</div></td></tr>
<tr><td style="padding:36px 36px 28px">${content}</td></tr>
<tr><td style="padding:20px 36px;border-top:1px solid #edf0f5;color:#68738a;font-size:12px;line-height:1.6">Email ini dikirim otomatis oleh Cira PM. Mohon jangan membalas email ini.<br>Jika Anda tidak mengenali aktivitas ini, Anda dapat mengabaikan email ini.</td></tr>
</table><div style="max-width:600px;padding:18px 8px;color:#8a93a5;font-size:11px;text-align:center">© Cira PM</div>
</td></tr></table></body></html>`;
}

function actionButton(label: string, link: string): string {
  const safeLink = escapeHtml(link);
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0 20px"><tr><td bgcolor="#263b80" style="border-radius:8px"><a href="${safeLink}" style="display:inline-block;padding:13px 22px;color:#fff;text-decoration:none;font-size:14px;font-weight:700;border-radius:8px">${escapeHtml(label)}</a></td></tr></table>
<p style="margin:0 0 8px;color:#68738a;font-size:13px;line-height:1.6">Jika tombol tidak berfungsi, salin dan buka tautan ini:</p><p style="margin:0;word-break:break-all;font-size:12px;line-height:1.6"><a href="${safeLink}" style="color:#263b80">${safeLink}</a></p>`;
}

export const emailService = {
  async send(to: string, subject: string, html: string, text: string): Promise<void> {
    try {
      await getTransporter().sendMail({
        from: fromAddress,
        to,
        subject,
        html,
        text,
        headers: { "X-Entity-Ref-ID": `${Date.now()}-${Math.random().toString(36).slice(2)}` },
      });
    } catch (error) {
      // Do not log credentials, message content, or recipient addresses.
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "SMTP_SEND_FAILED";
      console.error("SMTP email delivery failed", { code });
      throw new ServiceUnavailableError("Email tidak dapat dikirim. Periksa konfigurasi SMTP dan coba kembali.");
    }
  },

  invitationHtml(name: string, link: string, role: string, expiresAt: string): string {
    const greeting = name ? `Halo ${escapeHtml(name)},` : "Halo, Anda menerima undangan untuk bergabung.";
    const roleLabel = role === "operasional" ? "Operasional" : role === "developer" ? "Developer" : escapeHtml(role);
    const content = `<p style="margin:0 0 12px;color:#172033;font-size:16px;line-height:1.6">${greeting}</p>
<h1 style="margin:0 0 12px;color:#172033;font-size:24px;line-height:1.3">Anda diundang ke Cira PM</h1>
<p style="margin:0;color:#536078;font-size:14px;line-height:1.7">Owner mengundang Anda bergabung sebagai <strong>${roleLabel}</strong>. Aktifkan akun untuk mulai berkolaborasi di workspace Cira PM.</p>
${actionButton("Terima undangan", link)}
<div style="margin-top:22px;padding:14px 16px;background:#f7f8fb;border-radius:8px;color:#536078;font-size:12px;line-height:1.6"><strong style="color:#34415a">Berlaku sampai</strong><br>${escapeHtml(expiresAt)} WIB<br>Tautan ini hanya dapat digunakan satu kali.</div>`;
    return layout("Undangan Anda untuk bergabung ke workspace Cira PM.", content);
  },

  invitationText(name: string, link: string, role: string, expiresAt: string): string {
    return `Halo${name ? ` ${name}` : ""},\n\nAnda diundang ke Cira PM sebagai ${role}. Terima undangan melalui tautan berikut:\n${link}\n\nTautan berlaku sampai ${expiresAt} WIB dan hanya dapat digunakan satu kali.\n\n© Cira PM`;
  },

  passwordResetHtml(link: string, expiresMinutes: number): string {
    const content = `<h1 style="margin:0 0 12px;color:#172033;font-size:24px;line-height:1.3">Atur ulang password</h1>
<p style="margin:0;color:#536078;font-size:14px;line-height:1.7">Kami menerima permintaan untuk mengatur ulang password akun Cira PM Anda. Gunakan tombol di bawah untuk membuat password baru.</p>
${actionButton("Buat password baru", link)}
<div style="margin-top:22px;padding:14px 16px;background:#fff8e8;border:1px solid #f6e4b8;border-radius:8px;color:#72551d;font-size:12px;line-height:1.6"><strong>Tautan berlaku ${expiresMinutes} menit</strong> dan hanya dapat digunakan satu kali. Demi keamanan, jangan bagikan tautan ini kepada siapa pun.</div>
<p style="margin:20px 0 0;color:#68738a;font-size:13px;line-height:1.6">Jika Anda tidak meminta reset password, abaikan email ini. Password Anda tidak akan berubah.</p>`;
    return layout("Tautan aman untuk mengatur ulang password Cira PM.", content);
  },

  passwordResetText(link: string, expiresMinutes: number): string {
    return `Kami menerima permintaan reset password Cira PM.\n\nBuka tautan ini untuk membuat password baru:\n${link}\n\nTautan berlaku ${expiresMinutes} menit dan hanya dapat digunakan satu kali. Jika Anda tidak meminta reset, abaikan email ini; password Anda tidak berubah.\n\n© Cira PM`;
  },
};
