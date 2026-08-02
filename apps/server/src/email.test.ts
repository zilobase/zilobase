import assert from "node:assert/strict";
import { test, vi } from "vitest";

const mail = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: mail.createTransport },
}));

import { sendEmail } from "./email";
import { setRuntimeAdapter, type OutboundEmailMessage } from "./runtime-adapter";

const message = {
  subject: "Welcome",
  text: "Thanks for signing up.",
  to: "user@example.com",
};

mail.createTransport.mockReturnValue({ sendMail: mail.sendMail });

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

test("SMTP delivery applies authentication, TLS, ports, and HTML escaping", async () => {
  mail.createTransport.mockClear();
  mail.sendMail.mockClear();

  await sendEmail(
    {
      SMTP_HOST: " smtp.example.com ",
      SMTP_PASSWORD: "password",
      SMTP_PORT: "465",
      SMTP_SECURE: "false",
      SMTP_USER: " user ",
    },
    {
      ...message,
      text: "<&>\"'\nnext",
    },
  );

  assert.deepEqual(mail.createTransport.mock.calls[0]?.[0], {
    auth: { pass: "password", user: "user" },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    host: "smtp.example.com",
    port: 465,
    secure: false,
    socketTimeout: 300_000,
  });
  assert.equal(
    mail.sendMail.mock.calls[0]?.[0].html,
    "<p>&lt;&amp;&gt;&quot;&#039;<br>next</p>",
  );

  await sendEmail(
    { SMTP_HOST: "smtp.example.com", SMTP_SECURE: "true" },
    message,
  );
  assert.equal(mail.createTransport.mock.calls[1]?.[0].secure, true);
  assert.equal(mail.createTransport.mock.calls[1]?.[0].auth, undefined);

  await sendEmail({ SMTP_HOST: "smtp.example.com", SMTP_PORT: "465" }, message);
  assert.equal(mail.createTransport.mock.calls[2]?.[0].secure, true);
});

test("SMTP ports reject out-of-range integers", async () => {
  for (const port of ["0", "65536", "1.5"]) {
    await assert.rejects(
      sendEmail({ SMTP_HOST: "smtp.example.com", SMTP_PORT: port }, message),
      /SMTP_PORT must be an integer between 1 and 65535/,
    );
  }
});
