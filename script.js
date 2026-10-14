(() => {
  const N = PAINTINGS.length;
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const wrap = (i) => (i + N) % N;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const label = (i) => `${pad(i + 1)} — ${PAINTINGS[i].title}`;

  /* ---------- Giant wordmarks fill their width ---------- */

  function fitAll() {
    document.querySelectorAll(".fit").forEach((el) => {
      const target = el.parentElement.clientWidth;
      el.style.fontSize = "100px";
      const w = el.getBoundingClientRect().width;
      if (w) el.style.fontSize = `${(100 * target) / w}px`;
    });
  }
  fitAll();
  document.fonts?.ready.then(fitAll);
  new ResizeObserver(fitAll).observe(document.documentElement);

  /* ---------- Intro: cut along the line ---------- */

  const curtain = $("curtain");
  const page = $("page");
  const line = $("c-line");
  const lineScissors = line.querySelector(".scissors");
  let seen = false;
  try { seen = sessionStorage.getItem("cut") === "1"; } catch {}

  if (seen || location.hash) {
    curtain.remove();
    document.body.classList.remove("has-curtain");
    requestAnimationFrame(start);
  } else {
    setupCurtain();
  }

  function setupCurtain() {
    page.inert = true;
    let done = false;
    let cut = 0;
    const setCut = (v) => { cut = v; line.style.setProperty("--cut", v); };
    // Start with the scissors fully on screen, just in from the left edge
    setCut((lineScissors.getBoundingClientRect().width + 24) / line.getBoundingClientRect().width);
    lineScissors.classList.add("snip-idle");

    // Loading counter and one dot per painting
    const dots = $("c-dots");
    const count = $("c-count");
    let loaded = 0, shown = 0;
    PAINTINGS.forEach((p) => {
      const dot = document.createElement("i");
      dots.appendChild(dot);
      const img = new Image();
      img.onload = img.onerror = () => { loaded++; dot.classList.add("is-loaded"); };
      img.src = p.file;
    });
    (function tick() {
      const target = (loaded / N) * 100;
      shown += (target - shown) * 0.12;
      if (target - shown < 0.5) shown = target;
      count.textContent = String(Math.round(shown)).padStart(3, "0");
      if (!done) requestAnimationFrame(tick);
    })();

    // Drag the scissors along the line
    let dragging = false;
    line.addEventListener("pointerdown", (e) => {
      if (done) return;
      dragging = true;
      line.setPointerCapture(e.pointerId);
      line.classList.add("is-dragging");
      lineScissors.classList.replace("snip-idle", "is-snipping");
    });
    line.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const r = line.getBoundingClientRect();
      setCut(Math.min(1, Math.max(cut, (e.clientX - r.left) / r.width)));
      if (cut > 0.97) finish();
    });
    const release = () => {
      if (!dragging) return;
      dragging = false;
      line.classList.remove("is-dragging");
      if (cut > 0.5) finish();
      else lineScissors.classList.replace("is-snipping", "snip-idle");
    };
    line.addEventListener("pointerup", release);
    line.addEventListener("pointercancel", release);

    // Other ways in: the button, the bottom half, scrolling, swiping up, keys
    $("c-cut").addEventListener("click", finish);
    curtain.querySelector(".c-bottom").addEventListener("click", finish);
    curtain.addEventListener("wheel", (e) => { if (e.deltaY > 10) finish(); }, { passive: true });
    let touchY = null;
    curtain.addEventListener("touchstart", (e) => { touchY = e.touches[0].clientY; }, { passive: true });
    curtain.addEventListener("touchend", (e) => {
      if (touchY !== null && touchY - e.changedTouches[0].clientY > 50) finish();
      touchY = null;
    });
    addEventListener("keydown", function onKey(e) {
      if (done) return removeEventListener("keydown", onKey);
      if (["ArrowDown", "PageDown", "Escape", " ", "Enter"].includes(e.key) && e.target === document.body) {
        e.preventDefault();
        finish();
      }
    });

    function finish() {
      if (done) return;
      done = true;
      try { sessionStorage.setItem("cut", "1"); } catch {}
      lineScissors.classList.remove("snip-idle");
      lineScissors.classList.add("is-snipping");

      // The scissors run the rest of the way, then the sheet splits open
      const from = cut;
      const dur = reducedMotion ? 1 : 300 + (1 - from) * 900;
      const t0 = performance.now();
      (function run(now) {
        const t = Math.min(1, (now - t0) / dur);
        setCut(from + (1.06 - from) * (1 - Math.pow(1 - t, 2)));
        if (t < 1) return requestAnimationFrame(run);
        curtain.classList.add("is-open");
        page.inert = false;
        document.body.classList.remove("has-curtain");
        setTimeout(start, reducedMotion ? 0 : 250);
        setTimeout(() => curtain.remove(), reducedMotion ? 0 : 1200);
      })(t0);
    }

  }

  /* ---------- Header details ---------- */

  $("count-serif").textContent = `${N} painting${N === 1 ? "" : "s"}`;
  $("on-view").textContent = `${pad(N)} works on view`;
  $("year").textContent = new Date().getFullYear();

  function clock() {
    const d = new Date();
    const off = -d.getTimezoneOffset();
    const h = Math.trunc(Math.abs(off) / 60), m = Math.abs(off) % 60;
    const gmt = `GMT${off < 0 ? "-" : "+"}${h}${m ? ":" + pad(m) : ""}`;
    $("clock").textContent = `${d.toLocaleTimeString("en-GB")} (${gmt})`;
  }
  clock();
  setInterval(clock, 1000);

  /* ---------- The pile ---------- */

  const pile = $("pile-cards");
  const pileLabel = $("pile-label");
  const cards = [];
  let order = PAINTINGS.map((_, i) => N - 1 - i); // back → front, first painting on top
  let busy = false;
  const front = () => order[N - 1];

  PAINTINGS.forEach((p, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<button class="pile-card" type="button"><img alt="" draggable="false"></button>`;
    const card = li.firstElementChild;
    card.querySelector("img").src = p.file;
    card.setAttribute("aria-label", `Open ${p.title}`);
    card.addEventListener("pointerenter", () => (pileLabel.textContent = label(i)));
    card.addEventListener("focus", () => (pileLabel.textContent = label(i)));
    card.addEventListener("click", (e) => {
      if (card.dataset.dragged) { delete card.dataset.dragged; e.preventDefault(); return; }
      open(i);
    });
    addFling(card, i);
    cards[i] = card;
    pile.appendChild(li);
  });

  pile.addEventListener("pointerleave", () => {
    pileLabel.textContent = label(front());
    pile.style.setProperty("--mx", 0);
    pile.style.setProperty("--my", 0);
  });
  pile.addEventListener("focusout", () => (pileLabel.textContent = label(front())));

  // Cascade the cards from the back (top-left) to the front (bottom-right)
  function layout() {
    const W = pile.clientWidth, H = pile.clientHeight;
    let cw = W * parseFloat(getComputedStyle(pile).getPropertyValue("--cw"));
    if (cw * 0.75 > H * 0.7) cw = (H * 0.7) / 0.75;
    const ch = cw * 0.75;
    const px = W * 0.05, py = H * 0.08;
    const steps = Math.max(1, N - 1);
    const dx = (W - 2 * px - cw) / steps, dy = (H - 2 * py - ch) / steps;
    pile.style.setProperty("--cw-px", `${cw}px`);
    order.forEach((idx, k) => {
      const c = cards[idx];
      c.style.setProperty("--x", `${px + k * dx}px`);
      c.style.setProperty("--y", `${py + k * dy}px`);
      c.style.setProperty("--k", k);
      c.style.setProperty("--d", ((k + 1) / N).toFixed(3));
      c.classList.toggle("is-front", k === N - 1);
    });
    pileLabel.textContent = label(front());
  }
  layout();
  new ResizeObserver(layout).observe(pile);

  // Cards drift with the mouse; the ones in front move more
  if (finePointer && !reducedMotion) {
    pile.addEventListener("pointermove", (e) => {
      const r = pile.getBoundingClientRect();
      pile.style.setProperty("--mx", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
      pile.style.setProperty("--my", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
    });
  }

  // Send the front card to the back
  function shuffle(dir = 1) {
    if (busy || N < 2) return;
    busy = true;
    pile.classList.remove("is-dealing");
    const idx = front();
    const card = cards[idx];
    card.style.setProperty("--fly", dir);
    card.classList.add("is-flying");
    let landed = false;
    const finishFly = () => {
      if (landed) return;
      landed = true;
      card.classList.add("no-trans");
      card.classList.remove("is-flying");
      card.style.removeProperty("--dx");
      order = [idx, ...order.slice(0, -1)];
      layout();
      card.offsetWidth; // apply the new spot before re-enabling transitions
      card.classList.remove("no-trans");
      card.classList.add("is-landing");
      card.addEventListener("animationend", () => card.classList.remove("is-landing"), { once: true });
      busy = false;
    };
    if (reducedMotion) return finishFly();
    card.addEventListener("animationend", finishFly, { once: true });
    setTimeout(finishFly, 700); // in case the animation never reports back
  }

  $("shuffle").addEventListener("click", () => shuffle(1));

  // Drag the front card sideways and let go to toss it to the back
  function addFling(card, i) {
    let sx = null, dx = 0;
    card.addEventListener("pointerdown", (e) => {
      if (i !== front() || busy) return;
      sx = e.clientX; dx = 0;
    });
    card.addEventListener("pointermove", (e) => {
      if (sx === null) return;
      dx = e.clientX - sx;
      if (Math.abs(dx) > 6 && !card.classList.contains("is-dragging")) {
        card.setPointerCapture(e.pointerId);
        card.classList.add("is-dragging");
      }
      if (card.classList.contains("is-dragging")) card.style.setProperty("--dx", `${dx}px`);
    });
    const end = () => {
      if (sx === null) return;
      sx = null;
      if (!card.classList.contains("is-dragging")) return;
      card.classList.remove("is-dragging");
      card.dataset.dragged = "1";
      setTimeout(() => delete card.dataset.dragged, 50);
      if (Math.abs(dx) > 70) shuffle(dx > 0 ? 1 : -1);
      else card.style.removeProperty("--dx");
    };
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
  }

  // Deal the cards in once the page is revealed
  function start() {
    pile.classList.replace("is-waiting", "is-dealing");
    setTimeout(() => pile.classList.remove("is-dealing"), 900 + N * 90);
  }

  /* ---------- Index: list or grid ---------- */

  const items = $("items");
  const preview = $("preview");

  PAINTINGS.forEach((p, i) => {
    const li = document.createElement("li");
    li.className = "reveal";
    li.innerHTML = `
      <button class="row" type="button">
        <span class="r-num">(${pad(i + 1)})</span>
        <span class="r-title"></span>
        <span class="r-media"><img loading="lazy" decoding="async" alt=""></span>
        <svg class="r-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6"/></svg>
      </button>`;
    li.querySelector(".r-title").textContent = p.title;
    li.querySelector("img").src = p.file;
    const row = li.firstElementChild;
    row.setAttribute("aria-label", `Open ${p.title}`);
    row.addEventListener("click", () => open(i));
    row.addEventListener("pointerenter", () => {
      if (!finePointer || items.dataset.view !== "list") return;
      preview.src = p.file;
      preview.classList.add("is-on");
    });
    items.appendChild(li);
  });

  items.addEventListener("pointerleave", () => preview.classList.remove("is-on"));

  const toggles = document.querySelectorAll(".toggle button");
  function setView(view) {
    items.dataset.view = view;
    toggles.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === view)));
    preview.classList.remove("is-on");
    try { localStorage.setItem("view", view); } catch {}
  }
  toggles.forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  try { const v = localStorage.getItem("view"); if (v === "grid") setView(v); } catch {}

  // The preview eases after the cursor and tilts with its speed
  if (finePointer) {
    let mx = 0, my = 0, x = 0, y = 0;
    addEventListener("pointermove", (e) => { mx = e.clientX; my = e.clientY; });
    (function follow() {
      const vx = mx - x;
      x += vx * (reducedMotion ? 1 : 0.16);
      y += (my - y) * (reducedMotion ? 1 : 0.16);
      preview.style.setProperty("--px", `${x}px`);
      preview.style.setProperty("--py", `${y}px`);
      preview.style.setProperty("--pr", `${Math.max(-12, Math.min(12, vx * 0.08))}deg`);
      requestAnimationFrame(follow);
    })();
  }

  /* ---------- Scroll reveal ---------- */

  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reducedMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const n = [...e.target.parentElement.children].indexOf(e.target);
        e.target.style.transitionDelay = `${(n % 4) * 70}ms`;
        e.target.classList.add("is-visible");
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -40px 0px" });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-visible"));
  }

  // Snip the footer scissors while the footer is on screen
  const footScissors = document.querySelector(".foot-line .scissors");
  if ("IntersectionObserver" in window && !reducedMotion) {
    new IntersectionObserver(([e]) => footScissors.classList.toggle("snip-idle", e.isIntersecting))
      .observe(footScissors);
  }

  /* ---------- Lightbox ---------- */

  const lightbox = $("lightbox");
  const stage = $("lb-stage");
  const lbImg = $("lb-img");
  let current = -1;
  let lastFocused = null;

  function open(i) {
    preview.classList.remove("is-on");
    if (!lightbox.open) {
      lastFocused = document.activeElement;
      lightbox.showModal();
    }
    show(i);
  }

  function show(i) {
    current = wrap(i);
    const p = PAINTINGS[current];
    resetZoom(false);
    lbImg.src = p.file;
    lbImg.alt = p.title;
    $("lb-title").textContent = p.title;
    $("lb-count").textContent = `${pad(current + 1)} / ${pad(N)}`;
    history.replaceState(null, "", `#${current + 1}`);
    [current - 1, current + 1].forEach((n) => (new Image().src = PAINTINGS[wrap(n)].file));
  }

  lightbox.addEventListener("close", () => {
    resetZoom(false);
    history.replaceState(null, "", location.pathname + location.search);
    if (lastFocused && lastFocused.isConnected) lastFocused.focus();
  });

  $("lb-close").addEventListener("click", () => lightbox.close());
  $("lb-prev").addEventListener("click", () => show(current - 1));
  $("lb-next").addEventListener("click", () => show(current + 1));

  lightbox.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") show(current + 1);
    else if (e.key === "ArrowLeft") show(current - 1);
    else if (e.key === "+" || e.key === "=") zoomAtCenter(scale * 1.5);
    else if (e.key === "-") zoomAtCenter(scale / 1.5);
  });

  /* Zoom & pan */

  const MAX_SCALE = 5;
  let scale = 1, tx = 0, ty = 0;

  function apply() {
    lbImg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    const zoomed = scale > 1.01;
    stage.classList.toggle("is-zoomed", zoomed);
    lightbox.classList.toggle("is-zoomed", zoomed);
  }

  function resetZoom(animate = true) {
    if (!animate) lbImg.style.transition = "none";
    scale = 1; tx = 0; ty = 0;
    apply();
    if (!animate) requestAnimationFrame(() => (lbImg.style.transition = ""));
  }

  // Keep the zoomed image covering its box so it can't be dragged away
  function clamp() {
    const w = lbImg.offsetWidth, h = lbImg.offsetHeight;
    tx = Math.min(0, Math.max(w - w * scale, tx));
    ty = Math.min(0, Math.max(h - h * scale, ty));
  }

  // Zoom so the image point under (clientX, clientY) stays put
  function zoomAt(newScale, clientX, clientY) {
    newScale = Math.min(MAX_SCALE, Math.max(1, newScale));
    const r = lbImg.getBoundingClientRect();
    const lx = clientX - (r.left - tx);
    const ly = clientY - (r.top - ty);
    tx = lx - ((lx - tx) / scale) * newScale;
    ty = ly - ((ly - ty) / scale) * newScale;
    scale = newScale;
    if (scale === 1) { tx = 0; ty = 0; }
    clamp();
    apply();
  }

  function zoomAtCenter(newScale) {
    const r = lbImg.getBoundingClientRect();
    zoomAt(newScale, r.left + r.width / 2, r.top + r.height / 2);
  }

  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomAt(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
  }, { passive: false });

  // Tap to zoom, drag to pan, swipe to change, pinch to zoom
  const pointers = new Map();
  let startPt = null, pinchStart = null;

  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      startPt = { x: e.clientX, y: e.clientY, tx, ty, target: e.target };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
      startPt = null;
    }
  });

  stage.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      stage.classList.add("is-dragging");
      zoomAt(pinchStart.scale * (dist / pinchStart.dist), (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (startPt && scale > 1.01) {
      stage.classList.add("is-dragging");
      tx = startPt.tx + (e.clientX - startPt.x);
      ty = startPt.ty + (e.clientY - startPt.y);
      clamp();
      apply();
    }
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    stage.classList.remove("is-dragging");
    if (pointers.size < 2) pinchStart = null;
    if (!startPt || pointers.size > 0) return;

    const dx = e.clientX - startPt.x;
    const dy = e.clientY - startPt.y;

    if (Math.hypot(dx, dy) < 6) {
      if (scale > 1.01) resetZoom();
      else if (startPt.target === lbImg) zoomAt(2.5, e.clientX, e.clientY);
      else lightbox.close(); // tapped the empty space around the painting
    } else if (scale <= 1.01 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      show(current + (dx < 0 ? 1 : -1));
    }
    startPt = null;
  }

  stage.addEventListener("pointerup", endPointer);
  stage.addEventListener("pointercancel", endPointer);

  /* ---------- Open from a link like .../#3 ---------- */

  const fromHash = parseInt(location.hash.slice(1), 10);
  if (fromHash >= 1 && fromHash <= N) open(fromHash - 1);
})();
