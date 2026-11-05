import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import mongoose from "mongoose";

const mocks = vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  return {
    putPdf: vi.fn(),
    deletePdf: vi.fn(),
    signPdfDownload: vi.fn(),
    streamLegacyObject: vi.fn(),
    uploadCover: vi.fn(),
    deleteCover: vi.fn(),
    r2Configured: vi.fn(() => false),
    cloudinaryConfigured: vi.fn(() => false),
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
import { AuditLog, Book, Category, Order, Purchase, Session, User } from "./models.js";

const ADMIN_ID = "65f000000000000000000010";
const STUDENT_ID = "65f000000000000000000020";
const BOOK_ID = "65f000000000000000000030";
const COOKIE_ADMIN = "classes_session=admin-session";
const COOKIE_STUDENT = "classes_session=student-session";

function mockAuth(role: "admin" | "student") {
  const id = role === "admin" ? ADMIN_ID : STUDENT_ID;
  const email = role === "admin" ? "admin@classes.internal" : "student@classes.internal";
  vi.spyOn(Session, "findOne").mockResolvedValue({ _id: "sess_" + role, userId: id } as any);
  vi.spyOn(User, "findById").mockReturnValue({
    select: vi.fn().mockResolvedValue({
      _id: id,
      name: role === "admin" ? "Admin User" : "Student User",
      email,
      phone: "9876543210",
      role,
      accountStatus: "active",
      isActive: true,
      emailVerified: true,
    }),
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signPdfDownload.mockResolvedValue("http://localhost:4000/api/downloads/test-token");
  vi.spyOn(AuditLog, "create").mockResolvedValue({} as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Admin operations & API routes", () => {
  it("allows authenticated admin to fetch dashboard stats", async () => {
    mockAuth("admin");
    vi.spyOn(User, "countDocuments").mockResolvedValue(10);
    vi.spyOn(Book, "countDocuments").mockResolvedValue(20);
    vi.spyOn(Category, "countDocuments").mockResolvedValue(4);
    vi.spyOn(Order, "countDocuments").mockResolvedValue(5);
    vi.spyOn(Order, "aggregate").mockResolvedValue([{ _id: null, total: 4500 }] as any);
    vi.spyOn(Order, "find").mockReturnValue({ populate: vi.fn().mockReturnValue({ sort: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) } as any);
    vi.spyOn(Purchase, "aggregate").mockResolvedValue([]);
    vi.spyOn(User, "find").mockReturnValue({ sort: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue([]) }) }) } as any);
    vi.spyOn(Book, "find").mockReturnValue({ sort: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue([]) }) }) } as any);

    const res = await request(app)
      .get("/api/admin/dashboard")
      .set("Cookie", COOKIE_ADMIN);

    expect(res.status).toBe(200);
    expect(res.body.students).toBe(10);
    expect(res.body.books).toBe(20);
    expect(res.body.revenue).toBe(4500);
  });

  it("supports search, filtering, and pagination on /api/admin/books", async () => {
    mockAuth("admin");
    const sampleBooks = [
      { _id: BOOK_ID, title: "Advanced Excel Guide", category: "Advanced Excel", originalPrice: 799, sellingPrice: 499, status: "published" },
    ];
    vi.spyOn(Book, "find").mockReturnValue({
      sort: vi.fn().mockReturnValue({
        skip: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(sampleBooks),
        }),
      }),
    } as any);
    vi.spyOn(Book, "countDocuments").mockResolvedValue(1);

    const res = await request(app)
      .get("/api/admin/books?q=Excel&category=Advanced%20Excel&status=published&page=1&limit=20")
      .set("Cookie", COOKIE_ADMIN);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.totalPages).toBe(1);
    expect(res.body.page).toBe(1);
  });

  it("prevents creating duplicate books with the same title", async () => {
    mockAuth("admin");
    vi.spyOn(Book, "exists").mockResolvedValue({ _id: BOOK_ID } as any);

    const res = await request(app)
      .post("/api/admin/books")
      .set("Cookie", COOKIE_ADMIN)
      .set("X-Classes-Request", "web")
      .send({
        title: "Duplicate Title Book",
        description: "A valid description for this book",
        author: "Test Author",
        category: "Digital Marketing",
        originalPrice: 899,
        sellingPrice: 599,
        status: "draft",
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already exists");
  });

  it("blocks non-admin students from accessing admin routes", async () => {
    mockAuth("student");

    const res = await request(app)
      .get("/api/admin/dashboard")
      .set("Cookie", COOKIE_STUDENT);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Admin access required");
  });

  it("allows admin to create a new category and prevents duplicates", async () => {
    mockAuth("admin");
    vi.spyOn(Category, "exists").mockResolvedValue(null);
    vi.spyOn(Category, "countDocuments").mockResolvedValue(4);
    vi.spyOn(Category, "create").mockResolvedValue({
      _id: "cat_1",
      name: "Artificial Intelligence",
      slug: "artificial-intelligence",
      description: "AI guides",
    } as any);

    const res = await request(app)
      .post("/api/admin/categories")
      .set("Cookie", COOKIE_ADMIN)
      .set("X-Classes-Request", "web")
      .send({ name: "Artificial Intelligence", description: "AI guides" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Artificial Intelligence");
  });
});

describe("Student payment and library experience", () => {
  it("provides mock payment capability in development when Razorpay keys are not set", async () => {
    mockAuth("student");

    const keyRes = await request(app)
      .get("/api/payments/key")
      .set("Cookie", COOKIE_STUDENT);

    expect(keyRes.status).toBe(200);
    expect(keyRes.body.isMock).toBe(true);

    // Mock create order
    const mockBook = {
      _id: new mongoose.Types.ObjectId(BOOK_ID),
      title: "Sample Book",
      sellingPrice: 499,
      status: "published",
      pdfStorageKey: "ebooks/sample.pdf",
    };
    vi.spyOn(Book, "find").mockResolvedValue([mockBook] as any);
    vi.spyOn(Order, "findOne").mockResolvedValue(null);
    vi.spyOn(Purchase, "find").mockResolvedValue([]);
    const mockOrder = {
      _id: new mongoose.Types.ObjectId(),
      userId: STUDENT_ID,
      items: [{ bookId: BOOK_ID, title: "Sample Book", amount: 499 }],
      totalAmount: 499,
      currency: "INR",
      paymentStatus: "created",
      razorpayOrderId: undefined,
      save: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(Order, "create").mockResolvedValue(mockOrder as any);

    const orderRes = await request(app)
      .post("/api/payments/create-order")
      .set("Cookie", COOKIE_STUDENT)
      .set("X-Classes-Request", "web")
      .send({ bookIds: [BOOK_ID] });

    expect(orderRes.status).toBe(200);
    expect(orderRes.body.isMock).toBe(true);
    expect(orderRes.body.orderId).toContain("order_mock_");
  });
});
