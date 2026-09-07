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
      this.defaultItems = Array.isArray(window.DEFAULT_PLANOGRAM_DATA) 
        ? [...window.DEFAULT_PLANOGRAM_DATA] 
        : [];
      this.items = [...this.defaultItems];
      
      this.codeIndex = new Map();
      this.pageTextMap = new Map();
      this.pageSectionMap = new Map();
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

    setItems(newItems, docName = '') {
      if (Array.isArray(newItems) && newItems.length > 0) {
        this.items = newItems;
        this.rebuildIndex();
        if (docName) this.currentPdfName = docName;
        return true;
      }
      return false;
    }

    addItems(moreItems) {
      if (!Array.isArray(moreItems) || moreItems.length === 0) return 0;
      let added = 0;
      moreItems.forEach(item => {
        if (!item.code) return;
        const cleanCode = String(item.code).trim();
        if (!this.codeIndex.has(cleanCode)) {
          this.items.push(item);
          this.codeIndex.set(cleanCode, item);
          added++;
        }
      });
      return added;
    }

    resetToDefault() {
      this.items = [...this.defaultItems];
      this.rebuildIndex();
      this.pageTextMap.clear();
      this.pageSectionMap.clear();
      this.currentPdfName = 'Default Retail Cheatsheet (M6-M10 & MT2)';
    }

    /**
     * Look up a product in the planogram.
     * 1. Exact match in code index.
     * 2. Loose match (substring/padded).
     * 3. Document text search across raw pages of uploaded PDF/slides.
     */
    lookup(scannedCode) {
      if (!scannedCode) return null;
      const code = String(scannedCode).trim();
      const codeDigits = code.replace(/\D/g, '');

      // 1. Direct exact match
      if (this.codeIndex.has(code)) {
        return this.codeIndex.get(code);
      }

      // 2. Digits-only match
      if (codeDigits && this.codeIndex.has(codeDigits)) {
        return this.codeIndex.get(codeDigits);
      }

      // 3. Loose match (substring / suffix / prefix)
      for (const [indexedCode, item] of this.codeIndex.entries()) {
        const indexedDigits = indexedCode.replace(/\D/g, '');
        if (
          indexedCode.includes(code) ||
          code.includes(indexedCode) ||
          (indexedDigits && codeDigits && (indexedDigits.includes(codeDigits) || codeDigits.includes(indexedDigits)))
        ) {
          return item;
        }
      }

      // 4. Raw page text match from uploaded document
      for (const [pageNum, pageText] of this.pageTextMap.entries()) {
        if (pageText.includes(code) || (codeDigits && pageText.includes(codeDigits))) {
          const section = this.pageSectionMap.get(pageNum) || `DOCUMENT PAGE ${pageNum}`;
          const synthItem = {
            code: code,
            section: section,
            page: pageNum,
            position: 1,
            totalPositions: 1,
            signage: 'In Document',
            color: 'Detected in Document',
            slotType: 'Document Match',
            shelf: `Page ${pageNum}`,
            remarks: `Found in document text on Page ${pageNum}`
          };
          return synthItem;
        }
      }

      return null;
    }

    /**
     * Parse an uploaded PDF file using PDF.js with multi-tier extraction
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
        this.pageTextMap.clear();
        this.pageSectionMap.clear();

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const rawText = textContent.items.map(item => item.str).join(' ');
          this.pageTextMap.set(pageNum, rawText);

          // Detect Section or Slide title
          let currentSection = `FIXTURE PAGE ${pageNum}`;
          const sectionMatch = rawText.match(/(M[0-9]+[A-Z\s-]*|MT[0-9]+-[A-Z\s]+|BAY\s*[0-9]+|WALL\s*[0-9]+|RACK\s*[0-9]+)/i);
          if (sectionMatch) {
            currentSection = sectionMatch[0].trim();
          } else {
            // Check first line for title
            const firstTokens = textContent.items.slice(0, 5).map(x => x.str).join(' ').trim();
            if (firstTokens.length > 2 && firstTokens.length < 40) {
              currentSection = firstTokens;
            }
          }
          this.pageSectionMap.set(pageNum, currentSection);

          // Tier 1: Look for labeled fields CODE: ... SIGNAGE: ...
          const codeRegex = /(?:CODE|SKU|STYLE|BARCODE|ITEM)\s*[:#-]?\s*([0-9A-Z]{4,16})/gi;
          let match;
          const labeledCodes = [];
          while ((match = codeRegex.exec(rawText)) !== null) {
            labeledCodes.push({ code: match[1], index: match.index });
          }

          if (labeledCodes.length > 0) {
            for (let i = 0; i < labeledCodes.length; i++) {
              const cObj = labeledCodes[i];
              const nextIdx = (i + 1 < labeledCodes.length) ? labeledCodes[i + 1].index : rawText.length;
              const snippet = rawText.slice(cObj.index, nextIdx);

              const sMatch = snippet.match(/(?:SIGNAGE|PRICE|MRP|INR|₹)\s*[:#-]?\s*([0-9]+)/i);
              const colMatch = snippet.match(/(?:COLOR|COLOUR|SHADE)\s*[:#-]?\s*([A-Z0-9\s]+?)(?=POSITION|NEW|SIGNAGE|PRICE|CODE|$)/i);
              const pMatch = snippet.match(/(?:POSITION|POS|OPT|OPTION)\s*[:#-]?\s*([0-9]+)/i);
              const nlMatch = snippet.match(/NEW\s*LINE\s*:\s*(YES|NO)/i);

              extractedItems.push({
                code: cObj.code.trim(),
                section: currentSection,
                page: pageNum,
                signage: sMatch ? sMatch[1] : 'N/A',
                color: colMatch ? colMatch[1].trim() : 'Standard',
                position: pMatch ? parseInt(pMatch[1], 10) : (i + 1),
                totalPositions: labeledCodes.length,
                slotType: (pMatch && parseInt(pMatch[1], 10) <= 4) ? 'Hanger' : 'Shelf Stack',
                shelf: `Position ${pMatch ? pMatch[1] : (i + 1)}`,
                newLine: nlMatch ? nlMatch[1] : 'NO',
                remarks: snippet.match(/REMARKS\s*:\s*([^.]+)/i) ? snippet.match(/REMARKS\s*:\s*([^.]+)/i)[1] : ''
              });
            }
          } else {
            // Tier 2: Universal Number Pattern Detection (6 to 14 digit retail barcode / SKU numbers)
            const numRegex = /\b\d{6,14}\b/g;
            const foundNumbers = [];
            let nMatch;
            while ((nMatch = numRegex.exec(rawText)) !== null) {
              const val = nMatch[0];
              // Avoid duplicate numbers in same page
              if (!foundNumbers.some(x => x.code === val)) {
                foundNumbers.push({ code: val, index: nMatch.index });
              }
            }

            if (foundNumbers.length > 0) {
              for (let i = 0; i < foundNumbers.length; i++) {
                const fObj = foundNumbers[i];
                const surrounding = rawText.slice(Math.max(0, fObj.index - 50), Math.min(rawText.length, fObj.index + 80));
                const priceMatch = surrounding.match(/(?:₹|INR|Rs\.?|MRP)?\s*([0-9]{3,5})\b/);

                extractedItems.push({
                  code: fObj.code,
                  section: currentSection,
                  page: pageNum,
                  signage: priceMatch ? priceMatch[1] : 'N/A',
                  color: 'Option ' + (i + 1),
                  position: i + 1,
                  totalPositions: foundNumbers.length,
                  slotType: (i + 1 <= 4) ? 'Hanger' : 'Shelf Stack',
                  shelf: `Position ${i + 1}`,
                  remarks: `Extracted from ${currentSection}`
                });
              }
            }
          }
        }

        // Resilient Merged Catalog:
        // NEVER drop default verified store products when an uploaded PDF has sparse/unparseable text on some pages!
        const mergedMap = new Map();

        // 1. Always keep verified default store items as baseline
        this.defaultItems.forEach(it => {
          if (it.code) mergedMap.set(String(it.code).trim(), it);
        });

        // 2. Keep any previously imported items in session
        this.items.forEach(it => {
          if (it.code) mergedMap.set(String(it.code).trim(), it);
        });

        // 3. Overlay any newly extracted items from the PDF
        extractedItems.forEach(it => {
          if (it.code) mergedMap.set(String(it.code).trim(), it);
        });

        this.items = Array.from(mergedMap.values());
        this.rebuildIndex();
        this.currentPdfName = file.name;

        return {
          success: true,
          count: this.items.length,
          extractedCount: extractedItems.length,
          pagesCount: pdf.numPages
        };
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
