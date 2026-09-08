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
      this.dpiScale = 1.5; // Balanced high resolution with mobile memory safety
      this.preloadedSlides = new Map(); // pageNum -> Image
      this.preloadedRacks = new Map();
      this.preloadDefaultAssets();
    }

    preloadDefaultAssets() {
      if (typeof window === 'undefined' || typeof Image === 'undefined') return;
      for (let p = 1; p <= 6; p++) {
        const slideImg = new Image();
        slideImg.crossOrigin = 'anonymous';
        slideImg.onload = () => this.preloadedSlides.set(p, slideImg);
        slideImg.src = `sample-data/slides/page_${p}.jpg`;

        const rackImg = new Image();
        rackImg.crossOrigin = 'anonymous';
        rackImg.onload = () => this.preloadedRacks.set(p, rackImg);
        rackImg.src = `sample-data/racks/rack_p${p}.png`;
      }
    }

    async getSlideImage(pageNum = 1) {
      const p = Math.max(1, Math.min(6, parseInt(pageNum, 10) || 1));
      if (this.preloadedSlides.has(p)) {
        const img = this.preloadedSlides.get(p);
        if (img && (img.complete || img.naturalWidth > 0)) return img;
      }
      return new Promise((resolve) => {
        if (typeof Image === 'undefined') return resolve(null);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          this.preloadedSlides.set(p, img);
          resolve(img);
        };
        img.onerror = () => resolve(null);
        img.src = `sample-data/slides/page_${p}.jpg`;
      });
    }

    getRackImageUrl(pageNum = 1) {
      const p = Math.max(1, Math.min(6, parseInt(pageNum, 10) || 1));
      return `sample-data/racks/rack_p${p}.png`;
    }

    async loadPdfDocument(arrayBuffer) {
      if (!window.pdfjsLib) {
        console.warn('PDF.js not available for visual cropping');
        return;
      }

      try {
        this.renderedPages.clear();
        this.currentPdfDoc = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        // Render page 1 initially to keep mobile memory light and fast;
        // remaining pages will be rendered lazily on demand when scanned or viewed!
        await this.renderPage(1);
        console.log(`PdfCropper: Loaded ${this.currentPdfDoc.numPages} pages (page 1 primed).`);
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
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
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

    clear() {
      this.renderedPages.clear();
      this.currentPdfDoc = null;
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

        // Solid white background before rendering PDF
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext: ctx,
          viewport: viewport,
          background: 'rgb(255, 255, 255)'
        }).promise;

        // Get text tokens and their bounding coordinates
        let textItems = [];
        try {
          const textContent = await page.getTextContent();
          textItems = textContent.items || [];
        } catch (tErr) {
          console.warn('Text content extraction skipped for page', pageNum);
        }

        const pageData = {
          pageNum,
          canvas,
          viewport,
          textItems
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
        const pageNum = Math.max(1, Math.min(6, parseInt(product.page, 10) || 1));

        let source = null;
        let W = 0, H = 0;

        // Check if custom uploaded PDF page canvas is available
        let pageData = this.renderedPages.get(pageNum);
        if (!pageData && this.currentPdfDoc) {
          pageData = await this.renderPage(pageNum);
        }

        if (pageData && pageData.canvas && pageData.canvas.width > 0) {
          source = pageData.canvas;
          W = pageData.canvas.width;
          H = pageData.canvas.height;
        }

        // If no custom PDF canvas or canvas is empty, use authentic pre-rendered cheatsheet slide!
        if (!source) {
          const slideImg = await this.getSlideImage(pageNum);
          if (slideImg && (slideImg.naturalWidth || slideImg.width)) {
            source = slideImg;
            W = slideImg.naturalWidth || slideImg.width;
            H = slideImg.naturalHeight || slideImg.height;
          }
        }

        if (!source || W <= 0 || H <= 0) {
          return this.generateFallbackSnippet(product);
        }

        let cropX = 0, cropY = 0, cropW = 0, cropH = 0;

        // Try text token match if available in custom PDF
        const cleanCode = String(product.code || '').trim();
        const codeDigits = cleanCode.replace(/\D/g, '');
        let matchedToken = null;

        if (pageData && Array.isArray(pageData.textItems) && pageData.textItems.length > 0) {
          for (let i = 0; i < pageData.textItems.length; i++) {
            const item = pageData.textItems[i];
            const str = (item.str || '').trim();
            if (str && (str.includes(cleanCode) || (codeDigits && str.replace(/\D/g, '').includes(codeDigits)))) {
              matchedToken = item;
              break;
            }
          }
        }

        if (matchedToken && Array.isArray(matchedToken.transform) && matchedToken.transform.length >= 6) {
          const pdfX = matchedToken.transform[4];
          const pdfY = matchedToken.transform[5];
          const unscaledH = (pageData.viewport && pageData.viewport.height)
            ? (pageData.viewport.height / (this.dpiScale || 1))
            : (H / (this.dpiScale || 1));
          const tx = pdfX * (this.dpiScale || 1);
          const ty = (unscaledH - pdfY) * (this.dpiScale || 1);
          const boxWidth = Math.max(80, W * 0.17);
          const boxHeight = Math.max(100, H * 0.32);
          cropX = tx - (boxWidth * 0.15);
          cropY = ty - (boxHeight * 0.65);
          cropW = boxWidth * 1.3;
          cropH = boxHeight * 1.25;
        } else {
          // Precise Fixture-Aware 5-Column Grid Mapping for Retail Cheatsheet Slides:
          const pos = parseInt(product.position, 10);
          const basePos = (pageNum === 2) ? 23 : 1;
          const index = (!isNaN(pos) && pos >= basePos) ? (pos - basePos) : 0;

          let col = index % 5;
          let row = Math.floor(index / 5);

          if ((product.cutSize === 'YES' || pos === 0) && (pageNum === 3 || pageNum === 5 || pageNum === 6)) {
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

        // Clamp dimensions safely
        cropX = Math.max(0, Math.min(cropX, W - 40));
        cropY = Math.max(0, Math.min(cropY, H - 40));
        cropW = Math.max(40, Math.min(cropW, W - cropX));
        cropH = Math.max(40, Math.min(cropH, H - cropY));

        const destCanvas = document.createElement('canvas');
        destCanvas.width = Math.round(cropW);
        destCanvas.height = Math.round(cropH);
        const destCtx = destCanvas.getContext('2d');

        if (!destCtx) {
          return this.generateFallbackSnippet(product);
        }

        // CRITICAL: Always fill with solid white background FIRST!
        destCtx.fillStyle = '#FFFFFF';
        destCtx.fillRect(0, 0, destCanvas.width, destCanvas.height);

        // Draw cropped area with high quality smoothing
        if (destCtx.imageSmoothingEnabled !== undefined) {
          destCtx.imageSmoothingEnabled = true;
          destCtx.imageSmoothingQuality = 'high';
        }

        destCtx.drawImage(
          source,
          Math.round(cropX), Math.round(cropY), Math.round(cropW), Math.round(cropH),
          0, 0, Math.round(cropW), Math.round(cropH)
        );

        // Add thin subtle laser border on the cropped piece
        destCtx.strokeStyle = '#FF473A';
        destCtx.lineWidth = 3;
        destCtx.strokeRect(1.5, 1.5, destCanvas.width - 3, destCanvas.height - 3);

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
      const p = Math.max(1, Math.min(6, parseInt(pageNum, 10) || 1));

      // 1. If custom PDF document is uploaded and page is rendered, try cropping from PDF canvas
      const pageData = this.renderedPages.get(p);
      if (pageData && pageData.canvas && pageData.canvas.width > 0) {
        const { canvas } = pageData;
        const W = canvas.width;
        const H = canvas.height;

        const cropX = 0;
        const cropY = 0;
        const cropW = Math.round(W * 0.254);

        let cropH;
        if (p === 1 || p === 2 || p === 4) {
          cropH = Math.round(H * 0.48);
        } else if (p === 3) {
          cropH = Math.round(H * 0.38);
        } else if (p === 5) {
          cropH = Math.round(H * 0.42);
        } else if (p === 6) {
          cropH = Math.round(H * 0.36);
        } else {
          cropH = Math.round(Math.min(H * 0.50, W * 0.35));
        }

        const destCanvas = document.createElement('canvas');
        destCanvas.width = cropW;
        destCanvas.height = cropH;
        const destCtx = destCanvas.getContext('2d');

        if (destCtx) {
          destCtx.fillStyle = '#FFFFFF';
          destCtx.fillRect(0, 0, cropW, cropH);
          destCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
          return destCanvas.toDataURL('image/png');
        }
      }

      // 2. Guaranteed clean authentic floor fixture diagram
      return this.getRackImageUrl(p);
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

      const activeDocLabel = docName ? docName.slice(0, 36) : 'None (No PDF Uploaded)';
      ctx.fillText(`Active Doc: ${activeDocLabel}`, 20, 120);

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
