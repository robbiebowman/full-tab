
// MV2 Firefox/Chrome-compatible background using tabs.executeScript.
function injectToggle(tabId) {
  // Define the function source as a string so we can inject with code:
  const code = `(${toggleFullTab.toString()})();`;
  chrome.tabs.executeScript(tabId, { code: code, allFrames: true });
}

chrome.browserAction.onClicked.addListener((tab) => {
  if (!tab || !tab.id) return;
  injectToggle(tab.id);
});

function toggleFullTab() {
  const DOC = document;
  const ROOT = DOC.documentElement;
  const FLAG_CLASS = "vft-active";
  const STYLE_ID = "vft-style";

  const isVisible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      style.opacity !== "0"
    );
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

  const deactivate = () => {
    const style = DOC.getElementById(STYLE_ID);
    if (style) style.remove();
    ROOT.classList.remove(FLAG_CLASS);
    DOC.querySelectorAll("[data-vft-target],[data-vft-iframe]").forEach(el => {
      el.removeAttribute("data-vft-target");
      el.removeAttribute("data-vft-iframe");
    });
  };

  const activate = () => {
    const vids = Array.from(DOC.querySelectorAll("video"));
    const bestVideo = largestByArea(vids);
    if (bestVideo) bestVideo.setAttribute("data-vft-target", "1");

    if (window.top === window) {
      const hasTopVideo = !!DOC.querySelector('[data-vft-target="1"]');
      if (!hasTopVideo) {
        const iframes = Array.from(DOC.querySelectorAll("iframe"));
        const bestIframe = largestByArea(iframes);
        if (bestIframe) bestIframe.setAttribute("data-vft-iframe", "1");
      }
    }

    if (!DOC.getElementById(STYLE_ID)) {
      const style = DOC.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        html.${FLAG_CLASS}, body.${FLAG_CLASS} {
          overflow: hidden !important;
          background: black !important;
        }
        [data-vft-target="1"], [data-vft-iframe="1"] {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          z-index: 2147483647 !important;
          background: black !important;
        }
        [data-vft-target="1"] {
          object-fit: contain !important;
          max-width: 100vw !important;
          max-height: 100vh !important;
        }
        * { pointer-events: none !important; }
        [data-vft-target="1"], [data-vft-iframe="1"] {
          pointer-events: auto !important;
        }
      `;
      DOC.head.appendChild(style);
    }
    ROOT.classList.add(FLAG_CLASS);
  };

  const isActive = ROOT.classList.contains(FLAG_CLASS);
  if (isActive) deactivate(); else activate();
}
