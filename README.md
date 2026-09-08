# Scan Dock — AI PDF Cheatsheet, Barcode & Voice Terminal (v2.1)

> **Enterprise-Grade Retail Visual Merchandising Terminal**: Scan product barcodes at hardware 60 FPS speeds, detect codes via microphone voice recognition, trim trailing digits, and instantly locate exact rack/shelf positions from your store's Cheatsheet PDF (M6, M8, M9, M10, MT2).

---

## 🌟 Key Features

1. **Ultra-Fast Barcode Scanning ("RFID-Speed 60 FPS")**:
   - **Native Hardware `BarcodeDetector` API**: Sub-10ms frame-level detection in modern Chromium & Android/iOS Safari.
   - **ZXing MultiFormat Reader Fallback**: Optimized single-pass ROI sampling with zero stutter.
   - **Physical USB / Bluetooth Laser Scanner Gun Support**: Plug in any wireless or USB barcode scanner gun — automatically captures keystroke bursts without focusing input!
   - **2X Macro Zoom & Torch**: Instant 1X / 2X toggle for small, dense garment tags and warehouse lighting.

2. **Voice Barcode Detection & Speech Guidance (`js/voice-service.js`)**:
   - **Voice Barcode Scanner**: Speak product digits (e.g., *"three zero one zero eight one six two six"* or *"301081626"*) to trigger instant planogram lookup hands-free.
   - **Multilingual Spoken Digit Parsing**: Supports English and Hindi number words (*ek, do, teen, char, paanch...*).
   - **AI Placement Text-To-Speech (TTS)**: Tap **Speak** in the AI Advisor box to hear clear audio instructions (*"Place in M6 Denim at Position #1, Signage ₹899..."*).
   - **Voice Rack Search**: Speak color names or section titles to filter items on the active rack display.

3. **Complete 102-Product Planogram Catalog & Fresh New Lines**:
   - Covers all 6 Cheatsheet pages (M6 Denim, M8 Denim Mono, M9 Essentials, M10 Essentials, MT2 Front, MT2 Back).
   - Accurate tracking of all 16 New Launch lines and 26 cut pieces.
   - Interactive Visual Rack Map lights up the target position on hanger rails, shacket tiers, or folded shelves.

4. **Cheatsheet PDF Dock & Pixel-Perfect Cropper**:
   - 5-column grid mapping for all 6 pages of the store cheatsheet catalog.
   - Direct canvas extraction with high-resolution visual cropping of physical product cards.
   - Zoom, fit, and page navigation controls for PDF viewing.

5. **Google Gemini AI Placement Advisor**:
   - Integrated with Google Gemini AI (`gemini-2.5-flash`).
   - Detailed visual merchandising instructions ("Kahan Lagega • Kaise Lagega").
   - **Zero-Failure Local Fallback**: 100% of cheatsheet codes and rack positions resolve instantly offline without an API key.

---

## 📁 File Structure

```
scan-dock/
├── index.html                     # Semantic HTML5 single-page application
├── package.json                   # Project metadata, scripts, and dependencies
├── package-lock.json              # Dependency lockfile
├── css/
│   └── styles.css                 # Industrial design system, visual rack diagrams & voice animations
├── js/
│   ├── app.js                     # Main terminal orchestrator & event bus
│   ├── voice-service.js           # Speech-to-Text barcode detection & Text-to-Speech narration
│   ├── scanner.js                 # Dual-engine BarcodeDetector + ZXing + Laser gun listener
│   ├── planogram.js               # PDF.js catalog extractor & interactive fixture visualizer
│   ├── pdf-cropper.js             # 5-column PDF page renderer & physical snippet cropper
│   ├── trimmer.js                 # Synced dial & slider digit truncation
│   ├── ai-service.js              # Google Gemini AI placement advisor & local smart engine
│   └── db-sync.js                 # LocalStorage persistence & offline store state
├── sample-data/
│   ├── cheatsheet-data.js         # Complete 102-item store planogram catalog
│   ├── racks/                     # High-res fixture diagram graphics (P1-P6)
│   └── slides/                    # Full-page high-definition cheatsheet slide images
├── build-prompt.md                # System specification prompt
└── README.md                      # Terminal documentation
```

---

## 🚀 Running the Terminal

### Option 1: Quick Static Serve
```powershell
npx serve .
```

### Option 2: Python Web Server
```powershell
python -m http.server 8888
```
Then open `http://localhost:8888` in your browser.
