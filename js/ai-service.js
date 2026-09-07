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
     */
    async explainPlacement(scannedCode, product) {
      if (!product) {
        return `⚠️ **Item Not in Active Cheatsheet:** Product code \`${scannedCode}\` was not found in the current store planogram. Please verify the code or check if a new PDF cheatsheet needs to be uploaded.`;
      }

      // If user has Gemini API key, generate dynamic AI placement guidance
      if (this.hasApiKey()) {
        try {
          const prompt = 
            `A retail store worker just scanned garment barcode "${scannedCode}". ` +
            `Here is the verified cheatsheet data for this item:\n` +
            `- Section / Fixture: ${product.section} (Page ${product.page})\n` +
            `- Position Number: #${product.position} (${product.slotType || 'Hanger/Shelf'})\n` +
            `- Signage Price: ₹${product.signage}\n` +
            `- Color / Style: ${product.color}\n` +
            `- Display Instructions: ${product.remarks || 'Standard placement'}\n` +
            `- Capacity: ${product.capacity || 'Standard'}\n\n` +
            `In 2 crisp, clear bullet points, tell the store worker exactly:\n` +
            `1. WHICH rack fixture to walk to, and WHICH specific position/hanger/shelf slot to place this garment on.\n` +
            `2. How many pieces to put and any layering or signage instruction.\n` +
            `Keep it professional, direct, and actionable.`;

          const aiReply = await this.callGemini(prompt);
          if (aiReply) return aiReply;
        } catch (err) {
          console.warn('Gemini placement explanation call failed, using local format:', err);
        }
      }

      // Local Instant High-Fidelity Answer
      return (
        `📍 **Hang/Place in ${product.section}:**\n` +
        `• **Target Slot:** **Position #${product.position}** (${product.slotType || 'Display Slot'})\n` +
        `• **Product:** ${product.color} &bull; Signage: **₹${product.signage}**\n` +
        (product.remarks ? `• **Display Rule:** *${product.remarks}*\n` : '') +
        (product.capacity ? `• **Rack Capacity:** ${product.capacity}` : '')
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

    async callGeminiVisionPage(base64Image, pageNum) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const promptText = 
        `You are a visual merchandising data extractor for retail store fixture sheets. ` +
        `Examine this cheatsheet / planogram slide (Page ${pageNum}). ` +
        `Extract all garment/product items shown. Look for product codes/barcodes (6-14 digits), ` +
        `prices/signage (numbers, e.g. 899, 1299), colors, rack fixture name (e.g. M6, M8, M9, M10, MT2, or title), ` +
        `and position/option numbers (1, 2, 3...).\n\n` +
        `Return ONLY a raw JSON array of objects with keys:\n` +
        `[{"code": "string", "section": "string", "position": number, "signage": "string", "color": "string", "slotType": "string", "remarks": "string"}]\n` +
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
                  data: base64Image
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1500
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
          return parsed.map(item => ({
            code: String(item.code || '').trim(),
            section: item.section || `PAGE ${pageNum} FIXTURE`,
            page: pageNum,
            signage: String(item.signage || 'N/A').replace(/[^\d]/g, ''),
            color: item.color || 'Standard',
            position: Number(item.position) || 1,
            slotType: item.slotType || (Number(item.position) <= 4 ? 'Hanger' : 'Shelf'),
            remarks: item.remarks || ''
          })).filter(x => x.code && x.code.length >= 4);
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
