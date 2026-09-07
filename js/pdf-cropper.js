/**
 * PDF Visual Snippet Cropper Module
 * Renders uploaded PDF pages onto high-DPI canvases using PDF.js,
 * detects product bounding boxes via text token coordinates or grid math,
 * and crops out the exact physical snippet from the PDF document.
 */
(function(window) {
  'use strict';

  class PdfCropper {
    constructor() {
      this.renderedPages = new Map(); // pageNum -> { canvas, textItems, viewport }
      this.currentPdfDoc = null;
      this.dpiScale = 2.0; // High resolution rendering for crisp text & photos
    }

    async loadPdfDocument(arrayBuffer) {
      if (!window.pdfjsLib) {
        console.warn('PDF.js not available for visual cropping');
        return;
      }

      try {
        this.renderedPages.clear();
        this.currentPdfDoc = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        // Render all pages in background for instant crop on scan
        for (let pageNum = 1; pageNum <= this.currentPdfDoc.numPages; pageNum++) {
          await this.renderPage(pageNum);
        }
        console.log(`PdfCropper: Rendered ${this.currentPdfDoc.numPages} pages for visual extraction.`);
      } catch (err) {
        console.error('PdfCropper failed to load document:', err);
      }
    }

    /**
     * Loads a direct presentation slide image or photo into page 1
     */
    async loadImageDocument(imgElement) {
      try {
        this.renderedPages.clear();
        this.currentPdfDoc = null;

        const canvas = document.createElement('canvas');
        canvas.width = imgElement.naturalWidth || imgElement.width || 1200;
        canvas.height = imgElement.naturalHeight || imgElement.height || 800;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);

        const pageData = {
          pageNum: 1,
          canvas,
          viewport: { width: canvas.width, height: canvas.height },
          textItems: []
        };

        this.renderedPages.set(1, pageData);
        return true;
      } catch (err) {
        console.error('PdfCropper failed to load image document:', err);
        return false;
      }
    }

    getAllCanvases() {
      const canvases = [];
      for (const [pageNum, pageData] of this.renderedPages.entries()) {
        if (pageData && pageData.canvas) {
          canvases.push(pageData.canvas);
        }
      }
      return canvases;
    }

    getPageCount() {
      if (this.currentPdfDoc) return this.currentPdfDoc.numPages;
      return this.renderedPages.size || 0;
    }

    getPageCanvas(pageNum = 1) {
      const p = this.renderedPages.get(pageNum);
      return p ? p.canvas : null;
    }

    async renderPage(pageNum) {
      if (this.renderedPages.has(pageNum)) return this.renderedPages.get(pageNum);
      if (!this.currentPdfDoc) return null;

      try {
        const page = await this.currentPdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: this.dpiScale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        await page.render({ canvasContext: ctx, viewport: viewport }).promise;

        // Get text tokens and their bounding coordinates
        const textContent = await page.getTextContent();

        const pageData = {
          pageNum,
          canvas,
          viewport,
          textItems: textContent.items
        };

        this.renderedPages.set(pageNum, pageData);
        return pageData;
      } catch (err) {
        console.warn(`Error rendering PDF page ${pageNum}:`, err);
        return null;
      }
    }

    /**
     * Crops the exact visual card from the PDF for a given product code & position.
     * @param {Object} product { code, page, position, section }
     * @returns {Promise<string|null>} Data URL of cropped image
     */
    async cropProductSnippet(product) {
      if (!product) return null;

      try {
        const pageNum = product.page || 1;

        let pageData = this.renderedPages.get(pageNum);
        if (!pageData && this.currentPdfDoc) {
          pageData = await this.renderPage(pageNum);
        }

        if (!pageData || !pageData.canvas) {
          // Return a dynamically generated visual card if PDF canvas is not active
          return this.generateFallbackSnippet(product);
        }

        const { canvas, viewport, textItems } = pageData;
        const W = canvas.width || 800;
        const H = canvas.height || 600;

        if (W <= 0 || H <= 0) {
          return this.generateFallbackSnippet(product);
        }

        const cleanCode = String(product.code || '').trim();
        const codeDigits = cleanCode.replace(/\D/g, '');
        let matchedToken = null;

        // 1. Search for single text token matching code
        if (Array.isArray(textItems) && textItems.length > 0) {
          for (let i = 0; i < textItems.length; i++) {
            const item = textItems[i];
            const str = (item.str || '').trim();
            if (str && (str.includes(cleanCode) || (codeDigits && str.replace(/\D/g, '').includes(codeDigits)))) {
              matchedToken = item;
              break;
            }
          }

          // 2. Search across multi-token window if barcode digits were split across adjacent text tokens
          if (!matchedToken && cleanCode.length >= 4) {
            for (let i = 0; i < textItems.length; i++) {
              let combinedStr = '';
              let combinedDigits = '';
              for (let j = i; j < Math.min(i + 6, textItems.length); j++) {
                const s = textItems[j].str || '';
                combinedStr += s;
                combinedDigits += s.replace(/\D/g, '');
                if (combinedStr.includes(cleanCode) || (codeDigits && combinedDigits.includes(codeDigits))) {
                  matchedToken = textItems[i];
                  break;
                }
              }
              if (matchedToken) break;
            }
          }
        }

        let cropX = 0, cropY = 0, cropW = 0, cropH = 0;

        if (matchedToken && Array.isArray(matchedToken.transform) && matchedToken.transform.length >= 6) {
          // PDF coordinates have origin at bottom-left: transform[4] is X, transform[5] is Y from bottom (points)
          const pdfX = matchedToken.transform[4];
          const pdfY = matchedToken.transform[5];

          // Unscaled PDF page height in points
          const unscaledH = (viewport && viewport.height)
            ? (viewport.height / (this.dpiScale || 1))
            : (H / (this.dpiScale || 1));

          // Convert to canvas top-left coordinates:
          const tx = pdfX * (this.dpiScale || 1);
          const ty = (unscaledH - pdfY) * (this.dpiScale || 1);

          // Bounding box: include the product photo above the code and the metadata box
          const boxWidth = Math.max(80, W * 0.17);
          const boxHeight = Math.max(100, H * 0.32);

          cropX = tx - (boxWidth * 0.15);
          cropY = ty - (boxHeight * 0.65);
          cropW = boxWidth * 1.3;
          cropH = boxHeight * 1.25;
        } else {
          // Fixture-Aware 5-Column Grid Mapping for Retail Cheatsheet Slides:
          // Standard cheatsheet slide template (1080px base width):
          // Left side (0 to 25.4% W) is the rack diagram & legends.
          // Right side (25.4% to 99% W) has 5 equal columns: Col 0 to Col 4 (width = 0.1472 * W).
          // Row height is fixed to the garment tile proportion: W * (5 / 24) ≈ 0.2083 * W.
          const pNum = product.page || 1;
          const pos = parseInt(product.position, 10);

          // Page 2 (M8) positions start at 23; other pages start at 1.
          const basePos = (pNum === 2) ? 23 : 1;
          const index = (!isNaN(pos) && pos >= basePos) ? (pos - basePos) : 0;

          let col = index % 5;
          let row = Math.floor(index / 5);

          // Handle cut-size trays or bottom trays if position is 0
          if ((product.cutSize === 'YES' || pos === 0) && (pNum === 3 || pNum === 5 || pNum === 6)) {
            row = Math.max(3, Math.floor(H / (W * (5.0 / 24.0))) - 1);
            col = (product.code === '301077491' || product.code === '301073491') ? 1 : 0;
          }

          col = Math.max(0, Math.min(4, col));
          row = Math.max(0, row);

          const colWidth = W * 0.1472;
          const rowHeight = Math.min(H * 0.35, Math.max(H * 0.16, W * (5.0 / 24.0)));

          cropX = (0.254 + col * 0.1472) * W;
          cropY = row * rowHeight;
          cropW = colWidth;
          cropH = rowHeight;
        }

        // Safety-clamp dimensions: minimum 40px, strictly inside page bounds
        cropX = Math.max(0, Math.min(cropX, W - 40));
        cropY = Math.max(0, Math.min(cropY, H - 40));
        cropW = Math.max(40, Math.min(cropW, W - cropX));
        cropH = Math.max(40, Math.min(cropH, H - cropY));

        // Render crop to destination canvas
        const destCanvas = document.createElement('canvas');
        destCanvas.width = Math.round(cropW);
        destCanvas.height = Math.round(cropH);
        const destCtx = destCanvas.getContext('2d');

        if (!destCtx) {
          return this.generateFallbackSnippet(product);
        }

        // Draw cropped area from full page canvas
        destCtx.drawImage(
          canvas,
          Math.round(cropX), Math.round(cropY), Math.round(cropW), Math.round(cropH),
          0, 0, Math.round(cropW), Math.round(cropH)
        );

        // Add thin subtle laser border on the cropped piece
        destCtx.strokeStyle = '#FF473A';
        destCtx.lineWidth = 4;
        destCtx.strokeRect(0, 0, destCanvas.width, destCanvas.height);

        return destCanvas.toDataURL('image/png');
      } catch (err) {
        console.warn('cropProductSnippet failed, returning fallback card:', err);
        return this.generateFallbackSnippet(product);
      }
    }

    /**
     * Crops the clean physical fixture rack diagram (left side of cheatsheet page)
     * Focused specifically on the floor rack illustration, slots, and capacity labels
     */
    async cropFixtureSnippet(pageNum = 1) {
      const pageData = this.renderedPages.get(pageNum);
      if (!pageData || !pageData.canvas) {
        return this.generateFallbackFixtureSnippet(pageNum);
      }

      const { canvas } = pageData;
      const W = canvas.width;
      const H = canvas.height;

      // Left column contains the fixture illustration:
      const cropX = 0;
      const cropY = 0;
      const cropW = Math.round(W * 0.254);

      // Clean height based on page aspect ratio to exclude blank CHEATSHEET box
      let cropH;
      if (pageNum === 1 || pageNum === 2 || pageNum === 4) {
        cropH = Math.round(H * 0.48);
      } else if (pageNum === 3) {
        cropH = Math.round(H * 0.38);
      } else if (pageNum === 5) {
        cropH = Math.round(H * 0.42);
      } else if (pageNum === 6) {
        cropH = Math.round(H * 0.36);
      } else {
        cropH = Math.round(Math.min(H * 0.50, W * 0.35));
      }

      const destCanvas = document.createElement('canvas');
      destCanvas.width = cropW;
      destCanvas.height = cropH;
      const destCtx = destCanvas.getContext('2d');

      destCtx.drawImage(
        canvas,
        cropX, cropY, cropW, cropH,
        0, 0, cropW, cropH
      );

      return destCanvas.toDataURL('image/png');
    }

    // Backwards-compatible alias
    async cropRackDiagram(pageNum = 1) {
      return this.cropFixtureSnippet(pageNum);
    }

    /**
     * Fallback clean graphic for fixture diagram when PDF canvas is not yet loaded
     */
    generateFallbackFixtureSnippet(pageNum = 1) {
      const c = document.createElement('canvas');
      c.width = 400;
      c.height = 460;
      const ctx = c.getContext('2d');

      // Background
      ctx.fillStyle = '#0E1117';
      ctx.fillRect(0, 0, c.width, c.height);

      // Header Banner
      ctx.fillStyle = '#171B22';
      ctx.fillRect(0, 0, c.width, 42);
      ctx.fillStyle = '#55E497';
      ctx.font = 'bold 15px -apple-system, sans-serif';
      const secName = pageNum === 2 ? 'M8 DENIM MONO' : (pageNum === 1 ? 'M6 DENIM' : `PAGE ${pageNum} FIXTURE`);
      ctx.fillText(`🏢 ${secName} (FLOOR RACK)`, 16, 27);

      // Hanging Rail Frame
      ctx.fillStyle = '#1F2430';
      ctx.fillRect(20, 58, c.width - 40, 160);
      ctx.strokeStyle = '#2F3746';
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 58, c.width - 40, 160);

      // Hanging Rail Bar
      ctx.fillStyle = '#55E497';
      ctx.fillRect(36, 75, c.width - 72, 6);

      // 4 Hanger slots
      const basePos = pageNum === 2 ? 23 : 1;
      for (let i = 0; i < 4; i++) {
        const hx = 44 + i * 82;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(hx + 28, 92, 10, Math.PI, 0);
        ctx.stroke();

        ctx.fillStyle = '#282F3E';
        ctx.fillRect(hx, 105, 56, 95);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 12px monospace';
        ctx.fillText(`#${basePos + i}`, hx + 16, 155);
      }

      // Middle Shelf
      ctx.fillStyle = '#171B24';
      ctx.fillRect(20, 230, c.width - 40, 85);
      ctx.strokeStyle = '#2F3746';
      ctx.strokeRect(20, 230, c.width - 40, 85);

      const midBase = pageNum === 2 ? 27 : 5;
      for (let i = 0; i < 5; i++) {
        const sx = 28 + i * 68;
        ctx.fillStyle = '#222836';
        ctx.fillRect(sx, 242, 58, 62);
        ctx.fillStyle = '#8C93A0';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`#${midBase + i}`, sx + 18, 278);
      }

      // Bottom Shelf
      ctx.fillStyle = '#171B24';
      ctx.fillRect(20, 325, c.width - 40, 85);
      ctx.strokeStyle = '#2F3746';
      ctx.strokeRect(20, 325, c.width - 40, 85);

      const botBase = pageNum === 2 ? 32 : 10;
      for (let i = 0; i < 5; i++) {
        const sx = 28 + i * 68;
        ctx.fillStyle = '#222836';
        ctx.fillRect(sx, 337, 58, 62);
        ctx.fillStyle = '#8C93A0';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`#${botBase + i}`, sx + 18, 373);
      }

      ctx.fillStyle = '#55E497';
      ctx.font = '11px monospace';
      ctx.fillText('• 14 pcs Denim Rail  • 15 pcs Folded Tees', 24, 435);

      return c.toDataURL('image/png');
    }

    generateFallbackSnippet(product) {
      const c = document.createElement('canvas');
      c.width = 400;
      c.height = 320;
      const ctx = c.getContext('2d');

      // Card Background
      ctx.fillStyle = '#101318';
      ctx.fillRect(0, 0, c.width, c.height);

      // Border
      ctx.strokeStyle = '#FF473A';
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, c.width - 4, c.height - 4);

      // Header Tag
      ctx.fillStyle = '#FF473A';
      ctx.fillRect(10, 10, 120, 26);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(`POS #${product.position || 1}`, 22, 28);

      // Section
      ctx.fillStyle = '#55E497';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(product.section || 'STORE FIXTURE', 140, 28);

      // Product Visual placeholder icon / box
      ctx.fillStyle = '#1E232E';
      ctx.fillRect(20, 48, c.width - 40, 150);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.strokeRect(20, 48, c.width - 40, 150);

      ctx.fillStyle = '#8C93A0';
      ctx.font = '14px monospace';
      ctx.fillText(`[ ${product.color || 'COLOR'} ]`, 140, 125);
      ctx.font = '12px monospace';
      ctx.fillText(`Option ${product.position || 1} • ${product.slotType || 'Garment'}`, 120, 150);

      // Data fields
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 15px monospace';
      ctx.fillText(`CODE: ${product.code}`, 24, 230);
      ctx.fillStyle = '#55E497';
      ctx.fillText(`SIGNAGE: ₹${product.signage}`, 24, 255);
      ctx.fillStyle = '#D1D5DB';
      ctx.font = '13px sans-serif';
      ctx.fillText(`COLOR: ${product.color}`, 24, 280);

      if (product.remarks) {
        ctx.fillStyle = '#FFB5AF';
        ctx.font = 'italic 11px sans-serif';
        ctx.fillText(`* ${product.remarks.slice(0, 45)}`, 24, 305);
      }

      return c.toDataURL('image/png');
    }

    generateNotFoundSnippet(scannedCode, rawCode = '', docName = 'Cheatsheet') {
      const c = document.createElement('canvas');
      c.width = 400;
      c.height = 240;
      const ctx = c.getContext('2d');

      // Warning Card Background
      ctx.fillStyle = '#141010';
      ctx.fillRect(0, 0, c.width, c.height);

      // Warning Border
      ctx.strokeStyle = '#FF473A';
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, c.width - 4, c.height - 4);

      // Top Tag
      ctx.fillStyle = '#FF473A';
      ctx.fillRect(10, 10, 180, 24);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('NO PLANOGRAM MATCH', 18, 26);

      // Main Icon & Status
      ctx.fillStyle = '#FFB5AF';
      ctx.font = 'bold 15px monospace';
      ctx.fillText(`CODE: ${scannedCode}`, 20, 68);

      if (rawCode && rawCode !== scannedCode) {
        ctx.fillStyle = '#8C93A0';
        ctx.font = '12px monospace';
        ctx.fillText(`RAW SCANNED: ${rawCode}`, 20, 92);
      }

      ctx.fillStyle = '#A0AEC0';
      ctx.font = '12px sans-serif';
      ctx.fillText(`Active Doc: ${docName.slice(0, 36)}`, 20, 120);

      // Diagnostic Box
      ctx.fillStyle = 'rgba(255, 71, 58, 0.12)';
      ctx.fillRect(20, 140, c.width - 40, 75);
      ctx.strokeStyle = 'rgba(255, 71, 58, 0.3)';
      ctx.strokeRect(20, 140, c.width - 40, 75);

      ctx.fillStyle = '#FFB5AF';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('RECOMMENDED ACTION:', 30, 160);

      ctx.fillStyle = '#E2E8F0';
      ctx.font = '11px sans-serif';
      ctx.fillText('1. Check Digit Trim dial if barcode has size/check digits.', 30, 180);
      ctx.fillText('2. Or upload the matching fixture PDF in the PDF Dock.', 30, 198);

      return c.toDataURL('image/png');
    }
  }

  window.PdfCropper = PdfCropper;
})(window);
