/**
 * Planogram & Cheatsheet Engine
 * 1. Preloaded with visual merchandising store cheatsheet data
 * 2. Client-side PDF text parser via PDF.js for custom uploaded PDFs
 * 3. Instant O(1) product lookup by barcode/code
 * 4. Interactive visual rack/shelf diagram generator with position highlight
 */
(function(window) {
  'use strict';

  class PlanogramEngine {
    constructor() {
      // Initialize with preloaded cheatsheet data if available
      this.items = Array.isArray(window.DEFAULT_PLANOGRAM_DATA) 
        ? [...window.DEFAULT_PLANOGRAM_DATA] 
        : [];
      
      this.codeIndex = new Map();
      this.rebuildIndex();

      this.currentPdfName = 'Default Retail Cheatsheet (M6-M10 & MT2)';
    }

    rebuildIndex() {
      this.codeIndex.clear();
      this.items.forEach(item => {
        if (!item.code) return;
        const cleanCode = String(item.code).trim();
        this.codeIndex.set(cleanCode, item);
      });
    }

    /**
     * Look up a product in the planogram.
     * Supports exact match, or prefix/suffix matching if check digits were partially trimmed.
     */
    lookup(scannedCode) {
      if (!scannedCode) return null;
      const code = String(scannedCode).trim();

      // 1. Direct exact match
      if (this.codeIndex.has(code)) {
        return this.codeIndex.get(code);
      }

      // 2. Loose match (e.g. if cheatsheet code is 9 digits and scanned code has leading/trailing zeroes or vice versa)
      for (const [indexedCode, item] of this.codeIndex.entries()) {
        if (indexedCode.includes(code) || code.includes(indexedCode)) {
          return item;
        }
      }

      return null;
    }

    /**
     * Parse an uploaded PDF file using PDF.js
     */
    async parsePdfFile(file) {
      if (!window.pdfjsLib) {
        console.warn('PDF.js not loaded, keeping existing planogram index');
        return { success: false, count: this.items.length };
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const extractedItems = [];
        let currentSection = 'DISPLAY SECTION';

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ');

          // Detect Section title (e.g. M6 DENIM, M8 DENIM MONO, M9, M10, MT2-FRONT)
          const sectionMatch = pageText.match(/(M[0-9]+[A-Z\s-]*|MT[0-9]+-[A-Z\s]+)/i);
          if (sectionMatch) {
            currentSection = sectionMatch[0].trim();
          }

          // Extract blocks with CODE: ... SIGNAGE: ... COLOR: ... POSITION: ...
          // Using regex across page text
          const codeRegex = /CODE\s*:\s*([0-9A-Z]+)/gi;
          const signageRegex = /SIGNAGE\s*:\s*([0-9]+)/gi;
          const colorRegex = /COLOR\s*:\s*([A-Z\s]+?)(?=POSITION|SIGNAGE|NEW|CODE|$)/gi;
          const posRegex = /POSITION\s*:\s*([0-9]+)/gi;

          let match;
          const codes = [];
          while ((match = codeRegex.exec(pageText)) !== null) {
            codes.push({ code: match[1], index: match.index });
          }

          // If standard OCR block format found
          for (let i = 0; i < codes.length; i++) {
            const cObj = codes[i];
            const nextIdx = (i + 1 < codes.length) ? codes[i + 1].index : pageText.length;
            const snippet = pageText.slice(cObj.index, nextIdx);

            const sMatch = snippet.match(/SIGNAGE\s*:\s*([0-9]+)/i);
            const colMatch = snippet.match(/COLOR\s*:\s*([A-Z0-9\s]+?)(?=POSITION|NEW|SIGNAGE|$)/i);
            const pMatch = snippet.match(/POSITION\s*:\s*([0-9]+)/i);
            const nlMatch = snippet.match(/NEW\s*LINE\s*:\s*(YES|NO)/i);

            extractedItems.push({
              code: cObj.code.trim(),
              section: currentSection,
              page: pageNum,
              signage: sMatch ? sMatch[1] : 'N/A',
              color: colMatch ? colMatch[1].trim() : 'Standard',
              position: pMatch ? parseInt(pMatch[1], 10) : (i + 1),
              totalPositions: codes.length,
              slotType: pMatch && parseInt(pMatch[1], 10) <= 4 ? 'Hanger' : 'Shelf Stack',
              shelf: `Position ${pMatch ? pMatch[1] : (i + 1)}`,
              newLine: nlMatch ? nlMatch[1] : 'NO',
              cutSize: snippet.includes('CUT SIZE') ? 'YES' : 'NO',
              remarks: snippet.match(/REMARKS\s*:\s*([^.]+)/i) ? snippet.match(/REMARKS\s*:\s*([^.]+)/i)[1] : ''
            });
          }
        }

        if (extractedItems.length > 0) {
          this.items = extractedItems;
          this.rebuildIndex();
          this.currentPdfName = file.name;
          return { success: true, count: extractedItems.length };
        } else {
          // If PDF was pure raster without searchable text, retain existing cheatsheet
          return { success: false, count: this.items.length };
        }
      } catch (err) {
        console.error('Error parsing PDF for cheatsheet items:', err);
        return { success: false, error: err };
      }
    }

    /**
     * Render the interactive Visual Rack Diagram HTML for a found product
     */
    renderRackVisualizer(product) {
      if (!product) return '';

      const sectionItems = this.items.filter(it => it.section === product.section);
      const totalPos = product.totalPositions || Math.max(14, sectionItems.length);
      const activePos = product.position || 1;

      // Group into Top Hangers (1-4) and Bottom Shelf Grids (5-14)
      let hangersHtml = '';
      let shelvesHtml = '';

      for (let pos = 1; pos <= Math.min(4, totalPos); pos++) {
        const itemAtPos = sectionItems.find(it => it.position === pos);
        const isActive = (pos === activePos);
        hangersHtml += `
          <div class="rack-slot hanger-slot ${isActive ? 'active-slot' : ''}">
            <div class="slot-hanger-hook"></div>
            <div class="slot-box">
              <span class="slot-pos-badge">#${pos}</span>
              <span class="slot-item-name">${itemAtPos ? itemAtPos.color : 'Opt ' + pos}</span>
              ${isActive ? '<span class="slot-target-tag">TARGET</span>' : ''}
            </div>
          </div>
        `;
      }

      for (let pos = 5; pos <= totalPos; pos++) {
        const itemAtPos = sectionItems.find(it => it.position === pos);
        const isActive = (pos === activePos);
        shelvesHtml += `
          <div class="rack-slot shelf-slot ${isActive ? 'active-slot' : ''}">
            <span class="slot-pos-badge">#${pos}</span>
            <span class="slot-item-name">${itemAtPos ? itemAtPos.color : 'Opt ' + pos}</span>
            ${isActive ? '<span class="slot-target-tag">TARGET</span>' : ''}
          </div>
        `;
      }

      return `
        <div class="visual-rack-container">
          <div class="rack-header-label">
            <span>RACK ARCHITECTURE &bull; ${escapeHtml(product.section)}</span>
            <span class="badge-active-pos">SLOT #${activePos} HIGHLIGHTED</span>
          </div>

          <div class="rack-diagram">
            <!-- Top Hanging Rail -->
            <div class="rack-rail-label">TOP HANGING RAIL (Denim / Shackets)</div>
            <div class="rack-hanger-row">
              ${hangersHtml}
            </div>

            <!-- Middle / Bottom Shelves -->
            <div class="rack-rail-label" style="margin-top: 10px;">FOLDED SHELF TIERS (Tees / Stacks)</div>
            <div class="rack-shelf-grid">
              ${shelvesHtml}
            </div>
          </div>
        </div>
      `;
    }

    getAllItems() {
      return this.items;
    }

    getTotalCount() {
      return this.items.length;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  window.PlanogramEngine = PlanogramEngine;
})(window);
