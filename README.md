# Mafo.il — Server

REST API for **Mafo.il**, an e-commerce store with a built-in wallet. Users deposit funds through Stripe, buy products with their wallet balance, and track orders that are finalised automatically by scheduled jobs. Admins manage products, moderate reviews and view all orders and transactions.

The companion frontend lives in [`../client`](../client/README.md).

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
| Sessions store     | `express-session` + `connect-mongo`                       |
| Auth tokens        | `jsonwebtoken` (HS256, 30 day expiry)                     |
| Password hashing   | `bcrypt` 6                                                |
| Payments           | [Stripe Checkout](https://stripe.com/docs/payments/checkout) |
| File uploads       | `multer` (memory storage) → [Cloudinary](https://cloudinary.com/) |
| Email              | `nodemailer` over SMTP (port 465, TLS)                    |
| Scheduled jobs     | `node-cron` 4                                             |
| Logging            | `morgan` (combined format)                                |
| Production bundle  | webpack 5 + Babel + `webpack-obfuscator`                  |
| Tests              | Jest 30 + Supertest                                       |

## Requirements

- **Node.js 24** — pinned in `.nvmrc` and `package.json` `engines` (run `nvm use` in this folder)
- A **MongoDB** database. A replica set is required (MongoDB Atlas works out of the box), because checkout, cancellations, activation and review moderation use multi-document transactions.
- A **Stripe** account (secret key) for deposits
- A **Cloudinary** account for product images
- An **SMTP** mailbox for verification, password-reset and contact emails

## Getting started

```bash
cd server
npm install
cp .env.example .env     # then fill in the values (see below)
npm run dev              # starts on http://localhost:8000 and restarts on file changes
```

Check it is running:

```bash
curl http://localhost:8000/
# {"success":true}
```

The client's dev server proxies `/api/*` to `http://localhost:8000`, so run both together during development.

## Environment variables

Create `server/.env` (it is git-ignored). Variables actually read by the code:

| Variable                | Required | Description |
| ----------------------- | :------: | ----------- |
| `MONGO_URL`             | ✅ | MongoDB connection string. Also used for the session store. |
| `SECRET`                | ✅ | Secret used to sign and verify JWTs. Use a long random string. |
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
| `NODE_ENV`              |    | Set to `production` to enable secure cookies and the production CORS allow-list. |

> `.env.example` also lists `JWT_SECRET` and `BASE_URL`. They are not read anywhere in the code — the JWT secret is `SECRET`.

Generate a strong secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## npm scripts

| Script          | What it does |
| --------------- | ------------ |
| `npm run dev`   | Runs `src/server.js` with `node --watch` (auto-restart on changes). |
| `npm run build` | Bundles and obfuscates the app into `dist/main.bundle.js` with webpack. |
| `npm run serve` | Runs the built bundle `dist/main.bundle.js`. |
| `npm start`     | `build` then `serve`. This is what the hosting platform runs. |
| `npm test`      | Runs Jest in **watch mode** (`jest --watch`). Use `npx jest` for a single run. |
| `npm run docker`| Runs `node ./server.js` (legacy; there is no `server.js` at the package root). |

## Project structure

```
server/
├── src/
│   ├── server.js                 # Entry point: creates HTTP server, connects DB, starts crons
│   ├── app.js                    # Express app: JSON, CORS, morgan, session, /api router, error handler
│   ├── routes/
│   │   ├── index.js              # Mounts every router under /api
│   │   ├── auth/                 # Login, register, email verification, password reset
│   │   ├── user/                 # Profile, password, wallet (activate, deposit, withdraw)
│   │   ├── products/             # Product catalogue + admin CRUD (+ products.test.js)
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
│   │   ├── user.middleware.js    # Verifies the JWT and loads the user into req.session.user
│   │   ├── admin.middleware.js   # Requires req.session.user.is_admin
│   │   └── error.middleware.js   # Converts thrown errors into { error: message } JSON
│   ├── schemas/                  # Mongoose models (User, Product, Order, Cart, …)
│   ├── cron-jobs/                # Scheduled background jobs (see below)
│   ├── libs/                     # mongoose, connect-mongo, cloudinary, multer, nodemailer setup
│   ├── email-templates/          # HTML templates with {{ PLACEHOLDER }} tokens
│   └── utils/                    # Small helpers (codes, slugs, time checks, template replace)
├── dist/                         # webpack output (generated by `npm run build`)
├── webpack.config.js
├── Dockerfile
└── .env.example
```

## Authentication

1. **Register** — `POST /api/auth/register` creates an unverified user and emails a 6-digit code.
2. **Verify email** — `POST /api/auth/verifyEmail` with `mode: "accountverification"` marks the account as verified. Unverified accounts are deleted after 2 hours by a cron job.
3. **Login** — `POST /api/auth/login` returns the user and a JWT (`token`). Logging in to an unverified account sends a fresh code and returns `401`.
4. **Authenticated requests** — send the token as a header:

   ```
   Authorization: Bearer <token>
   ```

   `user.middleware.js` verifies the token with `SECRET`, loads the user from MongoDB (without password and code) and stores it on `req.session.user` for the rest of the request.
5. **Admin routes** additionally pass through `admin.middleware.js`, which checks `is_admin`.

**Creating an admin:** there is no endpoint for it. `is_admin` defaults to `false` and is immutable through Mongoose, so set it directly in the database, e.g. in `mongosh`:

```js
db.users.updateOne({ email: "admin@example.com" }, { $set: { is_admin: true } })
```

**Password reset flow:** `POST /auth/resetPassword` emails a code → `POST /auth/verifyEmail` with `mode: "resetpassword"` returns a reset `code` → `POST /auth/confirmReset` with `email`, `code` and `newPassword` sets the new password.

## API reference

All routes are prefixed with `/api`. Errors are returned as `{ "error": "message" }` with an appropriate status code.

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
| GET    | `/logout`        | User | Ends the server session. |

### User & wallet — `/api/user`

| Method | Path                 | Auth | Body / notes |
| ------ | -------------------- | :--: | ------------ |
| GET    | `/`                  | User | Current user (`email, fullname, activated, _id, balance, is_admin, subscribed`). |
| PUT    | `/details`           | User | `{ fullname }` |
| PUT    | `/password`          | User | `{ oldpassword, newpassword }` |
| DELETE | `/`                  | User | Deletes the account. |
| PUT    | `/newsletter`        | User | `{ subscription }` |
| GET    | `/activate`          | User | Activates the account for a GH₵40 fee; credits the referrer GH₵3. |
| POST   | `/withdraw`          | User | `{ amount: number, address }` |
| POST   | `/deposit-checkout`  | User | `{ amount }` in USD → `{ url }` of a Stripe Checkout session. |
| PUT    | `/validate-checkout` | User | `{ sessionId }` — credits the wallet once Stripe reports the session as paid. |

### Products — `/api/products`

| Method | Path                         | Auth  | Notes |
| ------ | ---------------------------- | :---: | ----- |
| GET    | `/`                          | —     | Query: `category`, `page` (default 1), `size` (default 12, `all` for no limit) → `{ data, nextPage }`. |
| GET    | `/search`                    | —     | Query: `searchText`. Without it, returns 12 random products. |
| GET    | `/categories`                | —     | Product counts per category (`cloth`, `shoe`, `bag`, `accessories`, `all`). |
| GET    | `/:slugname`                 | —     | Single product. |
| GET    | `/:slugname/recommendations` | —     | Up to 4 products from the same category. |
| GET    | `/edit/:slugname`            | —     | Product data for the edit form. |
| POST   | `/recents`                   | —     | `{ recents: [slugname, …] }` → matching products. |
| POST   | `/`                          | Admin | `{ name, price, category, store, short_desc, long_desc, images }` — slug is generated from the name. |
| PUT    | `/:slugname`                 | Admin | Same body as create. Renaming regenerates the slug. |
| DELETE | `/`                          | Admin | Query: `slugname`. Currently validates the product but does not delete it. |

### Reviews — `/api/reviews`

| Method | Path          | Auth  | Notes |
| ------ | ------------- | :---: | ----- |
| GET    | `/pending`    | Admin | Reviews awaiting moderation. |
| GET    | `/:slugname`  | —     | Accepted reviews for a product. |
| POST   | `/:slugname`  | User  | `{ title, rating (≤ 5), comment }` — stored as `pending`. |
| PUT    | `/:reviewId`  | Admin | `{ status: "accepted" \| "rejected" }` — accepting updates the product's rating. |

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
| GET    | `/:orderId`        | User  | Order details with items and progress `step` (1–5). |
| POST   | `/cancel/:orderId` | User  | Refunds a pending order within the first 10% of its duration. |

### Transactions — `/api/transactions`

| Method | Path     | Auth  | Notes |
| ------ | -------- | :---: | ----- |
| GET    | `/`      | User  | Latest 20 of the user's transactions. Query: `filter` (status). |
| GET    | `/admin` | Admin | All transactions. |
| GET    | `/:id`   | Admin | Single transaction. |

### Other routes

| Method | Path                                   | Auth | Notes |
| ------ | -------------------------------------- | :--: | ----- |
| GET    | `/api/wishlist`                        | User | Wishlist with populated products. |
| POST   | `/api/wishlist`                        | User | `{ wishlist: [productId, …] }` — replaces the stored wishlist. |
| GET    | `/api/notifications`                   | User | User's notifications, unread first. |
| PUT    | `/api/notifications/:notificationId/read` | User | Marks a notification as read. |
| GET    | `/api/newsletters/all`                 | User | All newsletter subscriptions. |
| POST   | `/api/newsletters`                     | User | `{ email, moderation? }` — `moderation: "unsub"` unsubscribes. |
| POST   | `/api/contact`                         | —    | `{ title, email, message, ticket? }` — emails `SUPPORT_EMAIL`. |
| POST   | `/api/files`                           | —    | `multipart/form-data` with a `file` field → `{ url, public_id }` from Cloudinary (folder `mafoil`). |
| DELETE | `/api/files`                           | User | Query: `public_id`. |

## Data models

Defined in [`src/schemas`](src/schemas). All models except Cart and Wishlist have `createdAt`/`updatedAt` timestamps.

| Model          | Key fields |
| -------------- | ---------- |
| `User`         | `email`, `password` (bcrypt), `code` (hashed verification code), `verified`, `fullname`, `referrer`, `balance`, `activated`, `is_admin` (immutable) |
| `Product`      | `name`, `slugname`, `price`, `old_price`, `short_desc`, `long_desc`, `category`, `store`, `images[{ public_id, url }]`, `rating{ totalRatings, avgRating, accumulatedRating }`, `itemsSold`, `inStock` |
| `Cart`         | `user`, `cart[{ itemId, count }]` |
| `Order`        | `user`, `cart[{ itemId, count, price, profitPercent, totalItemsProfit }]`, `totalPrice`, `totalProfit`, `avgProfitPercent`, `status`, `endDate`, `completionDate` |
| `Transaction`  | `user`, `type` (`deposit`/`withdraw`), `status`, `amount`, `desc`, `address`, `session` (Stripe session id) |
| `Review`       | `user`, `product`, `name`, `email`, `title`, `comment`, `rating`, `status` (`pending`/`accepted`/`rejected`) |
| `Notification` | `user`, `link`, `desc`, `status` (`unread`/`read`) |
| `Wishlist`     | `user`, `wishlist[productId]` |
| `Newsletter`   | `email`, `status` (`active`/`inactive`) |

## Cron jobs

Started from `server.js` once the server is listening (see [`src/cron-jobs/index.js`](src/cron-jobs/index.js)). Each job runs **every 10 seconds**:

| Job                          | What it does |
| ---------------------------- | ------------ |
| `delete-unverified-users`    | Deletes users who have not verified their email within 2 hours of registering. |
| `finalise-order`             | Marks one overdue `pending` order as `completed` per run, and records a deposit transaction and a notification. |
| `delete-read-notifications`  | Deletes notifications that are read and older than 48 hours. |

## Wallet, orders and payments

- **Currency:** balances are stored in Ghana cedis (GH₵). Stripe deposits are made in USD and converted at a fixed rate of **12.78** in `user.controller.js`.
- **Deposits:** the client calls `/user/deposit-checkout`, redirects to Stripe, and Stripe returns to `CLIENT_URL/account/transactions?status=deposit&session_id=…`. The client then calls `/user/validate-checkout` to credit the wallet.
- **Checkout:** `/cart/checkout` charges the wallet for the cart total and creates an order that runs for **3–5 days**, with a random **5–7%** profit per item.
- **Cancellation:** pending orders can be refunded during the first 10% of their duration.
- **Finalisation:** the `finalise-order` cron completes orders whose end date has passed. The balance credit in that job is currently commented out.
- **Activation:** `/user/activate` charges GH₵40 and pays the referrer GH₵3. New registrations are currently created with `activated: true`.

## Testing

Tests live next to the code (`*.test.js`) and use Jest + Supertest against the real Express app.

```bash
npx jest            # single run
npm test            # watch mode
```

The tests connect to the database from `MONGO_URL`, so point it at a test database, not production. `products.test.js` contains a hard-coded bearer token that has expired; replace it with a token from a test account to run the authenticated tests.

## Building and deployment

### Bundle

`npm run build` uses [`webpack.config.js`](webpack.config.js) to bundle `src/server.js` into `dist/main.bundle.js`. Dependencies stay external (`webpack-node-externals`), the code is transpiled with Babel and then obfuscated. `npm start` builds and runs this bundle, and is what the hosting platform (Render) runs.

### Docker

The [`Dockerfile`](Dockerfile) copies the prebuilt `dist/` folder and installs production dependencies:

```bash
npm run build
docker build -t mafoil-server .
docker run --env-file .env -p 8000:8000 mafoil-server
```

The image is based on `node:24-slim`.

Before building the image:

- The Dockerfile currently copies `.env` into the image. Prefer passing variables at runtime with `--env-file` (as above) and removing the `COPY /.env` line, so secrets are not baked into the image.

### CORS

In production (`NODE_ENV=production`) only `https://mafoil.vercel.app` and `https://crons-gd5m.onrender.com` are allowed origins. In development every origin is allowed. Update the list in [`src/app.js`](src/app.js) when the frontend URL changes.

## Troubleshooting

| Problem | Fix |
| ------- | --- |
| `Cannot find module …` on start | Run `npm install`. Make sure you are on Node 24 (`nvm use`). |
| `Transaction numbers are only allowed on a replica set member or mongos` | Use a replica set (e.g. MongoDB Atlas or a local single-node replica set). |
| Every authenticated request returns `403` / `jwt malformed` | Check the `Authorization: Bearer <token>` header, and that `SECRET` matches the one used to sign the token. |
| Verification emails are not sent | Check the SMTP variables; the transport uses port 465 with TLS. |
| Deposits never reach the wallet | Check `stripe_key` and `CLIENT_URL`; the wallet is only credited after the client calls `/user/validate-checkout`. |
