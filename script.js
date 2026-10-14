(() => {
  const gallery = document.getElementById("gallery");
  const lightbox = document.getElementById("lightbox");
  const stage = document.getElementById("lb-stage");
  const lbImg = document.getElementById("lb-img");
  const lbTitle = document.getElementById("lb-title");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

  let current = -1;
  let lastFocused = null;

  /* ---------- Build the gallery ---------- */

  PAINTINGS.forEach((p, i) => {
    const li = document.createElement("li");
    li.className = "card";
    li.innerHTML = `
      <button class="card-btn" type="button">
        <span class="frame"><img loading="lazy" decoding="async"></span>
        <span class="card-title"></span>
      </button>`;
    const img = li.querySelector("img");
    img.src = p.file;
    img.alt = p.title;
    li.querySelector(".card-title").textContent = p.title;

    const btn = li.querySelector(".card-btn");
    btn.addEventListener("click", () => open(i));
    if (finePointer && !reducedMotion) addTilt(btn);

    gallery.appendChild(li);
  });

  // Fade cards in as they scroll into view
  if ("IntersectionObserver" in window && !reducedMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: "0px 0px -40px 0px" });
    gallery.querySelectorAll(".card").forEach((c) => io.observe(c));
  } else {
    gallery.querySelectorAll(".card").forEach((c) => c.classList.add("is-visible"));
  }

  // Gentle 3D tilt that follows the mouse
  function addTilt(btn) {
    const frame = btn.querySelector(".frame");
    btn.addEventListener("pointermove", (e) => {
      const r = frame.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      frame.style.setProperty("--ry", `${x * 8}deg`);
      frame.style.setProperty("--rx", `${-y * 8}deg`);
    });
    btn.addEventListener("pointerleave", () => {
      frame.style.setProperty("--ry", "0deg");
      frame.style.setProperty("--rx", "0deg");
    });
  }

  /* ---------- Lightbox ---------- */

  function open(i) {
    if (!lightbox.open) {
      lastFocused = document.activeElement;
      lightbox.showModal();
    }
    show(i);
  }

  function show(i) {
    current = (i + PAINTINGS.length) % PAINTINGS.length;
    const p = PAINTINGS[current];
    resetZoom(false);
    lbImg.src = p.file;
    lbImg.alt = p.title;
    lbTitle.textContent = p.title;
    history.replaceState(null, "", `#${current + 1}`);

    // Preload neighbours so next/previous feel instant
    [current - 1, current + 1].forEach((n) => {
      new Image().src = PAINTINGS[(n + PAINTINGS.length) % PAINTINGS.length].file;
    });
  }

  function close() {
    lightbox.close();
  }

  lightbox.addEventListener("close", () => {
    resetZoom(false);
    history.replaceState(null, "", location.pathname + location.search);
    if (lastFocused) lastFocused.focus();
  });

  document.getElementById("lb-close").addEventListener("click", close);
  document.getElementById("lb-prev").addEventListener("click", () => show(current - 1));
  document.getElementById("lb-next").addEventListener("click", () => show(current + 1));

  lightbox.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") show(current + 1);
    else if (e.key === "ArrowLeft") show(current - 1);
    else if (e.key === "+" || e.key === "=") zoomAtCenter(scale * 1.5);
    else if (e.key === "-") zoomAtCenter(scale / 1.5);
  });

  /* ---------- Zoom & pan ---------- */

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

  // Pointer handling: tap to zoom, drag to pan, swipe to change, pinch to zoom
  const pointers = new Map();
  let start = null, pinchStart = null;

  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      start = { x: e.clientX, y: e.clientY, tx, ty, target: e.target, t: Date.now() };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
      start = null;
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
    } else if (start && scale > 1.01) {
      stage.classList.add("is-dragging");
      tx = start.tx + (e.clientX - start.x);
      ty = start.ty + (e.clientY - start.y);
      clamp();
      apply();
    }
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    stage.classList.remove("is-dragging");
    if (pointers.size < 2) pinchStart = null;
    if (!start || pointers.size > 0) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const moved = Math.hypot(dx, dy);

    if (moved < 6) {
      // A tap
      if (scale > 1.01) resetZoom();
      else if (start.target === lbImg) zoomAt(2.5, e.clientX, e.clientY);
      else close(); // tapped the empty space around the painting
    } else if (scale <= 1.01 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      show(current + (dx < 0 ? 1 : -1)); // swipe
    }
    start = null;
  }

  stage.addEventListener("pointerup", endPointer);
  stage.addEventListener("pointercancel", endPointer);

  /* ---------- Open from a link like .../#3 ---------- */

  const fromHash = parseInt(location.hash.slice(1), 10);
  if (fromHash >= 1 && fromHash <= PAINTINGS.length) open(fromHash - 1);
})();
