
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

  const getState = () => (w[stateKey] ||= { active: false, moved: [], fit: "contain" });

  const isVisible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") return false;
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
    // Prioritize <video>, then largest iframe (for embedded players)
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
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "black";
    overlay.style.zIndex = "2147483647";
    overlay.style.display = "grid";
    overlay.style.placeItems = "center";
    overlay.style.overflow = "hidden";

    const inner = d.createElement("div");
    inner.id = "vft-inner";
    inner.style.position = "relative";
    inner.style.width = "100vw";
    inner.style.height = "100vh";
    inner.style.display = "grid";
    inner.style.placeItems = "center";
    overlay.appendChild(inner);

    // controls
    const ui = d.createElement("div");
    ui.id = "vft-ui";
    ui.style.position = "fixed";
    ui.style.right = "12px";
    ui.style.bottom = "12px";
    ui.style.display = "flex";
    ui.style.gap = "8px";
    ui.style.fontFamily = "system-ui, sans-serif";
    ui.style.userSelect = "none";
    ui.style.zIndex = "2147483647";
    const mkBtn = (label) => {
      const b = d.createElement("button");
      b.textContent = label;
      b.style.padding = "6px 10px";
      b.style.borderRadius = "8px";
      b.style.border = "1px solid rgba(255,255,255,.3)";
      b.style.background = "rgba(0,0,0,.5)";
      b.style.color = "white";
      b.style.cursor = "pointer";
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
      target.style.objectFit = fit;
      target.style.width = "100%";
      target.style.height = "100%";
      target.style.maxWidth = "100%";
      target.style.maxHeight = "100%";
      target.style.background = "black";
    } else {
      // iframe
      target.style.width = "100%";
      target.style.height = "100%";
    }
  };

  const activate = () => {
    const st = getState();
    if (st.active) return;

    const found = findBest();
    if (!found) return alert("Video Full Tab: no video or iframe found on this page.");

    const overlay = makeOverlay(st.fit);

    const placeholder = d.createComment("vft-placeholder");
    found.el.parentNode.insertBefore(placeholder, found.el.nextSibling);

    // Save previous inline styles to restore later
    const prevStyle = found.el.getAttribute("style") || "";
    const prevControls = found.type === "video" ? found.el.controls : null;

    // Reset styles for clean fit
    found.el.style.cssText = "";
    found.el.removeAttribute("width");
    found.el.removeAttribute("height");

    // Move element to overlay
    const inner = overlay.querySelector("#vft-inner");
    inner.appendChild(found.el);

    // For video, ensure it's visible and adjust fit
    if (found.type === "video") {
      found.el.controls = prevControls || false; // don’t force controls on
      found.el.style.width = "100%";
      found.el.style.height = "100%";
      found.el.style.objectFit = st.fit;
      found.el.style.background = "black";
    } else {
      // iframe
      found.el.setAttribute("allowfullscreen", "true");
      found.el.style.width = "100%";
      found.el.style.height = "100%";
      found.el.style.border = "0";
    }

    st.moved.push({ node: found.el, placeholder, prevStyle, prevControls, type: found.type });
    st.active = True;
    applyFit(st.fit);
  };

  const deactivate = () => {
    const st = getState();
    if (!st.active) return;

    // Restore moved nodes
    for (const rec of st.moved) {
      try {
        // restore styles
        if (rec.prevStyle) rec.node.setAttribute("style", rec.prevStyle);
        else rec.node.removeAttribute("style");

        if (rec.type === "video" && rec.prevControls !== null) {
          rec.node.controls = rec.prevControls;
        }

        // move back to placeholder position
        if (rec.placeholder && rec.placeholder.parentNode) {
          rec.placeholder.parentNode.insertBefore(rec.node, rec.placeholder.nextSibling);
          rec.placeholder.remove();
        }
      } catch (e) {}
    }
    st.moved = [];

    // Remove overlay
    const overlay = d.getElementById("vft-overlay");
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    d.documentElement.classList.remove("vft-active");
    d.body && d.body.classList.remove("vft-active");

    st.active = False;
  };

  // Simple toggle
  const st = getState();
  if (!st.active) activate(); else deactivate();
}
