# Classes eBook Commerce

A full stack digital eBook marketplace with separately hosted storefront, administrator portal, and API.

## Project layout

```text
frontend/        Next.js storefront (port 3000)
admin/           Separate Next.js administrator portal (port 3001)
backend/         Express API (port 4000)
packages/shared  Shared catalogue types and seed data
docs/            Deployment and service setup
```

The admin portal uses the shared Classes admin UI but builds and deploys independently. The API enforces the admin role on all management endpoints.

## Local setup

1. Install dependencies from the repository root:
   ```bash
   npm install
   ```

2. Add your MongoDB Atlas URI and service credentials to `backend/.env`. At minimum, `MONGODB_URI` must be a valid Atlas connection string. In Atlas, add your current IP under Network Access and create a database user.

3. Configure initial admin credentials in `backend/.env`:
   ```env
   ADMIN_NAME=Admin
   ADMIN_EMAIL=admin@gmail.com
   ADMIN_PASSWORD=your_secure_password
   # Optional:
   ADMIN_PHONE=9326990672
   ```

4. Provision the initial administrator account:
   ```bash
   npm run create-admin
   ```
   If the admin account does not exist, it will be created securely in MongoDB Atlas with bcrypt password hashing. If it already exists, the script will clearly report that and safely exit without creating duplicates.

5. Create `frontend/.env.local` from `frontend/.env.example`:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:4000/api
   NEXT_PUBLIC_ADMIN_URL=http://localhost:3001
   ```

6. Create `admin/.env.local` from `admin/.env.example`:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:4000/api
   ```

7. Build all packages:
   ```bash
   npm run build
   ```

8. Start the applications:
   ```bash
   # All three together:
   npm run dev

   # Or in separate terminals:
   npm run dev:backend   # API at http://localhost:4000
   npm run dev:frontend  # Storefront at http://localhost:3000
   npm run dev:admin     # Admin at http://localhost:3001/admin
   ```

## Admin provisioning & credentials

- **Command**: `npm run create-admin`
- **Configuration**:
  - `ADMIN_NAME`: Name of the administrator
  - `ADMIN_EMAIL`: Email address for admin login
  - `ADMIN_PASSWORD`: Minimum 8 characters password
  - `ADMIN_PHONE`: Optional phone number (defaults if omitted)
- **Role Enforcement**: Public student registration (`/api/auth/register`) strictly assigns the `student` role and ignores any client-supplied role values.
- **Session Persistence**: Secured HTTP-only cookies (`classes_session`) with SameSite policy and role-based route guards.

## Build and tests

- `npm run build` compiles shared code, backend TypeScript, storefront, and admin portal.
- `npm test` runs backend authorization, payment security, storage, and scenario tests.

The API verifies authentication, ownership, paid order, published status, and active entitlement before signing a private eBook download URL. Public book responses omit private storage keys. The API recalculates all prices at checkout on the server.

## External services

MongoDB Atlas, Cloudinary, private Cloudflare R2, Razorpay, and Brevo setup for Vercel and Render are documented in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
