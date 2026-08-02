# GIF Sender for WhatsApp

WhatsApp Web still doesn't let you send GIFs properly. Drag one into the browser and it arrives as a single static frame instead of a looping animation.

This extension fixes that.

Drop one straight into a chat, drag it in from another website, or pick a file using the button in the bottom-right corner. The extension converts it into the format WhatsApp expects, applies the metadata that makes WhatsApp loop it, and inserts it into WhatsApp's normal upload flow. From there you preview and send it exactly as you normally would.

The panel also accepts other animated images and short video clips, converting them so they send as looping animations too.

The goal is simple: make sending GIFs on WhatsApp Web work the way it should have in the first place.

### Everything stays on your PC

All processing happens locally in your browser. Your files are never uploaded to a server, sent to a third party, or moved off your computer at any point. When you drag a picture in from another website, your browser hands it straight over, so there is nothing to download.

Conversion runs on your own hardware, so for the best results you'll want browser hardware acceleration enabled with H.264 encoding support. This keeps conversions fast while keeping everything local.

### Features

* Drag and drop straight into a WhatsApp chat.
* Drag one in directly from another website, without saving it first.
* Convert other animated images and short video clips from the built-in panel.
* Uses WhatsApp's own send preview. Nothing is sent automatically.
* No accounts, no cloud processing, no data collection.

## Installation

### Chrome Web Store (recommended)

The easiest way to install GIF Sender for WhatsApp is through the Chrome Web Store:

[Chrome Web Store Link](https://chromewebstore.google.com/detail/pmkkmjjejbfbijgljkhjgbjampckkomp)

The Web Store version will automatically receive updates when new versions are released.

### Manual installation

If you prefer to install the extension manually, or if the Chrome Web Store version is unavailable, you can download the latest release package here:

[Download Latest Release](https://github.com/VireliaDev/GIF-Sender-for-WhatsApp/releases)

To install manually:

1. Download and extract the ZIP file.
2. Open Chrome's extension page at `chrome://extensions`
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the extracted extension folder.

The extension will then be installed locally in your browser.

## Privacy

The extension collects no data, makes no network requests, and requests no Chrome permissions beyond running on `https://web.whatsapp.com`. See the [privacy policy](PRIVACY.md) for details.

## Disclaimer

GIF Sender for WhatsApp is an independent project and is not affiliated with, sponsored by, or endorsed by WhatsApp LLC or Meta Platforms, Inc.
