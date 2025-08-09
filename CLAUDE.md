# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a cross-browser extension called "Video Full Tab" that toggles videos (or the largest iframe) to fill the entire browser tab. The project maintains compatibility with both Chrome (Manifest V3) and Firefox (Manifest V2) through separate build directories.

## Repository Structure

- `chrome-mv3/` - Chrome extension build using Manifest V3 API
- `firefox-mv2/` - Firefox extension build using Manifest V2 API

Each directory contains:
- `manifest.json` - Browser-specific manifest configuration
- `background.js` - Background script with browser-specific API calls
- `icons/` - Extension icons in multiple sizes (16, 32, 48, 128px)

## Architecture

### Core Functionality
The extension uses a shared `toggleFullTab()` function that:
1. Detects the largest visible video element on the page
2. If no video found in top frame, falls back to largest visible iframe
3. Toggles full-tab styling by injecting CSS and applying data attributes
4. Handles both activation and deactivation states

### Browser API Differences
- **Chrome MV3**: Uses `chrome.action.onClicked` and `chrome.scripting.executeScript`
- **Firefox MV2**: Uses `chrome.browserAction.onClicked` and `chrome.tabs.executeScript`

The core logic in `toggleFullTab()` is identical between both versions - only the injection mechanism differs.

## Development Commands

Since this is a browser extension project without a build system, development involves:

1. **Chrome Development**:
   - Load `chrome-mv3/` directory as unpacked extension in Chrome
   - Test by navigating to pages with videos/iframes and clicking the extension icon

2. **Firefox Development**:
   - Load `firefox-mv2/manifest.json` as temporary add-on in Firefox
   - Test functionality on video sites and iframe-heavy pages

3. **Testing**:
   - Verify video fullscreen toggling works on YouTube, Vimeo, embedded videos
   - Test iframe fallback on sites without direct video elements
   - Ensure proper cleanup when toggling off (styles removed, attributes cleared)

## Key Implementation Details

- Uses `allFrames: true` to inject into all iframes for comprehensive video detection
- Applies maximum z-index (2147483647) to ensure full-screen overlay
- Disables pointer events on all elements except the target video/iframe
- Uses `object-fit: contain` for proper video scaling
- Maintains aspect ratios while filling viewport

## Cross-Frame Handling

The extension handles iframe detection logic:
- Only searches for iframe fallback in the top frame (`window.top === window`)
- Executes in all frames to find videos within iframes
- Properly scopes video search to avoid conflicts between frames