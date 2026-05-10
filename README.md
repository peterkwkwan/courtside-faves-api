# Courtside Faves → Framer

This bundle has two pieces:

1. **`api/courtside.js`** — a tiny serverless function that fetches your Faves
   page (`faves.xyz/@courtside?capsule=all`), extracts the embedded product
   JSON, and serves it as a clean, CORS-enabled API.
2. **`CourtsideProducts.tsx`** — a Framer Code Component that fetches that API
   and renders a responsive product grid (desktop + mobile).

You'll deploy the API once, paste the component into Framer, point it at your
API URL, and you're done. Total time: ~10 minutes.

---

## Part 1 — Deploy the API to Vercel

You only have to do this once.

### Option A: Deploy via the Vercel website (no command line)

1. Make a new folder on your computer called `courtside-faves-api`.
2. Copy these files from this bundle into it, preserving the structure:
   ```
   courtside-faves-api/
     api/
       courtside.js
     vercel.json
     package.json
   ```
3. Push the folder to a new GitHub repo (GitHub Desktop works fine).
4. Go to https://vercel.com → **Add New… → Project** → import that repo.
5. Click **Deploy**. Done in ~30 seconds.
6. Vercel gives you a URL like `https://courtside-faves-api-xyz.vercel.app`.
   Your API endpoint is:
   ```
   https://courtside-faves-api-xyz.vercel.app/api/courtside
   ```

### Option B: Deploy via the Vercel CLI

```bash
cd courtside-faves-api
npx vercel              # follow prompts, accept defaults
npx vercel --prod       # promote to production
```

### Optional: use a custom domain

In the Vercel project → **Settings → Domains** → add `api.courtside.tennis`
(or any subdomain). Vercel will tell you which CNAME / A record to add at
your DNS provider. Once it propagates, your endpoint becomes:

```
https://api.courtside.tennis/api/courtside
```

### Verify

Open the URL in your browser. You should see JSON with 12 products. The
shape looks like:

```json
{
  "athlete": { "name": "Noah Wolfe", "slug": "courtside", "bio": "..." },
  "brands":   [ { "name": "WHOOP",   "image": { "url": "..." } }, ... ],
  "products": [
    {
      "id": 0,
      "public_id": "6f59690a-a52a-45d7-82f2-0f9987293e08",
      "name": "WHOOP Life - 12-Month Membership ...",
      "price": "$359.00",
      "endorsement": "I love my Whoop ...",
      "image": "https://dks.scene7.com/is/image/...",
      "faves_url": "https://faves.xyz/@courtside/products/6f59690a-..."
    },
    ... 11 more
  ],
  "fetched_at": "2026-05-04T..."
}
```

The endpoint also accepts `?slug=...&capsule=...` if you ever want to
re-point it at a different Faves athlete or capsule.

---

## Part 2 — Add the component to Framer

1. In Framer, open your courtside.tennis project.
2. Left sidebar: **Assets → Code → ＋ → New File**.
3. Name it `CourtsideProducts`. Delete the boilerplate.
4. Paste the entire contents of `CourtsideProducts.tsx` from this bundle.
5. Save (Cmd+S). Framer will compile it.
6. Drag **CourtsideProducts** from Assets onto your canvas.
7. In the right-hand inspector, set **API URL** to your endpoint
   (e.g. `https://api.courtside.tennis/api/courtside`).
8. Resize the component to fill the section width. The grid is responsive:
   - **Desktop (≥1024px):** 4 columns by default
   - **Tablet (640–1024px):** 3 columns
   - **Mobile (<640px):** 2 columns

   Tweak any of those in the inspector.

The inspector also exposes: gap, image aspect ratio, corner radius, card
background, border, font family, name/price/endorsement sizes and colors,
hover lift, and "open in new tab" toggle.

---

## How it works (so you can debug it later)

Faves renders the page with React on the client, but the data comes
embedded in the initial HTML response inside this script tag:

```html
<script id="shopData" type="application/json">{ ... }</script>
```

The serverless function fetches the page, extracts that JSON via regex,
normalizes it into a flatter shape (no triplicate avif/webp/jpeg image
variants — we pick the best URL), adds CORS headers, and caches the
response at Vercel's edge for 5 minutes. Repeat hits are essentially free.

When you publish a new product on Faves, it'll appear on your Framer site
within 5 minutes (next cache miss). To force-refresh sooner, redeploy the
function, or hit the URL with a query string like `?cb=1` to bypass cache.

---

## Re-using elsewhere

The function is ~120 lines of plain JavaScript with no dependencies. It
runs anywhere Node 18+ is available:

- **Cloudflare Workers** — change `export default async function handler`
  to `export default { async fetch(request, env, ctx) { ... } }` and adapt
  the `req`/`res` API. Free 100k req/day.
- **Netlify Functions** — same code; rename to `netlify/functions/courtside.js`
  and tweak the response signature.
- **Anywhere Express-y** — wrap the body in `app.get('/api/courtside', ...)`.

---

## What's not covered

- **Add-to-cart / checkout from your Framer site.** That requires the
  CSRF token and Faves' cart endpoints, which are not part of the public
  page payload. The current setup links each product card to the Faves
  product page, which preserves your affiliate tracking and uses Faves'
  own cart flow. If you want native checkout in Framer later, we'd need
  to reverse-engineer the cart API (and Faves may not allow third-party
  carts).
- **Capsule filter UI.** The data structure supports it, but your
  `capsules` array is currently empty. If you start using capsules on
  Faves, this component can be extended to show a filter chip row.
