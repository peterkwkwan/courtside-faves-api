// /api/courtside.js
//
// Vercel serverless function that scrapes the Courtside Faves page once,
// extracts the embedded shopData JSON, normalizes it, and serves it as
// a clean JSON API with CORS headers + edge caching.
//
// Deployed at: https://<your-vercel-project>.vercel.app/api/courtside
// Optional custom domain: https://api.courtside.tennis/api/courtside
//
// Query params (all optional):
//   ?slug=courtside        Faves athlete slug (default: courtside)
//   ?capsule=all           Capsule filter (default: all)
//
// Response shape:
//   {
//     athlete: { name, slug, bio, image, banner, socials },
//     brands:  [{ name, image }],
//     products:[{
//       id, public_id, name, price, endorsement,
//       image, image_alt, faves_url, shop_index
//     }],
//     fetched_at: ISO-8601 string
//   }

const FAVES_BASE = "https://faves.xyz";
const DEFAULT_SLUG = "courtside";

// Pull the JSON from <script id="shopData" type="application/json">...</script>
function extractShopData(html) {
  const re =
    /<script\s+id=["']shopData["']\s+type=["']application\/json["']\s*>([\s\S]*?)<\/script>/i;
  const match = html.match(re);
  if (!match) {
    throw new Error("shopData script tag not found in Faves response");
  }
  return JSON.parse(match[1]);
}

// Pick the best-quality srcset URL from a Faves image object.
// Faves provides avif/webp/jpeg variants at multiple widths. We return
// the largest available so Framer can scale down. We also pass through
// the full srcsets so the client can do responsive <picture> rendering.
function pickImage(img) {
  if (!img) return null;
  const sizes = ["1080", "640", "320", "180", "120", "60"];
  const formats = ["avif", "webp", "jpeg"];
  let best = null;
  for (const fmt of formats) {
    if (!img[fmt]) continue;
    for (const s of sizes) {
      if (img[fmt][s]) {
        best = img[fmt][s];
        break;
      }
    }
    if (best) break;
  }
  return {
    url: best,
    alt: img.alt_text || "",
    srcsets: img.srcsets || null,
  };
}

function normalize(shopData, slug) {
  const a = shopData.athleteInfo || {};
  const athlete = {
    id: a.id ?? null,
    slug: a.slug || slug,
    name: [a.first_name, a.last_name].filter(Boolean).join(" ").trim() || null,
    first_name: a.first_name || null,
    last_name: a.last_name || null,
    bio: a.bio || null,
    image: pickImage(a.image),
    banner: pickImage(a.banner_image),
    socials: Array.isArray(shopData.socials) ? shopData.socials : [],
  };

  const brands = (shopData.brands || []).map((b) => ({
    id: b.id,
    name: b.rect_image?.alt_text || b.name || "",
    image: pickImage(b.rect_image),
  }));

  const products = (shopData.products || []).map((p) => ({
    id: p.id,
    public_id: p.public_id,
    name: p.name,
    price: p.price,
    endorsement: p.endorsement || null,
    image: p.image_data?.url || null,
    image_alt: p.image_data?.alt || p.name || "",
    faves_url: `${FAVES_BASE}/@${slug}/products/${p.public_id}`,
    shop_index: p.shop_index ?? 0,
    variant_id: p.variant_id ?? null,
  }));

  // Faves orders by shop_index; preserve that.
  products.sort((a, b) => a.shop_index - b.shop_index);

  return {
    athlete,
    brands,
    products,
    capsules: shopData.capsules || [],
    fetched_at: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  // CORS — allow any origin so Framer (framer.app, framer.website,
  // your custom domain) can fetch this directly from the browser.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const slug = (req.query.slug || DEFAULT_SLUG).toString().replace(/^@/, "");
  const capsule = (req.query.capsule || "all").toString();

  const url = `${FAVES_BASE}/@${encodeURIComponent(slug)}?capsule=${encodeURIComponent(capsule)}`;

  try {
    const upstream = await fetch(url, {
      headers: {
        // Faves serves the same SSR HTML to bots and browsers, but we
        // send a normal UA to be safe.
        "User-Agent":
          "Mozilla/5.0 (compatible; CourtsideFavesProxy/1.0; +https://courtside.tennis)",
        Accept: "text/html,application/xhtml+xml",
      },
      // Vercel's fetch supports a `next` revalidate hint, harmless elsewhere.
      next: { revalidate: 300 },
    });

    if (!upstream.ok) {
      res.status(502).json({
        error: "Upstream Faves request failed",
        status: upstream.status,
      });
      return;
    }

    const html = await upstream.text();
    const shopData = extractShopData(html);
    const payload = normalize(shopData, slug);

    // Cache at Vercel's edge for 5 minutes, allow stale-while-revalidate
    // for an hour. Tweak to taste.
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=3600"
    );
    res.status(200).json(payload);
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch or parse Faves page",
      message: err?.message || String(err),
    });
  }
}
