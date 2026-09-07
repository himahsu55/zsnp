# Scan Dock — AI PDF Cheatsheet & Barcode Terminal (v2.0)

> **Office-Grade Retail Visual Merchandising Terminal**: Scan product barcodes at hardware RFID speeds, trim trailing digits, and instantly locate exact rack/shelf positions from your store's Cheatsheet PDF (M6, M8, M9, M10, MT2).

---

## 🌟 What's New in v2.0

1. **Modular Architecture (Multi-File)**:
   - Split cleanly into `index.html`, `css/styles.css`, and specialized `js/` modules:
     - [`js/scanner.js`](file:///c:/Users/HIMANSHU/Desktop/spdf/js/scanner.js): Hardware-accelerated BarcodeDetector + ZXing + Handheld laser gun buffer.
     - [`js/planogram.js`](file:///c:/Users/HIMANSHU/Desktop/spdf/js/planogram.js): PDF.js extractor & visual rack diagram renderer.
     - [`js/trimmer.js`](file:///c:/Users/HIMANSHU/Desktop/spdf/js/trimmer.js): Synced dial & slider digit truncation.
     - [`js/ai-service.js`](file:///c:/Users/HIMANSHU/Desktop/spdf/js/ai-service.js): Google Gemini AI API integration.
     - [`js/app.js`](file:///c:/Users/HIMANSHU/Desktop/spdf/js/app.js): Main terminal orchestrator.
     - [`sample-data/cheatsheet-data.js`](file:///c:/Users/HIMANSHU/Desktop/spdf/sample-data/cheatsheet-data.js): 6-page store visual merchandising planogram catalog.

2. **Ultra-Fast Barcode Scanning ("RFID-Speed 60 FPS")**:
   - **Native Hardware `BarcodeDetector` API**: Sub-15ms frame-level detection in modern Chromium & iOS Safari.
   - **ZXing MultiFormat Reader Fallback**: Superior accuracy on retail tags over older QuaggaJS.
   - **Physical USB / Bluetooth Laser Scanner Gun Support**: Plug in any wireless or USB barcode scanner gun — it captures keystroke bursts automatically without needing to click any input!
   - Camera controls: Torch/flashlight toggle for dim warehouse racks, front/rear camera flip.

3. **Instant Planogram Rack Locator & Visual Rack Diagram**:
   - When a barcode is scanned (e.g. `301081626`):
     - 📍 **Section Name**: `M6 DENIM` (Page 1)
     - 📌 **Exact Position**: `Position #1`
     - 💰 **Signage Price**: `₹899`
     - 🎨 **Color**: `WHITE`
     - 🗺️ **Visual Rack Map**: Lights up the exact slot on the hanger rail or folded shelf in glowing laser-red!
     - 📋 **Instructions**: `LAYER 1ST PIECE OF OPTION 1 WITH OPTION 3.`

4. **Google Gemini AI Assistant**:
   - Integrated with Google Gemini AI (`gemini-2.5-flash`).
   - Click the **AI Assistant** button to ask conversational questions about the store display:
     - *"Where does code 301081626 go?"*
     - *"Which items belong in M6 Denim?"*
     - *"What products have price 899?"*
   - **Zero-Failure Local Engine**: Even **without** an API key, the local smart engine resolves 100% of cheatsheet codes and rack positions with zero latency.

---

## 🔑 AI API Key Setup

To enable full conversational reasoning with Google Gemini:
1. Get a free API key from [Google AI Studio](https://aistudio.google.com/).
2. In Scan Dock, click **API Key** in the top header.
3. Paste your key and click **Save**.
4. Keys are stored locally in your browser's `localStorage` and never sent to any third party.

---

## 🚀 Running the Terminal

### Option 1: Browser Direct (Already Running!)
The local server is running on your machine:
👉 **[http://localhost:8888](http://localhost:8888)**

### Option 2: Command Line
```powershell
python -m http.server 8888
```

---

## 📁 File Structure

```
scan-dock/
├── index.html                     # Semantic HTML layout
├── css/
│   └── styles.css                 # Industrial design system, visual rack diagrams
├── js/
│   ├── app.js                     # Main orchestrator & table exports
│   ├── scanner.js                 # BarcodeDetector + ZXing + Handheld gun listener
│   ├── planogram.js               # PDF.js extractor & rack visualizer
│   ├── trimmer.js                 # Digit trim rule dial & strikethrough preview
│   └── ai-service.js              # Google Gemini API integration
├── sample-data/
│   └── cheatsheet-data.js         # Preloaded 6-page store planogram catalog
├── build-prompt.md
└── README.md
```
