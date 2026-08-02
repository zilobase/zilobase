import assert from "node:assert/strict";
import { test, vi } from "vitest";

import { sendEmail } from "./email";
import { setRuntimeAdapter, type OutboundEmailMessage } from "./runtime-adapter";

const message = {
  subject: "Welcome",
  text: "Thanks for signing up.",
  to: "user@example.com",
};

test("prints email locally when SMTP is not configured", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

  try {
    await sendEmail({}, message);

    assert.equal(info.mock.calls.length, 5);
    assert.equal(info.mock.calls[1]?.[0], "To: user@example.com");
  } finally {
    info.mockRestore();
  }
});

test("validates SMTP configuration before connecting", async () => {
  await assert.rejects(
    sendEmail({ SMTP_HOST: "smtp.example.com", SMTP_PORT: "invalid" }, message),
    /SMTP_PORT must be an integer/,
  );
  await assert.rejects(
    sendEmail({ SMTP_HOST: "smtp.example.com", SMTP_USER: "user" }, message),
    /SMTP_USER and SMTP_PASSWORD must be configured together/,
  );
  await assert.rejects(
    sendEmail({ SMTP_HOST: "smtp.example.com", SMTP_SECURE: "maybe" }, message),
    /SMTP_SECURE must be either true or false/,
  );
});

test("delegates email delivery to the runtime adapter when configured", async () => {
  let delivered: OutboundEmailMessage | undefined;

  setRuntimeAdapter({
    async sendEmail({ message: outbound }) {
      delivered = outbound;
    },
    selfHosted: false,
  });

  try {
    await sendEmail({ EMAIL_FROM: "Zilobase <hello@zilobase.com>" }, message);
  } finally {
    setRuntimeAdapter({});
  }

  assert.deepEqual(delivered, {
    from: "Zilobase <hello@zilobase.com>",
    html: "<p>Thanks for signing up.</p>",
    subject: "Welcome",
    text: "Thanks for signing up.",
    to: "user@example.com",
  });
});
