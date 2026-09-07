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
     * Maps the EXACT slot numbers of the section (#23-36 for M8, #1-14 for M6, etc.)
     */
    renderRackVisualizer(product) {
      if (!product) return '';

      const activeSection = product.section || 'M6 DENIM';
      const activePos = parseInt(product.position, 10);
      const sectionItems = this.items.filter(it => it.section === activeSection);
      
      // Sort items by position
      const sorted = [...sectionItems].sort((a, b) => {
        const pA = parseInt(a.position, 10) || 0;
        const pB = parseInt(b.position, 10) || 0;
        return pA - pB;
      });

      // Split into logical tiers: Hangers (Top Rail), Middle Shelves, Bottom Shelves, Cut Trays
      const hangers = [];
      const middleShelves = [];
      const bottomShelves = [];
      const cutTrays = [];

      sorted.forEach((item, idx) => {
        const slotType = (item.slotType || '').toLowerCase();
        const shelf = (item.shelf || '').toLowerCase();
        const pos = parseInt(item.position, 10);

        if (item.cutSize === 'YES' || slotType.includes('cut') || shelf.includes('cut')) {
          cutTrays.push(item);
        } else if (slotType.includes('hanger') || slotType.includes('shacket') || shelf.includes('hanger') || shelf.includes('top')) {
          hangers.push(item);
        } else if (shelf.includes('middle') || slotType.includes('middle')) {
          middleShelves.push(item);
        } else if (shelf.includes('bottom') || slotType.includes('bottom')) {
          bottomShelves.push(item);
        } else {
          // Fallback distribution: 4 hangers, then 5 middle, remainder bottom
          if (idx < 4) hangers.push(item);
          else if (idx < 9) middleShelves.push(item);
          else bottomShelves.push(item);
        }
      });

      const renderSlotHtml = (item, isHanger = false) => {
        const pos = parseInt(item.position, 10);
        const isActive = (pos === activePos);
        const isNewLine = String(item.newLine || '').trim().toUpperCase() === 'YES';
        const colorName = item.color || `Option #${pos}`;
        const priceTag = item.signage ? `₹${item.signage}` : '';

        return `
          <div class="rack-slot ${isHanger ? 'hanger-slot' : 'shelf-slot'} ${isActive ? 'active-slot slot-blinking-target' : ''} ${isNewLine ? 'slot-is-new-line' : ''}"
               data-pos="${pos}" data-code="${escapeHtml(item.code)}" title="${escapeHtml(colorName)} • ${priceTag}">
            ${isHanger ? '<div class="slot-hanger-hook"></div>' : ''}
            <div class="slot-box">
              <div class="slot-top-labels">
                <span class="slot-pos-badge">#${pos}</span>
                ${isNewLine ? '<span class="slot-new-tag">NEW</span>' : ''}
              </div>
              <span class="slot-item-name">${escapeHtml(colorName)}</span>
              <span class="slot-item-price">${priceTag}</span>
              ${isActive ? '<div class="slot-target-radar-tag">📍 YE YAHAN LAGEGA</div>' : ''}
            </div>
          </div>
        `;
      };

      const hangersHtml = hangers.map(it => renderSlotHtml(it, true)).join('');
      const middleHtml = middleShelves.map(it => renderSlotHtml(it, false)).join('');
      const bottomHtml = bottomShelves.map(it => renderSlotHtml(it, false)).join('');
      const cutHtml = cutTrays.map(it => renderSlotHtml(it, false)).join('');

      return `
        <div class="visual-rack-container">
          <div class="rack-header-label">
            <span class="rack-title-badge">🏢 FIXTURE FLOOR MAP &bull; ${escapeHtml(activeSection)}</span>
            <span class="badge-active-pos pulse-beacon">SLOT #${activePos} TARGET HIGHLIGHTED</span>
          </div>

          <div class="rack-diagram">
            ${hangers.length > 0 ? `
              <div class="rack-rail-label">TOP HANGING RAIL (Denim / Shackets)</div>
              <div class="rack-hanger-row">
                ${hangersHtml}
              </div>
            ` : ''}

            ${middleShelves.length > 0 ? `
              <div class="rack-rail-label" style="margin-top: 12px;">MIDDLE FOLDED SHELF TIERS (Tees / Shirts)</div>
              <div class="rack-shelf-grid">
                ${middleHtml}
              </div>
            ` : ''}

            ${bottomShelves.length > 0 ? `
              <div class="rack-rail-label" style="margin-top: 12px;">BOTTOM SHELF TIERS (Stacks / Denims)</div>
              <div class="rack-shelf-grid">
                ${bottomHtml}
              </div>
            ` : ''}

            ${cutTrays.length > 0 ? `
              <div class="rack-rail-label" style="margin-top: 12px;">CUT PIECES / BOTTOM TRAYS</div>
              <div class="rack-shelf-grid">
                ${cutHtml}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    /**
     * Get relative (x, y) percent coordinates of target slot on the cropped PDF fixture diagram
     * Used to overlay the animated pulsing radar beacon ("Ye Yahan Pe Lagega")
     */
    getFixtureBeaconCoordinates(product) {
      if (!product) return { x: 50, y: 50, label: 'SLOT #1' };

      const pNum = product.page || 1;
      const pos = parseInt(product.position, 10) || 1;
      let x = 50;
      let y = 50;

      if (pNum === 1) {
        // Page 1: M6 DENIM (1-4 rail, 5-9 middle, 10-14 bottom)
        if (pos <= 4) {
          x = 22 + (pos - 1) * 18.5;
          y = 36;
        } else if (pos <= 9) {
          x = 12 + (pos - 5) * 16.5;
          y = 75;
        } else {
          x = 12 + (pos - 10) * 16.5;
          y = 86;
        }
      } else if (pNum === 2) {
        // Page 2: M8 DENIM MONO (23-26 rail, 27-31 middle, 32-36 bottom)
        if (pos <= 26) {
          x = 22 + Math.max(0, pos - 23) * 18.5;
          y = 36;
        } else if (pos <= 31) {
          x = 12 + Math.max(0, pos - 27) * 16.5;
          y = 75;
        } else {
          x = 12 + Math.max(0, pos - 32) * 16.5;
          y = 86;
        }
      } else if (pNum === 3 || pNum === 4) {
        // Page 3 & 4: M9 / M10 ESSENTIALS
        if (pos <= 4) {
          x = 22 + Math.max(0, pos - 1) * 18.5;
          y = 36;
        } else if (pos <= 8) {
          x = 14 + Math.max(0, pos - 5) * 18.0;
          y = 72;
        } else {
          x = 14 + Math.max(0, pos - 9) * 18.0;
          y = 85;
        }
      } else if (pNum >= 5) {
        // Page 5 & 6: MT2 DENIM WORLD
        if (pos <= 4) {
          x = 26 + Math.max(0, pos - 1) * 13.0;
          y = 34;
        } else if (pos <= 8) {
          x = 26 + Math.max(0, pos - 5) * 13.0;
          y = 52;
        } else if (pos <= 12) {
          x = 26 + Math.max(0, pos - 9) * 13.0;
          y = 66;
        } else {
          x = 50;
          y = 78;
        }
      }

      const xCoord = Math.max(8, Math.min(92, Math.round(x)));
      const yCoord = Math.max(10, Math.min(92, Math.round(y)));
      return {
        x: xCoord,
        y: yCoord,
        xPct: xCoord,
        yPct: yCoord,
        label: `SLOT #${pos}`
      };
    }

    /**
     * Get all NEW LINE products in the cheatsheet catalog
     */
    getAllNewLines() {
      return this.items.filter(it => String(it.newLine || '').trim().toUpperCase() === 'YES');
    }

    /**
     * Total count of NEW LINE products
     */
    getNewLinesCount() {
      return this.getAllNewLines().length;
    }

    /**
     * Breakdown of NEW LINE products grouped by section
     */
    getNewLinesBySection() {
      const result = {};
      const newLines = this.getAllNewLines();
      newLines.forEach(it => {
        const sec = it.section || 'Unassigned';
        if (!result[sec]) result[sec] = [];
        result[sec].push(it);
      });
      return result;
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
