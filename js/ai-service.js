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
      const p = prompt.toLowerCase();
      const items = this.planogramEngine.getAllItems();

      // Section query (M6, M8, M9, M10, MT2)
      const secMatch = p.match(/(m6|m8|m9|m10|mt2)/);
      if (secMatch) {
        const sec = secMatch[0].toUpperCase();
        const matches = items.filter(it => it.section.toUpperCase().includes(sec));
        if (matches.length > 0) {
          const sample = matches.slice(0, 4).map(m => `• **Pos ${m.position}**: \`${m.code}\` — ${m.color} (₹${m.signage})`).join('\n');
          return `📦 **Fixture ${matches[0].section}:**\n${sample}\n*(${matches.length} total planned items).*`;
        }
      }

      return `ℹ️ **Planogram Catalog Active:**\n` +
        `Database contains **${items.length} items** across M6, M8, M9, M10, and MT2 fixtures.\n` +
        `Scan any garment barcode to see its exact rack position and cropped PDF photo!`;
    }
  }

  window.AiService = AiService;
})(window);
