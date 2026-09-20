import type { OutboundEmailMessage } from "@zilobase/runtime-ports";

import { getStringEnv, type RuntimeEnv } from "../../shared/config/config";
import { getRuntimePorts } from "@zilobase/runtime-adapter/capabilities";

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

const DEFAULT_EMAIL_FROM = "Zilobase <hello@zilobase.com>";

export async function sendEmail(env: RuntimeEnv, email: EmailMessage) {
  const message: OutboundEmailMessage = {
    from: getStringEnv(env, "EMAIL_FROM") ?? DEFAULT_EMAIL_FROM,
    html: textToHtml(email.text),
    subject: email.subject,
    text: email.text,
    to: email.to,
  };
  const mailer = getRuntimePorts().mailer;
  if (!mailer) throw new Error("Runtime Mailer port is required");
  await mailer.send(message);
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
