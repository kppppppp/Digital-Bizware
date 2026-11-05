# Setup and deployment

Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`. Do not commit environment files. The backend validates the complete integration configuration before starting in production; missing names are reported without printing any values.

## MongoDB Atlas

1. Create an Atlas project and cluster.
2. Create a dedicated database user with read/write access to the Classes database.
3. Add the Render backend's outbound IP addresses to the Atlas network access list, or use a controlled network policy appropriate to your Render plan.
4. Copy the connection string into `MONGODB_URI` in Render. Keep credentials out of frontend configuration.

Mongoose creates the indexes for unique email, slug, Razorpay identifiers, purchase ownership and webhook event IDs at startup. Purchase grants use MongoDB transactions; use an Atlas replica-set cluster (Atlas clusters are replica sets).

## Cloudinary: covers and thumbnails

1. Create a Cloudinary account and copy its cloud name and API key/secret from the dashboard.
2. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the backend environment only.
3. Admin image uploads accept PNG, JPEG and WebP up to 5 MB, validate the signature, and upload into `classes/books`.
4. The database stores the secure Cloudinary URL and public ID. Replacements update MongoDB first, then remove the previous Cloudinary asset. Book deletion removes the image when no purchase history exists.

Cloudinary's server-side upload and asset management use the [official Node.js SDK](https://cloudinary.com/documentation/node_integration).

## Cloudflare R2: private PDFs

1. Create an R2 bucket and leave public access disabled.
2. Create an R2 API token scoped to that bucket with object read, write and delete permissions.
3. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, and `R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`. `R2_REGION=auto` is required by the S3 SDK.
4. Set `PDF_MAX_SIZE_MB=50` and `SIGNED_URL_EXPIRY_SECONDS=60` (the API clamps signed URL expiry to ten minutes maximum).

PDF uploads check the `.pdf` extension and `%PDF-` signature, use unique `ebooks/{bookId}/{uuid}.pdf` keys, and store only the object key in MongoDB. Replacements save the new R2 key before deleting the old object. Students receive a signed GET URL only after server-side authentication, purchase ownership, paid order, active entitlement and published-book checks. The API never returns a permanent PDF URL or R2 credentials. See [Cloudflare's S3-compatible API setup](https://developers.cloudflare.com/r2/get-started/s3/) and [presigned URL guide](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).

## Razorpay

1. Enable test mode and create test API keys. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in the backend; the key ID is public and is returned by the backend to Checkout, while the secret stays server-side.
2. Add a webhook pointing to `https://<backend-host>/api/webhooks/razorpay` and copy its secret to `RAZORPAY_WEBHOOK_SECRET`.
3. Subscribe to `payment.captured`, `order.paid`, `payment.failed`, and `refund.processed` (or `payment.refunded`).
4. For local testing, expose the local backend with a trusted HTTPS tunnel and use that URL as the test webhook endpoint. Never test with live payments.

The API calculates prices from MongoDB, binds orders to the authenticated user, validates callback HMAC, fetches the payment from Razorpay, and confirms captured status before granting access. Webhooks use the original raw body for HMAC and deduplicate using Razorpay's event ID. Database transactions and unique indexes make grants idempotent across callbacks and webhook retries. See the [Razorpay webhook and payment security docs](https://razorpay.com/docs/webhooks/).

## Brevo transactional email

1. Create a Brevo API key and verify a sender identity/domain in Brevo.
2. Set `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, optional `BREVO_SENDER_NAME`, and `ADMIN_NOTIFICATION_EMAIL` in the backend environment.
3. The app sends responsive HTML and text alternatives for welcome, email verification, password reset, purchase confirmation and admin new-order notification messages.

Brevo sends through its [transactional email API](https://developers.brevo.com/reference/send-transac-email). Message failures are logged without reverting paid orders or purchases. Per-order notification markers prevent duplicate confirmations; refreshing a paid order status retries any message whose delivery failed.

## Local development

1. Install from the repository root: `npm install`.
2. For a local database only, start the replica set with `docker compose up -d` (or use Atlas). Docker is optional when `MONGODB_URI` points to Atlas.
3. Set `MONGODB_URI`, `FRONTEND_URL=http://localhost:3000`, `ADMIN_URL=http://localhost:3001`, and `BACKEND_URL=http://localhost:4000` in `backend/.env`.
4. Configure the service credentials in `backend/.env`. With services absent, their relevant upload, payment, or email action reports that the service is unavailable; the API still starts for catalog and UI work.
5. Set `NEXT_PUBLIC_API_URL=http://localhost:4000/api` in `frontend/.env.local`.
6. Run both apps with `npm run dev`, or start separately with `npm run dev:frontend` and `npm run dev:backend`.
7. Create the first administrator with `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PHONE`, and `ADMIN_PASSWORD` in the backend environment, then run `npm run seed:admin --workspace @classes/backend`. Remove the temporary password after setup. Public registration always creates a student.

## Vercel: frontend

Create two Vercel projects from this monorepo: one for the `frontend` workspace and one for `admin`. Configure both with `NEXT_PUBLIC_API_URL=https://<backend-host>/api`. Set `NEXT_PUBLIC_ADMIN_URL=https://<admin-host>` on the storefront. Set `FRONTEND_URL` and `ADMIN_URL` on the backend to the exact deployed origins. `NEXT_PUBLIC_RAZORPAY_KEY_ID` is optional because the backend provides its configured key ID. Never set API secrets in Vercel.

## Render: backend

Build from the repository root so npm can install the shared workspace: `npm --workspace @classes/shared run build && npm --workspace @classes/backend run build`. Start with `npm --workspace @classes/backend run start`. Add all backend environment variables from `backend/.env.example` in Render, set `NODE_ENV=production`, `FRONTEND_URL` to the exact HTTPS storefront origin, and `BACKEND_URL` to the public backend origin. Production startup fails with the names of missing required variables.

## Cookies, CORS and domains

The API permits credentialed requests from the exact `FRONTEND_URL` and `ADMIN_URL` origins and requires the `X-Classes-Request` header for state-changing app requests. Production session cookies are HTTP-only, secure and `SameSite=None` so frontend and API origins can communicate. Use custom domains under the same registrable domain when possible, since browser third-party-cookie restrictions can affect separate hosted domains. If using `COOKIE_DOMAIN`, scope it only to the shared application domain.

## Operations

- Keep Atlas backups enabled and test a restore.
- Keep the R2 bucket private and rotate scoped tokens regularly.
- Configure Razorpay webhook retries and monitor failed deliveries.
- Retain API logs and alert on errors; logs do not include provider secrets or raw reset tokens.
- Render's local filesystem is not used for permanent PDFs.
- A downloaded eBook can be copied by its recipient; the platform controls website access, not redistribution after download.
