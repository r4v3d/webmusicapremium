import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent = [];
const created = [];
let brevoFails = false;

vi.mock("nodemailer", () => ({
  default: {
    createTransport: (options) => {
      created.push(options);
      return {
        sendMail: async (mail) => {
          if (options.host === "smtp-relay.brevo.com" && brevoFails) throw Object.assign(new Error("daily limit reached"), { code: "EENVELOPE" });
          sent.push({ host: options.host, ...mail });
          return { messageId: "x" };
        },
      };
    },
  },
}));

const { deliverMail, mailConfigured, sendOTPEmail } = await import("./email");

beforeEach(() => {
  sent.length = 0;
  brevoFails = false;
  for (const k of ["BREVO_SMTP_LOGIN", "BREVO_SMTP_KEY", "EMAIL_FROM", "EMAIL_REPLY_TO", "EMAIL_USER", "EMAIL_PASS"]) vi.stubEnv(k, "");
});
afterEach(() => vi.unstubAllEnvs());

const brevo = () => {
  vi.stubEnv("BREVO_SMTP_LOGIN", "abc@smtp-brevo.com");
  vi.stubEnv("BREVO_SMTP_KEY", "xsmtpsib-clave");
  vi.stubEnv("EMAIL_FROM", "pedidos@cheapmusic.best");
};
const gmail = () => {
  vi.stubEnv("EMAIL_USER", "tienda@gmail.com");
  vi.stubEnv("EMAIL_PASS", "app-pass");
};

describe("correo", () => {
  it("sin proveedor no envía nada", async () => {
    expect(mailConfigured()).toBe(false);
    expect(await deliverMail({ to: "a@example.com", subject: "s", html: "h" })).toMatchObject({ sent: false, skipped: true });
  });

  it("usa Brevo con el remitente de tu dominio y respuestas al Gmail", async () => {
    brevo(); gmail();
    vi.stubEnv("EMAIL_REPLY_TO", "tienda@gmail.com");
    const r = await deliverMail({ to: "a@example.com", subject: "s", html: "h" });
    expect(r).toMatchObject({ sent: true, provider: "brevo" });
    expect(sent[0]).toMatchObject({ host: "smtp-relay.brevo.com", from: '"Música Premium Barato" <pedidos@cheapmusic.best>', replyTo: "tienda@gmail.com" });
  });

  it("si Brevo falla (p. ej. límite diario), lo envía Gmail", async () => {
    brevo(); gmail();
    brevoFails = true;
    const r = await deliverMail({ to: "a@example.com", subject: "s", html: "h" });
    expect(r).toMatchObject({ sent: true, provider: "gmail" });
    expect(sent[0]).toMatchObject({ host: "smtp.gmail.com", from: '"Música Premium Barato" <tienda@gmail.com>' });
  });

  it("reutiliza la conexión (pool) y limita la velocidad de envío", async () => {
    brevo();
    const before = created.length;
    await Promise.all(Array.from({ length: 20 }, (_, i) => deliverMail({ to: `c${i}@example.com`, subject: "s", html: "h" })));
    expect(sent).toHaveLength(20);
    expect(created.length - before).toBeLessThanOrEqual(1);
    const opts = created.find((o) => o.host === "smtp-relay.brevo.com");
    expect(opts).toMatchObject({ pool: true, port: 587, requireTLS: true, rateLimit: 10 });
  });

  it("el código de acceso también sale por el proveedor configurado", async () => {
    brevo();
    expect(await sendOTPEmail("a@example.com", "123456")).toEqual({ success: true });
    expect(sent[0].subject).toBe("Código de verificación");
  });
});
