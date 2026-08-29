import nodemailer from "nodemailer";
import { getStringEnv, type RuntimeEnv } from "../../shared/config/config";
import {
  getRuntimeAdapter,
  type OutboundEmailMessage,
} from "../runtime/runtime-adapter";

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

const DEFAULT_EMAIL_FROM = "Zilobase <hello@zilobase.com>";
const DEFAULT_SMTP_PORT = 587;

export async function sendEmail(env: RuntimeEnv, email: EmailMessage) {
  const message: OutboundEmailMessage = {
    from: getStringEnv(env, "EMAIL_FROM") ?? DEFAULT_EMAIL_FROM,
    html: textToHtml(email.text),
    subject: email.subject,
    text: email.text,
    to: email.to,
  };
  const runtimeSendEmail = getRuntimeAdapter().sendEmail;

  if (runtimeSendEmail) {
    await runtimeSendEmail({ env, message });
    return;
  }

  const host = getStringEnv(env, "SMTP_HOST")?.trim();

  if (!host) {
    await sendConsoleEmail(message);
    return;
  }

  const port = getSmtpPort(env);
  const user = getStringEnv(env, "SMTP_USER")?.trim();
  const password = getStringEnv(env, "SMTP_PASSWORD");

  if (Boolean(user) !== Boolean(password)) {
    throw new Error("SMTP_USER and SMTP_PASSWORD must be configured together");
  }

  const transport = nodemailer.createTransport({
    auth: user && password ? { pass: password, user } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    host,
    port,
    secure: getSmtpSecure(env, port),
    socketTimeout: 300_000,
  });

  await transport.sendMail(message);
}

function getSmtpPort(env: RuntimeEnv) {
  const configured = getStringEnv(env, "SMTP_PORT");
  const port = configured ? Number(configured) : DEFAULT_SMTP_PORT;

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535");
  }

  return port;
}

function getSmtpSecure(env: RuntimeEnv, port: number) {
  const configured = getStringEnv(env, "SMTP_SECURE")?.trim().toLowerCase();

  if (!configured) return port === 465;
  if (configured === "true") return true;
  if (configured === "false") return false;

  throw new Error("SMTP_SECURE must be either true or false");
}

function textToHtml(value: string) {
  const escaped = value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  return `<p>${escaped.replaceAll("\n", "<br>")}</p>`;
}

async function sendConsoleEmail({ to, subject, text }: OutboundEmailMessage) {
  console.info("\n--- Zilobase local email ---");
  console.info(`To: ${to}`);
  console.info(`Subject: ${subject}`);
  console.info(text);
  console.info("--- end email ---\n");
}
