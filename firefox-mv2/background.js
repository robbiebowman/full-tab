
function injectToggle(tabId) {
  const code = `(` + toggleFullTab.toString() + `)();`;
  chrome.tabs.executeScript(tabId, { code: code, allFrames: true });
}
chrome.browserAction.onClicked.addListener((tab) => {
  if (!tab || !tab.id) return;
  injectToggle(tab.id);
});

function toggleFullTab() {
  if (window.top !== window) return;

  const w = window;
  const d = document;
  const stateKey = "__VFT_STATE__";

  const getState = () => (w[stateKey] ||= {
    active: false,
    moved: [],
    mode: "contain",         // "contain" | "cover"
    observer: null,
    innerObserver: null,
    activeEl: null,
    rafId: null,
    resizeHandler: null,
    metaHandler: null
  });

  const isVisible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (cs.visibility === "hidden" || cs.display === "none") return false;
    return true;
  };

  const largestByArea = (els) => {
    let best = null, bestArea = 0;
    for (const el of els) {
      if (!isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) { best = el; bestArea = area; }
    }
    return best;
  };

  const findBest = () => {
    const vids = Array.from(d.querySelectorAll("video"));
    const bestVid = largestByArea(vids);
    if (bestVid) return { el: bestVid, type: "video" };

    const iframes = Array.from(d.querySelectorAll("iframe"));
    const bestFrame = largestByArea(iframes);
    if (bestFrame) return { el: bestFrame, type: "iframe" };

    return null;
  };

  const ensureStyle = (mode) => {
    let style = d.getElementById("vft-style");
    const css = `
      #vft-overlay { position: fixed; inset: 0; background: black; z-index: 2147483647; overflow: hidden; }
      #vft-inner { position: absolute; inset: 0; }
      #vft-inner > .vft-media { position: absolute !important; left: 50% !important; top: 50% !important;
                                transform: translate(-50%, -50%) !important; background: black !important; }
      #vft-ui { position: fixed; right: 12px; bottom: 12px; display: flex; gap: 8px;
                font-family: system-ui, sans-serif; user-select: none; z-index: 2147483647; }
      #vft-ui button { padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,.3);
                       background: rgba(0,0,0,.5); color: white; cursor: pointer; }
      #vft-ui button:hover { background: rgba(255,255,255,.1); }
    `;
    if (!style) { style = d.createElement("style"); style.id = "vft-style"; d.head.appendChild(style); }
    style.textContent = css;
  };

  const makeOverlay = (mode) => {
    ensureStyle(mode);
    let overlay = d.getElementById("vft-overlay");
    if (overlay) return overlay;
    overlay = d.createElement("div");
    overlay.id = "vft-overlay";

    const inner = d.createElement("div");
    inner.id = "vft-inner";
    overlay.appendChild(inner);

    const ui = d.createElement("div");
    ui.id = "vft-ui";
    const mkBtn = (label) => { const b = d.createElement("button"); b.textContent = label; return b; };
    const closeBtn = mkBtn("Close");
    const fitBtn = mkBtn(`Fit: ${mode}`);

    closeBtn.addEventListener("click", () => deactivate());
    fitBtn.addEventListener("click", () => {
      const st = getState();
      st.mode = st.mode === "contain" ? "cover" : "contain";
      fitBtn.textContent = `Fit: ${st.mode}`;
      scheduleLayout();
    });

    ui.appendChild(fitBtn);
    ui.appendChild(closeBtn);
    overlay.appendChild(ui);

    d.body && d.body.appendChild(overlay);
    return overlay;
  };

  const getIntrinsic = (el) => {
    // For video, use videoWidth/Height. For iframe, use bounding rect.
    if (el.tagName === "VIDEO") {
      const vw = el.videoWidth || el.getBoundingClientRect().width || 16;
      const vh = el.videoHeight || el.getBoundingClientRect().height || 9;
      return { w: vw, h: vh };
    } else {
      const r = el.getBoundingClientRect();
      return { w: Math.max(16, r.width), h: Math.max(9, r.height) };
    }
  };

  const layout = () => {
    const st = getState();
    const inner = d.getElementById("vft-inner");
    if (!inner || !st.activeEl) return;
    const vw = inner.clientWidth;
    const vh = inner.clientHeight;
    const { w: mw, h: mh } = getIntrinsic(st.activeEl);
    if (!mw || !mh || !vw || !vh) return;

    const sx = vw / mw;
    const sy = vh / mh;
    const scale = st.mode === "cover" ? Math.max(sx, sy) : Math.min(sx, sy);
    const targetW = Math.round(mw * scale);
    const targetH = Math.round(mh * scale);

    st.activeEl.style.width = targetW + "px";
    st.activeEl.style.height = targetH + "px";
    // Positioning is handled by translate(-50%, -50%) centering.
  };

  const scheduleLayout = () => {
    const st = getState();
    if (st.rafId) cancelAnimationFrame(st.rafId);
    st.rafId = requestAnimationFrame(() => {
      layout();
      st.rafId = null;
    });
  };

  const moveIntoOverlay = (found) => {
    const st = getState();
    const overlay = makeOverlay(st.mode);

    const placeholder = d.createComment("vft-placeholder");
    found.el.parentNode.insertBefore(placeholder, found.el.nextSibling);

    const prevStyle = found.el.getAttribute("style") || "";
    const prevControls = found.type === "video" ? found.el.controls : null;

    // Strip size constraints
    found.el.removeAttribute("width");
    found.el.removeAttribute("height");
    found.el.style.cssText = "";

    const inner = overlay.querySelector("#vft-inner");
    found.el.classList.add("vft-media");
    inner.appendChild(found.el);

    st.activeEl = found.el;
    if (found.type === "video") { try { found.el.controls = prevControls || false; } catch(e) {} }
    if (found.type === "iframe") { found.el.setAttribute("allowfullscreen", "true"); found.el.style.border = "0"; }

    // Handlers
    st.resizeHandler = () => scheduleLayout();
    w.addEventListener("resize", st.resizeHandler, { passive: true });

    st.metaHandler = () => scheduleLayout();
    if (found.type === "video") {
      found.el.addEventListener("loadedmetadata", st.metaHandler, { passive: true });
      found.el.addEventListener("resize", st.metaHandler, { passive: true });
    }

    // Twitch sometimes swaps the video node; reattach and relayout.
    if (st.innerObserver) { try { st.innerObserver.disconnect(); } catch(e) {} }
    st.innerObserver = new MutationObserver(() => {
      const current = inner.querySelector("video, iframe");
      if (current && current !== st.activeEl) {
        st.activeEl = current;
        st.activeEl.classList.add("vft-media");
        scheduleLayout();
      }
    });
    st.innerObserver.observe(inner, { childList: true, subtree: true });

    // Initial layout
    scheduleLayout();

    st.moved.push({ node: found.el, placeholder, prevStyle, prevControls, type: found.type });
    st.active = true;
  };

  const activate = () => {
    const st = getState();
    if (st.active) return;
    ensureStyle(st.mode);

    const found = findBest();
    if (found) {
      moveIntoOverlay(found);
      return;
    }

    let timeoutId = null;
    const start = performance.now();
    const tryActivate = () => {
      if (st.active) return;
      const f = findBest();
      if (f) {
        if (st.observer) { st.observer.disconnect(); st.observer = null; }
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        moveIntoOverlay(f);
      } else if (performance.now() - start > 5000) {
        if (st.observer) { st.observer.disconnect(); st.observer = null; }
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        if (!document.getElementById("vft-overlay")) {
          alert("Video Full Tab: no video found on this page.");
        }
      }
    };

    st.observer = new MutationObserver(tryActivate);
    st.observer.observe(d, { childList: true, subtree: true });
    timeoutId = setTimeout(() => tryActivate(), 250);
  };

  const deactivate = () => {
    const st = getState();
    if (!st.active) return;

    if (st.observer) { st.observer.disconnect(); st.observer = null; }
    if (st.innerObserver) { st.innerObserver.disconnect(); st.innerObserver = null; }
    if (st.resizeHandler) { w.removeEventListener("resize", st.resizeHandler); st.resizeHandler = null; }
    if (st.metaHandler && st.activeEl) {
      try { st.activeEl.removeEventListener("loadedmetadata", st.metaHandler); } catch(e) {}
      try { st.activeEl.removeEventListener("resize", st.metaHandler); } catch(e) {}
      st.metaHandler = null;
    }
    if (st.rafId) { cancelAnimationFrame(st.rafId); st.rafId = null; }

    for (const rec of st.moved) {
      try {
        rec.node.classList.remove("vft-media");
        if (rec.prevStyle) rec.node.setAttribute("style", rec.prevStyle);
        else rec.node.removeAttribute("style");
        if (rec.type === "video" && rec.prevControls !== null) rec.node.controls = rec.prevControls;
        if (rec.placeholder && rec.placeholder.parentNode) {
          rec.placeholder.parentNode.insertBefore(rec.node, rec.placeholder.nextSibling);
          rec.placeholder.remove();
        }
      } catch (e) {}
    }
    st.moved = [];
    st.activeEl = null;

    const overlay = d.getElementById("vft-overlay");
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    const style = d.getElementById("vft-style");
    if (style) style.remove();

    st.active = false;
  };

  const st = getState();
  if (!st.active) activate(); else deactivate();
}
