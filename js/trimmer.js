/**
 * Trimmer Module — Digit Trim Rule & Visual Strikethrough Preview
 * Manages dial stepper, synced range slider (0-12), and trailing digit truncation.
 */
(function(window) {
  'use strict';

  class TrimmerManager {
    constructor() {
      this.trimN = 0; // Default 0 or 4, let's initialize to 0 for raw product codes, or configurable
      this.maxN = 12;
      this.onTrimChangeCallbacks = [];
      this.sampleBarcode = '301081626001'; // Default sample showing 9-digit code with 3 check digits
    }

    init(initialValue = 0) {
      this.trimN = Math.max(0, Math.min(this.maxN, initialValue));

      this.dom = {
        btnMinus: document.getElementById('btn-trim-minus'),
        btnPlus: document.getElementById('btn-trim-plus'),
        dialNum: document.getElementById('dial-display-num'),
        slider: document.getElementById('trim-range'),
        valText: document.getElementById('trim-val-text'),
        telemStatus: document.getElementById('telem-trim-status'),
        previewSavedPill: document.getElementById('preview-saved-pill'),
        codeKeep: document.getElementById('code-part-keep'),
        codeCut: document.getElementById('code-part-cut'),
        previewLenLabel: document.getElementById('preview-len-label'),
        customInput: document.getElementById('custom-test-barcode')
      };

      if (!this.dom.btnMinus || !this.dom.slider) return;

      // Event listeners
      this.dom.btnMinus.addEventListener('click', () => this.setTrim(this.trimN - 1));
      this.dom.btnPlus.addEventListener('click', () => this.setTrim(this.trimN + 1));
      this.dom.slider.addEventListener('input', (e) => this.setTrim(parseInt(e.target.value, 10)));

      if (this.dom.customInput) {
        this.dom.customInput.addEventListener('input', (e) => {
          this.sampleBarcode = e.target.value.trim() || '301081626';
          this.updatePreview();
        });
      }

      this.updateUI();
    }

    onTrimChange(callback) {
      if (typeof callback === 'function') {
        this.onTrimChangeCallbacks.push(callback);
      }
    }

    setTrim(val) {
      let n = parseInt(val, 10);
      if (isNaN(n)) n = 0;
      this.trimN = Math.max(0, Math.min(this.maxN, n));

      this.updateUI();

      // Notify listeners
      this.onTrimChangeCallbacks.forEach(cb => cb(this.trimN));
    }

    getTrim() {
      return this.trimN;
    }

    /**
     * Trims N trailing characters from raw string
     */
    apply(rawCode) {
      if (!rawCode) return '';
      const str = String(rawCode).trim();
      const n = this.trimN;
      if (n <= 0) return str;
      if (n >= str.length) return '';
      return str.slice(0, str.length - n);
    }

    updateUI() {
      const n = this.trimN;

      if (this.dom.dialNum) this.dom.dialNum.textContent = n;
      if (this.dom.slider) this.dom.slider.value = n;
      if (this.dom.valText) this.dom.valText.textContent = n;
      if (this.dom.telemStatus) this.dom.telemStatus.textContent = `-${n} Digits`;

      if (this.dom.btnMinus) this.dom.btnMinus.disabled = (n <= 0);
      if (this.dom.btnPlus) this.dom.btnPlus.disabled = (n >= this.maxN);

      this.updatePreview();
    }

    updatePreview() {
      const sample = this.dom.customInput && this.dom.customInput.value.trim() 
        ? this.dom.customInput.value.trim() 
        : this.sampleBarcode;
      
      const n = this.trimN;
      const len = sample.length;

      if (this.dom.previewLenLabel) {
        this.dom.previewLenLabel.textContent = `(${len} chars)`;
      }

      if (n === 0) {
        if (this.dom.codeKeep) this.dom.codeKeep.textContent = sample;
        if (this.dom.codeCut) {
          this.dom.codeCut.textContent = '';
          this.dom.codeCut.style.display = 'none';
        }
        if (this.dom.previewSavedPill) {
          this.dom.previewSavedPill.textContent = `Saved: ${sample}`;
        }
      } else if (n >= len) {
        if (this.dom.codeKeep) this.dom.codeKeep.textContent = '';
        if (this.dom.codeCut) {
          this.dom.codeCut.textContent = sample;
          this.dom.codeCut.style.display = 'inline';
        }
        if (this.dom.previewSavedPill) {
          this.dom.previewSavedPill.textContent = `Saved: [All Excluded]`;
        }
      } else {
        const keep = sample.slice(0, len - n);
        const cut = sample.slice(len - n);
        if (this.dom.codeKeep) this.dom.codeKeep.textContent = keep;
        if (this.dom.codeCut) {
          this.dom.codeCut.textContent = cut;
          this.dom.codeCut.style.display = 'inline';
        }
        if (this.dom.previewSavedPill) {
          this.dom.previewSavedPill.textContent = `Saved: ${keep}`;
        }
      }
    }
  }

  window.TrimmerManager = TrimmerManager;
})(window);
