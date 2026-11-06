import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import mongoose from "mongoose";

const mocks = vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = "test-razorpay-secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";
  return {
    putPdf: vi.fn(), deletePdf: vi.fn(), signPdfDownload: vi.fn(), streamLegacyObject: vi.fn(),
    uploadCover: vi.fn(), deleteCover: vi.fn(), r2Configured: vi.fn(() => true), cloudinaryConfigured: vi.fn(() => true),
    sendVerification: vi.fn(), sendWelcome: vi.fn(), sendPasswordReset: vi.fn(), sendPurchaseConfirmation: vi.fn(), sendAdminOrder: vi.fn(),
    razorOrdersCreate: vi.fn(), razorPaymentsFetch: vi.fn(), razorPaymentsCapture: vi.fn(),
  };
});

vi.mock("./services/storage.js", () => mocks);
vi.mock("./services/email.js", () => mocks);
vi.mock("razorpay", () => ({ default: class { orders = { create: mocks.razorOrdersCreate }; payments = { fetch: mocks.razorPaymentsFetch, capture: mocks.razorPaymentsCapture }; } }));

import { app, canDownload, isAllowedOrigin, processPayment, validWebhookSignature } from "./server.js";
import { AuditLog, Book, Order, Purchase, Session, User, WebhookEvent } from "./models.js";
import { deleteCover, deletePdf, putPdf, signPdfDownload, uploadCover } from "./services/storage.js";

const A = "65f000000000000000000001", B = "65f000000000000000000002", BOOK = "65f000000000000000000003", COOKIE = "classes_session=test-session";
function auth(role = "student", id = A, isActive = true) {
  vi.spyOn(Session, "findOne").mockResolvedValue({ _id: "session", userId: id } as any);
  vi.spyOn(User, "findById").mockReturnValue({ select: vi.fn().mockResolvedValue({ _id: id, name: "Test User", email: "student@example.com", phone: "1234567890", role, accountStatus: "active", isActive, emailVerified: true }) } as any);
}
function purchase(userId = A, entitlementStatus = "active", paymentStatus = "paid") { return { _id: "purchase", userId, entitlementStatus, orderId: { paymentStatus } }; }
function setPurchase(value: any) { vi.spyOn(Purchase, "findOne").mockReturnValue({ populate: vi.fn().mockResolvedValue(value) } as any); }
function paidOrder() { return { _id: "order", userId: A, razorpayOrderId: "order_123", totalAmount: 549, currency: "INR", paymentStatus: "pending", razorpayPaymentId: undefined as string | undefined, items: [{ bookId: BOOK, title: "Guide", amount: 549 }], save: vi.fn(async () => {}) }; }

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signPdfDownload.mockResolvedValue("https://private-r2.example/signed.pdf?sig=temporary");
  mocks.putPdf.mockResolvedValue(undefined);
  mocks.deletePdf.mockResolvedValue(undefined);
  mocks.uploadCover.mockResolvedValue({ url: "https://res.cloudinary.com/classes/image/upload/cover.webp", publicId: "classes/books/cover-1" });
  mocks.deleteCover.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("purchase download authorization", () => {
  it("rejects unauthenticated requests before signing a URL", async () => {
    const r = await request(app).get(`/api/books/${BOOK}/download`);
    expect(r.status).toBe(401); expect(r.body).not.toHaveProperty("url"); expect(signPdfDownload).not.toHaveBeenCalled();
  });
  it("denies a student without an entitlement and never signs a file URL", async () => {
    auth(); setPurchase(null);
    const r = await request(app).get(`/api/student/download/${BOOK}`).set("Cookie", COOKIE);
    expect(r.status).toBe(403); expect(signPdfDownload).not.toHaveBeenCalled();
  });
  it("does not let one student use another student's purchase", async () => {
    auth("student", A); setPurchase(purchase(B));
    const r = await request(app).get(`/api/books/${BOOK}/download`).set("Cookie", COOKIE);
    expect(r.status).toBe(403); expect(Purchase.findOne).toHaveBeenCalledWith(expect.objectContaining({ userId: A, bookId: BOOK }));
  });
  it("returns a short-lived signed URL only for a paid active purchase of a published book", async () => {
    auth(); setPurchase(purchase());
    vi.spyOn(Book, "findOne").mockResolvedValue({ _id: BOOK, slug: "sample-guide", pdfStorageKey: "ebooks/book/file.pdf", pdfOriginalFilename: "guide.pdf" } as any);
    const r = await request(app).get(`/api/books/${BOOK}/download`).set("Cookie", COOKIE);
    expect(r.status).toBe(200); expect(r.body.url).toContain("temporary"); expect(r.body.expiresIn).toBe(60);
    expect(signPdfDownload).toHaveBeenCalledWith("ebooks/book/file.pdf", "guide.pdf");
  });
  it("blocks revoked or refunded entitlements and inactive accounts", async () => {
    auth(); setPurchase(purchase(A, "revoked"));
    expect((await request(app).get(`/api/student/download/${BOOK}`).set("Cookie", COOKIE)).status).toBe(403);
    auth("student", A, false);
    expect((await request(app).get(`/api/student/download/${BOOK}`).set("Cookie", COOKIE)).status).toBe(401);
    expect(signPdfDownload).not.toHaveBeenCalled();
    expect(canDownload({ userId: A, purchaseUserId: A, entitlementStatus: "refunded", paymentStatus: "paid" })).toBe(false);
    expect(canDownload({ userId: A, purchaseUserId: A, entitlementStatus: "active", paymentStatus: "failed" })).toBe(false);
  });
  it("denies downloads for unpublished books even when an old purchase exists", async () => {
    auth(); setPurchase(purchase()); vi.spyOn(Book, "findOne").mockResolvedValue(null);
    const r = await request(app).get(`/api/books/${BOOK}/download`).set("Cookie", COOKIE);
    expect(r.status).toBe(404); expect(signPdfDownload).not.toHaveBeenCalled();
  });
  it("does not expose private R2 keys or Cloudinary management IDs publicly", async () => {
    vi.spyOn(Book, "findOne").mockResolvedValue({ _id: BOOK, slug: "sample-guide", title: "Sample", thumbnailUrl: "https://res.cloudinary.com/example/image/upload/cover.webp", cloudinaryPublicId: "classes/books/secret-id", pdfStorageKey: "ebooks/secret/file.pdf" } as any);
    const r = await request(app).get("/api/books/sample-guide");
    expect(r.status).toBe(200); expect(JSON.stringify(r.body)).not.toContain("ebooks/secret"); expect(r.body).not.toHaveProperty("cloudinaryPublicId");
  });
});

describe("Razorpay verification and webhooks", () => {
  it("rejects forged checkout callbacks before fetching payment or creating an entitlement", async () => {
    auth(); vi.spyOn(Order, "findOne").mockResolvedValue(paidOrder() as any); vi.spyOn(Purchase, "updateOne").mockResolvedValue({} as any);
    const r = await request(app).post("/api/payments/verify").set("Cookie", COOKIE).set("X-Classes-Request", "web").send({ razorpay_order_id: "order_123", razorpay_payment_id: "pay_123", razorpay_signature: "forged" });
    expect(r.status).toBe(400); expect(mocks.razorPaymentsFetch).not.toHaveBeenCalled(); expect(Purchase.updateOne).not.toHaveBeenCalled();
  });
  it("does not grant access when the provider reports an incorrect amount", async () => {
    auth(); const order = paidOrder(); vi.spyOn(Order, "findOne").mockResolvedValue(order as any); vi.spyOn(Purchase, "updateOne").mockResolvedValue({} as any);
    mocks.razorPaymentsFetch.mockResolvedValue({ id: "pay_123", order_id: "order_123", amount: 1, currency: "INR", status: "captured" });
    const signature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!).update("order_123|pay_123").digest("hex");
    const r = await request(app).post("/api/payments/verify").set("Cookie", COOKIE).set("X-Classes-Request", "web").send({ razorpay_order_id: "order_123", razorpay_payment_id: "pay_123", razorpay_signature: signature });
    expect(r.status).toBe(400); expect(Purchase.updateOne).not.toHaveBeenCalled();
  });
  it("accepts a captured payment only after HMAC and provider order/amount checks", async () => {
    auth(); const order = paidOrder(); vi.spyOn(Order, "findOne").mockResolvedValue(order as any);
    vi.spyOn(Order, "findById").mockReturnValue({ session: vi.fn().mockResolvedValue(order) } as any);
    vi.spyOn(Purchase, "updateOne").mockResolvedValue({ upsertedCount: 1 } as any); vi.spyOn(AuditLog, "create").mockResolvedValue({} as any);
    vi.spyOn(mongoose, "startSession").mockResolvedValue({ withTransaction: async (fn: any) => fn(), endSession: async () => {} } as any);
    mocks.razorPaymentsFetch.mockResolvedValue({ id: "pay_123", order_id: "order_123", amount: 54900, currency: "INR", status: "captured" });
    const signature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!).update("order_123|pay_123").digest("hex");
    const r = await request(app).post("/api/payments/verify").set("Cookie", COOKIE).set("X-Classes-Request", "web").send({ razorpay_order_id: "order_123", razorpay_payment_id: "pay_123", razorpay_signature: signature });
    expect(r.status).toBe(200); expect(order.paymentStatus).toBe("paid"); expect(order.razorpayPaymentId).toBe("pay_123"); expect(Purchase.updateOne).toHaveBeenCalledTimes(1);
  });
  it("validates raw webhook signatures and deduplicates repeated event IDs", async () => {
    auth(); const order = paidOrder(); vi.spyOn(Order, "findOne").mockResolvedValue(order as any);
    vi.spyOn(Order, "findById").mockReturnValue({ session: vi.fn().mockResolvedValue(order) } as any);
    vi.spyOn(Purchase, "updateOne").mockResolvedValue({ upsertedCount: 1 } as any); vi.spyOn(AuditLog, "create").mockResolvedValue({} as any);
    vi.spyOn(mongoose, "startSession").mockResolvedValue({ withTransaction: async (fn: any) => fn(), endSession: async () => {} } as any);
    vi.spyOn(WebhookEvent, "exists").mockResolvedValueOnce(null as any).mockResolvedValueOnce({ eventId: "evt_1" } as any);
    vi.spyOn(WebhookEvent, "create").mockResolvedValue({} as any);
    const body = Buffer.from(JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_123", order_id: "order_123", amount: 54900, currency: "INR", status: "captured" } } } }));
    const signature = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!).update(body).digest("hex");
    for (let i = 0; i < 2; i++) { const response = await request(app).post("/api/webhooks/razorpay").set("Content-Type", "application/json").set("x-razorpay-event-id", "evt_1").set("x-razorpay-signature", signature).send(body.toString()); expect(response.status).toBe(200); }
    expect(Purchase.updateOne).toHaveBeenCalledTimes(1); expect(WebhookEvent.create).toHaveBeenCalledTimes(1);
    expect(validWebhookSignature(body, "forged", process.env.RAZORPAY_WEBHOOK_SECRET!)).toBe(false);
  });
  it("keeps a verified purchase paid when Brevo rejects a confirmation email", async () => {
    process.env.BREVO_API_KEY = "test-key"; process.env.BREVO_SENDER_EMAIL = "mail@classes.example"; process.env.ADMIN_NOTIFICATION_EMAIL = "admin@classes.example";
    const order = paidOrder(); vi.spyOn(Order, "findOne").mockResolvedValue(order as any);
    const query: any = { session: vi.fn().mockResolvedValue(order), then: (resolve: any, reject: any) => Promise.resolve(order).then(resolve, reject) };
    vi.spyOn(Order, "findById").mockReturnValue(query);
    vi.spyOn(Order, "updateOne").mockResolvedValue({ modifiedCount: 1 } as any);
    vi.spyOn(User, "findById").mockReturnValue({ select: vi.fn().mockResolvedValue({ name: "Asha", email: "student@example.com" }) } as any);
    vi.spyOn(Purchase, "updateOne").mockResolvedValue({ upsertedCount: 1 } as any); vi.spyOn(AuditLog, "create").mockResolvedValue({} as any);
    vi.spyOn(mongoose, "startSession").mockResolvedValue({ withTransaction: async (fn: any) => fn(), endSession: async () => {} } as any);
    mocks.sendPurchaseConfirmation.mockRejectedValue(new Error("Brevo unavailable")); mocks.sendAdminOrder.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(processPayment("order_123", "pay_123")).resolves.toBeUndefined();
    expect(order.paymentStatus).toBe("paid"); expect(Purchase.updateOne).toHaveBeenCalledTimes(1);
    expect(mocks.sendPurchaseConfirmation).toHaveBeenCalledTimes(1); expect(mocks.sendAdminOrder).toHaveBeenCalledTimes(1);
    delete process.env.BREVO_API_KEY; delete process.env.BREVO_SENDER_EMAIL; delete process.env.ADMIN_NOTIFICATION_EMAIL;
  });
});

describe("administrator uploads and catalogue", () => {
  it("always creates a student during public registration, even if role is supplied", async () => {
    vi.spyOn(User, "exists").mockResolvedValue(null as any); vi.spyOn(User, "create").mockResolvedValue({ name: "Asha", email: "asha@example.com" } as any);
    const r = await request(app).post("/api/auth/register").set("X-Classes-Request", "web").send({ name: "Asha User", email: "asha@example.com", phone: "9876543210", password: "long-secure-password", role: "admin" });
    expect(r.status).toBe(201); expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ role: "student" }));
  });
  it("prevents students from uploading PDFs", async () => {
    auth("student");
    expect((await request(app).post(`/api/admin/books/${BOOK}/upload-pdf`).set("Cookie", COOKIE).set("X-Classes-Request", "web").attach("file", Buffer.from("%PDF-1.7"), { filename: "book.pdf", contentType: "application/pdf" })).status).toBe(403);
    expect(putPdf).not.toHaveBeenCalled();
  });
  it("rejects invalid PDF signatures", async () => {
    auth("admin");
    expect((await request(app).post(`/api/admin/books/${BOOK}/upload-pdf`).set("Cookie", COOKIE).set("X-Classes-Request", "web").attach("file", Buffer.from("not a PDF"), { filename: "book.pdf", contentType: "application/pdf" })).status).toBe(400);
    expect(putPdf).not.toHaveBeenCalled();
  });
  it("uploads a validated PDF to a unique private R2 key", async () => {
    auth("admin"); const doc: any = { _id: BOOK, slug: "guide", pdfStorageKey: "ebooks/old-book/old.pdf", save: vi.fn(async () => {}) };
    vi.spyOn(Book, "findById").mockResolvedValue(doc); vi.spyOn(AuditLog, "create").mockResolvedValue({} as any);
    const r = await request(app).post(`/api/admin/books/${BOOK}/upload-pdf`).set("Cookie", COOKIE).set("X-Classes-Request", "web").attach("file", Buffer.from("%PDF-1.7 sample"), { filename: "guide.pdf", contentType: "application/pdf" });
    expect(r.status).toBe(200); expect(r.body.fileName).toBe("guide.pdf"); expect(doc.pdfStorageKey).toMatch(/^ebooks\/.+\/.+\.pdf$/); expect(putPdf).toHaveBeenCalledWith(doc.pdfStorageKey, expect.any(Buffer)); expect(deletePdf).toHaveBeenCalledWith("ebooks/old-book/old.pdf"); expect(doc.save.mock.invocationCallOrder[0]).toBeLessThan(deletePdf.mock.invocationCallOrder[0]);
  });
  it("uploads covers to Cloudinary and removes the prior asset only after save", async () => {
    auth("admin"); const doc: any = { _id: BOOK, slug: "guide", cloudinaryPublicId: "classes/books/old", save: vi.fn(async () => {}) };
    vi.spyOn(Book, "findById").mockResolvedValue(doc); vi.spyOn(AuditLog, "create").mockResolvedValue({} as any);
    const image = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(12)]);
    const r = await request(app).post(`/api/admin/books/${BOOK}/upload-cover`).set("Cookie", COOKIE).set("X-Classes-Request", "web").attach("file", image, { filename: "cover.png", contentType: "image/png" });
    expect(r.status).toBe(200); expect(uploadCover).toHaveBeenCalledWith(image, "png"); expect(doc.thumbnailUrl).toContain("cloudinary"); expect(deleteCover).toHaveBeenCalledWith("classes/books/old");
  });
  it("rejects invalid image signatures before calling Cloudinary", async () => {
    auth("admin"); const invalid = Buffer.from("not an image");
    const r = await request(app).post(`/api/admin/books/${BOOK}/upload-cover`).set("Cookie", COOKIE).set("X-Classes-Request", "web").attach("file", invalid, { filename: "cover.png", contentType: "image/png" });
    expect(r.status).toBe(400); expect(uploadCover).not.toHaveBeenCalled();
  });
  it("requires a PDF before an admin can publish a book", async () => {
    auth("admin"); vi.spyOn(Book, "create").mockResolvedValue({} as any);
    const r = await request(app).post("/api/admin/books").set("Cookie", COOKIE).set("X-Classes-Request", "web").send({ title: "New guide", description: "A useful sample guide for learners.", author: "Editor", category: "SEO", originalPrice: 100, sellingPrice: 80, status: "published" });
    expect(r.status).toBe(409); expect(Book.create).not.toHaveBeenCalled();
  });
  it("keeps unique ownership constraint on purchases", () => {
    expect(Purchase.schema.indexes().some(([fields, options]: any) => fields.userId === 1 && fields.bookId === 1 && options.unique)).toBe(true);
  });
  it("keeps students out of admin APIs", async () => {
    auth("student"); expect((await request(app).get("/api/admin/dashboard").set("Cookie", COOKIE)).status).toBe(403);
  });
});


describe("CORS and cross-origin preflight requests", () => {
  it("allows preflight OPTIONS for https://www.webturelab.com and sets CORS headers", async () => {
    const res = await request(app)
      .options("/api/auth/me")
      .set("Origin", "https://www.webturelab.com")
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "Authorization, Content-Type, X-Classes-Request");

    expect([200, 204]).toContain(res.status);
    expect(res.headers["access-control-allow-origin"]).toBe("https://www.webturelab.com");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("allows preflight OPTIONS for apex https://webturelab.com", async () => {
    const res = await request(app)
      .options("/api/books")
      .set("Origin", "https://webturelab.com")
      .set("Access-Control-Request-Method", "GET");

    expect([200, 204]).toContain(res.status);
    expect(res.headers["access-control-allow-origin"]).toBe("https://webturelab.com");
  });

  it("blocks untrusted origins from receiving CORS allow origin headers", async () => {
    const res = await request(app)
      .options("/api/books")
      .set("Origin", "https://unauthorized-domain.com")
      .set("Access-Control-Request-Method", "GET");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("isAllowedOrigin helper correctly validates trusted domains", () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin("https://www.webturelab.com")).toBe(true);
    expect(isAllowedOrigin("https://webturelab.com")).toBe(true);
    expect(isAllowedOrigin("https://admin.webturelab.com")).toBe(true);
    expect(isAllowedOrigin("https://my-preview.vercel.app")).toBe(true);
    expect(isAllowedOrigin("http://localhost:3000")).toBe(true);
    expect(isAllowedOrigin("https://malicious-site.com")).toBe(false);
  });
});
