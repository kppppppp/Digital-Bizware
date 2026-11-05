import { afterEach, describe, expect, it, vi } from "vitest";
import { sendAdminOrder, sendPasswordReset, sendPurchaseConfirmation, sendTransactional, sendVerification, sendWelcome } from "./services/email.js";

afterEach(() => { vi.unstubAllGlobals(); delete process.env.BREVO_API_KEY; delete process.env.BREVO_SENDER_EMAIL; delete process.env.BREVO_SENDER_NAME; });

describe("Brevo transactional email service", () => {
  it("uses the Brevo transactional email endpoint with server-only credentials", async () => {
    process.env.BREVO_API_KEY = "secret-test-key"; process.env.BREVO_SENDER_EMAIL = "mail@classes.example"; process.env.BREVO_SENDER_NAME = "Classes";
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 201 }); vi.stubGlobal("fetch", fetch);
    await sendTransactional({ email: "student@example.com", name: "Student" }, "Subject", "<p>Hello</p>", "Hello");
    expect(fetch).toHaveBeenCalledWith("https://api.brevo.com/v3/smtp/email", expect.objectContaining({
      method: "POST", headers: expect.objectContaining({ "api-key": "secret-test-key", "content-type": "application/json" }),
    }));
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.sender).toEqual({ email: "mail@classes.example", name: "Classes" }); expect(body.to[0].email).toBe("student@example.com");
  });
  it("renders a welcome message and email verification link", async () => {
    process.env.BREVO_API_KEY = "key"; process.env.BREVO_SENDER_EMAIL = "mail@classes.example";
    const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetch);
    await sendWelcome({ email: "student@example.com", name: "Asha" }, "https://classes.example/login");
    await sendVerification({ email: "student@example.com", name: "Asha" }, "https://classes.example/verify?token=one-time");
    const messages = fetch.mock.calls.map(call => JSON.parse(call[1].body));
    expect(messages[0].htmlContent).toContain("Welcome to Classes"); expect(messages[0].htmlContent).toContain("https://classes.example/login");
    expect(messages[1].htmlContent).toContain("https://classes.example/verify?token=one-time");
  });
  it("renders password reset without accepting or sending a password", async () => {
    process.env.BREVO_API_KEY = "key"; process.env.BREVO_SENDER_EMAIL = "mail@classes.example";
    const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetch);
    await sendPasswordReset({ email: "student@example.com" }, "https://classes.example/reset-password?token=single-use");
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.htmlContent).toContain("single-use"); expect(body.htmlContent).toContain("expires in one hour"); expect(body.htmlContent).not.toContain("password123");
  });
  it("includes purchase details and admin order information", async () => {
    process.env.BREVO_API_KEY = "key"; process.env.BREVO_SENDER_EMAIL = "mail@classes.example";
    const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetch);
    const details = { name: "Asha", email: "student@example.com", titles: "Excel Guide", amount: 599, orderRef: "order_1", date: "02/11/2026", libraryUrl: "https://classes.example/student" };
    await sendPurchaseConfirmation({ email: details.email, name: details.name }, details); await sendAdminOrder({ email: "admin@example.com" }, details);
    const bodies = fetch.mock.calls.map(call => JSON.parse(call[1].body));
    expect(bodies[0].htmlContent).toContain("Excel Guide"); expect(bodies[0].htmlContent).toContain("order_1"); expect(bodies[0].htmlContent).toContain("599");
    expect(bodies[1].to[0].email).toBe("admin@example.com"); expect(bodies[1].htmlContent).toContain("student@example.com");
  });
  it("reports provider failures without exposing response bodies", async () => {
    process.env.BREVO_API_KEY = "key"; process.env.BREVO_SENDER_EMAIL = "mail@classes.example";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "sensitive provider response" }));
    await expect(sendTransactional({ email: "student@example.com" }, "Subject", "html", "text")).rejects.toThrow("HTTP 429");
    await expect(sendTransactional({ email: "student@example.com" }, "Subject", "html", "text")).rejects.not.toThrow("sensitive provider response");
  });
});
