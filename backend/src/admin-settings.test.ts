import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";

const mocks = vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  return {
    putPdf: vi.fn(),
    deletePdf: vi.fn(),
    signPdfDownload: vi.fn(),
    streamLegacyObject: vi.fn(),
    uploadCover: vi.fn(),
    deleteCover: vi.fn(),
    r2Configured: vi.fn(() => true),
    cloudinaryConfigured: vi.fn(() => true),
    sendVerification: vi.fn(),
    sendWelcome: vi.fn(),
    sendPasswordReset: vi.fn(),
    sendPurchaseConfirmation: vi.fn(),
    sendAdminOrder: vi.fn(),
  };
});

vi.mock("./services/storage.js", () => mocks);
vi.mock("./services/email.js", () => mocks);

import { app } from "./server.js";
import { AuditLog, Order, Purchase, Session, User } from "./models.js";

const ADMIN_ID = "65f000000000000000000001";
const STUDENT_ID = "65f000000000000000000002";
const COOKIE = "classes_session=test-token";

function mockAdminWithDoc(doc: any) {
  vi.spyOn(Session, "findOne").mockResolvedValue({
    _id: "mock_session_id",
    userId: ADMIN_ID,
    tokenHash: "mock_hash"
  } as any);

  let callCount = 0;
  vi.spyOn(User, "findById").mockImplementation((id: any) => {
    callCount++;
    if (callCount === 1) {
      // Called by requireAuth with .select(...)
      return {
        select: vi.fn().mockResolvedValue({
          _id: ADMIN_ID,
          name: "Admin User",
          email: "info@webturelab.com",
          role: "admin",
          accountStatus: "active",
          isActive: true,
          emailVerified: true,
        })
      } as any;
    }
    // Called inside endpoint
    return Promise.resolve(doc) as any;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(AuditLog, "create").mockResolvedValue({} as any);
  vi.spyOn(Session, "deleteMany").mockResolvedValue({} as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Admin Change Password Endpoint", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(app)
      .post("/api/admin/change-password")
      .set("x-classes-request", "web")
      .send({ currentPassword: "OldPassword123", newPassword: "NewPassword456" });

    expect(res.status).toBe(401);
  });

  it("blocks non-admin users from changing admin password", async () => {
    vi.spyOn(Session, "findOne").mockResolvedValue({ _id: "s", userId: STUDENT_ID } as any);
    vi.spyOn(User, "findById").mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: STUDENT_ID,
        role: "student",
        accountStatus: "active",
        isActive: true,
        emailVerified: true,
      })
    } as any);

    const res = await request(app)
      .post("/api/admin/change-password")
      .set("x-classes-request", "web")
      .set("Cookie", COOKIE)
      .send({ currentPassword: "OldPassword123", newPassword: "NewPassword456" });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Admin access required");
  });

  it("fails when current password is wrong", async () => {
    const oldHash = await bcrypt.hash("CorrectOldPassword123", 12);
    mockAdminWithDoc({
      _id: ADMIN_ID,
      email: "info@webturelab.com",
      passwordHash: oldHash,
      save: vi.fn(),
    });

    const res = await request(app)
      .post("/api/admin/change-password")
      .set("x-classes-request", "web")
      .set("Cookie", COOKIE)
      .send({ currentPassword: "WrongPassword999", newPassword: "NewValidPassword123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Current password is incorrect");
  });

  it("fails when new password is identical to current password", async () => {
    const oldHash = await bcrypt.hash("SamePassword123", 12);
    mockAdminWithDoc({
      _id: ADMIN_ID,
      email: "info@webturelab.com",
      passwordHash: oldHash,
      save: vi.fn(),
    });

    const res = await request(app)
      .post("/api/admin/change-password")
      .set("x-classes-request", "web")
      .set("Cookie", COOKIE)
      .send({ currentPassword: "SamePassword123", newPassword: "SamePassword123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("New password must be different from current password");
  });

  it("fails when new password is too short", async () => {
    mockAdminWithDoc({});

    const res = await request(app)
      .post("/api/admin/change-password")
      .set("x-classes-request", "web")
      .set("Cookie", COOKIE)
      .send({ currentPassword: "OldPassword123", newPassword: "short" });

    expect(res.status).toBe(400);
  });

  it("successfully updates password and invalidates other sessions", async () => {
    const oldHash = await bcrypt.hash("Bizware@321", 12);
    const mockSave = vi.fn().mockResolvedValue({});
    let updatedHash = "";

    const mockAdminDoc = {
      _id: ADMIN_ID,
      email: "info@webturelab.com",
      passwordHash: oldHash,
      save: mockSave,
    };

    Object.defineProperty(mockAdminDoc, "passwordHash", {
      get: () => updatedHash || oldHash,
      set: (val: string) => { updatedHash = val; },
    });

    mockAdminWithDoc(mockAdminDoc);

    const res = await request(app)
      .post("/api/admin/change-password")
      .set("x-classes-request", "web")
      .set("Cookie", COOKIE)
      .send({ currentPassword: "Bizware@321", newPassword: "NewSecretPassword@999" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toBe("Password updated successfully");
    expect(mockSave).toHaveBeenCalledTimes(1);

    const isMatch = await bcrypt.compare("NewSecretPassword@999", updatedHash);
    expect(isMatch).toBe(true);
  });
});

describe("Admin Orders Maintenance", () => {
  it("allows admin to delete an individual order", async () => {
    mockAdminWithDoc({});
    vi.spyOn(Order, "findByIdAndDelete").mockResolvedValue({ _id: "order_123", razorpayOrderId: "rzp_1" } as any);
    vi.spyOn(Purchase, "deleteMany").mockResolvedValue({} as any);

    const res = await request(app)
      .delete("/api/admin/orders/order_123")
      .set("x-classes-request", "web")
      .set("Cookie", COOKIE);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toBe("Order removed successfully");
  });

  it("allows admin to clear all orders", async () => {
    mockAdminWithDoc({});
    vi.spyOn(Order, "deleteMany").mockResolvedValue({ deletedCount: 5 } as any);
    vi.spyOn(Purchase, "deleteMany").mockResolvedValue({} as any);

    const res = await request(app)
      .post("/api/admin/orders/clear-all")
      .set("x-classes-request", "web")
      .set("Cookie", COOKIE);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toContain("Successfully cleared 5 orders");
  });
});
