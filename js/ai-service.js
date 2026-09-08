/**
 * AI Service Module — Google Gemini API Integration & Planogram Placement Advisor
 * 1. Analyzes uploaded Cheatsheet PDF fixture-by-fixture with Gemini 2.5 Flash
 * 2. Generates conversational placement instructions upon barcode scan
 * 3. Instant local fallback engine for zero-latency responses
 */
(function(window) {
  'use strict';

  class AiService {
    constructor(planogramEngine) {
      this.planogramEngine = planogramEngine;
      this.apiKey = localStorage.getItem('scandock_gemini_api_key') || '';
      this.model = 'gemini-2.5-flash';
      this.aiMetaMap = new Map(); // code -> { kahan_lagega, kaise_lagega, tips, box_2d, ... }
    }

    setApiKey(key) {
      this.apiKey = (key || '').trim();
      if (this.apiKey) {
        localStorage.setItem('scandock_gemini_api_key', this.apiKey);
      } else {
        localStorage.removeItem('scandock_gemini_api_key');
      }
    }

    getApiKey() {
      return this.apiKey;
    }

    hasApiKey() {
      return Boolean(this.apiKey);
    }

    /**
     * Generates a conversational placement explanation when a barcode is scanned.
     * Tells the staff: exactly what it is, which fixture to go to, which hanger/shelf to place it on, and any layering rules.
     * Output format:
     * - 📍 KAHAN LAGEGA (Where to Place)
     * - 👔 KAISE LAGEGA (How to Display)
     * - 💡 AI VM TIPS & RULES (PDF Research)
     */
    async explainPlacement(scannedCode, product) {
      if (!product) {
        return `⚠️ **Item Not in Active Cheatsheet:** Product code \`${scannedCode}\` was not found in the current store planogram. Please verify the code or check if a new PDF cheatsheet needs to be uploaded.`;
      }

      const cleanCode = String(product.code || scannedCode).trim();
      const meta = this.aiMetaMap.get(cleanCode);
      const isHanger = (product.slotType || '').toLowerCase().includes('hanger') || Number(product.position) <= 4;
      const isNewLine = (product.newLine || '').toUpperCase() === 'YES';

      // 1. If we already have rich AI metadata extracted from PDF Vision for this product
      if (meta && (meta.kahan_lagega || meta.kaise_lagega || meta.tips)) {
        return (
          `### 📍 KAHAN LAGEGA (Where to Place)\n` +
          `• **Fixture & Section**: **${product.section}** (Cheatsheet Page ${product.page})\n` +
          `• **Target Slot**: **Position #${product.position}** (${product.slotType || (isHanger ? 'Hanging Rail' : 'Shelf Stack')})\n` +
          `• **Location Advice**: ${meta.kahan_lagega || `Fixture ${product.section}, Slot #${product.position}`}\n\n` +
          `### 👔 KAISE LAGEGA (How to Display)\n` +
          `• **Display Style**: ${meta.kaise_lagega || (isHanger ? 'Hanging presentation — hook facing left, garment face-out, buttoned/zipped' : 'Shelf folded stack — size sticker visible on front fold')}\n` +
          `• **Size Sequence**: Arrange sizes Small to XL from front-to-back (or left-to-right)\n\n` +
          `### 💡 AI VM TIPS & RULES (PDF Research)\n` +
          `• **Assortment Status**: ${isNewLine ? '🔥 **FRESH NEW LINE LAUNCH** — High-visibility front-facing placement' : '📦 Core Repeat Line'}\n` +
          `• **Price Signage**: Ensure **₹${product.signage}** talker card is centered at slot\n` +
          `• **Guidelines & Capacity**: ${meta.tips || product.remarks || (isHanger ? '4–6 Units per face-out rail. Do not overstuff.' : '6–8 Units per shelf stack. Neat alignment.')}`
        );
      }

      // 2. If Gemini API Key is available, prompt Gemini for actionable 3-part guide
      if (this.hasApiKey()) {
        try {
          const prompt = 
            `You are the expert retail visual merchandising AI for "Scan Dock". ` +
            `Store worker just scanned garment barcode "${scannedCode}". Planogram details:\n` +
            `- Fixture Section: ${product.section} (Page ${product.page})\n` +
            `- Position: #${product.position} (${product.slotType || 'Hanger/Shelf'})\n` +
            `- Signage Price: ₹${product.signage}\n` +
            `- Color / Style: ${product.color}\n` +
            `- New Line Status: ${product.newLine || 'NO'}\n` +
            `- Display Rule: ${product.remarks || 'Standard'}\n` +
            `- Capacity: ${product.capacity || 'Standard'}\n\n` +
            `Generate actionable visual merchandising instructions in clear professional retail guidelines in EXACTLY these 3 markdown sections:\n\n` +
            `### 📍 KAHAN LAGEGA (Where to Place)\n` +
            `• Bullet with fixture name, shelf or rail tier, and exact slot position #${product.position}.\n\n` +
            `### 👔 KAISE LAGEGA (How to Display)\n` +
            `• Bullets explaining hanging vs folding style, hook/collar direction, size order (S to XL), and buttoning/zipping.\n\n` +
            `### 💡 AI VM TIPS & RULES (PDF Guidelines)\n` +
            `• Bullets with capacity (max pieces), adjacent color coordination, price signage placement, and what NOT to do (kaise nahi lagana hai).`;

          const aiReply = await this.callGemini(prompt);
          if (aiReply && aiReply.includes('KAHAN LAGEGA')) return aiReply;
          if (aiReply) {
            return `### 📍 KAHAN LAGEGA: ${product.section} Pos #${product.position}\n\n${aiReply}`;
          }
        } catch (err) {
          console.warn('Gemini placement explanation call failed, using local format:', err);
        }
      }

      // 3. Local High-Fidelity 3-Section Format
      return (
        `### 📍 KAHAN LAGEGA (Where to Place)\n` +
        `• **Fixture & Section**: **${product.section}** (Cheatsheet Page ${product.page})\n` +
        `• **Target Slot**: **Position #${product.position}** (${product.slotType || (isHanger ? 'Hanging Rail' : 'Shelf Stack')})\n` +
        `• **Price Signage**: **₹${product.signage}** Talker Card\n\n` +
        `### 👔 KAISE LAGEGA (How to Display)\n` +
        `• **Display Style**: ${isHanger ? 'Hanging presentation — hook facing left, garment face-out, buttoned/zipped' : 'Shelf folded stack — neat rectangular fold with size sticker visible on front fold'}\n` +
        `• **Size Sequence**: Arrange sizes Small to XL from front-to-back (or left-to-right)\n\n` +
        `### 💡 AI VM TIPS & RULES (Cheatsheet Guidelines)\n` +
        `• **Assortment Status**: ${isNewLine ? '🔥 **FRESH NEW LINE LAUNCH** — Prioritize eye-level / front-facing visibility!' : '📦 Core Repeat Line'}\n` +
        `• **Rack Capacity**: ${product.capacity || (isHanger ? '4–6 Units per face-out rail' : '6–8 Units per shelf stack')}\n` +
        `• **Display Rule**: ${product.remarks || 'Maintain clean spacing and verify price talker ₹' + product.signage}`
      );
    }

    /**
     * Generates clear, actionable guidance when a scanned barcode is NOT found in the planogram.
     * Prevents the AI from going silent or disappearing.
     */
    async explainNotFound(scannedCode, rawCode, trimmedDigits = 0, activeDocName = 'Cheatsheet PDF') {
      const isTrimmed = trimmedDigits > 0 && scannedCode !== rawCode;

      if (this.hasApiKey()) {
        try {
          const prompt = 
            `A retail warehouse/store worker scanned a barcode on a garment tag, but it is NOT in the planogram catalog.\n` +
            `- Trimmed Code: "${scannedCode}"\n` +
            `- Raw Scanned Barcode: "${rawCode}"\n` +
            `- Trailing Digits Excluded: ${trimmedDigits}\n` +
            `- Active Document: "${activeDocName}"\n\n` +
            `Explain in 2 short, crisp bullet points why it might be missing:\n` +
            `1. Diagnose if the Trim Dial needs adjustment (e.g. check digits or size digits trimmed or not trimmed).\n` +
            `2. Suggest checking if the garment belongs to another fixture or if a new cheatsheet PDF should be uploaded.\n` +
            `Keep it very direct, empathetic, and professional.`;

          const aiReply = await this.callGemini(prompt);
          if (aiReply) return aiReply;
        } catch (err) {
          console.warn('Gemini explainNotFound failed, using local diagnostic:', err);
        }
      }

      // Local Instant Diagnostic Response
      let trimAdvice = '';
      if (isTrimmed) {
        trimAdvice = `• **Trim Dial Active:** Currently trimming **${trimmedDigits} trailing digit${trimmedDigits === 1 ? '' : 's'}** (scanned \`${rawCode}\` → tested \`${scannedCode}\`). If the barcode did not contain check digits, try reducing the trim dial to 0.\n`;
      } else {
        trimAdvice = `• **Check Digits:** Currently trimming **0 digits**. If your physical tag has trailing size/batch digits (e.g. 11–13 digits), increase the **Digit Trim Rule** dial.\n`;
      }

      return (
        `⚠️ **Item Not Found in ${activeDocName}:**\n` +
        `• Code \`${scannedCode}\` (raw: \`${rawCode}\`) has no matching slot in this document.\n` +
        trimAdvice +
        `• **Action:** Verify the physical tag or upload the updated fixture PDF/slide in the **Cheatsheet PDF Dock**.`
      );
    }

    /**
     * Uses Gemini 2.5 Flash Vision to extract structured planogram items from rendered page canvases.
     * Works for scanned PDFs, presentation slides, photos, and non-standard tables.
     */
    async extractPlanogramWithGeminiVision(pageCanvases, progressCallback) {
      if (!this.hasApiKey()) {
        console.warn('Gemini API Key not configured for Vision extraction.');
        return [];
      }

      const allExtracted = [];
      const totalPages = pageCanvases.length;

      for (let i = 0; i < totalPages; i++) {
        const canvas = pageCanvases[i];
        const pageNum = i + 1;

        if (progressCallback) {
          progressCallback(pageNum, totalPages, `AI Vision analyzing page ${pageNum} of ${totalPages}...`);
        }

        try {
          // Scale canvas down if huge for fast transmission
          const maxDim = 1280;
          let sendCanvas = canvas;
          if (canvas.width > maxDim || canvas.height > maxDim) {
            const scale = Math.min(maxDim / canvas.width, maxDim / canvas.height);
            sendCanvas = document.createElement('canvas');
            sendCanvas.width = Math.round(canvas.width * scale);
            sendCanvas.height = Math.round(canvas.height * scale);
            const sCtx = sendCanvas.getContext('2d');
            sCtx.drawImage(canvas, 0, 0, sendCanvas.width, sendCanvas.height);
          }

          const base64Data = sendCanvas.toDataURL('image/jpeg', 0.85).split(',')[1];
          const pageItems = await this.callGeminiVisionPage(base64Data, pageNum);
          if (Array.isArray(pageItems) && pageItems.length > 0) {
            allExtracted.push(...pageItems);
          }
        } catch (err) {
          console.warn(`Gemini Vision failed on page ${pageNum}:`, err);
        }
      }

      return allExtracted;
    }

    /**
     * Uses Gemini 2.5 Flash Vision to detect 2D bounding boxes [ymin, xmin, ymax, xmax] (0-1000)
     * of every garment card on a rendered PDF page canvas, extracting visual swatches and VM rules.
     */
    async analyzeAndCropPageWithVision(canvas, pageNum, knownProducts = []) {
      if (!this.hasApiKey() || !canvas) return [];

      try {
        const maxDim = 1280;
        let sendCanvas = canvas;
        if (canvas.width > maxDim || canvas.height > maxDim) {
          const scale = Math.min(maxDim / canvas.width, maxDim / canvas.height);
          sendCanvas = document.createElement('canvas');
          sendCanvas.width = Math.round(canvas.width * scale);
          sendCanvas.height = Math.round(canvas.height * scale);
          const sCtx = sendCanvas.getContext('2d');
          sCtx.fillStyle = '#FFFFFF';
          sCtx.fillRect(0, 0, sendCanvas.width, sendCanvas.height);
          sCtx.drawImage(canvas, 0, 0, sendCanvas.width, sendCanvas.height);
        }

        const base64Data = sendCanvas.toDataURL('image/jpeg', 0.85).split(',')[1];
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

        let knownHint = '';
        if (Array.isArray(knownProducts) && knownProducts.length > 0) {
          knownHint = `KNOWN PRODUCTS ON THIS SLIDE:\n` + 
            knownProducts.slice(0, 25).map(p => `- Code: ${p.code}, Pos: #${p.position}, Color: ${p.color}, Price: ₹${p.signage}`).join('\n');
        }

        const promptText = 
          `You are an expert retail planogram visual merchandising AI and computer vision extractor.\n` +
          `Analyze this planogram cheatsheet / fixture presentation slide (Page ${pageNum}).\n\n` +
          (knownHint ? `${knownHint}\n\n` : '') +
          `OBJECTIVE:\n` +
          `1. Detect every garment/product swatch or product photo card displayed on this slide.\n` +
          `2. For each garment item, return its exact 2D bounding box in normalized coordinates [ymin, xmin, ymax, xmax] from 0 to 1000 (where 0,0 is top-left and 1000,1000 is bottom-right of the slide). The bounding box should tightly frame the garment photo and its code/price/color card so it can be cleanly cropped as a visual card snippet.\n` +
          `3. Read the text on the slide to extract:\n` +
          `   - "code": product code / barcode (e.g. "301077376", "301079509")\n` +
          `   - "color": color or garment style description (e.g. "SEA SPRAY", "MUSTARD")\n` +
          `   - "position": position number (e.g. 15, 1)\n` +
          `   - "signage": price (e.g. "699", "799")\n` +
          `   - "section": fixture name from the slide title (e.g. "M1 A - F M", "M2 FS URBAN STORY")\n` +
          `   - "slotType": "Hanger" or "Shelf Stack" or "Face-out"\n` +
          `   - "newLine": "YES" if marked as new line, else "NO"\n` +
          `   - "kahan_lagega": Exact fixture and slot location (e.g. "M1 A - F M, Shelf 3, Slot #15")\n` +
          `   - "kaise_lagega": Practical store display technique (e.g. "Fold neatly on shelf stack, max 4 units, size sticker facing front")\n` +
          `   - "tips": Merchandising rules read from the slide (e.g. "Coordinate with adjacent Sea Spray palette; ensure ₹699 price talker is centered")\n\n` +
          `Return ONLY a raw JSON array of objects with keys:\n` +
          `[{"code": "string", "color": "string", "position": number, "signage": "string", "section": "string", "slotType": "string", "newLine": "string", "box_2d": [ymin, xmin, ymax, xmax], "kahan_lagega": "string", "kaise_lagega": "string", "tips": "string"}]\n` +
          `Do not wrap in markdown code fence. Output pure JSON.`;

        const payload = {
          contents: [
            {
              role: 'user',
              parts: [
                { text: promptText },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2500
          }
        };

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error ? errData.error.message : `HTTP ${res.status}`);
        }

        const data = await res.json();
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
          const raw = data.candidates[0].content.parts[0].text.trim();
          const jsonMatch = raw.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            parsed.forEach(item => {
              const codeStr = String(item.code || '').trim();
              if (codeStr) {
                this.aiMetaMap.set(codeStr, item);
              }
            });
            return parsed;
          }
        }
        return [];
      } catch (err) {
        console.warn(`analyzeAndCropPageWithVision failed on page ${pageNum}:`, err);
        return [];
      }
    }

    async callGeminiVisionPage(base64Image, pageNum) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const promptText = 
        `You are an expert visual merchandising data extractor and computer vision detector for retail fixture sheets. ` +
        `Examine this cheatsheet / planogram slide (Page ${pageNum}). ` +
        `Extract all garment/product items shown. Look for product codes/barcodes (6-14 digits), ` +
        `prices/signage (e.g. 699, 799, 899), colors, rack fixture name, position numbers, and 2D bounding boxes.\n\n` +
        `Return ONLY a raw JSON array of objects with keys:\n` +
        `[{"code": "string", "section": "string", "position": number, "signage": "string", "color": "string", "slotType": "string", "newLine": "string", "remarks": "string", "box_2d": [ymin, xmin, ymax, xmax], "kahan_lagega": "string", "kaise_lagega": "string", "tips": "string"}]\n` +
        `Where box_2d is [ymin, xmin, ymax, xmax] in 0-1000 normalized coordinates. Do not wrap in markdown code fence. Output pure JSON.`;

      const payload = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: promptText },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: base64Image
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2500
        }
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(`Gemini Vision HTTP ${res.status}`);

      const data = await res.json();
      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        const raw = data.candidates[0].content.parts[0].text.trim();
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return parsed.map(item => {
            const codeStr = String(item.code || '').trim();
            const resObj = {
              code: codeStr,
              section: item.section || `PAGE ${pageNum} FIXTURE`,
              page: pageNum,
              signage: String(item.signage || 'N/A').replace(/[^\d]/g, ''),
              color: item.color || 'Standard',
              position: Number(item.position) || 1,
              slotType: item.slotType || (Number(item.position) <= 4 ? 'Hanger' : 'Shelf'),
              newLine: item.newLine || 'NO',
              remarks: item.remarks || '',
              box_2d: Array.isArray(item.box_2d) && item.box_2d.length === 4 ? item.box_2d : null,
              kahan_lagega: item.kahan_lagega || '',
              kaise_lagega: item.kaise_lagega || '',
              tips: item.tips || ''
            };
            if (codeStr) {
              this.aiMetaMap.set(codeStr, resObj);
            }
            return resObj;
          }).filter(x => x.code && x.code.length >= 4);
        }
      }
      return [];
    }

    /**
     * Ask a general question to Gemini about the active PDF
     */
    async ask(userPrompt) {
      if (!userPrompt || !userPrompt.trim()) {
        return 'Please enter a question or product code.';
      }

      const prompt = userPrompt.trim();

      // Quick code lookup
      const codeMatch = prompt.match(/\b\d{6,14}\b/);
      if (codeMatch) {
        const product = this.planogramEngine.lookup(codeMatch[0]);
        if (product) {
          return await this.explainPlacement(codeMatch[0], product);
        }
      }

      if (this.hasApiKey()) {
        try {
          return await this.callGemini(prompt);
        } catch (err) {
          console.error('Gemini error:', err);
          return this.localFallbackAnswer(prompt, err.message);
        }
      } else {
        return this.localFallbackAnswer(prompt);
      }
    }

    async callGemini(userPrompt) {
      const items = this.planogramEngine.getAllItems();
      const planogramSummary = items.slice(0, 40).map(it => 
        `Code:${it.code} | Fixture:${it.section} | Pos:${it.position} | Price:${it.signage} | Color:${it.color} | Rule:${it.remarks || 'None'}`
      ).join('\n');

      const systemInstruction = 
        `You are the expert retail visual merchandising terminal AI for "Scan Dock". ` +
        `Store workers use this terminal to locate garment fixtures, hanging rails, and shelf positions. ` +
        `PLANOGRAM DATA:\n${planogramSummary}\n\n` +
        `Answer concisely with exact fixture names, position numbers, and prices.`;

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

      const payload = {
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemInstruction}\n\nQuestion: ${userPrompt}` }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 600
        }
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error ? errJson.error.message : `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        return data.candidates[0].content.parts[0].text;
      }

      return 'No answer generated by AI.';
    }

    localFallbackAnswer(prompt, optionalError = null) {
      if (!prompt || !prompt.trim()) {
        return 'Please enter a product code, color, fixture name, or price to search.';
      }

      const p = prompt.trim().toLowerCase();
      const items = this.planogramEngine.getAllItems();
      if (!items || items.length === 0) {
        return 'No items indexed in the cheatsheet catalog. Please upload a cheatsheet PDF or reset catalog.';
      }

      // 1. Direct Barcode / Number query
      const codeMatch = p.match(/\b\d{6,14}\b/);
      if (codeMatch) {
        const found = this.planogramEngine.lookup(codeMatch[0]);
        if (found) {
          return `📍 **Found Item \`${found.code}\`:**\n` +
            `• **Fixture**: **${found.section}** • **Slot**: Pos #${found.position} (${found.slotType || 'Slot'})\n` +
            `• **Color**: ${found.color} | **Signage**: ₹${found.signage}\n` +
            (found.remarks ? `• **Rule**: *${found.remarks}*\n` : '') +
            `• **Doc Page**: Page ${found.page}`;
        }
      }

      // 2. Count query ("kitne items", "how many", "total", "count")
      if (/(kitne|how many|total|count|kitna|all items|kitne product)/i.test(p)) {
        const secCounts = {};
        items.forEach(it => {
          secCounts[it.section] = (secCounts[it.section] || 0) + 1;
        });
        const breakdown = Object.entries(secCounts)
          .map(([sec, cnt]) => `• **${sec}**: ${cnt} items`)
          .join('\n');
        return `📊 **Cheatsheet Catalog Summary:**\n` +
          `• **Total Products Indexed**: **${items.length} items** across ${Object.keys(secCounts).length} fixture sections.\n` +
          `**Section Breakdown:**\n${breakdown}\n\n` +
          `*Scan any barcode or search by color/section for instant placement.*`;
      }

      // 3. Section query (M6, M8, M9, M10, MT2, FRONT, BACK)
      const secMatch = p.match(/(m6|m8|m9|m10|mt2|mt2-front|mt2-back)/i);
      if (secMatch) {
        const secKey = secMatch[0].toUpperCase();
        const matches = items.filter(it => it.section && it.section.toUpperCase().includes(secKey));
        if (matches.length > 0) {
          const sample = matches.slice(0, 6).map(m => 
            `• **Pos #${m.position}**: \`${m.code}\` — **${m.color}** (₹${m.signage}) [${m.slotType || 'Slot'}]`
          ).join('\n');
          const remaining = matches.length > 6 ? `\n*...and ${matches.length - 6} more items in this rack.*` : '';
          return `📦 **Fixture ${matches[0].section} (${matches.length} planned items):**\n${sample}${remaining}\n\n` +
            `*Tip: Scan any of these codes to see their visual PDF slot crop.*`;
        }
      }

      // 4. Price query ("₹899", "price 899", "899 rs", "899", "599", "699", "1299")
      const priceMatch = p.match(/(?:price|mrp|rs\.?|inr|₹)?\s*([0-9]{3,5})\s*(?:rs|rupees|inr)?/i);
      if (priceMatch && priceMatch[1]) {
        const targetPrice = priceMatch[1];
        const matches = items.filter(it => String(it.signage) === targetPrice);
        if (matches.length > 0) {
          const sample = matches.slice(0, 5).map(m => 
            `• \`${m.code}\` — **${m.section}** Pos #${m.position} (${m.color})`
          ).join('\n');
          const remaining = matches.length > 5 ? `\n*...and ${matches.length - 5} more items at ₹${targetPrice}.*` : '';
          return `🏷️ **Items with Signage ₹${targetPrice} (${matches.length} found):**\n${sample}${remaining}`;
        }
      }

      // 5. Color query - match against actual colors in dataset
      const allColors = Array.from(new Set(items.map(it => (it.color || '').toLowerCase().trim()).filter(Boolean)));
      const matchedColor = allColors.find(col => {
        const tokens = col.split(/\s+/);
        return tokens.some(tok => tok.length > 2 && p.includes(tok)) || p.includes(col);
      });
      if (matchedColor) {
        const matches = items.filter(it => (it.color || '').toLowerCase().includes(matchedColor));
        if (matches.length > 0) {
          const sample = matches.slice(0, 5).map(m => 
            `• \`${m.code}\` — **${m.section}** Pos #${m.position} (₹${m.signage})`
          ).join('\n');
          const remaining = matches.length > 5 ? `\n*...and ${matches.length - 5} more ${matchedColor.toUpperCase()} items.*` : '';
          return `🎨 **${matchedColor.toUpperCase()} Garments (${matches.length} items found):**\n${sample}${remaining}`;
        }
      }

      // 6. Generic keyword search across all fields
      const cleanWord = p.replace(/[^a-z0-9\s]/g, '').trim();
      const words = cleanWord.split(/\s+/).filter(w => w.length >= 3);
      if (words.length > 0) {
        const matches = items.filter(it => {
          const hay = `${it.code} ${it.section} ${it.color} ${it.remarks || ''} ${it.slotType || ''} ${it.shelf || ''}`.toLowerCase();
          return words.some(w => hay.includes(w));
        });
        if (matches.length > 0) {
          const sample = matches.slice(0, 5).map(m => 
            `• \`${m.code}\` — **${m.section}** Pos #${m.position} (${m.color}, ₹${m.signage})`
          ).join('\n');
          const remaining = matches.length > 5 ? `\n*...and ${matches.length - 5} more matching items.*` : '';
          return `🔍 **Found ${matches.length} items matching "${prompt}":**\n${sample}${remaining}`;
        }
      }

      // 7. Helpful fallback guidance if nothing matched
      return `ℹ️ **Scan Dock Local Assistant:**\n` +
        `I couldn't find a direct match for *"${prompt}"* in the cheatsheet.\n\n` +
        `**Try asking:**\n` +
        `• **Section**: *"M6"*, *"M8"*, *"M9"*, *"M10"*, *"MT2"*\n` +
        `• **Price**: *"price 899"*, *"₹599"*, *"699"*\n` +
        `• **Color**: *"white"*, *"indigo"*, *"grey"*, *"taupe"*, *"coffee"*\n` +
        `• **Total**: *"kitne items"*, *"how many"*, *"total products"*\n` +
        `• **Barcode**: Enter any 9-digit barcode directly (e.g. \`301075847\`)`;
    }
  }

  window.AiService = AiService;
})(window);
