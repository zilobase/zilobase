import type { Mailer, OutboundEmailMessage } from "@zilobase/runtime-ports";

export type WorkerEmailBinding = { send(message: unknown): Promise<unknown> };

export function createWorkerMailer(input: {
  binding?: WorkerEmailBinding;
  developmentSinkUrl?: string;
}): Mailer {
  return {
    async send(message) {
      if (input.developmentSinkUrl?.trim()) {
        await sendDevelopmentEmail(input.developmentSinkUrl.trim(), message);
        return;
      }
      if (!input.binding) throw new Error("EMAIL binding is required");
      await input.binding.send({ ...message, from: parseEmailAddress(message.from) });
    },
  };
}

function parseEmailAddress(value: string) {
  const displayAddress = /^(.*?)\s*<([^<>]+)>$/.exec(value.trim());
  return displayAddress
    ? { email: displayAddress[2]!.trim(), name: displayAddress[1]!.trim() }
    : { email: value.trim(), name: "" };
}

async function sendDevelopmentEmail(sinkUrl: string, message: OutboundEmailMessage) {
  const url = new URL(sinkUrl);
  if (url.protocol !== "http:" || !new Set(["127.0.0.1", "localhost", "[::1]"]).has(url.hostname)) {
    throw new Error("Development email sink must use loopback HTTP");
  }
  const address = (value: string) => {
    const parsed = parseEmailAddress(value);
    return { Email: parsed.email, ...(parsed.name ? { Name: parsed.name } : {}) };
  };
  const response = await fetch(url, {
    body: JSON.stringify({ From: address(message.from), HTML: message.html, Subject: message.subject, Tags: ["Cloudflare"], Text: message.text, To: [address(message.to)] }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw new Error(`Development email sink rejected message (${response.status})`);
}
