import mongoose, { Schema } from "mongoose";

const UserSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  phone: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["student", "admin"], default: "student", immutable: true },
  isActive: { type: Boolean, default: true, index: true },
  accountStatus: { type: String, enum: ["active", "suspended"], default: "active", index: true },
  emailVerified: { type: Boolean, default: false },
  verifyTokenHash: String,
  verifyExpires: Date,
  resetTokenHash: String,
  resetExpires: Date,
}, { timestamps: true });

const SessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

const CategorySchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  description: { type: String, default: "" },
  displayOrder: { type: Number, default: 0 },
}, { timestamps: true });

const BookSchema = new Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, index: true },
  description: { type: String, required: true },
  author: { type: String, required: true },
  category: { type: String, required: true, index: true },
  thumbnailUrl: { type: String, default: "" },
  cloudinaryPublicId: { type: String, default: "" },
  coverImageKey: { type: String, default: "assets/ebook-cover.png" },
  pdfStorageKey: { type: String, default: "" },
  pdfOriginalFilename: String,
  pdfFileName: String,
  pdfSize: Number,
  originalPrice: { type: Number, required: true, min: 0 },
  sellingPrice: { type: Number, required: true, min: 0 },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0 },
  tag: String,
  pages: { type: Number, default: 0 },
  subtitle: String,
  preview: [String],
  tableOfContents: [String],
  status: { type: String, enum: ["draft", "published", "unpublished"], default: "draft", index: true },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

BookSchema.index({ title: "text", author: "text", description: "text" });
BookSchema.index({ status: 1, tag: 1 });
BookSchema.index({ status: 1, category: 1 });
BookSchema.index({ status: 1, rating: -1, reviewCount: -1 });
BookSchema.index({ status: 1, createdAt: -1 });
BookSchema.index({ status: 1, sellingPrice: 1 });
BookSchema.index({ status: 1, sellingPrice: -1 });

const OrderSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  items: [{
    bookId: { type: Schema.Types.ObjectId, ref: "Book", required: true },
    title: String,
    amount: { type: Number, required: true },
  }],
  subtotal: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },
  currency: { type: String, default: "INR", required: true },
  paymentStatus: {
    type: String,
    enum: ["created", "pending", "paid", "failed", "refunded"],
    default: "created",
    index: true,
  },
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  paymentVerifiedAt: Date,
  customerConfirmationSentAt: Date,
  adminNotificationSentAt: Date,
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ razorpayOrderId: 1 }, { unique: true, sparse: true });
OrderSchema.index({ razorpayPaymentId: 1 }, { unique: true, sparse: true });

const PurchaseSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  bookId: { type: Schema.Types.ObjectId, ref: "Book", required: true },
  orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
  paymentId: { type: String, required: true },
  amountPaid: { type: Number, required: true },
  entitlementStatus: {
    type: String,
    enum: ["active", "revoked", "refunded"],
    default: "active",
    index: true,
  },
  purchasedAt: { type: Date, default: Date.now },
}, { timestamps: true });

PurchaseSchema.index({ userId: 1, bookId: 1 }, { unique: true });

const AuditSchema = new Schema({
  adminId: Schema.Types.ObjectId,
  action: String,
  targetId: String,
  details: Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
}, { timestamps: false });

const WebhookEventSchema = new Schema({
  eventId: { type: String, required: true, unique: true },
  eventType: { type: String, required: true },
  processedAt: { type: Date, default: Date.now },
}, { timestamps: false });

export const User = mongoose.models.User || mongoose.model("User", UserSchema);
export const Session = mongoose.models.Session || mongoose.model("Session", SessionSchema);
export const Category = mongoose.models.Category || mongoose.model("Category", CategorySchema);
export const Book = mongoose.models.Book || mongoose.model("Book", BookSchema);
export const Order = mongoose.models.Order || mongoose.model("Order", OrderSchema);
export const Purchase = mongoose.models.Purchase || mongoose.model("Purchase", PurchaseSchema);
export const AuditLog = mongoose.models.AuditLog || mongoose.model("AuditLog", AuditSchema);
export const WebhookEvent = mongoose.models.WebhookEvent || mongoose.model("WebhookEvent", WebhookEventSchema);
