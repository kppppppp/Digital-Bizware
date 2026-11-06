type Recipient = { email: string; name?: string };
const apiKey = () => process.env.BREVO_API_KEY;
const sender = () => ({ email: process.env.BREVO_SENDER_EMAIL || "", name: process.env.BREVO_SENDER_NAME || "Classes" });
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function template(title: string, content: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f8;font-family:Arial,sans-serif;color:#14234f"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="padding:24px 32px;background:#10245b;color:#ffc629;font-weight:bold;letter-spacing:2px">CLASSES</td></tr><tr><td style="padding:32px"><h1 style="font-size:24px;margin:0 0 18px;color:#10245b">${title}</h1>${content}<p style="font-size:13px;color:#667085;margin-top:30px">Digital editions for curious minds.</p></td></tr></table></td></tr></table></body></html>`;
}

export async function sendTransactional(to: Recipient, subject: string, htmlContent: string, textContent: string) {
  if (!apiKey() || !sender().email) throw new Error("Brevo transactional email is not configured");
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey()!,
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify({ sender: sender(), to: [to], subject, htmlContent, textContent }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const status = response.status;
    response.text().then(body => {
      console.error(`[BREVO ERROR] Status ${status}:`, body);
    }).catch(() => {});
    throw new Error(`Brevo email delivery failed (HTTP ${status})`);
  }
}

export async function sendWelcome(to: Recipient, loginUrl: string) {
  const name = escapeHtml(to.name || "there");
  await sendTransactional(to, "Welcome to Classes", template("Welcome to Classes", `<p>Hello ${name},</p><p>Your Classes account is ready. Sign in to explore practical eBooks and keep your purchases together.</p><p><a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#ffc629;color:#10245b;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Sign in to Classes</a></p>`), `Welcome to Classes. Sign in: ${loginUrl}`);
}

export async function sendVerification(to: Recipient, verifyUrl: string) {
  const name = escapeHtml(to.name || "there");
  await sendTransactional(to, "Verify your Classes account", template("Verify your email address", `<p>Hello ${escapeHtml(to.name || "there")},</p><p>Please verify your email within 24 hours to activate your Classes account.</p><p><a href="${escapeHtml(verifyUrl)}" style="display:inline-block;background:#ffc629;color:#10245b;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Verify email</a></p>`), `Verify your email within 24 hours: ${verifyUrl}`);
}

export async function sendPasswordReset(to: Recipient, resetUrl: string) {
  const name = escapeHtml(to.name || "there");
  await sendTransactional(to, "Reset your Classes password", template("Reset your password", `<p>Hello ${escapeHtml(to.name || "there")},</p><p>Use the secure link below to choose a new password. It expires in one hour and can be used once.</p><p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#ffc629;color:#10245b;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Choose a new password</a></p><p>If you did not request this, you can ignore this email.</p>`), `Reset your password within one hour: ${resetUrl}`);
}

export async function sendPurchaseConfirmation(to: Recipient, details: { name: string; titles: string; amount: number; orderRef: string; date: string; libraryUrl: string }) {
  const html = template("Your eBook purchase is confirmed", `<p>Hello ${escapeHtml(details.name)},</p><p>Your payment was verified and your eBook is ready in your library.</p><table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:8px 0">eBook(s)</td><td style="padding:8px 0;text-align:right">${escapeHtml(details.titles)}</td></tr><tr><td style="padding:8px 0">Amount paid</td><td style="padding:8px 0;text-align:right">₹${details.amount.toLocaleString("en-IN")}</td></tr><tr><td style="padding:8px 0">Order reference</td><td style="padding:8px 0;text-align:right">${escapeHtml(details.orderRef)}</td></tr><tr><td style="padding:8px 0">Purchase date</td><td style="padding:8px 0;text-align:right">${escapeHtml(details.date)}</td></tr></table><p><a href="${escapeHtml(details.libraryUrl)}" style="display:inline-block;background:#ffc629;color:#10245b;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Open My Library</a></p><p>Sign in to Classes and select Download eBook from your library.</p>`);
  await sendTransactional(to, "Your Classes eBook purchase is confirmed", html, `Purchase confirmed: ${details.titles}. Paid ₹${details.amount}. Order ${details.orderRef}. Open your library: ${details.libraryUrl}`);
}

export async function sendAdminOrder(to: Recipient, details: { name: string; email: string; titles: string; amount: number; orderRef: string }) {
  const html = template("A new Classes order was verified", `<p>A payment has been verified.</p><p><strong>Student:</strong> ${escapeHtml(details.name)} (${escapeHtml(details.email)})<br><strong>eBook(s):</strong> ${escapeHtml(details.titles)}<br><strong>Amount:</strong> ₹${details.amount.toLocaleString("en-IN")}<br><strong>Order:</strong> ${escapeHtml(details.orderRef)}</p>`);
  await sendTransactional(to, "New verified Classes order", html, `Verified order ${details.orderRef}: ${details.titles}, ₹${details.amount}, student ${details.email}`);
}
