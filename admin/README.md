# Classes admin portal

This is a separate Next.js workspace for the Classes administrator portal. It runs on port 3001 and shares the storefront's admin UI and design files while deploying as its own app.

## Run locally

From the repository root, install dependencies and build first:

```powershell
npm install
npm run build
```

Copy `admin/.env.example` to `admin/.env.local`, set `NEXT_PUBLIC_API_URL=http://localhost:4000/api`, then run:

```powershell
npm run dev:admin
```

Open `http://localhost:3001/admin`. The storefront runs separately at `http://localhost:3000`; the backend runs at `http://localhost:4000`. To run the compiled admin server, use `npm start --workspace @classes/admin` from the repository root.

Configure `ADMIN_URL=http://localhost:3001` in `backend/.env`. Create admin accounts using the backend seed command; public signup only creates students.

Deploy the `frontend` and `admin` workspaces as separate Next.js projects, and deploy `backend` as the API service. Set `NEXT_PUBLIC_API_URL` for both frontends, `NEXT_PUBLIC_ADMIN_URL` for the storefront, and `FRONTEND_URL` plus `ADMIN_URL` on the backend.
