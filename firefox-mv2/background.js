
function injectToggle(tabId) {
  const code = `(` + toggleFullTab.toString() + `)();`;
  chrome.tabs.executeScript(tabId, { code: code, allFrames: true });
}
chrome.browserAction.onClicked.addListener((tab) => {
  if (!tab || !tab.id) return;
  injectToggle(tab.id);
});

function toggleFullTab() {
  const w = window;
  const d = document;
  const stateKey = "__VFT_STATE__";

  const getState = () => (w[stateKey] ||= { active: false, moved: [], fit: "contain", observer: null });

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

  const makeOverlay = (fit) => {
    let overlay = d.getElementById("vft-overlay");
    if (overlay) return overlay;
    overlay = d.createElement("div");
    overlay.id = "vft-overlay";
    overlay.setAttribute("role", "dialog");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      background: "black",
      zIndex: "2147483647",
      display: "grid",
      placeItems: "center",
      overflow: "hidden"
    });

    const inner = d.createElement("div");
    inner.id = "vft-inner";
    Object.assign(inner.style, {
      position: "relative",
      width: "100vw",
      height: "100vh",
      display: "grid",
      placeItems: "center"
    });
    overlay.appendChild(inner);

    // controls
    const ui = d.createElement("div");
    ui.id = "vft-ui";
    Object.assign(ui.style, {
      position: "fixed",
      right: "12px",
      bottom: "12px",
      display: "flex",
      gap: "8px",
      fontFamily: "system-ui, sans-serif",
      userSelect: "none",
      zIndex: "2147483647"
    });
    const mkBtn = (label) => {
      const b = d.createElement("button");
      b.textContent = label;
      Object.assign(b.style, {
        padding: "6px 10px",
        borderRadius: "8px",
        border: "1px solid rgba(255,255,255,.3)",
        background: "rgba(0,0,0,.5)",
        color: "white",
        cursor: "pointer"
      });
      b.onmouseenter = () => b.style.background = "rgba(255,255,255,.1)";
      b.onmouseleave = () => b.style.background = "rgba(0,0,0,.5)";
      return b;
    };
    const closeBtn = mkBtn("Close");
    const fitBtn = mkBtn(fit === "cover" ? "Fit: cover" : "Fit: contain");

    closeBtn.addEventListener("click", () => deactivate());
    fitBtn.addEventListener("click", () => {
      const st = getState();
      st.fit = st.fit === "contain" ? "cover" : "contain";
      fitBtn.textContent = `Fit: ${st.fit}`;
      applyFit(st.fit);
    });

    ui.appendChild(fitBtn);
    ui.appendChild(closeBtn);
    overlay.appendChild(ui);

    d.documentElement.classList.add("vft-active");
    d.body && d.body.classList.add("vft-active");
    d.body && d.body.appendChild(overlay);
    return overlay;
  };

  const applyFit = (fit) => {
    const overlay = d.getElementById("vft-overlay");
    if (!overlay) return;
    const target = overlay.querySelector("#vft-inner > video, #vft-inner > iframe");
    if (!target) return;
    if (target.tagName === "VIDEO") {
      Object.assign(target.style, {
        objectFit: fit,
        width: "100%",
        height: "100%",
        maxWidth: "100%",
        maxHeight: "100%",
        background: "black"
      });
    } else {
      target.style.width = "100%";
      target.style.height = "100%";
      target.style.border = "0";
    }
  };

  const moveIntoOverlay = (found) => {
    const st = getState();
    const overlay = makeOverlay(st.fit);

    const placeholder = d.createComment("vft-placeholder");
    found.el.parentNode.insertBefore(placeholder, found.el.nextSibling);

    const prevStyle = found.el.getAttribute("style") || "";
    const prevControls = found.type === "video" ? found.el.controls : null;

    found.el.style.cssText = "";
    found.el.removeAttribute("width");
    found.el.removeAttribute("height");

    const inner = overlay.querySelector("#vft-inner");
    inner.appendChild(found.el);

    if (found.type === "video") {
      found.el.controls = prevControls || false;
      Object.assign(found.el.style, {
        width: "100%",
        height: "100%",
        objectFit: st.fit,
        background: "black"
      });
    } else {
      found.el.setAttribute("allowfullscreen", "true");
      found.el.style.width = "100%";
      found.el.style.height = "100%";
      found.el.style.border = "0";
    }

    st.moved.push({ node: found.el, placeholder, prevStyle, prevControls, type: found.type });
    st.active = true;
    applyFit(st.fit);
  };

  const activate = () => {
    const st = getState();
    if (st.active) return;

    const found = findBest();
    if (found) {
      moveIntoOverlay(found);
      return;
    }

    // Wait up to 5s for a video/iframe to appear
    let timeoutId = null;
    const start = performance.now();
    const tryActivate = () => {
      const f = findBest();
      if (f) {
        if (st.observer) { st.observer.disconnect(); st.observer = null; }
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        moveIntoOverlay(f);
      } else if (performance.now() - start > 5000) {
        if (st.observer) { st.observer.disconnect(); st.observer = null; }
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        alert("Video Full Tab: no video found on this page.");
      }
    };

    st.observer = new MutationObserver(tryActivate);
    st.observer.observe(d, { childList: true, subtree: true });
    timeoutId = setTimeout(() => {
      tryActivate();
    }, 250);
  };

  const deactivate = () => {
    const st = getState();
    if (!st.active) return;

    if (st.observer) { st.observer.disconnect(); st.observer = null; }

    for (const rec of st.moved) {
      try {
        if (rec.prevStyle) rec.node.setAttribute("style", rec.prevStyle);
        else rec.node.removeAttribute("style");
        if (rec.type === "video" && rec.prevControls !== null) {
          rec.node.controls = rec.prevControls;
        }
        if (rec.placeholder && rec.placeholder.parentNode) {
          rec.placeholder.parentNode.insertBefore(rec.node, rec.placeholder.nextSibling);
          rec.placeholder.remove();
        }
      } catch (e) {}
    }
    st.moved = [];

    const overlay = d.getElementById("vft-overlay");
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    d.documentElement.classList.remove("vft-active");
    d.body && d.body.classList.remove("vft-active");

    st.active = false;
  };

  const st = getState();
  if (!st.active) activate(); else deactivate();
}
