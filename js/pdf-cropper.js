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
      const pageNum = product.page || 1;

      let pageData = this.renderedPages.get(pageNum);
      if (!pageData && this.currentPdfDoc) {
        pageData = await this.renderPage(pageNum);
      }

      if (!pageData) {
        // Return a dynamically generated visual card if PDF canvas is not active
        return this.generateFallbackSnippet(product);
      }

      const { canvas, viewport, textItems } = pageData;
      const W = canvas.width;
      const H = canvas.height;

      // 1. Search for text token matching product code
      const cleanCode = String(product.code).trim();
      let matchedToken = null;

      for (const item of textItems) {
        if (item.str && item.str.includes(cleanCode)) {
          matchedToken = item;
          break;
        }
      }

      let cropX = 0, cropY = 0, cropW = 0, cropH = 0;

      if (matchedToken && matchedToken.transform) {
        // PDF coordinates have origin at bottom-left, convert to canvas top-left
        const tx = matchedToken.transform[4] * this.dpiScale;
        const ty = (viewport.rawDims ? viewport.rawDims.pageHeight : (H / this.dpiScale) - matchedToken.transform[5]) * this.dpiScale;

        // Bounding box: include the product photo above the code and the metadata box
        const boxWidth = W * 0.17; // Approx width of one garment box
        const boxHeight = H * 0.32; // Includes photo + code + color + price
        
        cropX = Math.max(0, tx - (boxWidth * 0.15));
        cropY = Math.max(0, ty - (boxHeight * 0.65));
        cropW = Math.min(W - cropX, boxWidth * 1.3);
        cropH = Math.min(H - cropY, boxHeight * 1.25);
      } else {
        // Fallback: Grid layout math based on position (Positions 1-4 top row, 5-9 middle, 10-14 bottom)
        const pos = product.position || 1;
        const colCount = 5;
        let col = 0, row = 0;

        if (pos <= 5) {
          row = 0;
          col = pos - 1;
        } else if (pos <= 10) {
          row = 1;
          col = pos - 6;
        } else {
          row = 2;
          col = pos - 11;
        }

        const gridStartX = W * 0.26; // Products start to the right of fixture diagram
        const gridWidth = W * 0.73;
        const cellW = gridWidth / colCount;
        const cellH = H * 0.31;

        cropX = gridStartX + (col * cellW);
        cropY = H * 0.05 + (row * cellH);
        cropW = cellW * 0.96;
        cropH = cellH * 0.94;
      }

      // Render crop to destination canvas
      const destCanvas = document.createElement('canvas');
      destCanvas.width = Math.round(cropW);
      destCanvas.height = Math.round(cropH);
      const destCtx = destCanvas.getContext('2d');

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
    }

    /**
     * Crops the fixture rack diagram (left side of cheatsheet page)
     */
    async cropRackDiagram(pageNum = 1) {
      const pageData = this.renderedPages.get(pageNum);
      if (!pageData) return null;

      const { canvas } = pageData;
      const W = canvas.width;
      const H = canvas.height;

      // Fixture diagram is on the left 26% of the page
      const cropX = 0;
      const cropY = H * 0.08;
      const cropW = W * 0.255;
      const cropH = H * 0.85;

      const destCanvas = document.createElement('canvas');
      destCanvas.width = Math.round(cropW);
      destCanvas.height = Math.round(cropH);
      const destCtx = destCanvas.getContext('2d');

      destCtx.drawImage(
        canvas,
        cropX, cropY, cropW, cropH,
        0, 0, cropW, cropH
      );

      return destCanvas.toDataURL('image/png');
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
