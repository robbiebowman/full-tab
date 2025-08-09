
const MODE_KEY = "vft_mode";

function getMode() {
  return new Promise((resolve) => {
    chrome.storage.local.get(MODE_KEY, (res) => {
      const m = (res && res[MODE_KEY] === "cover") ? "cover" : "contain";
      resolve(m);
    });
  });
}
function setMode(mode) {
  return new Promise((resolve) => {
    const obj = {}; obj[MODE_KEY] = mode;
    chrome.storage.local.set(obj, resolve);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "toggle-fit",
    title: "Toggle Fit (Contain/Cover)",
    contexts: ["browser_action", "action"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "toggle-fit" || !tab || !tab.id) return;
  const current = await getMode();
  const next = current === "contain" ? "cover" : "contain";
  await setMode(next);
  // Try to poke the page if overlay is active
  chrome.tabs.executeScript(tab.id, {
    code: `(function(){ if (window.__VFT_API__) window.__VFT_API__.setMode(${JSON.stringify(next)}); })();`
  });
});

chrome.browserAction.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  const mode = await getMode();
  const code = `(${toggleFullTab.toString()})(${JSON.stringify(mode)});`;
  chrome.tabs.executeScript(tab.id, { code: code, allFrames: true });
});

function toggleFullTab(preferredMode) {
  if (window.top !== window) return;

  const w = window;
  const d = document;
  const stateKey = "__VFT_STATE__";

  const getState = () => (w[stateKey] ||= {
    active: false,
    moved: [],
    mode: preferredMode || "contain", // "contain" | "cover"
    observer: null,
    innerObserver: null,
    activeEl: null,
    rafId: null,
    resizeHandler: null,
    metaHandler: null
  });

  // Simple public API for background to poke
  w.__VFT_API__ = {
    setMode: (m) => { const st = getState(); st.mode = (m === "cover" ? "cover" : "contain"); scheduleLayout(); },
    getMode: () => getState().mode,
    isActive: () => getState().active,
    toggle: () => { const st = getState(); if (!st.active) activate(); else deactivate(); }
  };

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

  const ensureStyle = () => {
    let style = d.getElementById("vft-style");
    const css = `
      #vft-overlay { position: fixed; inset: 0; background: black; z-index: 2147483647; overflow: hidden; }
      #vft-inner { position: absolute; inset: 0; }
      #vft-inner > .vft-media { position: absolute !important; left: 50% !important; top: 50% !important;
                                transform: translate(-50%, -50%) !important; background: black !important; }
    `;
    if (!style) { style = d.createElement("style"); style.id = "vft-style"; d.head.appendChild(style); }
    style.textContent = css;
  };

  const makeOverlay = () => {
    ensureStyle();
    let overlay = d.getElementById("vft-overlay");
    if (overlay) return overlay;
    overlay = d.createElement("div");
    overlay.id = "vft-overlay";
    const inner = d.createElement("div");
    inner.id = "vft-inner";
    overlay.appendChild(inner);
    d.body && d.body.appendChild(overlay);
    return overlay;
  };

  const getIntrinsic = (el) => {
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
    const sx = vw / mw, sy = vh / mh;
    const scale = st.mode === "cover" ? Math.max(sx, sy) : Math.min(sx, sy);
    const targetW = Math.round(mw * scale);
    const targetH = Math.round(mh * scale);
    st.activeEl.style.width = targetW + "px";
    st.activeEl.style.height = targetH + "px";
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
    const overlay = makeOverlay();

    const placeholder = d.createComment("vft-placeholder");
    found.el.parentNode.insertBefore(placeholder, found.el.nextSibling);

    const prevStyle = found.el.getAttribute("style") || "";
    const prevControls = found.type === "video" ? found.el.controls : null;

    found.el.removeAttribute("width");
    found.el.removeAttribute("height");
    found.el.style.cssText = "";

    const inner = overlay.querySelector("#vft-inner");
    found.el.classList.add("vft-media");
    inner.appendChild(found.el);

    st.activeEl = found.el;
    if (found.type === "video") { try { found.el.controls = prevControls || false; } catch(e) {} }
    if (found.type === "iframe") { found.el.setAttribute("allowfullscreen", "true"); found.el.style.border = "0"; }

    st.resizeHandler = () => scheduleLayout();
    w.addEventListener("resize", st.resizeHandler, { passive: true });

    st.metaHandler = () => scheduleLayout();
    if (found.type === "video") {
      found.el.addEventListener("loadedmetadata", st.metaHandler, { passive: true });
      found.el.addEventListener("resize", st.metaHandler, { passive: true });
    }

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

    scheduleLayout();

    st.moved.push({ node: found.el, placeholder, prevStyle, prevControls, type: found.type });
    st.active = true;
  };

  const activate = () => {
    const st = getState();
    if (st.active) return;
    ensureStyle();

    const found = findBest();
    if (found) { moveIntoOverlay(found); return; }

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
