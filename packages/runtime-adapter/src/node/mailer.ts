import nodemailer from "nodemailer";
import type { Mailer, OutboundEmailMessage, RuntimeEnv } from "@zilobase/runtime-ports";

export function createNodeMailer(env: RuntimeEnv): Mailer {
  const host = read(env, "SMTP_HOST")?.trim();
  if (!host) {
    return { send: sendConsoleEmail };
  }
  const configuredPort = read(env, "SMTP_PORT");
  const port = configuredPort ? Number(configuredPort) : 587;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535");
  }
  const user = read(env, "SMTP_USER")?.trim();
  const password = read(env, "SMTP_PASSWORD");
  if (Boolean(user) !== Boolean(password)) {
    throw new Error("SMTP_USER and SMTP_PASSWORD must be configured together");
  }
  const secureSetting = read(env, "SMTP_SECURE")?.trim().toLowerCase();
  if (secureSetting && secureSetting !== "true" && secureSetting !== "false") {
    throw new Error("SMTP_SECURE must be either true or false");
  }
  const transport = nodemailer.createTransport({
    auth: user && password ? { pass: password, user } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    host,
    port,
    secure: secureSetting ? secureSetting === "true" : port === 465,
    socketTimeout: 300_000,
  });
  return {
    async send(message) {
      await transport.sendMail(message);
    },
  };
}

function read(env: RuntimeEnv, key: string) {
  const value = env[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function sendConsoleEmail({ to, subject, text }: OutboundEmailMessage) {
  console.info(JSON.stringify({ event: "mail.local", subject, text, to }));
}
