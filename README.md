# Mafo.il — Server

REST API for **Mafo.il**, an e-commerce store with a built-in wallet. Users deposit funds through Stripe, buy products with their wallet balance, and track orders that are finalised automatically by scheduled jobs. Admins manage products, moderate reviews and view all orders and transactions.

The companion frontend lives in a separate repository: [FosterSOAsare/mafoil-client](https://github.com/FosterSOAsare/mafoil-client).

---

## Table of contents

- [Tech stack](#tech-stack)
- [Requirements](#requirements)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [npm scripts](#npm-scripts)
- [Project structure](#project-structure)
- [Authentication](#authentication)
- [API reference](#api-reference)
- [Data models](#data-models)
- [Cron jobs](#cron-jobs)
- [Wallet, orders and payments](#wallet-orders-and-payments)
- [Testing](#testing)
- [Building and deployment](#building-and-deployment)
- [Troubleshooting](#troubleshooting)

---

## Tech stack

| Concern            | Library                                                   |
| ------------------ | --------------------------------------------------------- |
| HTTP server        | [Express 4](https://expressjs.com/)                       |
| Database           | MongoDB via [Mongoose 7](https://mongoosejs.com/)         |
| Auth tokens        | `jsonwebtoken` (HS256, 30 day expiry)                     |
| Password hashing   | `bcrypt` 6                                                |
| Payments           | [Stripe Checkout](https://stripe.com/docs/payments/checkout) |
| File uploads       | `multer` (memory storage) → [Cloudinary](https://cloudinary.com/) |
| Email              | `nodemailer` over SMTP (port 465, TLS)                    |
| Scheduled jobs     | `node-cron` 4                                             |
| Security           | `helmet`, `express-rate-limit`, input sanitising middleware |
| Logging            | `morgan` (combined format)                                |
| Tests              | Jest 30 + Supertest + `mongodb-memory-server`             |

## Requirements

- **Node.js 24** — pinned in `.nvmrc` and `package.json` `engines` (run `nvm use` in this folder)
- A **MongoDB** database. A replica set is required (MongoDB Atlas works out of the box), because checkout, cancellations, activation and review moderation use multi-document transactions.
- A **Stripe** account (secret key) for deposits
- A **Cloudinary** account for product images
- An **SMTP** mailbox for verification, password-reset and contact emails

## Getting started

```bash
git clone https://github.com/FosterSOAsare/mafoil-server.git
cd mafoil-server
npm install
cp .env.example .env     # then fill in the values (see below)
npm run dev              # starts on http://localhost:8000 and restarts on file changes
```

Check it is running:

```bash
curl http://localhost:8000/health
# {"status":"ok","database":"connected"}
```

The server checks its environment variables at startup: it exits if `MONGO_URL` or `SECRET` is missing, and warns about any optional ones that are unset.

The [client](https://github.com/FosterSOAsare/mafoil-client) calls this API directly at `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`), so run both together during development. In production the client's origin must be in the CORS allow-list (see [CORS](#cors)).

## Environment variables

Create `server/.env` (it is git-ignored). Variables actually read by the code:

| Variable                | Required | Description |
| ----------------------- | :------: | ----------- |
| `MONGO_URL`             | ✅ | MongoDB connection string. |
| `SECRET`                | ✅ | Secret used to sign and verify JWTs. Use a long random string (32+ characters). |
| `CLIENT_URL`            | ✅ | Public URL of the frontend, e.g. `http://localhost:3000`. Used for Stripe success/cancel redirects. |
| `stripe_key`            | ✅ | Stripe **secret** key (`sk_test_…` / `sk_live_…`). |
| `cloudinary_cloud_name` | ✅ | Cloudinary cloud name. |
| `cloudinary_api_key`    | ✅ | Cloudinary API key. |
| `cloudinary_api_secret` | ✅ | Cloudinary API secret. |
| `SMTP_HOST`             | ✅ | SMTP server host (connection uses port 465 with TLS). |
| `EMAIL_ADDRESS`         | ✅ | SMTP username, also used as the `From` address. |
| `EMAIL_PASSWORD`        | ✅ | SMTP password / app password. |
| `SUPPORT_EMAIL`         | ✅ | Inbox that receives messages from the contact form. |
| `PORT`                  |    | Port to listen on. Defaults to `8000`. |
| `NODE_ENV`              |    | Set to `production` to enable the production CORS allow-list. |
| `RUN_CRONS`             |    | Set to `false` to stop this instance running the scheduled jobs (useful when running more than one instance). Defaults to running them. |

`.env.example` contains every variable with a short comment.

Generate a strong secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## npm scripts

| Script          | What it does |
| --------------- | ------------ |
| `npm run dev`   | Runs `src/server.js` with `node --watch` (auto-restart on changes). |
| `npm start`     | Runs `src/server.js`. This is what the hosting platform runs. |
| `npm test`      | Runs the Jest test suite once (see [Testing](#testing)). |
| `npm run test:watch` | Runs Jest in watch mode. |

## Project structure

```
server/
├── src/
│   ├── server.js                 # Entry point: creates HTTP server, connects DB, starts crons
│   ├── app.js                    # Express app: helmet, JSON, sanitising, CORS, /api router, /health, errors
│   ├── routes/
│   │   ├── index.js              # Mounts every router under /api
│   │   ├── auth/                 # Login, register, email verification, password reset
│   │   ├── user/                 # Profile, password, wallet (activate, deposit, withdraw)
│   │   ├── products/             # Product catalogue + admin CRUD
│   │   ├── reviews/              # Product reviews + admin moderation
│   │   ├── cart.route.js         # Cart storage and checkout
│   │   ├── orders.route.js       # Orders, cancellation, admin listing
│   │   ├── transactions.route.js # Wallet transaction history
│   │   ├── wishlist.route.js
│   │   ├── notifications.route.js
│   │   ├── newsletter.route.js
│   │   ├── contact.route.js      # Sends contact-form emails to SUPPORT_EMAIL
│   │   └── file.route.js         # Image upload/delete via Cloudinary
│   ├── middlewares/
│   │   ├── user.middleware.js    # Verifies the JWT and loads the user into req.user
│   │   ├── admin.middleware.js   # Requires req.user.is_admin
│   │   ├── sanitize.middleware.js # Strips MongoDB operator keys ($gt, $ne, …) from all input
│   │   └── error.middleware.js   # Converts thrown errors into { error: message } JSON
│   ├── schemas/                  # Mongoose models (User, Product, Order, Cart, …)
│   ├── cron-jobs/                # Scheduled background jobs (see below)
│   ├── libs/                     # mongoose, env check, cloudinary, multer, nodemailer setup
│   ├── email-templates/          # HTML templates with {{ PLACEHOLDER }} tokens
│   └── utils/                    # Helpers: validation, money, HTTP errors, slugs, codes, templates
├── tests/                        # Jest suite (in-memory MongoDB, faked Stripe/Cloudinary/SMTP)
├── jest.config.js
├── Dockerfile
└── .env.example
```

## Authentication

1. **Register** — `POST /api/auth/register` creates an unverified, not-yet-activated user and emails a 6-digit code. Emails are stored lowercase and must be unique; passwords must be 8 characters to 72 bytes.
2. **Verify email** — `POST /api/auth/verifyEmail` with `mode: "accountverification"` marks the account as verified. Unverified accounts are deleted after 2 hours by a cron job.
3. **Login** — `POST /api/auth/login` returns the user and a JWT (`token`). A wrong password and an unknown email return the same error. Logging in to an unverified account sends a fresh code and returns `401`.
4. **Authenticated requests** — send the token as a header:

   ```
   Authorization: Bearer <token>
   ```

   `user.middleware.js` verifies the token with `SECRET` and loads the user from MongoDB into `req.user` for the rest of the request.
5. **Admin routes** additionally pass through `admin.middleware.js`, which checks `is_admin`.

**Creating an admin:** there is no endpoint for it. `is_admin` defaults to `false` and is immutable through Mongoose, so set it directly in the database, e.g. in `mongosh`:

```js
db.users.updateOne({ email: "admin@example.com" }, { $set: { is_admin: true } })
```

Reset and resend requests return the same response whether or not an account exists, so they can't be used to discover registered emails.

**Password reset flow:** `POST /auth/resetPassword` emails a code → `POST /auth/verifyEmail` with `mode: "resetpassword"` returns a reset `code` → `POST /auth/confirmReset` with `email`, `code` and `newPassword` sets the new password.

## API reference

All routes are prefixed with `/api`. Errors are returned as `{ "error": "message" }` with an appropriate status code: 400 for invalid input, 401/403 for auth, 404 not found, 409 conflicts (already done or duplicate), 429 rate limited. Unexpected 500 errors return a generic message. List endpoints accept `?page=` and `?limit=` (max 100).

Auth column: **—** public, **User** requires a valid JWT, **Admin** requires a JWT for an admin user.

### Auth — `/api/auth`

| Method | Path             | Auth | Body / notes |
| ------ | ---------------- | :--: | ------------ |
| POST   | `/register`      | —    | `{ email, password, fullname, referrer? }` — `referrer` is another user's id. |
| POST   | `/login`         | —    | `{ email, password }` → user fields + `token`. |
| POST   | `/verifyEmail`   | —    | `{ email, code, mode }` — `mode` is `accountverification` or `resetpassword`. |
| POST   | `/resendEmail`   | —    | `{ email, mode }` |
| POST   | `/resetPassword` | —    | `{ email }` — sends a reset code. |
| POST   | `/confirmReset`  | —    | `{ email, code, newPassword }` |
| POST   | `/changePassword`| —    | `{ email, password, newPassword }` |
| GET    | `/user`          | User | Current user. |
| GET    | `/logout`        | User | Confirms logout. Auth is a stateless JWT, so the client discards the token. |

### User & wallet — `/api/user`

| Method | Path                 | Auth | Body / notes |
| ------ | -------------------- | :--: | ------------ |
| GET    | `/`                  | User | Current user (`email, fullname, activated, _id, balance, is_admin, subscribed`). |
| PUT    | `/details`           | User | `{ fullname }` |
| PUT    | `/password`          | User | `{ oldpassword, newpassword }` |
| DELETE | `/`                  | User | Deletes the account. |
| PUT    | `/newsletter`        | User | `{ subscription: boolean }` — subscribes or unsubscribes the user's own email. |
| GET    | `/activate`          | User | Activates the account for a GH₵40 fee; credits the referrer GH₵3. |
| POST   | `/withdraw`          | User | `{ amount: number, address }` — holds the amount and creates a **pending** withdrawal for an admin to approve or reject. |
| POST   | `/deposit-checkout`  | User | `{ amount }` in USD ($1–$10,000, whole cents) → `{ url }` of a Stripe Checkout session tied to the user. |
| PUT    | `/validate-checkout` | User | `{ sessionId }` — credits the wallet once Stripe reports the session as paid. Each session is credited once, and only to the user who created it. |

### Products — `/api/products`

| Method | Path                         | Auth  | Notes |
| ------ | ---------------------------- | :---: | ----- |
| GET    | `/`                          | —     | Query: `category`, `page` (default 1), `size` (default 12, max 100) → `{ data, nextPage }`. |
| GET    | `/search`                    | —     | Query: `searchText` (matched literally, max 100 characters, up to 48 results). Without it, returns 12 random products. |
| GET    | `/categories`                | —     | Product counts per category (`cloth`, `shoe`, `bag`, `accessories`, `all`). |
| GET    | `/:slugname`                 | —     | Single product. |
| GET    | `/:slugname/recommendations` | —     | Up to 4 products from the same category. |
| GET    | `/edit/:slugname`            | Admin | Product data for the edit form. |
| POST   | `/recents`                   | —     | `{ recents: [slugname, …] }` (up to 20) → matching products. |
| POST   | `/`                          | Admin | `{ name, price, category, store, short_desc, long_desc, images }` — validated; the slug is generated from the name (letters, digits and hyphens only). |
| PUT    | `/:slugname`                 | Admin | Same body as create. Renaming regenerates the slug. |
| DELETE | `/:id`                       | Admin | Product id or slug. Deletes the product and its Cloudinary images, and removes it from carts and wishlists. |

### Reviews — `/api/reviews`

| Method | Path          | Auth  | Notes |
| ------ | ------------- | :---: | ----- |
| GET    | `/pending`    | Admin | Reviews awaiting moderation. |
| GET    | `/:slugname`  | —     | Accepted reviews for a product. |
| POST   | `/:slugname`  | User  | `{ title, rating (whole number 1–5), comment }` — stored as `pending`. One review per user per product. |
| PUT    | `/:reviewId`  | Admin | `{ status: "accepted" \| "rejected" }` — only pending reviews; accepting updates the product's rating. |

### Cart — `/api/cart`

| Method | Path        | Auth | Notes |
| ------ | ----------- | :--: | ----- |
| GET    | `/`         | User | Cart with populated products and counts. |
| POST   | `/`         | User | `{ cart: [{ id, count }, …] }` — replaces the stored cart. |
| GET    | `/checkout` | User | Pays for the cart from the wallet and creates an order. Requires an activated account. |

### Orders — `/api/orders`

| Method | Path               | Auth  | Notes |
| ------ | ------------------ | :---: | ----- |
| GET    | `/`                | User  | Latest 20 of the user's orders. Query: `filter` (`all`, `pending`, `completed`, `cancelled`). |
| GET    | `/admin`           | Admin | All orders. Query: `filter`. |
| GET    | `/:orderId`        | User  | Order details with items and progress `step` (1–5). Only the owner (or an admin) can view it. |
| POST   | `/cancel/:orderId` | User  | Refunds a pending order within the first 10% of its duration. |

### Transactions — `/api/transactions`

| Method | Path     | Auth  | Notes |
| ------ | -------- | :---: | ----- |
| GET    | `/`      | User  | Latest 20 of the user's transactions. Query: `filter` (status). |
| GET    | `/admin` | Admin | All transactions. |
| GET    | `/:id`   | Admin | Single transaction, including the user's name and email. |
| PUT    | `/:id/approve` | Admin | Approves a pending withdrawal (marks it completed). |
| PUT    | `/:id/reject`  | Admin | Rejects a pending withdrawal and refunds the held amount. |

### Other routes

| Method | Path                                   | Auth | Notes |
| ------ | -------------------------------------- | :--: | ----- |
| GET    | `/api/wishlist`                        | User | Wishlist with populated products. |
| POST   | `/api/wishlist`                        | User | `{ wishlist: [productId, …] }` — replaces the stored wishlist. |
| GET    | `/api/notifications`                   | User | User's notifications, unread first. |
| PUT    | `/api/notifications/:notificationId/read` | User | Marks one of the user's notifications as read. |
| GET    | `/api/newsletters/all`                 | Admin | All newsletter subscriptions. |
| POST   | `/api/newsletters`                     | User | `{ email, moderation? }` — subscribes any valid email; `moderation: "unsub"` only works for the user's own email. |
| POST   | `/api/contact`                         | —    | `{ title, email, message, ticket? }` — emails `SUPPORT_EMAIL`. Limited to 5 messages per hour per IP. |
| POST   | `/api/files`                           | Admin | `multipart/form-data` with a `file` field (JPEG/PNG/WebP/GIF/AVIF, max 5 MB) → `{ url, public_id }` from Cloudinary (folder `mafoil`). |
| DELETE | `/api/files`                           | Admin | Query: `public_id` (must be inside `mafoil/`). |
| GET    | `/health`                              | —    | `200` while the database is connected, `503` otherwise (no `/api` prefix). |

## Data models

Defined in [`src/schemas`](src/schemas). All models except Cart and Wishlist have `createdAt`/`updatedAt` timestamps. Unique indexes: `User.email`, `Product.slugname`, `Newsletter.email`, `Transaction.session`, `Cart.user`, `Wishlist.user`, `Review { user, product }`. Status and type fields are restricted to the values listed below.

| Model          | Key fields |
| -------------- | ---------- |
| `User`         | `email`, `password` (bcrypt), `code` (hashed verification code), `verified`, `fullname`, `referrer`, `balance`, `activated`, `is_admin` (immutable) |
| `Product`      | `name`, `slugname`, `price`, `old_price`, `short_desc`, `long_desc`, `category`, `store`, `images[{ public_id, url }]`, `rating{ totalRatings, avgRating, accumulatedRating }`, `itemsSold`, `inStock` |
| `Cart`         | `user`, `cart[{ itemId, count }]` |
| `Order`        | `user`, `cart[{ itemId, count, price, profitPercent, totalItemsProfit }]`, `totalPrice`, `totalProfit`, `avgProfitPercent`, `status` (`pending`/`completed`/`cancelled`), `endDate`, `completionDate` |
| `Transaction`  | `user`, `type` (`deposit`/`withdraw`), `status` (`pending`/`completed`/`cancelled`), `amount`, `desc`, `address`, `session` (Stripe session id) |
| `Review`       | `user`, `product`, `name`, `email`, `title`, `comment`, `rating`, `status` (`pending`/`accepted`/`rejected`) |
| `Notification` | `user`, `link`, `desc`, `status` (`unread`/`read`) |
| `Wishlist`     | `user`, `wishlist[productId]` |
| `Newsletter`   | `email`, `status` (`active`/`inactive`) |

## Cron jobs

Started from `server.js` after the database connects (see [`src/cron-jobs/index.js`](src/cron-jobs/index.js)), unless `RUN_CRONS=false`. Each job runs **once a minute**, and a run is skipped while the previous one is still going:

| Job                          | What it does |
| ---------------------------- | ------------ |
| `delete-unverified-users`    | Deletes users who have not verified their email within 2 hours of registering. |
| `finalise-order`             | Completes every overdue `pending` order (in batches of 100), credits price + profit to the user's balance, and records a deposit transaction and a notification. Each order is paid exactly once. |
| `delete-read-notifications`  | Deletes notifications that are read and older than 48 hours. |

## Wallet, orders and payments

- **Currency:** balances are stored in Ghana cedis (GH₵). Stripe deposits are made in USD and converted at a fixed rate of **12.78** in `user.controller.js`.
- **Deposits:** the client calls `/user/deposit-checkout`, redirects to Stripe, and Stripe returns to `CLIENT_URL/account/transactions?status=deposit&session_id=…`. The client then calls `/user/validate-checkout` to credit the wallet.
- **Withdrawals:** the amount is deducted when requested and the withdrawal stays `pending` until an admin approves it (payout sent) or rejects it (amount refunded) from `/admin/transactions`.
- **Checkout:** `/cart/checkout` charges the wallet for the cart total and creates an order that runs for **3–5 days**, with a random **5–7%** profit per item.
- **Cancellation:** pending orders can be refunded during the first 10% of their duration.
- **Finalisation:** the `finalise-order` cron completes orders whose end date has passed and credits price + profit.
- **Activation:** new users must pay a one-time GH₵40 fee with `/user/activate` before checking out; the referrer receives GH₵3.
- **Concurrency:** every money operation is a single conditional update inside a MongoDB transaction, so concurrent requests can't double-spend, double-refund or double-credit.

## Testing

The Jest suite in [`tests/`](tests) runs the real Express app against an in-memory MongoDB replica set ([`mongodb-memory-server`](https://github.com/typegoose/mongodb-memory-server)). Stripe, Cloudinary and SMTP are replaced with fakes ([`tests/mocks.js`](tests/mocks.js)), so the tests never touch a real database, payment, upload or email.

```bash
npm test             # single run
npm run test:watch   # watch mode
```

The first run downloads a MongoDB binary (about 100 MB), which is then cached. The suites cover the wallet (including concurrent requests), access control, auth, products, reviews, wishlist, cron jobs and error handling.

## Building and deployment

### Render

Build command `npm install`, start command `npm start`. Set the environment variables in the dashboard with `NODE_ENV=production`, and point Render's health check at `/health`.

### Docker

The [`Dockerfile`](Dockerfile) (based on `node:24-slim`) installs production dependencies, copies `src/`, runs as the unprivileged `node` user and has a `HEALTHCHECK` on `/health`. Environment variables are supplied at runtime and never baked into the image:

```bash
docker build -t mafoil-server .
docker run --env-file .env -p 8000:8000 mafoil-server
```

### CORS

In production (`NODE_ENV=production`) only `https://mafoil.vercel.app` and `https://crons-gd5m.onrender.com` are allowed origins. In development every origin is allowed. Update the list in [`src/app.js`](src/app.js) when the frontend URL changes.

## Troubleshooting

| Problem | Fix |
| ------- | --- |
| `Cannot find module …` on start | Run `npm install`. Make sure you are on Node 24 (`nvm use`). |
| `Transaction numbers are only allowed on a replica set member or mongos` | Use a replica set (e.g. MongoDB Atlas or a local single-node replica set). |
| Every authenticated request returns `401` | Check the `Authorization: Bearer <token>` header, and that `SECRET` matches the one used to sign the token. |
| Server exits with `Missing required environment variables` | Set `MONGO_URL` and `SECRET` (see `.env.example`). |
| A unique index fails to build on startup (`E11000` in the logs) | Existing documents have duplicate values (e.g. two users with the same email). Remove the duplicates, then restart. |
| Verification emails are not sent | Check the SMTP variables; the transport uses port 465 with TLS. |
| Deposits never reach the wallet | Check `stripe_key` and `CLIENT_URL`; the wallet is only credited after the client calls `/user/validate-checkout`. |
