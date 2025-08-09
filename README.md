# Full Tab

<img src="chrome-mv3/icons/icon128.png" alt="Full Tab Icon" width="64" height="64">

A cross-browser extension that toggles videos (or the largest iframe) to fill the entire browser tab with pixel-perfect fit.

## Download

- **Chrome**: [Chrome Web Store](https://chromewebstore.google.com/detail/dhkcndahfmecapcghdcegojdpnadbkgp/preview?hl=en-GB&authuser=0&pli=1)
- **Firefox**: [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/full-tab/)

## How it works

1. Click the extension icon while on any webpage
2. The extension finds the largest visible video element
3. If no video is found, it falls back to the largest visible iframe
4. The selected element is moved to a full-screen overlay that fills the entire browser tab
5. Videos maintain their aspect ratio using "contain" scaling (letterboxing/pillarboxing as needed)
6. Click the icon again to return to normal view

## Features

- **Smart detection**: Automatically finds the best video or iframe on the page
- **Pixel-perfect fit**: Videos scale to fill the tab while maintaining aspect ratio
- **Cross-frame support**: Works with videos inside iframes
- **Preserved controls**: Video controls remain functional in full-tab mode
- **Clean restoration**: Elements are perfectly restored to their original position and styling

## Technical Details

### Browser Compatibility
- **Chrome**: Uses Manifest V3 with `chrome.scripting` API
- **Firefox**: Uses Manifest V2 with `chrome.tabs.executeScript`

### Permissions
- `activeTab`: Required to inject scripts into the current tab
- `scripting` (Chrome only): Required for Chrome's MV3 script injection
- `<all_urls>` (Firefox only): Required for Firefox's script injection method

### Architecture
The extension uses a shared `toggleFullTab()` function that:
- Detects elements using visibility and size heuristics
- Creates a black overlay with maximum z-index
- Moves the target element into the overlay with proper positioning
- Handles cleanup and restoration when toggled off

## Development

This is a simple browser extension without a build system. The repository contains two directories:

- `chrome-mv3/`: Chrome extension using Manifest V3
- `firefox-mv2/`: Firefox extension using Manifest V2

### Loading for Development

**Chrome:**
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `chrome-mv3/` folder

**Firefox:**
1. Open `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on" and select `firefox-mv2/manifest.json`

### Testing

Test the extension on various sites:
- YouTube videos
- Embedded videos (Vimeo, etc.)
- Sites with iframes
- Pages with multiple videos/iframes

## License

This project is open source. Feel free to contribute or report issues.