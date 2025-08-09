
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

  const findBestPlayerTarget = () => {
    // Site-specific player containers we prefer over <video>
    const selectors = [
      // YouTube player container (watch page & embeds)
      "#movie_player",
      ".html5-video-player",
      // Vimeo
      ".player",
      // Dailymotion
      ".dmp_Player",
      // Twitch
      ".video-player__container",
      // Generic: video parent with controls overlays
      "video[controls]::-webkit-media-controls-enclosure", // unlikely, but keep list extensible
    ].filter(Boolean);

    for (const sel of selectors) {
      const nodes = Array.from(DOC.querySelectorAll(sel));
      const best = largestByArea(nodes);
      if (best) return best;
    }
    // Fallback: largest visible <video>
    const vids = Array.from(DOC.querySelectorAll("video"));
    const bestVideo = largestByArea(vids);
    if (bestVideo) return bestVideo;

    return null;
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
    // Per-frame: pick best player target
    const bestPlayer = findBestPlayerTarget();
    if (bestPlayer) {
      bestPlayer.setAttribute("data-vft-target", "1");
    }

    // In top frame, if no player chosen, expand the largest iframe
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
        [data-vft-target="1"], [data-vft-iframe="1"] {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          z-index: 2147483647 !important;
          background: black !important;
        }
        /* Ensure <video> adapts when we're targeting a container (e.g., YouTube player) */
        [data-vft-target="1"] video {
          width: 100% !important;
          height: 100% !important;
          object-fit: contain !important;
          max-width: 100% !important;
          max-height: 100% !important;
        }
        /* Disable pointer-events site-wide so overlays don't steal clicks,
           but keep them working inside our target (controls, captions). */
        * { pointer-events: none !important; }
        [data-vft-target="1"], [data-vft-iframe="1"],
        [data-vft-target="1"] *,
        [data-vft-iframe="1"] * {
          pointer-events: auto !important;
        }

        /* YouTube-specific: hide chrome that might float above */
        html.${FLAG_CLASS} ytd-app #masthead-container,
        html.${FLAG_CLASS} ytd-app #guide,
        html.${FLAG_CLASS} ytd-watch-flexy #secondary,
        html.${FLAG_CLASS} ytd-watch-flexy #below,
        html.${FLAG_CLASS} ytd-watch-flexy ytd-merch-shelf-renderer,
        html.${FLAG_CLASS} tp-yt-app-drawer,
        html.${FLAG_CLASS} ytd-popup-container {
          display: none !important;
        }
      `;
      DOC.head.appendChild(style);
    }
    ROOT.classList.add(FLAG_CLASS);
  };

  const isActive = ROOT.classList.contains(FLAG_CLASS);
  if (isActive) deactivate(); else activate();
}
