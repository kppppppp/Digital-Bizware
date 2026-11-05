import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "./models.js";

async function main() {
  const name = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL?.toLowerCase()?.trim();
  const phone = process.env.ADMIN_PHONE?.trim() || "9999999999";
  const password = process.env.ADMIN_PASSWORD;

  if (!name || !email || !password) {
    throw new Error("Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD in environment variables first.");
  }

  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters long.");
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is required to create an administrator.");
  }

  await mongoose.connect(mongoUri);

  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role === "admin") {
      console.log(`Admin account already exists for ${email}.`);
      await mongoose.disconnect();
      return;
    } else {
      console.log(`Account with email ${email} already exists as role '${existing.role}'. Updating role to 'admin'...`);
      existing.role = "admin";
      existing.emailVerified = true;
      existing.accountStatus = "active";
      existing.isActive = true;
      existing.passwordHash = await bcrypt.hash(password, 12);
      await existing.save();
      console.log(`Administrator account updated successfully: ${email}`);
      await mongoose.disconnect();
      return;
    }
  }

  await User.create({
    name,
    email,
    phone,
    passwordHash: await bcrypt.hash(password, 12),
    role: "admin",
    emailVerified: true,
    accountStatus: "active",
    isActive: true,
  });

  console.log(`Administrator account created successfully: ${email}`);
  await mongoose.disconnect();
}

main().catch(async e => {
  console.error("Error creating administrator:", e.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

