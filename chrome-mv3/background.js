
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: toggleFullTab
    });
  } catch (e) {
    console.error("Video Full Tab injection failed:", e);
  }
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
      el.style.removeProperty('transform');
    });
  };

  const activate = () => {
    // Prefer the largest visible <video> in this frame
    const vids = Array.from(DOC.querySelectorAll("video"));
    const bestVideo = largestByArea(vids);
    if (bestVideo) {
      bestVideo.setAttribute("data-vft-target", "1");
    }

    // In top frame, if we didn't find a video, expand the largest iframe
    if (window.top === window) {
      const hasTarget = !!DOC.querySelector('[data-vft-target="1"]');
      if (!hasTarget) {
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
        /* Targeted video or iframe fills viewport */
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

        /* YouTube-specific: hide surrounding chrome while active */
        html.${FLAG_CLASS} ytd-app #masthead-container,
        html.${FLAG_CLASS} ytd-app #guide,
        html.${FLAG_CLASS} ytd-watch-flexy #secondary,
        html.${FLAG_CLASS} ytd-watch-flexy #below,
        html.${FLAG_CLASS} tp-yt-app-drawer,
        html.${FLAG_CLASS} ytd-popup-container {
          display: none !important;
        }
        /* Ensure YouTube's own video container doesn't fight sizing */
        html.${FLAG_CLASS} .html5-video-container,
        html.${FLAG_CLASS} .html5-video-player {
          width: 100% !important;
          height: 100% !important;
        }
      `;
      DOC.head.appendChild(style);
    }
    ROOT.classList.add(FLAG_CLASS);

    // Nudge layout engines that depend on resize
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 50);
  };

  const isActive = ROOT.classList.contains(FLAG_CLASS);
  if (isActive) deactivate(); else activate();
}
