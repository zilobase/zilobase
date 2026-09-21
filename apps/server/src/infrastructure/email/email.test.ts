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
import { runWithRuntimePorts, type OutboundEmailMessage } from "../runtime/runtime-adapter";
import { createNodeMailer } from "@zilobase/runtime-adapter/node";

const message = {
  subject: "Welcome",
  text: "Thanks for signing up.",
  to: "user@example.com",
};

mail.createTransport.mockReturnValue({ sendMail: mail.sendMail });

test("node mailer reports email locally when SMTP is not configured", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

  try {
    await createNodeMailer({}).send({ ...message, from: "Zilobase", html: "<p>Thanks</p>" });

    assert.equal(info.mock.calls.length, 1);
    assert.match(String(info.mock.calls[0]?.[0]), /mail\.local/);
  } finally {
    info.mockRestore();
  }
});

test("validates SMTP configuration before connecting", async () => {
  await assert.rejects(
    Promise.resolve().then(() => createNodeMailer({ SMTP_HOST: "smtp.example.com", SMTP_PORT: "invalid" })),
    /SMTP_PORT must be an integer/,
  );
  await assert.rejects(
    Promise.resolve().then(() => createNodeMailer({ SMTP_HOST: "smtp.example.com", SMTP_USER: "user" })),
    /SMTP_USER and SMTP_PASSWORD must be configured together/,
  );
  await assert.rejects(
    Promise.resolve().then(() => createNodeMailer({ SMTP_HOST: "smtp.example.com", SMTP_SECURE: "maybe" })),
    /SMTP_SECURE must be either true or false/,
  );
});

test("delegates email delivery to the runtime mailer port", async () => {
  let delivered: OutboundEmailMessage | undefined;

  await runWithRuntimePorts({
    mailer: { async send(outbound) {
      delivered = outbound;
    } },
  }, async () => {
    await sendEmail({ EMAIL_FROM: "Zilobase <hello@zilobase.com>" }, message);
  });

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

  await createNodeMailer(
    {
      SMTP_HOST: " smtp.example.com ",
      SMTP_PASSWORD: "password",
      SMTP_PORT: "465",
      SMTP_SECURE: "false",
      SMTP_USER: " user ",
    },
    ).send({
      ...message,
      from: "Zilobase",
      html: "<p>&lt;&amp;&gt;&quot;&#039;<br>next</p>",
      ...message,
      text: "<&>\"'\nnext",
    });

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

  await createNodeMailer({ SMTP_HOST: "smtp.example.com", SMTP_SECURE: "true" })
    .send({ ...message, from: "Zilobase", html: "<p>Thanks</p>" });
  assert.equal(mail.createTransport.mock.calls[1]?.[0].secure, true);
  assert.equal(mail.createTransport.mock.calls[1]?.[0].auth, undefined);

  await createNodeMailer({ SMTP_HOST: "smtp.example.com", SMTP_PORT: "465" })
    .send({ ...message, from: "Zilobase", html: "<p>Thanks</p>" });
  assert.equal(mail.createTransport.mock.calls[2]?.[0].secure, true);
});

test("SMTP ports reject out-of-range integers", async () => {
  for (const port of ["0", "65536", "1.5"]) {
    await assert.rejects(
      Promise.resolve().then(() => createNodeMailer({ SMTP_HOST: "smtp.example.com", SMTP_PORT: port })),
      /SMTP_PORT must be an integer between 1 and 65535/,
    );
  }
});
