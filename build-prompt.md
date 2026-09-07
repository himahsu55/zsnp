# Build Prompt — "Scan Dock" (PDF + Barcode Scanner Website)

Is document ko copy-paste karke kisi bhi AI coding agent (Claude Code, Antigravity, Cursor, etc.)
ko de sakte ho — ismein poora spec hai, taaki dobara build karte waqt koi confusion na ho.

---

## 1. Project ka ek-line summary

Ek browser-based web app jisme user pehle ek PDF upload karta hai, fir apne phone/laptop ke
camera se product barcodes scan karta hai, aur scan karte waqt barcode ke **aakhri N digits
automatically trim (exclude)** ho jaate hain — N user khud number-dial/slider se set karta hai.
Trim hone ke baad wahi (chhota) code hi list/log mein save hota hai.

---

## 2. Core features (must-have)

1. **PDF Upload**
   - Drag-and-drop + click-to-browse, `.pdf` only.
   - Uploaded file ka naam, size, aur inline preview (native browser PDF viewer, `<iframe>` +
     `URL.createObjectURL`) dikhna chahiye.
   - File hataने (remove) ka option.

2. **Barcode Camera Scanner**
   - PDF upload hone ke baad hi scanner section unlock ho (soft gating — UI flow guide karta hai).
   - Live camera feed (`environment` facing camera, mobile-friendly) ke andar barcode detect ho.
   - Supported formats: CODE128, EAN-13, EAN-8, CODE39, UPC-A, UPC-E (extendable).
   - Start / Stop controls, visual "flash" feedback + vibration on successful scan.
   - Duplicate scans (same code within ~1.5s) ignore honi chahiye.

3. **Digit Trim Rule (Number Dial)**
   - Ek numeric stepper (`−` / `+` buttons) + range slider (0–12), dono sync mein.
   - Ye value decide karti hai ki scanned barcode ke **kitne aakhri digits exclude** honge.
   - Live example preview: pura barcode dikhे, aur jo digits cut ho rahe hain wo strikethrough
     mein highlight ho, taaki user ko turant samajh aaye.
   - Trim hone ke baad ka result hi "Saved Code" ke roop mein log/export mein jaaye — raw/full
     code permanently store nahi hona chahiye.

4. **Scanned Log / Results Table**
   - Columns: Time, Barcode format, Saved (trimmed) code, Linked PDF filename.
   - Newest scan sabse upar.
   - Clear All, Export CSV, Export JSON buttons.

5. **Responsive + accessible**
   - Mobile par bhi camera scanning smoothly kaam kare (yahi primary use-case hai — warehouse
     ya field workers phone se scan karenge).
   - Keyboard-focus visible, color-contrast theek ho.

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Plain HTML + CSS + vanilla JS (single file) | Koi build step nahi chahiye, kahin bhi deploy ho sakta hai (Netlify, GitHub Pages, ya kisi bhi static host par) |
| Barcode detection | **QuaggaJS** (`https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js`) | Free, client-side, live-camera 1D barcode decoding, koi server/API key nahi chahiye |
| PDF preview | Native browser PDF viewer via `<iframe src="blob:...">` | Extra library ki zaroorat nahi; agar page-by-page thumbnail chahiye to `pdf.js` add kar sakte hain |
| Camera access | Browser `navigator.mediaDevices.getUserMedia` (Web API) | Native, HTTPS par kaam karta hai |
| Fonts | Google Fonts: `Space Grotesk` (headings), `Inter` (body), `JetBrains Mono` (codes/data) | |
| Storage (is version mein) | In-memory (browser session) | Simple, privacy-friendly — refresh karne par data clear ho jaata hai |

---

## 4. Visual design system

**Theme concept**: Ek physical barcode-scanning terminal/dock ka feel — warehouse/counter par
lage device jaisa, laser-red scan accent ke saath, lekin paper-white content area jo PDF/document
context ko reflect kare.

- **Colors**
  - `--ink: #14171C` — header/dark text
  - `--paper: #F5F3EE` — background (warm paper white)
  - `--card: #FFFFFF` — panel background
  - `--laser: #FF4B3E` — primary accent (scan line, buttons) — barcode scanner ki red laser
    line se inspired
  - `--ok: #2BAE66` — success/scan-confirmed feedback
  - `--line: #DEDAD0` — borders/dividers
  - `--muted: #75726A` — secondary text

- **Typography**
  - Headings: `Space Grotesk` (geometric, technical feel)
  - Body/UI: `Inter`
  - Codes/numbers/data: `JetBrains Mono` (barcodes/numeric data monospace mein zyada readable
    hote hain)

---

## 5. File/folder structure

```
scan-dock/
├── index.html        ← poora app (HTML + CSS + JS ek hi file mein, single-file deploy)
├── build-prompt.md    ← ye spec document
└── README.md          ← (optional) deployment instructions
```
