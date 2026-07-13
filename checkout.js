/* ════════════════════════════════════════════════════════════
   Dave's Fish Stand — checkout
   Reads the basket from localStorage (same store as app.js),
   estimates shipping + tax, and takes payment with Square's
   Web Payments SDK (Card, Apple Pay, Google Pay).
   ════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var STORE_KEY = "dfm_basket";

  var SQUARE_APP_ID = "sandbox-sq0idb-Nq058p1zIfGQNFoRiFJh2A";
  var SQUARE_LOCATION_ID = "LA1V3HV1YTC08";

  var ORIGIN_ZIP3 = 841;
  var STICKER_WEIGHT_LB = 0.05;
  var PACKAGING_BASE_LB = 0.15;
  var SHIP_BASE = 4.25;
  var SHIP_PER_LB = 1.35;
  var SHIP_PER_ZONE = 0.35;
  var UT_TAX_RATE = 0.0845;

  function zoneFor(zip) {
    var zip3 = parseInt(String(zip || "").slice(0, 3), 10);
    if (!zip3) return 8;
    var dist = Math.abs(zip3 - ORIGIN_ZIP3);
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
    var weight = PACKAGING_BASE_LB + itemCount * STICKER_WEIGHT_LB;
    var cost = SHIP_BASE + weight * SHIP_PER_LB + zoneFor(zip) * SHIP_PER_ZONE;
    return Math.round(cost * 100) / 100;
  }

  function loadBasket() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function money(n) { return "$" + n.toFixed(2); }
  function fishThumb(fish, cls) {
    if (/\.(png|jpe?g|webp)$/i.test(fish)) return '<img class="' + cls + '" src="' + fish + '" alt="" />';
    return '<svg class="' + cls + '" viewBox="0 0 240 130" aria-hidden="true"><use href="#' + fish + '"></use></svg>';
  }

  var basket = loadBasket();
  var keys = Object.keys(basket);
  var itemCount = keys.reduce(function (n, k) { return n + basket[k].qty; }, 0);
  var subtotal = keys.reduce(function (n, k) { return n + basket[k].qty * basket[k].price; }, 0);

  var gridEl = document.getElementById("checkoutGrid");
  var emptyEl = document.getElementById("checkoutEmpty");
  var countEl = document.getElementById("checkoutItemCount");
  var itemsEl = document.getElementById("ckItems");

  if (itemCount === 0) {
    if (gridEl) gridEl.style.display = "none";
    if (emptyEl) emptyEl.style.display = "";
    return;
  }

  if (countEl) countEl.textContent = itemCount + (itemCount === 1 ? " fish" : " fish");
  if (itemsEl) {
    itemsEl.innerHTML = keys.map(function (k) {
      var it = basket[k];
      return (
        '<div class="ck-item">' +
          fishThumb(it.fish, "ck-item-thumb") +
          '<div class="ck-item-name">' + it.name + '<span class="ck-item-qty">&times;' + it.qty + "</span></div>" +
          '<div class="ck-item-total">' + money(it.qty * it.price) + "</div>" +
        "</div>"
      );
    }).join("");
  }

  var shipFields = document.getElementById("shipFields");
  var pickupNote = document.getElementById("pickupNote");
  var zipInput = document.getElementById("ck-zip");
  var subtotalEl = document.getElementById("ckSubtotal");
  var shippingEl = document.getElementById("ckShipping");
  var taxEl = document.getElementById("ckTax");
  var totalEl = document.getElementById("ckTotal");
  var payAmtEl = document.getElementById("ck-pay-amt");
  var form = document.getElementById("checkoutForm");
  var statusEl = document.getElementById("paymentStatus");
  var payBtn = document.getElementById("ck-pay-btn");

  var lastVals = { subtotal: subtotal, shipping: 0, tax: 0, total: subtotal, isShip: true };

  function currentFulfillment() {
    var checked = document.querySelector('input[name="fulfillment"]:checked');
    return checked ? checked.value : "ship";
  }

  function recalc() {
    var isShip = currentFulfillment() === "ship";
    if (shipFields) shipFields.style.display = isShip ? "" : "none";
    if (pickupNote) pickupNote.style.display = isShip ? "none" : "";
    document.querySelectorAll("#shipFields input").forEach(function (el) {
      if (el.id === "ck-addr2") return;
      el.required = isShip;
    });

    var shipping = isShip ? estimateShipping(itemCount, zipInput ? zipInput.value : "") : 0;
    var tax = Math.round(subtotal * UT_TAX_RATE * 100) / 100;
    var total = Math.round((subtotal + shipping + tax) * 100) / 100;

    if (subtotalEl) subtotalEl.textContent = money(subtotal);
    if (shippingEl) shippingEl.textContent = isShip ? money(shipping) : "Free (pickup)";
    if (taxEl) taxEl.textContent = money(tax);
    if (totalEl) totalEl.textContent = money(total);
    if (payAmtEl) payAmtEl.textContent = money(total);

    lastVals = { subtotal: subtotal, shipping: shipping, tax: tax, total: total, isShip: isShip };

    if (paymentRequest) {
      paymentRequest.update({ total: { amount: total.toFixed(2), label: "Dave's Fish Stand" } });
    }
    return lastVals;
  }

  document.querySelectorAll('input[name="fulfillment"]').forEach(function (r) { r.addEventListener("change", recalc); });
  if (zipInput) zipInput.addEventListener("input", recalc);
  recalc();

  var card = null;
  var applePay = null;
  var googlePay = null;
  var paymentRequest = null;

  function setBusy(isBusy) {
    if (payBtn) payBtn.disabled = isBusy || !card;
    document.querySelectorAll(".ck-wallet-btn").forEach(function (el) {
      el.style.pointerEvents = isBusy ? "none" : "";
      el.style.opacity = isBusy ? "0.6" : "";
    });
  }

  function updateWalletRowVisibility() {
    var appleBtn = document.getElementById("apple-pay-button");
    var googleBtn = document.getElementById("google-pay-button");
    var anyVisible = (appleBtn && appleBtn.style.display !== "none") || (googleBtn && googleBtn.style.display !== "none");
    var walletsEl = document.getElementById("ckWallets");
    var dividerEl = document.getElementById("ckOrDivider");
    if (walletsEl) walletsEl.style.display = anyVisible ? "" : "none";
    if (dividerEl) dividerEl.style.display = anyVisible ? "" : "none";
  }

  async function submitOrder(token) {
    var vals = recalc();
    var data = new FormData(form);
    var order = {
      sourceId: token,
      buyer: { name: data.get("name"), email: data.get("email"), phone: data.get("phone") },
      fulfillment: {
        type: vals.isShip ? "ship" : "pickup",
        address1: data.get("address1") || "",
        address2: data.get("address2") || "",
        city: data.get("city") || "",
        state: data.get("state") || "",
        zip: data.get("zip") || ""
      },
      notes: data.get("notes") || "",
      items: keys.map(function (k) { return { name: basket[k].name, price: basket[k].price, qty: basket[k].qty }; })
    };

    var res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order)
    });
    var result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.message || "Payment couldn't be completed. Please try again.");

    window.localStorage.removeItem(STORE_KEY);
    document.querySelectorAll("#navCount").forEach(function (el) { el.textContent = "0"; });

    form.style.display = "none";
    var confirmEl = document.getElementById("checkoutConfirmed");
    if (confirmEl) {
      confirmEl.style.display = "";
      var headingEl = document.getElementById("ck-confirm-heading");
      if (headingEl && result.orderNumber) headingEl.textContent = "Order landed — #" + result.orderNumber;
    }
  }

  async function payWithWallet(instance) {
    if (!form.reportValidity()) return;
    if (statusEl) statusEl.textContent = "";
    setBusy(true);
    try {
      var result = await instance.tokenize();
      if (result.status !== "OK") {
        throw new Error((result.errors && result.errors[0] && result.errors[0].message) || "Payment was cancelled or declined.");
      }
      await submitOrder(result.token);
    } catch (err) {
      if (statusEl) statusEl.textContent = err.message || "Something went wrong. Please try again.";
      setBusy(false);
    }
  }

  async function initSquare() {
    if (!window.Square) {
      if (statusEl) statusEl.textContent = "Payment form failed to load. Refresh the page and try again.";
      return;
    }
    var payments = window.Square.payments(SQUARE_APP_ID, SQUARE_LOCATION_ID);

    paymentRequest = payments.paymentRequest({
      countryCode: "US",
      currencyCode: "USD",
      total: { amount: lastVals.total.toFixed(2), label: "Dave's Fish Stand" }
    });

    try {
      card = await payments.card();
      await card.attach("#card-container");
      if (payBtn) payBtn.disabled = false;
    } catch (e) {
      if (statusEl) statusEl.textContent = "Couldn't load the card form: " + e.message;
    }

    try {
      applePay = await payments.applePay(paymentRequest);
      await applePay.attach("#apple-pay-button");
      var appleBtn = document.getElementById("apple-pay-button");
      if (appleBtn) {
        appleBtn.style.display = "";
        appleBtn.addEventListener("click", function (e) { e.preventDefault(); payWithWallet(applePay); });
      }
    } catch (e) { }

    try {
      googlePay = await payments.googlePay(paymentRequest);
      await googlePay.attach("#google-pay-button");
      var googleBtn = document.getElementById("google-pay-button");
      if (googleBtn) {
        googleBtn.style.display = "";
        googleBtn.addEventListener("click", function (e) { e.preventDefault(); payWithWallet(googlePay); });
      }
    } catch (e) { }

    updateWalletRowVisibility();
  }
  initSquare();

  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!card) { if (statusEl) statusEl.textContent = "Payment form isn't ready yet — give it a second and try again."; return; }
      if (statusEl) statusEl.textContent = "";
      var originalLabel = payBtn.innerHTML;
      setBusy(true);
      payBtn.textContent = "Processing…";

      try {
        var tokenResult = await card.tokenize();
        if (tokenResult.status !== "OK") {
          throw new Error((tokenResult.errors && tokenResult.errors[0] && tokenResult.errors[0].message) || "Card was declined. Please try again.");
        }
        await submitOrder(tokenResult.token);
      } catch (err) {
        if (statusEl) statusEl.textContent = err.message || "Something went wrong. Please try again.";
        setBusy(false);
        payBtn.innerHTML = originalLabel;
      }
    });
  }
})();
