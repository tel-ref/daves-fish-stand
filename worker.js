/* ════════════════════════════════════════════════════════════
   Dave's Fish Stand — Worker entry
   Serves the static site and handles /api/checkout server-side,
   where the secret Square Access Token can live safely.
   Recomputes the order total itself rather than trusting the
   number the browser sent, so a tampered client can't change
   the charge amount.

   REQUIRED setup (Cloudflare dashboard → this Worker → Settings
   → Variables and secrets):
     SQUARE_ACCESS_TOKEN   (required, add as type "Secret")
     RESEND_API_KEY        (optional — enables the confirmation email)
   ════════════════════════════════════════════════════════════ */

// TODO going live: swap for your PRODUCTION location ID (Square Developer
// Dashboard → Locations) and keep it in sync with checkout.js.
const SQUARE_LOCATION_ID = "LA1V3HV1YTC08";
const SQUARE_VERSION = "2026-05-20";

const SHOP_NAME = "Dave's Fish Stand";
// TODO: replace with Dave's real inbox once he has one, and a Resend-verified sending domain.
const SHOP_ORDER_EMAIL = "hello@davesfishstand.example";
const ORDER_FROM_EMAIL = "Dave's Fish Stand <orders@davesfishstand.example>";

// Keep these in sync with checkout.js — the server charges THIS total.
const ORIGIN_ZIP3 = 841; // Salt Lake City, UT
const STICKER_WEIGHT_LB = 0.05;
const PACKAGING_BASE_LB = 0.15;
const SHIP_BASE = 4.25;
const SHIP_PER_LB = 1.35;
const SHIP_PER_ZONE = 0.35;
const UT_TAX_RATE = 0.0845;

function zoneFor(zip) {
  const zip3 = parseInt(String(zip || "").slice(0, 3), 10);
  if (!zip3) return 8;
  const dist = Math.abs(zip3 - ORIGIN_ZIP3);
  if (dist <= 3) return 1;
  if (dist <= 50) return 2;
  if (dist <= 150) return 3;
  if (dist <= 300) return 4;
  if (dist <= 500) return 5;
  if (dist <= 700) return 6;
  if (dist <= 850) return 7;
  return 8;
}
function estimateShipping(itemCount, zip) {
  const weight = PACKAGING_BASE_LB + itemCount * STICKER_WEIGHT_LB;
  const cost = SHIP_BASE + weight * SHIP_PER_LB + zoneFor(zip) * SHIP_PER_ZONE;
  return Math.round(cost * 100) / 100;
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json" }
  });
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function buildEmailHtml(o) {
  var itemsHtml = o.items.map(function (it) {
    return '<tr><td style="padding:4px 8px 4px 0">' + it.qty + ' &times; ' + escapeHtml(it.name) + '</td><td style="padding:4px 0;text-align:right">$' + (it.qty * it.price).toFixed(2) + '</td></tr>';
  }).join("");
  var addr = o.fulfillment.type === "ship"
    ? (escapeHtml(o.fulfillment.address1) + (o.fulfillment.address2 ? ", " + escapeHtml(o.fulfillment.address2) : "") + "<br>" + escapeHtml(o.fulfillment.city) + ", " + escapeHtml(o.fulfillment.state) + " " + escapeHtml(o.fulfillment.zip))
    : "Pickup at the stand";
  return (
    '<div style="font-family:Georgia,serif;color:#21303B;max-width:480px;margin:0 auto">' +
    "<h2 style=\"margin-bottom:0\">Thanks" + (o.buyer.name ? ", " + escapeHtml(o.buyer.name) : "") + "!</h2>" +
    "<p>Your order <strong>" + o.orderNumber + "</strong> from " + SHOP_NAME + " is confirmed.</p>" +
    '<table style="width:100%;border-collapse:collapse;margin:16px 0">' + itemsHtml + "</table>" +
    "<p>Subtotal: $" + o.subtotal.toFixed(2) + "<br>" +
    "Shipping: " + (o.fulfillment.type === "ship" ? "$" + o.shipping.toFixed(2) : "Free (pickup)") + "<br>" +
    "Tax: $" + o.tax.toFixed(2) + "<br>" +
    "<strong>Total: $" + o.total.toFixed(2) + "</strong></p>" +
    "<p><strong>" + (o.fulfillment.type === "ship" ? "Shipping to" : "Fulfillment") + ":</strong><br>" + addr + "</p>" +
    "<p>I press, pack, and post every fish by hand &mdash; I'll be in touch if anything needs your input.<br>&mdash; Dave</p>" +
    "</div>"
  );
}

async function sendConfirmationEmail(env, o) {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: ORDER_FROM_EMAIL,
      to: [o.buyer.email],
      bcc: [SHOP_ORDER_EMAIL],
      subject: "Your order " + o.orderNumber + " — " + SHOP_NAME,
      html: buildEmailHtml(o)
    })
  });
}

async function handleCheckout(request, env) {
  try {
    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return json({ success: false, message: "Your basket is empty." }, 400);

    const itemCount = items.reduce(function (n, it) { return n + (it.qty || 0); }, 0);
    const subtotal = items.reduce(function (n, it) { return n + (it.qty || 0) * (Number(it.price) || 0); }, 0);

    const fulfillment = body.fulfillment || {};
    const isShip = fulfillment.type === "ship";
    if (isShip && (!fulfillment.address1 || !fulfillment.city || !fulfillment.state || !fulfillment.zip)) {
      return json({ success: false, message: "Please fill in a complete shipping address." }, 400);
    }

    const shipping = isShip ? estimateShipping(itemCount, fulfillment.zip) : 0;
    const tax = Math.round(subtotal * UT_TAX_RATE * 100) / 100;
    const total = Math.round((subtotal + shipping + tax) * 100) / 100;
    const amountCents = Math.round(total * 100);

    if (!body.sourceId) return json({ success: false, message: "Missing payment details." }, 400);
    if (amountCents < 1) return json({ success: false, message: "Nothing to charge." }, 400);
    if (!env.SQUARE_ACCESS_TOKEN) {
      return json({ success: false, message: "Payments aren't configured yet — the shop owner needs to add a Square Access Token." }, 500);
    }

    const buyer = body.buyer || {};
    const squareRes = await fetch("https://connect.squareup.com/v2/payments", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.SQUARE_ACCESS_TOKEN,
        "Content-Type": "application/json",
        "Square-Version": SQUARE_VERSION
      },
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        source_id: body.sourceId,
        location_id: SQUARE_LOCATION_ID,
        amount_money: { amount: amountCents, currency: "USD" },
        buyer_email_address: buyer.email || undefined,
        note: (SHOP_NAME + " order — " + itemCount + " item(s)").slice(0, 500)
      })
    });

    const squareData = await squareRes.json();
    if (!squareRes.ok) {
      const detail = squareData.errors && squareData.errors[0] && (squareData.errors[0].detail || squareData.errors[0].code);
      return json({ success: false, message: detail || "Payment was declined." }, 402);
    }

    const payment = squareData.payment;
    const orderNumber = "DFS-" + (payment.id || "").slice(-8).toUpperCase();

    if (env.RESEND_API_KEY && buyer.email) {
      try {
        await sendConfirmationEmail(env, { orderNumber, buyer, fulfillment, items, subtotal, shipping, tax, total });
      } catch (e) {
        console.log("Confirmation email failed:", e);
      }
    }

    return json({ success: true, orderNumber: orderNumber, receiptUrl: payment.receipt_url || null });
  } catch (err) {
    console.log("Checkout error:", err);
    return json({ success: false, message: "Something went wrong processing your payment. Please try again." }, 500);
  }
}

async function serveDomainAssociation(env) {
  // Square/Apple fetch this file directly and choke on range/conditional
  // responses or edge compression, so bypass all of that: strip Range and
  // conditional headers before asking the asset store for it, then hand
  // back a plain, uncompressed 200 with an exact Content-Length.
  const assetRes = await env.ASSETS.fetch(new Request("https://assets.local/.well-known/apple-developer-merchantid-domain-association"));
  const body = await assetRes.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": "attachment; filename=\"apple-developer-merchantid-domain-association\"",
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store"
    },
    encodeBody: "manual"
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/checkout") {
      if (request.method === "POST") return handleCheckout(request, env);
      return json({ success: false, message: "Method not allowed." }, 405);
    }
    if (url.pathname === "/.well-known/apple-developer-merchantid-domain-association") {
      return serveDomainAssociation(env);
    }
    return env.ASSETS.fetch(request);
  }
};
