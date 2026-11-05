import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express, { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import multer from "multer";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import Razorpay from "razorpay";
import { z } from "zod";
import { AuditLog, Book, Category, Order, Purchase, Session, User, WebhookEvent } from "./models.js";
import { defaultCategories, seedBooks } from "@classes/shared";
import {
  cloudinaryConfigured,
  deleteCover,
  deletePdf,
  getUploadPath,
  putPdf,
  r2Configured,
  signPdfDownload,
  streamLegacyObject,
  uploadCover,
  verifyDownloadToken
} from "./services/storage.js";
import {
  sendAdminOrder,
  sendPasswordReset,
  sendPurchaseConfirmation,
  sendVerification,
  sendWelcome
} from "./services/email.js";

declare global {
  namespace Express {
    interface Request {
      authUser?: any;
      sessionId?: string;
    }
  }
}

const app = express();
const isProd = process.env.NODE_ENV === "production";
const rawWebOrigins = (process.env.FRONTEND_URL || process.env.WEB_ORIGIN || "http://localhost:3000")
  .split(",")
  .map(s => s.trim().replace(/\/$/, ""))
  .filter(Boolean);
const rawAdminOrigins = (process.env.ADMIN_URL || "http://localhost:3001")
  .split(",")
  .map(s => s.trim().replace(/\/$/, ""))
  .filter(Boolean);
const rawAllowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim().replace(/\/$/, ""))
  .filter(Boolean);

const allowedOrigins = new Set([...rawWebOrigins, ...rawAdminOrigins, ...rawAllowedOrigins]);
const webOrigin = rawWebOrigins[0] || "http://localhost:3000";
const adminOrigin = rawAdminOrigins[0] || "http://localhost:3001";
const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;
const cookieName = "classes_session";

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const normalized = origin.replace(/\/$/, "");
    if (allowedOrigins.has(normalized)) return cb(null, true);
    try {
      const u = new URL(origin);
      // Allow all Vercel deployments (production, preview, staging)
      if (u.hostname.endsWith(".vercel.app") || u.hostname === "vercel.app") {
        return cb(null, true);
      }
      // Allow local development ports
      if (!isProd && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
        return cb(null, true);
      }
    } catch {}
    return cb(null, false);
  },
  credentials: true,
  allowedHeaders: ["Content-Type", "X-Classes-Request", "Authorization"],
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]
}));
app.use(cookieParser());

// Static serving for local uploads in development
if (!isProd) {
  try {
    const coversDir = getUploadPath("covers");
    fs.mkdirSync(coversDir, { recursive: true });
    app.use("/api/uploads/covers", express.static(coversDir));
  } catch {}
}

app.post("/api/webhooks/razorpay", express.raw({ type: "application/json", limit: "1mb" }), async (req, res, next) => {
  try {
    const raw = req.body as Buffer;
    const sig = req.header("x-razorpay-signature") || "";
    if (!Buffer.isBuffer(raw) || !validWebhookSignature(raw, sig, process.env.RAZORPAY_WEBHOOK_SECRET || "")) {
      return res.status(400).json({ error: "Invalid webhook signature" });
    }
    const event = JSON.parse(raw.toString());
    const eventId = req.header("x-razorpay-event-id") || sha(raw.toString());
    if (await WebhookEvent.exists({ eventId })) return res.json({ received: true, duplicate: true });

    if (["payment.captured", "order.paid"].includes(event.event)) {
      const payment = event.payload?.payment?.entity;
      const rzOrder = event.payload?.order?.entity?.id || payment?.order_id;
      if (payment && rzOrder) {
        const order = await Order.findOne({ razorpayOrderId: rzOrder });
        if (order && payment.status === "captured" && payment.amount === Math.round(order.totalAmount * 100) && payment.currency === order.currency) {
          await grantOrder(order, payment.id);
        } else if (order) {
          return res.status(400).json({ error: "Webhook payment does not match the order" });
        }
      }
    }
    if (event.event === "payment.failed") {
      const failed = event.payload?.payment?.entity;
      const order = failed?.order_id ? await Order.findOne({ razorpayOrderId: failed.order_id }) : null;
      if (order && order.paymentStatus !== "paid") {
        order.paymentStatus = "failed";
        await order.save();
        await AuditLog.create({ action: "payment.failed", targetId: String(order._id), details: { paymentId: failed?.id } });
      }
    }
    if (["refund.processed", "payment.refunded"].includes(event.event)) {
      const paymentId = event.payload?.refund?.entity?.payment_id || event.payload?.payment?.entity?.id;
      const order = await Order.findOne({ razorpayPaymentId: paymentId });
      if (order) {
        order.paymentStatus = "refunded";
        await order.save();
        await Purchase.updateMany({ orderId: order._id }, { $set: { entitlementStatus: "refunded" } });
        await AuditLog.create({ action: "payment.refunded", targetId: String(order._id), details: { paymentId } });
      }
    }
    try {
      await WebhookEvent.create({ eventId, eventType: event.event });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
    res.json({ received: true });
  } catch (e) {
    next(e);
  }
});

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method) || req.path === "/api/health" || req.path.startsWith("/api/downloads/")) return next();
  const origin = req.header("origin");
  if (origin) {
    const normalized = origin.replace(/\/$/, "");
    let allowed = allowedOrigins.has(normalized);
    if (!allowed) {
      try {
        const u = new URL(origin);
        if (
          u.hostname.endsWith(".vercel.app") ||
          u.hostname === "vercel.app" ||
          (!isProd && (u.hostname === "localhost" || u.hostname === "127.0.0.1"))
        ) {
          allowed = true;
        }
      } catch {}
    }
    if (!allowed) {
      return res.status(403).json({ error: "Request origin not allowed" });
    }
  }
  if (req.header("x-classes-request") !== "web") return res.status(403).json({ error: "Missing request header" });
  next();
});

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false, message: { error: "Too many attempts. Please try again later." } });
const asyncRoute = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);

const issue = async (res: Response, user: any): Promise<string> => {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + Number(process.env.SESSION_DAYS || 7) * 864e5);
  await Session.create({ userId: user._id, tokenHash: sha(token), expiresAt });
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
    expires: expiresAt,
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {})
  });
  return token;
};

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.header("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    const raw = bearerToken || req.cookies?.[cookieName];
    if (!raw) return res.status(401).json({ error: "Sign in required" });
    const session = await Session.findOne({ tokenHash: sha(raw), expiresAt: { $gt: new Date() } });
    if (!session) return res.status(401).json({ error: "Session expired" });
    const user = await User.findById(session.userId).select("name email phone role accountStatus isActive emailVerified");
    if (!user || user.isActive === false || user.accountStatus !== "active") return res.status(401).json({ error: "Account unavailable" });
    req.authUser = user;
    req.sessionId = String(session._id);
    next();
  } catch (e) {
    next(e);
  }
}

const requireStudent = (req: Request, res: Response, next: NextFunction) =>
  req.authUser?.role === "student" ? next() : res.status(403).json({ error: "Student access required" });

const requireAdmin = (req: Request, res: Response, next: NextFunction) =>
  req.authUser?.role === "admin" ? next() : res.status(403).json({ error: "Admin access required" });

const studentAuth = [requireAuth, requireStudent];
const adminAuth = [requireAuth, requireAdmin];

const createSession = async (user: any, res: Response): Promise<string> => {
  if (!user.emailVerified) throw Object.assign(new Error("Verify your email before signing in"), { status: 403 });
  if (user.isActive === false || user.accountStatus !== "active") throw Object.assign(new Error("This account is suspended"), { status: 403 });
  return await issue(res, user);
};

async function bestEffortEmail(kind: string, task: () => Promise<void>) {
  try {
    await task();
  } catch (error) {
    console.error(`${kind} email delivery failed:`, error instanceof Error ? error.message : "unknown email error");
  }
}

function sha(v: string) {
  return crypto.createHash("sha256").update(v).digest("hex");
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export function canDownload(access: { userId: string; purchaseUserId?: string; entitlementStatus?: string; paymentStatus?: string }) {
  return access.userId === access.purchaseUserId && access.entitlementStatus === "active" && access.paymentStatus === "paid";
}

export function validWebhookSignature(body: Buffer, signature: string, secret: string) {
  return !!secret && safeEqual(signature, crypto.createHmac("sha256", secret).update(body).digest("hex"));
}

function slug(title: string) {
  return title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function publicBook(b: any) {
  const o = b.toObject ? b.toObject() : b;
  const apiPublic = process.env.BACKEND_URL ? `${process.env.BACKEND_URL.replace(/\/$/, "")}/api` : process.env.API_PUBLIC_URL || "http://localhost:4000/api";
  return {
    ...o,
    _id: String(o._id),
    coverImageUrl: o.thumbnailUrl || (o.coverImageKey?.startsWith("http") && o.coverImageKey) || (o.coverImageKey?.startsWith("assets/") && `${webOrigin}/${o.coverImageKey}`) || `${apiPublic}/books/${o.slug}/cover`,
    coverImageKey: undefined,
    cloudinaryPublicId: undefined,
    availableForPurchase: !!o.pdfStorageKey,
    pdfStorageKey: undefined,
    pdfObjectKey: undefined,
    pdfOriginalFilename: undefined,
    pdfFileName: undefined,
    pdfSize: undefined
  };
}

function adminBook(b: any) {
  const o = b.toObject ? b.toObject() : b;
  return {
    ...publicBook(b),
    cloudinaryPublicId: o.cloudinaryPublicId,
    pdfFileName: o.pdfOriginalFilename || o.pdfFileName,
    pdfSize: o.pdfSize,
    pdfUploaded: !!o.pdfStorageKey
  };
}

async function sendOrderEmails(orderId: any) {
  if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) return;
  const order = await Order.findById(orderId);
  if (!order || order.paymentStatus !== "paid") return;
  const user = await User.findById(order.userId).select("name email");
  if (!user) return;
  const titles = order.items.map((item: any) => item.title).join(", ");
  const base = {
    name: user.name,
    email: user.email,
    titles,
    amount: order.totalAmount,
    orderRef: String(order.razorpayOrderId || order._id),
    date: new Date(order.paymentVerifiedAt || order.updatedAt || Date.now()).toLocaleDateString("en-IN"),
    libraryUrl: `${webOrigin}/student`
  };
  const customerField = "customerConfirmationSentAt";
  const claimedCustomer = await Order.updateOne({ _id: order._id, paymentStatus: "paid", [customerField]: { $exists: false } }, { $set: { [customerField]: new Date() } });
  if (claimedCustomer.modifiedCount) {
    await bestEffortEmail("Purchase confirmation", async () => {
      try {
        await sendPurchaseConfirmation({ email: user.email, name: user.name }, base);
      } catch (e) {
        await Order.updateOne({ _id: order._id }, { $unset: { [customerField]: 1 } });
        throw e;
      }
    });
  }
  const admin = process.env.ADMIN_NOTIFICATION_EMAIL;
  const adminField = "adminNotificationSentAt";
  if (admin) {
    const claimedAdmin = await Order.updateOne({ _id: order._id, paymentStatus: "paid", [adminField]: { $exists: false } }, { $set: { [adminField]: new Date() } });
    if (claimedAdmin.modifiedCount) {
      await bestEffortEmail("Admin order notification", async () => {
        try {
          await sendAdminOrder({ email: admin }, base);
        } catch (e) {
          await Order.updateOne({ _id: order._id }, { $unset: { [adminField]: 1 } });
          throw e;
        }
      });
    }
  }
}

async function processPayment(razorOrderId: string, paymentId: string) {
  const order = await Order.findOne({ razorpayOrderId: razorOrderId });
  if (!order || order.paymentStatus === "refunded") return;
  if (order.razorpayPaymentId && order.razorpayPaymentId !== paymentId) throw new Error("Payment reference mismatch");
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const current = await Order.findById(order._id).session(session);
      if (!current || current.paymentStatus === "refunded") return;
      if (current.razorpayPaymentId && current.razorpayPaymentId !== paymentId) throw new Error("Payment reference mismatch");
      if (current.paymentStatus !== "paid") {
        current.paymentStatus = "paid";
        current.razorpayPaymentId = paymentId;
        current.paymentVerifiedAt = new Date();
        await current.save({ session });
        for (const item of current.items) {
          await Purchase.updateOne(
            { userId: current.userId, bookId: item.bookId },
            { $setOnInsert: { orderId: current._id, paymentId, amountPaid: item.amount, entitlementStatus: "active", purchasedAt: new Date() } },
            { upsert: true, session }
          );
        }
        await AuditLog.create([{ action: "payment.verified", targetId: String(current._id), details: { paymentId, amount: current.totalAmount, userId: String(current.userId) } }], { session });
      }
    });
  } finally {
    await session.endSession();
  }
  await sendOrderEmails(order._id).catch(error => console.error("Purchase email processing failed", error instanceof Error ? error.message : "unknown email error"));
}

async function grantOrder(order: any, paymentId: string) {
  await processPayment(order.razorpayOrderId, paymentId);
}

async function bootstrap() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required. Add your MongoDB Atlas connection string to backend/.env.");
  if (isProd) {
    const required = ["MONGODB_URI", "FRONTEND_URL", "ADMIN_URL", "BACKEND_URL", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "BREVO_API_KEY", "BREVO_SENDER_EMAIL", "ADMIN_NOTIFICATION_EMAIL"];
    const missing = required.filter(key => !process.env[key]);
    if (!process.env.R2_ENDPOINT && !process.env.R2_ACCOUNT_ID) missing.push("R2_ENDPOINT or R2_ACCOUNT_ID");
    if (missing.length) throw new Error(`Missing required production configuration: ${missing.join(", ")}`);
  }

  // Ensure default sample PDF exists on disk for dev
  try {
    const sampleDir = getUploadPath("ebooks");
    fs.mkdirSync(sampleDir, { recursive: true });
    const samplePdfPath = path.join(sampleDir, "seed-sample.pdf");
    if (!fs.existsSync(samplePdfPath)) {
      const minimalPdf = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF\n";
      fs.writeFileSync(samplePdfPath, minimalPdf);
    }
  } catch {}

  await mongoose.connect(process.env.MONGODB_URI);

  // Seed default categories if none exist
  for (let i = 0; i < defaultCategories.length; i++) {
    const name = defaultCategories[i];
    const categorySlug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    await Category.updateOne(
      { slug: categorySlug },
      { $setOnInsert: { name, slug: categorySlug, description: `Guides and handbooks for ${name}.`, displayOrder: i } },
      { upsert: true }
    );
  }

  // Seed default books ONLY when explicitly configured
  if (process.env.SEED_DEFAULT_BOOKS === "true") {
    for (const row of seedBooks) {
      await Book.updateOne(
        { slug: row.slug },
        {
          $setOnInsert: {
            ...row,
            pdfStorageKey: "ebooks/seed-sample.pdf",
            pdfOriginalFilename: "sample-guide.pdf",
            pdfFileName: "sample-guide.pdf",
            pdfSize: 317
          }
        },
        { upsert: true }
      );
    }
  }

  // Sync any distinct book categories to Category collection
  const distinctCats = await Book.distinct("category");
  for (const c of distinctCats) {
    if (c) {
      const categorySlug = String(c).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      await Category.updateOne(
        { slug: categorySlug },
        { $setOnInsert: { name: c, slug: categorySlug, description: `Guides for ${c}.`, displayOrder: 99 } },
        { upsert: true }
      );
    }
  }

  // Automatic Administrator Account Provisioning (Ensures production access on deployment)
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@gmail.com").toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  const adminName = process.env.ADMIN_NAME || "Digital Bizware Admin";
  const adminPhone = process.env.ADMIN_PHONE?.trim() || "9999999999";
  const existingAdmin = await User.findOne({ email: adminEmail });
  if (!existingAdmin) {
    await User.create({
      name: adminName,
      email: adminEmail,
      phone: adminPhone,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: "admin",
      emailVerified: true,
      accountStatus: "active",
      isActive: true,
    });
    console.log(`[BOOTSTRAP] Administrator account created: ${adminEmail}`);
  } else if (existingAdmin.role !== "admin" || !existingAdmin.emailVerified || !existingAdmin.isActive) {
    existingAdmin.role = "admin";
    existingAdmin.emailVerified = true;
    existingAdmin.accountStatus = "active";
    existingAdmin.isActive = true;
    await existingAdmin.save();
    console.log(`[BOOTSTRAP] Administrator account verified and promoted: ${adminEmail}`);
  }

  if (!r2Configured()) console.warn("Cloudflare R2 is not configured; using local storage in development");
  if (!cloudinaryConfigured()) console.warn("Cloudinary is not configured; using local storage in development");
  if (!process.env.BREVO_API_KEY) console.warn("Brevo is not configured; transactional emails are logged to console in development");
}

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "classes-api" }));

// Authorized local file download handler
app.get("/api/downloads/:token", asyncRoute(async (req, res) => {
  const verified = verifyDownloadToken(req.params.token);
  if (!verified) return res.status(403).send("Download link is invalid or expired");
  const target = getUploadPath(verified.key);
  if (!fs.existsSync(target)) return res.status(404).send("The requested eBook file is unavailable");
  const safeName = (req.query.filename ? String(req.query.filename) : verified.filename).replace(/[\r\n"\\]/g, "");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
  res.setHeader("Cache-Control", "private, no-store");
  fs.createReadStream(target).pipe(res);
}));

app.post("/api/auth/register", authLimiter, asyncRoute(async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().email().max(254),
    phone: z.string().trim().min(7).max(24),
    password: z.string().min(10).max(128)
  }).parse(req.body);
  const email = body.email.toLowerCase();
  if (await User.exists({ email })) return res.status(409).json({ error: "An account with this email already exists" });
  const token = crypto.randomBytes(32).toString("hex");
  const user = await User.create({
    name: body.name,
    email,
    phone: body.phone,
    passwordHash: await bcrypt.hash(body.password, 12),
    role: "student",
    emailVerified: false,
    verifyTokenHash: sha(token),
    verifyExpires: new Date(Date.now() + 24 * 3600e3)
  });
  const verifyUrl = `${webOrigin}/verify?token=${token}`;
  if (!process.env.BREVO_API_KEY && !isProd) {
    console.log(`\n[DEV EMAIL] Student verification URL for ${email}: ${verifyUrl}\n`);
  }
  await bestEffortEmail("Verification", () => sendVerification({ email, name: user.name }, verifyUrl));
  await bestEffortEmail("Welcome", () => sendWelcome({ email, name: user.name }, `${webOrigin}/login`));
  res.status(201).json({
    message: "Account created. Check your email to verify your address.",
    ...(!isProd ? { devVerifyUrl: verifyUrl } : {})
  });
}));

app.post("/api/auth/resend-verification", authLimiter, asyncRoute(async (req, res) => {
  const email = z.string().email().parse(req.body.email).toLowerCase();
  const user = await User.findOne({ email, emailVerified: false });
  let verifyUrl: string | undefined;
  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    user.verifyTokenHash = sha(token);
    user.verifyExpires = new Date(Date.now() + 24 * 3600e3);
    await user.save();
    verifyUrl = `${webOrigin}/verify?token=${token}`;
    if (!process.env.BREVO_API_KEY && !isProd) {
      console.log(`\n[DEV EMAIL] Resent verification URL for ${email}: ${verifyUrl}\n`);
    }
    await bestEffortEmail("Verification", () => sendVerification({ email, name: user.name }, verifyUrl!));
  }
  res.json({
    message: "If the account needs verification, a new link has been sent.",
    ...(!isProd && verifyUrl ? { devVerifyUrl: verifyUrl } : {})
  });
}));

app.post("/api/auth/verify-email", authLimiter, asyncRoute(async (req, res) => {
  const token = z.string().min(32).parse(req.body.token);
  const user = await User.findOne({ verifyTokenHash: sha(token), verifyExpires: { $gt: new Date() } });
  if (!user) return res.status(400).json({ error: "Verification link is invalid or expired" });
  user.emailVerified = true;
  user.verifyTokenHash = undefined;
  user.verifyExpires = undefined;
  await user.save();
  const sessionToken = await issue(res, user);
  res.json({ message: "Email verified", user: { name: user.name, email: user.email, role: user.role }, token: sessionToken });
}));

app.post("/api/auth/login", authLimiter, asyncRoute(async (req, res) => {
  const b = z.object({ email: z.string().email(), password: z.string().min(1).max(128) }).parse(req.body);
  const user = await User.findOne({ email: b.email.toLowerCase() });
  if (!user || !(await bcrypt.compare(b.password, user.passwordHash))) return res.status(401).json({ error: "Email or password is incorrect" });
  const token = await createSession(user, res);
  res.json({ user: { name: user.name, email: user.email, role: user.role }, token });
}));

app.post("/api/auth/logout", requireAuth, asyncRoute(async (req, res) => {
  await Session.deleteOne({ _id: req.sessionId });
  res.clearCookie(cookieName, { path: "/", httpOnly: true, secure: isProd, sameSite: isProd ? "none" : "lax" });
  res.json({ ok: true });
}));

app.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: req.authUser }));

app.post("/api/auth/forgot-password", authLimiter, asyncRoute(async (req, res) => {
  const email = z.string().email().parse(req.body.email).toLowerCase();
  const user = await User.findOne({ email });
  let resetUrl: string | undefined;
  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    user.resetTokenHash = sha(token);
    user.resetExpires = new Date(Date.now() + 3600e3);
    await user.save();
    resetUrl = `${webOrigin}/reset-password?token=${token}`;
    if (!process.env.BREVO_API_KEY && !isProd) {
      console.log(`\n[DEV EMAIL] Password reset URL for ${email}: ${resetUrl}\n`);
    }
    await bestEffortEmail("Password reset", () => sendPasswordReset({ email, name: user.name }, resetUrl!));
  }
  res.json({
    message: "If the account exists, a reset link has been sent.",
    ...(!isProd && resetUrl ? { devResetUrl: resetUrl } : {})
  });
}));

app.post("/api/auth/reset-password", authLimiter, asyncRoute(async (req, res) => {
  const b = z.object({ token: z.string().min(32), password: z.string().min(10).max(128) }).parse(req.body);
  const user = await User.findOne({ resetTokenHash: sha(b.token), resetExpires: { $gt: new Date() } });
  if (!user) return res.status(400).json({ error: "Reset link is invalid or expired" });
  user.passwordHash = await bcrypt.hash(b.password, 12);
  user.resetTokenHash = undefined;
  user.resetExpires = undefined;
  await user.save();
  await Session.deleteMany({ userId: user._id });
  res.json({ message: "Password reset. Sign in with your new password." });
}));

// Public & Admin Categories API
app.get("/api/categories", asyncRoute(async (_req, res) => {
  const [categoriesList, bookCounts] = await Promise.all([
    Category.find().sort({ displayOrder: 1, name: 1 }),
    Book.aggregate([
      { $match: { status: "published" } },
      { $group: { _id: "$category", count: { $sum: 1 } } }
    ])
  ]);

  const countMap = new Map<string, number>();
  bookCounts.forEach((c: any) => countMap.set(String(c._id).toLowerCase(), c.count));

  const result = categoriesList.map((c: any) => ({
    _id: String(c._id),
    name: c.name,
    slug: c.slug,
    description: c.description,
    count: countMap.get(c.name.toLowerCase()) || 0
  }));

  if (!result.length && bookCounts.length) {
    return res.json(bookCounts.map(c => ({
      _id: String(c._id),
      name: c._id,
      slug: String(c._id).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      count: c.count
    })));
  }

  res.json(result);
}));

app.post("/api/admin/categories", adminAuth, asyncRoute(async (req, res) => {
  const b = z.object({
    name: z.string().trim().min(2).max(80),
    description: z.string().max(500).optional()
  }).parse(req.body);

  const categorySlug = slug(b.name);
  if (await Category.exists({ $or: [{ name: new RegExp(`^${escapeRegex(b.name)}$`, "i") }, { slug: categorySlug }] })) {
    return res.status(409).json({ error: "A category with this name already exists" });
  }

  const count = await Category.countDocuments();
  const created = await Category.create({
    name: b.name,
    slug: categorySlug,
    description: b.description || "",
    displayOrder: count
  });

  await AuditLog.create({ adminId: req.authUser._id, action: "category.create", targetId: String(created._id), details: { name: created.name } });
  res.status(201).json(created);
}));

app.patch("/api/admin/categories/:id", adminAuth, asyncRoute(async (req, res) => {
  const b = z.object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().max(500).optional()
  }).parse(req.body);

  const current = await Category.findById(req.params.id);
  if (!current) return res.sendStatus(404);

  const updates: any = {};
  if (b.description !== undefined) updates.description = b.description;
  if (b.name && b.name !== current.name) {
    const newSlug = slug(b.name);
    if (await Category.exists({ _id: { $ne: current._id }, $or: [{ name: new RegExp(`^${escapeRegex(b.name)}$`, "i") }, { slug: newSlug }] })) {
      return res.status(409).json({ error: "Another category already uses this name" });
    }
    updates.name = b.name;
    updates.slug = newSlug;

    // Update all books that belong to this category
    await Book.updateMany({ category: current.name }, { $set: { category: b.name } });
  }

  const updated = await Category.findByIdAndUpdate(req.params.id, updates, { new: true });
  await AuditLog.create({ adminId: req.authUser._id, action: "category.update", targetId: String(current._id), details: b });
  res.json(updated);
}));

app.delete("/api/admin/categories/:id", adminAuth, asyncRoute(async (req, res) => {
  const current = await Category.findById(req.params.id);
  if (!current) return res.sendStatus(404);

  const bookCount = await Book.countDocuments({ category: current.name });
  if (bookCount > 0) {
    return res.status(409).json({ error: `Cannot delete "${current.name}" because ${bookCount} eBook(s) are assigned to it. Reassign or delete those eBooks first.` });
  }

  await current.deleteOne();
  await AuditLog.create({ adminId: req.authUser._id, action: "category.delete", targetId: String(current._id), details: { name: current.name } });
  res.json({ ok: true });
}));

app.get("/api/books", asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(48, Math.max(1, Number(req.query.limit) || 24));
  const q = String(req.query.q || "").trim().slice(0, 100);
  const category = String(req.query.category || "").trim();
  const tag = String(req.query.tag || "").trim();
  const sort = String(req.query.sort || "popular");

  const filter: any = { status: "published" };
  if (category) filter.category = category;
  if (tag) filter.tag = tag;
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ title: rx }, { author: rx }, { description: rx }];
  }

  const sorts: any = {
    popular: { rating: -1, reviewCount: -1 },
    newest: { createdAt: -1 },
    low: { sellingPrice: 1 },
    high: { sellingPrice: -1 }
  };

  const [items, total] = await Promise.all([
    Book.find(filter).sort(sorts[sort] || sorts.popular).skip((page - 1) * limit).limit(limit),
    Book.countDocuments(filter)
  ]);
  res.json({ items: items.map(publicBook), page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
}));

app.get("/api/books/:slug/cover", asyncRoute(async (req, res) => {
  const b = await Book.findOne({ slug: req.params.slug, status: "published" });
  if (!b) return res.sendStatus(404);
  if (b.thumbnailUrl) return res.redirect(b.thumbnailUrl);
  const key = b.coverImageKey || "assets/ebook-cover.png";
  if (key.startsWith("assets/")) {
    res.redirect(`${webOrigin}/${key}`);
    return;
  }
  await streamLegacyObject(key, res);
}));

app.get("/api/books/:slug", asyncRoute(async (req, res) => {
  const b = await Book.findOne({ slug: req.params.slug, status: "published" });
  if (!b) return res.status(404).json({ error: "Book not found" });
  res.json(publicBook(b));
}));

app.get("/api/student/dashboard", studentAuth, asyncRoute(async (req, res) => {
  const [library, recent, available, availableBooksList] = await Promise.all([
    Purchase.find({ userId: req.authUser._id, entitlementStatus: "active" }).populate("bookId").sort({ purchasedAt: -1 }).limit(6),
    Order.find({ userId: req.authUser._id, paymentStatus: "paid" }).sort({ createdAt: -1 }).limit(5),
    Book.countDocuments({ status: "published" }),
    Book.find({ status: "published" }).sort({ rating: -1 }).limit(4)
  ]);
  res.json({
    user: req.authUser,
    library: library.filter((p: any) => p.bookId).map((p: any) => ({ purchase: p, book: publicBook(p.bookId) })),
    recentOrders: recent,
    availableBooks: available,
    availableBooksList: availableBooksList.map(publicBook)
  });
}));

app.get("/api/student/library", studentAuth, asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1), limit = Math.min(50, Number(req.query.limit) || 20);
  const [items, total] = await Promise.all([
    Purchase.find({ userId: req.authUser._id }).populate("bookId").populate("orderId", "paymentStatus").sort({ purchasedAt: -1 }).skip((page - 1) * limit).limit(limit),
    Purchase.countDocuments({ userId: req.authUser._id })
  ]);
  res.json({
    items: items.filter((p: any) => p.bookId).map((p: any) => ({
      purchase: { _id: p._id, purchasedAt: p.purchasedAt, amountPaid: p.amountPaid, entitlementStatus: p.entitlementStatus, paymentStatus: p.orderId?.paymentStatus },
      book: publicBook(p.bookId)
    })),
    page,
    total,
    totalPages: Math.ceil(total / limit) || 1
  });
}));

app.get("/api/student/purchases", studentAuth, asyncRoute(async (req, res) => {
  const items = await Purchase.find({ userId: req.authUser._id }).populate("bookId").sort({ purchasedAt: -1 });
  res.json({ items });
}));

app.get("/api/student/orders", studentAuth, asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1), limit = Math.min(50, Number(req.query.limit) || 20);
  const [items, total] = await Promise.all([
    Order.find({ userId: req.authUser._id }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select("items subtotal discount totalAmount currency paymentStatus razorpayOrderId razorpayPaymentId paymentVerifiedAt createdAt updatedAt"),
    Order.countDocuments({ userId: req.authUser._id })
  ]);
  res.json({ items, page, total, totalPages: Math.ceil(total / limit) || 1 });
}));

const downloadBook = asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.bookId)) return res.sendStatus(404);
  const purchase = await Purchase.findOne({ userId: req.authUser._id, bookId: req.params.bookId, entitlementStatus: "active" }).populate("orderId");
  const order: any = purchase?.orderId;
  if (!purchase || !order || !canDownload({ userId: String(req.authUser._id), purchaseUserId: String(purchase.userId), entitlementStatus: purchase.entitlementStatus, paymentStatus: order.paymentStatus })) {
    return res.status(403).json({ error: "A valid purchase is required to download this eBook" });
  }
  const book = await Book.findOne({ _id: req.params.bookId, status: "published" });
  if (!book?.pdfStorageKey) return res.status(404).json({ error: "The eBook file is not available" });
  const filename = book.pdfOriginalFilename || book.pdfFileName || `${book.slug}.pdf`;
  const url = await signPdfDownload(book.pdfStorageKey, filename);
  res.setHeader("Cache-Control", "private,no-store");
  res.json({ url, expiresIn: Math.max(1, Math.min(600, Number(process.env.SIGNED_URL_EXPIRY_SECONDS) || 60)) });
});

app.get("/api/student/download/:bookId", studentAuth, downloadBook);
app.get("/api/books/:bookId/download", studentAuth, downloadBook);

app.get("/api/payments/key", studentAuth, (_req: Request, res: Response) => {
  res.json({
    keyId: process.env.RAZORPAY_KEY_ID || "rzp_test_mock",
    isMock: !razorpay
  });
});

app.get("/api/payments/status/:orderId", studentAuth, asyncRoute(async (req, res) => {
  const order = await Order.findOne({ razorpayOrderId: req.params.orderId, userId: req.authUser._id }).select("paymentStatus totalAmount currency razorpayPaymentId updatedAt");
  if (!order) return res.sendStatus(404);
  if (order.paymentStatus === "paid") await sendOrderEmails(order._id).catch(error => console.error("Purchase email retry failed", error instanceof Error ? error.message : "unknown email error"));
  res.json({ status: order.paymentStatus, amount: order.totalAmount, currency: order.currency, paymentReference: order.razorpayPaymentId, updatedAt: order.updatedAt });
}));

app.post("/api/payments/create-order", studentAuth, asyncRoute(async (req, res) => {
  const b = z.object({ bookIds: z.array(z.string().min(1)).min(1).max(20) }).parse(req.body);
  if (b.bookIds.some(x => !mongoose.isValidObjectId(x))) return res.status(400).json({ error: "Invalid book selection" });
  if (new Set(b.bookIds).size !== b.bookIds.length) return res.status(400).json({ error: "Remove duplicate books from your order" });

  const books = await Book.find({ _id: { $in: b.bookIds }, status: "published", pdfStorageKey: { $exists: true, $nin: ["", null] } });
  if (books.length !== b.bookIds.length) return res.status(400).json({ error: "One or more books are unavailable for purchase" });

  const pending = await Order.findOne({ userId: req.authUser._id, paymentStatus: "pending", "items.bookId": { $in: books.map(b => b._id) } });
  if (pending) {
    const pendingIds = pending.items.map((item: any) => String(item.bookId)).sort();
    const requestedIds = books.map((book: any) => String(book._id)).sort();
    if (pendingIds.length !== requestedIds.length || pendingIds.some((id: string, index: number) => id !== requestedIds[index])) {
      return res.status(409).json({ error: "Finish or refresh your pending payment before changing the selected eBooks" });
    }
    return res.json({ orderId: pending.razorpayOrderId, amount: Math.round(pending.totalAmount * 100), currency: pending.currency, internalOrderId: pending._id, reused: true, isMock: !razorpay });
  }

  const owned = await Purchase.find({ userId: req.authUser._id, bookId: { $in: books.map(b => b._id) } });
  const ownedIds = new Set(owned.map(p => String(p.bookId)));
  const payable = books.filter(b => !ownedIds.has(String(b._id)));
  if (!payable.length) return res.status(409).json({ error: "These books are already in your library" });

  const total = payable.reduce((sum, b) => sum + b.sellingPrice, 0);
  const order = await Order.create({
    userId: req.authUser._id,
    items: payable.map(b => ({ bookId: b._id, title: b.title, amount: b.sellingPrice })),
    subtotal: total,
    discount: 0,
    totalAmount: total,
    currency: "INR",
    paymentStatus: "created"
  });

  if (!razorpay) {
    if (isProd) return res.status(503).json({ error: "Payments are not configured" });
    const mockRzId = `order_mock_${crypto.randomBytes(8).toString("hex")}`;
    order.razorpayOrderId = mockRzId;
    order.paymentStatus = "pending";
    await order.save();
    return res.json({ orderId: mockRzId, amount: Math.round(total * 100), currency: order.currency, internalOrderId: order._id, isMock: true });
  }

  try {
    const rz = await razorpay.orders.create({
      amount: Math.round(total * 100),
      currency: "INR",
      receipt: String(order._id).slice(-40),
      notes: { orderId: String(order._id), userId: String(req.authUser._id) }
    });
    order.razorpayOrderId = rz.id;
    order.paymentStatus = "pending";
    await order.save();
    res.json({ orderId: rz.id, amount: rz.amount, currency: rz.currency, internalOrderId: order._id });
  } catch (error) {
    order.paymentStatus = "failed";
    await order.save();
    throw Object.assign(new Error("Razorpay could not create the order. Please try again."), { status: 502 });
  }
}));

app.post("/api/payments/verify", studentAuth, asyncRoute(async (req, res) => {
  const b = z.object({
    razorpay_order_id: z.string(),
    razorpay_payment_id: z.string(),
    razorpay_signature: z.string().optional()
  }).parse(req.body);

  const order = await Order.findOne({ razorpayOrderId: b.razorpay_order_id, userId: req.authUser._id });
  if (!order) return res.status(404).json({ error: "Order not found" });

  if (b.razorpay_order_id.startsWith("order_mock_") && !isProd) {
    const paymentId = b.razorpay_payment_id || `pay_mock_${crypto.randomBytes(8).toString("hex")}`;
    await processPayment(order.razorpayOrderId!, paymentId);
    return res.json({ ok: true, message: "Payment verified. Your library is ready.", isMock: true });
  }

  const sig = b.razorpay_signature || "";
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "").update(`${b.razorpay_order_id}|${b.razorpay_payment_id}`).digest("hex");
  if (!safeEqual(expected, sig)) return res.status(400).json({ error: "Payment signature is invalid" });
  if (!razorpay) return res.status(503).json({ error: "Payments are not configured" });

  let payment = await razorpay.payments.fetch(b.razorpay_payment_id);
  if (payment.order_id !== order.razorpayOrderId || payment.amount !== Math.round(order.totalAmount * 100) || payment.currency !== order.currency || !( ["captured", "authorized"].includes(payment.status) )) {
    return res.status(400).json({ error: "Payment details could not be verified" });
  }
  if (payment.status === "authorized") {
    await razorpay.payments.capture(b.razorpay_payment_id, payment.amount, order.currency);
    payment = await razorpay.payments.fetch(b.razorpay_payment_id);
  }
  if (payment.status !== "captured") return res.status(409).json({ error: "Payment is still processing. Refresh the payment status shortly." });

  await processPayment(order.razorpayOrderId!, b.razorpay_payment_id);
  res.json({ ok: true, message: "Payment verified. Your library is ready." });
}));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: Math.max(1, Number(process.env.PDF_MAX_SIZE_MB) || 50) * 1024 * 1024, files: 2 } });
const coverUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

app.get("/api/admin/services-status", adminAuth, asyncRoute(async (_req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? "Connected" : "Disconnected";
  const r2Ok = r2Configured();
  const cloudinaryOk = cloudinaryConfigured();
  const razorpayOk = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  const brevoOk = !!(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);

  res.json({
    mongodb: { status: mongoStatus, provider: "MongoDB Atlas" },
    cloudinary: { configured: cloudinaryOk, provider: cloudinaryOk ? "Cloudinary CDN Active" : "Local Disk Storage (Development Mode)" },
    r2: { configured: r2Ok, provider: r2Ok ? `Cloudflare R2 Bucket (${process.env.R2_BUCKET_NAME || "configured"})` : "Local Disk Storage (Development Mode)" },
    razorpay: { configured: razorpayOk, provider: razorpayOk ? "Razorpay Live / Test Active" : "Test Simulation (Development Mode)" },
    brevo: { configured: brevoOk, provider: brevoOk ? `Brevo Active (${process.env.BREVO_SENDER_EMAIL})` : "Console Logger (Development Mode)" }
  });
}));

app.get("/api/admin/dashboard", adminAuth, asyncRoute(async (_req, res) => {
  const [students, books, orders, revenue, recentOrders, bestsellers, recentStudents, availableBooksList, categoriesCount] = await Promise.all([
    User.countDocuments({ role: "student" }),
    Book.countDocuments(),
    Order.countDocuments(),
    Order.aggregate([{ $match: { paymentStatus: "paid" } }, { $group: { _id: null, total: { $sum: "$totalAmount" } } }]),
    Order.find().populate("userId", "name email").sort({ createdAt: -1 }).limit(8),
    Purchase.aggregate([
      { $match: { entitlementStatus: "active" } },
      { $group: { _id: "$bookId", sales: { $sum: 1 } } },
      { $sort: { sales: -1 } },
      { $limit: 5 },
      { $lookup: { from: "books", localField: "_id", foreignField: "_id", as: "book" } },
      { $unwind: "$book" },
      { $project: { _id: 0, title: "$book.title", sellingPrice: "$book.sellingPrice", rating: "$book.rating", sales: 1 } }
    ]),
    User.find({ role: "student" }).sort({ createdAt: -1 }).limit(8).select("name email createdAt"),
    Book.find({ status: "published" }).sort({ rating: -1 }).limit(4).select("title slug category rating sellingPrice"),
    Category.countDocuments()
  ]);
  res.json({
    students,
    books,
    orders,
    categoriesCount,
    revenue: revenue[0]?.total || 0,
    recentOrders,
    bestsellers,
    recentStudents,
    availableBooksList
  });
}));

app.get("/api/admin/books", adminAuth, asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const q = String(req.query.q || "").trim().slice(0, 100);
  const category = String(req.query.category || "").trim();
  const status = String(req.query.status || "").trim();
  const sort = String(req.query.sort || "newest").trim();

  const filter: any = {};
  if (category) filter.category = category;
  if (status && ["draft", "published", "unpublished"].includes(status)) filter.status = status;
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ title: rx }, { author: rx }, { description: rx }];
  }

  const sorts: Record<string, any> = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    title_asc: { title: 1 },
    title_desc: { title: -1 },
    price_asc: { sellingPrice: 1 },
    price_desc: { sellingPrice: -1 },
  };

  const [items, total] = await Promise.all([
    Book.find(filter).sort(sorts[sort] || sorts.newest).skip((page - 1) * limit).limit(limit),
    Book.countDocuments(filter)
  ]);
  res.json({ items: items.map(adminBook), page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
}));

const bookInput = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().min(10).max(5000),
  author: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(100),
  originalPrice: z.number().nonnegative(),
  sellingPrice: z.number().nonnegative(),
  rating: z.number().min(0).max(5).optional(),
  tag: z.string().max(40).optional(),
  pages: z.number().int().nonnegative().optional(),
  subtitle: z.string().max(250).optional(),
  preview: z.array(z.string().max(300)).max(20).optional(),
  tableOfContents: z.array(z.string().max(300)).max(80).optional(),
  status: z.enum(["draft", "published", "unpublished"]).optional()
});

// Single unified create endpoint with cover and PDF file uploads in one flow
app.post("/api/admin/books/create-full", adminAuth, upload.fields([
  { name: "cover", maxCount: 1 },
  { name: "pdf", maxCount: 1 }
]), asyncRoute(async (req, res) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const coverFile = files?.cover?.[0];
  const pdfFile = files?.pdf?.[0];

  const body = req.body;
  const originalPrice = Number(body.originalPrice);
  const sellingPrice = Number(body.sellingPrice);
  const pages = Number(body.pages || 0);

  if (isNaN(originalPrice) || originalPrice < 0) return res.status(400).json({ error: "Original price must be a valid non-negative number" });
  if (isNaN(sellingPrice) || sellingPrice < 0) return res.status(400).json({ error: "Selling price must be a valid non-negative number" });
  if (sellingPrice > originalPrice) return res.status(400).json({ error: "Selling price cannot exceed original price" });
  if (!body.title || body.title.trim().length < 2) return res.status(400).json({ error: "Title must be at least 2 characters long" });
  if (!body.author || body.author.trim().length < 2) return res.status(400).json({ error: "Author is required" });
  if (!body.category || body.category.trim().length < 2) return res.status(400).json({ error: "Category is required" });
  if (!body.description || body.description.trim().length < 10) return res.status(400).json({ error: "Description must be at least 10 characters long" });

  const bookSlug = slug(body.title.trim());
  if (await Book.exists({ slug: bookSlug })) {
    return res.status(409).json({ error: "A book with this title already exists" });
  }

  let status = body.status || "draft";
  if (status === "published" && !pdfFile) {
    return res.status(409).json({ error: "Upload a PDF file before publishing this eBook" });
  }

  let tableOfContents: string[] = [];
  if (body.tableOfContents) {
    tableOfContents = typeof body.tableOfContents === "string"
      ? body.tableOfContents.split("\n").map((s: string) => s.trim()).filter(Boolean)
      : Array.isArray(body.tableOfContents) ? body.tableOfContents : [];
  }

  let preview: string[] = [];
  if (body.preview) {
    preview = typeof body.preview === "string"
      ? body.preview.split("\n").map((s: string) => s.trim()).filter(Boolean)
      : Array.isArray(body.preview) ? body.preview : [];
  }

  let computedTag = body.tag || "";
  if (body.isBestseller === "true" || body.isBestseller === true) computedTag = "Bestseller";
  else if (body.isFeatured === "true" || body.isFeatured === true || body.isNewArrival === "true" || body.isNewArrival === true) computedTag = "New";

  const book = new Book({
    title: body.title.trim(),
    subtitle: body.subtitle?.trim() || "",
    slug: bookSlug,
    author: body.author.trim(),
    category: body.category.trim(),
    originalPrice,
    sellingPrice,
    pages,
    description: body.description.trim(),
    tableOfContents,
    preview,
    tag: computedTag,
    status
  });

  if (coverFile) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(coverFile.mimetype) || coverFile.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: "Cover must be a PNG, JPEG or WebP up to 5 MB" });
    }
    const magic = coverFile.buffer.subarray(0, 12).toString("hex");
    const format = magic.startsWith("89504e47") ? "png" : magic.startsWith("ffd8ff") ? "jpg" : magic.startsWith("52494646") && magic.includes("57454250") ? "webp" : null;
    if (!format) return res.status(400).json({ error: "Image format is invalid" });

    const uploaded = await uploadCover(coverFile.buffer, format);
    book.thumbnailUrl = uploaded.url;
    book.cloudinaryPublicId = uploaded.publicId;
  }

  if (pdfFile) {
    if (path.extname(pdfFile.originalname).toLowerCase() !== ".pdf" || pdfFile.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return res.status(400).json({ error: "File must be a valid PDF format" });
    }
    const key = `ebooks/${book._id}/${crypto.randomUUID()}.pdf`;
    await putPdf(key, pdfFile.buffer);
    book.pdfStorageKey = key;
    book.pdfOriginalFilename = path.basename(pdfFile.originalname).slice(0, 180);
    book.pdfFileName = book.pdfOriginalFilename;
    book.pdfSize = pdfFile.size;
  }

  await book.save();
  await AuditLog.create({
    adminId: req.authUser._id,
    action: "book.create.full",
    targetId: String(book._id),
    details: { title: book.title, hasCover: !!coverFile, hasPdf: !!pdfFile }
  });

  res.status(201).json(adminBook(book));
}));

app.post("/api/admin/books", adminAuth, asyncRoute(async (req, res) => {
  const b = bookInput.parse(req.body);
  if (b.sellingPrice > b.originalPrice) return res.status(400).json({ error: "Selling price cannot exceed original price" });
  if (b.status === "published") return res.status(409).json({ error: "Upload a PDF before publishing this eBook" });
  const bookSlug = slug(b.title);
  if (await Book.exists({ slug: bookSlug })) {
    return res.status(409).json({ error: "A book with this title already exists" });
  }
  const created = await Book.create({ ...b, slug: bookSlug });
  await AuditLog.create({ adminId: req.authUser._id, action: "book.create", targetId: String(created._id), details: { title: created.title } });
  res.status(201).json(adminBook(created));
}));

const updateBook = asyncRoute(async (req, res) => {
  const b = bookInput.partial().parse(req.body);
  const updates: any = { ...b };
  if (b.title) updates.slug = slug(b.title);
  const current = await Book.findById(req.params.id);
  if (!current) return res.sendStatus(404);
  const nextSelling = b.sellingPrice ?? current.sellingPrice;
  const nextOriginal = b.originalPrice ?? current.originalPrice;
  if (nextSelling > nextOriginal) return res.status(400).json({ error: "Selling price cannot exceed original price" });
  if (b.status === "published" && !current.pdfStorageKey) return res.status(409).json({ error: "Upload a PDF before publishing this eBook" });
  const updated = await Book.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!updated) return res.sendStatus(404);
  await AuditLog.create({ adminId: req.authUser._id, action: "book.update", targetId: String(updated._id), details: b });
  res.json(publicBook(updated));
});

app.patch("/api/admin/books/:id", adminAuth, updateBook);
app.put("/api/admin/books/:id", adminAuth, updateBook);

app.patch("/api/admin/books/:id/toggle-bestseller", adminAuth, asyncRoute(async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book) return res.sendStatus(404);
  book.tag = book.tag === "Bestseller" ? "" : "Bestseller";
  await book.save();
  await AuditLog.create({ adminId: req.authUser._id, action: "book.toggle.bestseller", targetId: String(book._id), details: { tag: book.tag } });
  res.json(adminBook(book));
}));

app.patch("/api/admin/books/:id/toggle-new", adminAuth, asyncRoute(async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book) return res.sendStatus(404);
  book.tag = book.tag === "New" ? "" : "New";
  await book.save();
  await AuditLog.create({ adminId: req.authUser._id, action: "book.toggle.new", targetId: String(book._id), details: { tag: book.tag } });
  res.json(adminBook(book));
}));

app.delete("/api/admin/books/:id", adminAuth, asyncRoute(async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book) return res.sendStatus(404);
  const force = req.query.force === "true";
  if (await Purchase.exists({ bookId: book._id })) {
    if (!force) {
      return res.status(409).json({ error: "Books with purchase history cannot be deleted; unpublish the book instead or confirm deletion with force=true." });
    }
    await Purchase.deleteMany({ bookId: book._id });
    await Order.updateMany(
      { "items.bookId": book._id },
      { $pull: { items: { bookId: book._id } } }
    );
  }
  await book.deleteOne();
  if (book.pdfStorageKey && book.pdfStorageKey !== "ebooks/seed-sample.pdf") {
    await deletePdf(book.pdfStorageKey).catch(error => console.error("Deleted book PDF cleanup failed", error instanceof Error ? error.message : "unknown"));
  }
  if (book.cloudinaryPublicId) {
    await deleteCover(book.cloudinaryPublicId).catch(error => console.error("Deleted book cover cleanup failed", error instanceof Error ? error.message : "unknown"));
  }
  await AuditLog.create({ adminId: req.authUser._id, action: "book.delete", targetId: String(book._id) });
  res.json({ ok: true });
}));

app.post("/api/admin/books/:id/upload-pdf", adminAuth, upload.single("file"), asyncRoute(async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Select a PDF file" });
  if (path.extname(file.originalname).toLowerCase() !== ".pdf" || file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return res.status(400).json({ error: "File must be a valid PDF" });
  }
  const book = await Book.findById(req.params.id);
  if (!book) return res.sendStatus(404);
  const oldKey = book.pdfStorageKey;
  const key = `ebooks/${book._id}/${crypto.randomUUID()}.pdf`;
  await putPdf(key, file.buffer);
  book.pdfStorageKey = key;
  book.pdfOriginalFilename = path.basename(file.originalname).slice(0, 180);
  book.pdfFileName = book.pdfOriginalFilename;
  book.pdfSize = file.size;
  try {
    await book.save();
  } catch (error) {
    await deletePdf(key).catch(cleanup => console.error("Storage rollback failed", cleanup instanceof Error ? cleanup.message : "unknown"));
    throw error;
  }
  if (oldKey && oldKey !== "ebooks/seed-sample.pdf") {
    await deletePdf(oldKey).catch(error => console.error("Old PDF cleanup failed", error instanceof Error ? error.message : "unknown"));
  }
  await AuditLog.create({ adminId: req.authUser._id, action: "book.pdf.upload", targetId: String(book._id), details: { size: file.size, filename: book.pdfOriginalFilename } });
  res.json({ fileName: book.pdfOriginalFilename, fileSize: file.size, status: "uploaded" });
}));

app.post("/api/admin/books/:id/upload-cover", adminAuth, coverUpload.single("file"), asyncRoute(async (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: "Select an image" });
  if (!["image/png", "image/jpeg", "image/webp"].includes(f.mimetype) || f.size > 5 * 1024 * 1024) {
    return res.status(400).json({ error: "Cover must be a PNG, JPEG or WebP up to 5 MB" });
  }
  const magic = f.buffer.subarray(0, 12).toString("hex");
  const format = magic.startsWith("89504e47") ? "png" : magic.startsWith("ffd8ff") ? "jpg" : magic.startsWith("52494646") && magic.includes("57454250") ? "webp" : null;
  if (!format) return res.status(400).json({ error: "Image signature is invalid" });
  if ((format === "png" && f.mimetype !== "image/png") || (format === "jpg" && f.mimetype !== "image/jpeg") || (format === "webp" && f.mimetype !== "image/webp")) {
    return res.status(400).json({ error: "Image content does not match its declared format" });
  }
  const book = await Book.findById(req.params.id);
  if (!book) return res.sendStatus(404);
  const uploaded = await uploadCover(f.buffer, format);
  const oldPublicId = book.cloudinaryPublicId;
  book.thumbnailUrl = uploaded.url;
  book.cloudinaryPublicId = uploaded.publicId;
  try {
    await book.save();
  } catch (error) {
    await deleteCover(uploaded.publicId).catch(cleanup => console.error("Cover rollback failed", cleanup instanceof Error ? cleanup.message : "unknown"));
    throw error;
  }
  if (oldPublicId) {
    await deleteCover(oldPublicId).catch(error => console.error("Old cover cleanup failed", error instanceof Error ? error.message : "unknown"));
  }
  await AuditLog.create({ adminId: req.authUser._id, action: "book.cover.upload", targetId: String(book._id), details: { publicId: uploaded.publicId } });
  res.json(adminBook(book));
}));

app.get("/api/admin/students", adminAuth, asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const q = String(req.query.q || "").slice(0, 100);
  const status = String(req.query.status || "").trim();

  const filter: any = { role: "student" };
  if (status && ["active", "suspended"].includes(status)) filter.accountStatus = status;
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  const [items, total] = await Promise.all([
    User.find(filter).select("name email phone accountStatus emailVerified createdAt").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter)
  ]);
  res.json({ items, page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
}));

app.patch("/api/admin/students/:id/status", adminAuth, asyncRoute(async (req, res) => {
  const status = z.enum(["active", "suspended"]).parse(req.body.status);
  const user = await User.findOneAndUpdate({ _id: req.params.id, role: "student" }, { accountStatus: status, isActive: status === "active" }, { new: true }).select("name email accountStatus");
  if (!user) return res.sendStatus(404);
  if (status === "suspended") await Session.deleteMany({ userId: user._id });
  await AuditLog.create({ adminId: req.authUser._id, action: `student.${status}`, targetId: String(user._id) });
  res.json(user);
}));

app.get("/api/admin/students/:id/purchases", adminAuth, asyncRoute(async (req, res) => {
  const items = await Purchase.find({ userId: req.params.id }).populate("bookId", "title slug").populate("orderId", "paymentStatus createdAt").sort({ purchasedAt: -1 });
  res.json({ items });
}));

app.patch("/api/admin/purchases/:id/revoke", adminAuth, asyncRoute(async (req, res) => {
  const p = await Purchase.findByIdAndUpdate(req.params.id, { entitlementStatus: "revoked" }, { new: true });
  if (!p) return res.sendStatus(404);
  await AuditLog.create({ adminId: req.authUser._id, action: "purchase.revoke", targetId: String(p._id), details: { userId: p.userId, bookId: p.bookId } });
  res.json({ ok: true });
}));

app.get("/api/admin/purchases", adminAuth, asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const [items, total] = await Promise.all([
    Purchase.find().populate("userId", "name email").populate("bookId", "title slug").populate("orderId", "paymentStatus razorpayOrderId").sort({ purchasedAt: -1 }).skip((page - 1) * limit).limit(limit),
    Purchase.countDocuments()
  ]);
  res.json({ items, page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
}));

app.get("/api/admin/orders", adminAuth, asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const status = String(req.query.status || "").trim();
  const q = String(req.query.q || "").trim();

  const filter: any = {};
  if (status && ["created", "pending", "paid", "failed", "refunded"].includes(status)) {
    filter.paymentStatus = status;
  }
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [
      { razorpayOrderId: rx },
      { razorpayPaymentId: rx },
      { "items.title": rx }
    ];
  }

  const [items, total] = await Promise.all([
    Order.find(filter).populate("userId", "name email").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments(filter)
  ]);
  res.json({ items, page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
}));

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", details: err.issues.map(x => ({ path: x.path, message: x.message })) });
  if (err instanceof multer.MulterError) return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Upload is too large" : "Upload failed" });
  if (err?.code === 11000) return res.status(409).json({ error: "A record with these details already exists" });
  if (err?.name === "ValidationError") return res.status(400).json({ error: "The submitted data is invalid" });
  const status = Number(err.status) || 500;
  if (status >= 500) console.error("API request failed:", err?.name || "Error", err?.message || "");
  res.status(status).json({ error: status >= 500 ? "Internal server error" : err.message || "Request failed" });
});

if (process.env.NODE_ENV !== "test") {
  bootstrap().then(() => {
    const port = Number(process.env.PORT || 4000);
    app.listen(port, () => console.log(`Classes API listening on ${port}`));
  }).catch(e => {
    const message = e instanceof Error && (e.message.startsWith("Missing required production configuration") || e.message.startsWith("MONGODB_URI is required"))
      ? e.message
      : (e instanceof Error && e.name === "MongooseServerSelectionError"
        ? "Could not connect to MongoDB. Check MONGODB_URI in backend/.env, Atlas network access, and database credentials."
        : (e instanceof Error ? e.name : "Unknown startup error"));
    console.error("API startup failed:", message);
    process.exit(1);
  });
}

export { app, requireAuth, requireAdmin, requireStudent, processPayment };
