# Alkahf — E-commerce Bookstore

Web application for an online bookstore, with a full admin dashboard.

## Features

- Book catalog browsing (books, kids' books, packs)
- Shopping cart and Stripe checkout
- Promotions and relay (pickup) points
- Admin dashboard: manage books, packs, promos, and orders
- Invoice numbering and PDF generation
- Firebase Authentication, Firestore, and Storage
- Legal pages (terms of sale/use, privacy policy, legal notice)

## Tech stack

- React 18, React Router
- Firebase (Auth, Firestore, Storage, Functions)
- Stripe (`@stripe/react-stripe-js`) for payments
- Cloudinary for image hosting
- Tailwind CSS
- jsPDF, recharts

## Getting started

1. Install dependencies:

```bash
npm install
```

2. Configure Firebase:

- Create a Firebase project
- Enable **Authentication → Email/Password**, **Firestore**, and **Storage**
- Fill in your Firebase config in `src/firebase/config.js`

3. Configure server secrets as Firebase Functions secrets (see `functions/index.js`):
   `STRIPE_SECRET`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, …

4. Run the app:

```bash
npm start
```
