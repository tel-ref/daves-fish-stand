/* ════════════════════════════════════════════════════════════
   Dave's Fish Stand — shared behaviour
   Loaded on every page. Null-guards everything so one file
   serves the homepage, shop, product pages and the cart.
   Basket persists in localStorage so it follows you page to page.
   ════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var STORE_KEY = "dfm_basket";

  /* ---------- Basket state (persisted) ---------- */
  function loadBasket() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function saveBasket() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(basket)); } catch (e) {}
  }
  var basket = loadBasket(); // key -> {name, price, fish, qty, slug}

  function money(n) { return "$" + n; }

  function totals() {
    var count = 0, sum = 0;
    Object.keys(basket).forEach(function (k) {
      count += basket[k].qty;
      sum += basket[k].qty * basket[k].price;
    });
    return { count: count, sum: sum };
  }

  /* ---------- Elements (may be absent on a given page) ---------- */
  var overlay   = document.getElementById("overlay");
  var drawer    = document.getElementById("drawer");
  var body      = document.getElementById("basketBody");
  var subtotalEl= document.getElementById("subtotal");
  var cartBody  = document.getElementById("cartBody");
  var cartSub   = document.getElementById("cartSubtotal");
  var cartCount = document.getElementById("cartCount");

  function svgUse(fish) {
    return '<svg viewBox="0 0 240 130" aria-hidden="true"><use href="#' + fish + '"></use></svg>';
  }
  function fishThumb(fish, cls) {
    if (/\.(png|jpe?g|webp)$/i.test(fish)) {
      return '<img class="' + cls + '" src="' + fish + '" alt="" />';
    }
    return '<svg class="' + cls + '" viewBox="0 0 240 130" aria-hidden="true"><use href="#' + fish + '"></use></svg>';
  }
  function fishHref(it) {
    return it.slug ? ("fish-" + it.slug + ".html") : "catch.html";
  }

  /* ---------- Drawer ---------- */
  function openDrawer() {
    if (!drawer) return;
    overlay.classList.add("open");
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
  }
  function closeDrawer() {
    if (!drawer) return;
    overlay.classList.remove("open");
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
  }

  /* ---------- Render everything that exists ---------- */
  function updateCounts() {
    var t = totals();
    document.querySelectorAll("#navCount").forEach(function (el) { el.textContent = t.count; });
    if (cartCount) cartCount.textContent = t.count + (t.count === 1 ? " fish" : " fish");
    return t;
  }

  function renderDrawer(t) {
    if (!body) return;
    if (subtotalEl) subtotalEl.textContent = money(t.sum);
    var keys = Object.keys(basket);
    if (keys.length === 0) {
      body.innerHTML =
        '<div class="empty">' +
        '<svg class="fishy" viewBox="0 0 240 130" aria-hidden="true"><use href="#fish-trout"></use></svg>' +
        "<p>The basket's empty. The ice is fully stocked, so go pick your catch.</p>" +
        "</div>";
      return;
    }
    var html = "";
    keys.forEach(function (k) {
      var it = basket[k];
      html +=
        '<div class="line">' +
          fishThumb(it.fish, 'line-thumb') +
          "<div>" +
            '<div class="line-name">' + it.name + "</div>" +
            '<div class="line-price">' + money(it.price) + " each</div>" +
            '<div class="qty" data-key="' + k + '">' +
              '<button class="dec" aria-label="Remove one">&minus;</button>' +
              "<span>" + it.qty + "</span>" +
              '<button class="inc" aria-label="Add one">+</button>' +
            "</div>" +
          "</div>" +
          '<div style="text-align:right">' +
            '<div class="line-total">' + money(it.qty * it.price) + "</div>" +
            '<button class="line-remove" data-remove="' + k + '">Remove</button>' +
          "</div>" +
        "</div>";
    });
    body.innerHTML = html;
  }

  function renderCart(t) {
    if (!cartBody) return;
    if (cartSub) cartSub.textContent = money(t.sum);
    var keys = Object.keys(basket);
    var summary = document.getElementById("cartSummary");
    var headRow = document.getElementById("cartHeadRow");
    if (keys.length === 0) {
      cartBody.innerHTML =
        '<div class="cart-empty">' +
        '<svg class="fishy" viewBox="0 0 240 130" aria-hidden="true"><use href="#fish-sockeye"></use></svg>' +
        "<p>Your basket is empty as a dry bucket.<br>Head to the counter and pick a fish off the ice.</p>" +
        '<a href="catch.html" class="btn btn-primary">See today\'s catch</a>' +
        "</div>";
      if (summary) summary.style.display = "none";
      if (headRow) headRow.style.display = "none";
      return;
    }
    if (summary) summary.style.display = "";
    if (headRow) headRow.style.display = "";
    var html = "";
    keys.forEach(function (k) {
      var it = basket[k];
      html +=
        '<div class="cart-line">' +
          '<a href="' + fishHref(it) + '">' + fishThumb(it.fish, 'c-thumb') + '</a>' +
          "<div>" +
            '<div class="c-name"><a href="' + fishHref(it) + '">' + it.name + "</a></div>" +
            '<div class="c-each">' + money(it.price) + " each</div>" +
            '<button class="c-remove" data-remove="' + k + '">Remove</button>' +
          "</div>" +
          '<div class="qty" data-key="' + k + '">' +
            '<button class="dec" aria-label="Remove one">&minus;</button>' +
            "<span>" + it.qty + "</span>" +
            '<button class="inc" aria-label="Add one">+</button>' +
          "</div>" +
          '<div class="c-total">' + money(it.qty * it.price) + "</div>" +
        "</div>";
    });
    cartBody.innerHTML = html;
  }

  function render() {
    var t = updateCounts();
    renderDrawer(t);
    renderCart(t);
    saveBasket();
  }

  /* ---------- Add to basket ---------- */
  function addToBasket(name, price, fish, slug, qty) {
    var key = fish;
    qty = qty || 1;
    if (basket[key]) { basket[key].qty += qty; }
    else { basket[key] = { name: name, price: price, fish: fish, slug: slug || "", qty: qty }; }
    render();
  }

  document.querySelectorAll(".btn-add").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var name  = btn.getAttribute("data-name");
      var price = parseInt(btn.getAttribute("data-price"), 10);
      var fish  = btn.getAttribute("data-fish");
      var slug  = btn.getAttribute("data-slug") || "";
      var qty = 1;
      var src = btn.getAttribute("data-qty-source");
      if (src) {
        var qEl = document.querySelector(src);
        if (qEl) qty = Math.max(1, parseInt(qEl.textContent, 10) || 1);
      }
      addToBasket(name, price, fish, slug, qty);

      var original = btn.getAttribute("data-label") || btn.textContent;
      if (!btn.getAttribute("data-label")) btn.setAttribute("data-label", original);
      btn.textContent = qty > 1 ? ("On the ice \u2713 \u00d7" + qty) : "On the ice \u2713";
      btn.classList.add("added");
      window.setTimeout(function () {
        btn.textContent = btn.getAttribute("data-label");
        btn.classList.remove("added");
      }, 1200);

      // On product pages, nudge the drawer open so the catch is visible
      if (btn.hasAttribute("data-open-drawer")) openDrawer();
    });
  });

  /* ---------- Quantity stepper (product page) ---------- */
  document.querySelectorAll(".qty-stepper").forEach(function (stp) {
    var out = stp.querySelector(".q");
    stp.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-step]");
      if (!b || !out) return;
      var v = parseInt(out.textContent, 10) || 1;
      v += parseInt(b.getAttribute("data-step"), 10);
      if (v < 1) v = 1;
      if (v > 99) v = 99;
      out.textContent = v;
    });
  });

  /* ---------- Quantity + remove inside drawer / cart (delegated) ---------- */
  function wireLineControls(container) {
    if (!container) return;
    container.addEventListener("click", function (e) {
      var inc = e.target.closest(".inc");
      var dec = e.target.closest(".dec");
      var rem = e.target.closest("[data-remove]");
      if (inc || dec) {
        var holder = e.target.closest(".qty");
        if (!holder) return;
        var key = holder.getAttribute("data-key");
        if (!basket[key]) return;
        if (inc) basket[key].qty += 1;
        if (dec) { basket[key].qty -= 1; if (basket[key].qty <= 0) delete basket[key]; }
        render();
      } else if (rem) {
        delete basket[rem.getAttribute("data-remove")];
        render();
      }
    });
  }
  wireLineControls(body);
  wireLineControls(cartBody);

  /* ---------- Open / close drawer ---------- */
  document.querySelectorAll("#openBasket").forEach(function (b) { b.addEventListener("click", openDrawer); });
  var closeBtn = document.getElementById("closeBasket");
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  if (overlay) overlay.addEventListener("click", closeDrawer);

  /* ---------- Checkout: hand off to the real checkout page ---------- */
  function goToCheckout() {
    if (totals().count === 0) { openDrawer(); return; }
    window.location.href = "checkout.html";
  }
  var checkoutBtn = document.getElementById("checkoutBtn");
  if (checkoutBtn) checkoutBtn.addEventListener("click", goToCheckout);
  var cartCheckout = document.getElementById("cartCheckout");
  if (cartCheckout) cartCheckout.addEventListener("click", goToCheckout);

  /* ---------- Mobile nav ---------- */
  var nav = document.getElementById("nav");
  var navToggle = document.getElementById("navToggle");
  if (nav && navToggle) {
    navToggle.addEventListener("click", function () {
      var open = nav.classList.toggle("menu-open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.querySelectorAll(".nav-links a").forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("menu-open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- Active nav highlight ---------- */
  (function () {
    var page = document.body.getAttribute("data-nav") ||
               (location.pathname.split("/").pop() || "index.html");
    if (!page) page = "index.html";
    document.querySelectorAll(".nav-links a[href]").forEach(function (a) {
      if (a.getAttribute("href") === page) a.classList.add("active");
    });
  })();

  /* ---------- Shop filter chips ---------- */
  var chipRow = document.getElementById("chips");
  if (chipRow) {
    chipRow.addEventListener("click", function (e) {
      var chip = e.target.closest(".chip");
      if (!chip) return;
      chipRow.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
      chip.classList.add("active");
      var cat = chip.getAttribute("data-cat");
      document.querySelectorAll("[data-catch]").forEach(function (card) {
        var tags = card.getAttribute("data-cat") || "";
        var show = cat === "all" || tags.split(" ").indexOf(cat) !== -1;
        card.classList.toggle("hide", !show);
      });
    });
  }

  /* ---------- Contact form (graceful, no backend needed) ---------- */
  var contactForm = document.getElementById("contactForm");
  if (contactForm) {
    contactForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var flag = document.getElementById("formFlag");
      var data = new FormData(contactForm);
      var name = (data.get("name") || "").toString().trim();
      var email = (data.get("email") || "").toString().trim();
      var msg = (data.get("message") || "").toString().trim();
      if (!name || !email || !msg) {
        if (flag) flag.textContent = "Fill in your name, email and message first.";
        return;
      }
      // Until a backend is wired on Cloudflare, hand off to the visitor's mail app.
      var subject = encodeURIComponent("Message for Dave's Fish Stand — " + name);
      var bodyText = encodeURIComponent(
        msg + "\n\n— " + name + " (" + email + ")"
      );
      window.location.href = "mailto:hello@davesfishstand.example?subject=" + subject + "&body=" + bodyText;
      if (flag) flag.textContent = "Opening your mail app… if nothing happens, email hello@davesfishstand.example";
      contactForm.reset();
    });
  }

  /* ---------- Escape closes things ---------- */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && drawer && drawer.classList.contains("open")) closeDrawer();
  });

  render();
})();
