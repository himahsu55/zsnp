/**
 * Ultra-Fast Multi-Engine Barcode Scanner Module
 * 1. Hardware-accelerated Native BarcodeDetector (Sub-10ms RFID-like speed at 60 FPS)
 * 2. Optimized Direct-to-ROI Turbo ZXing 1D/2D Retail Decoder (Single-pass sampling, Sub-15ms)
 * 3. Continuous Autofocus & High-FPS Camera Stream (720p 60FPS) with 2x Macro Zoom
 * 4. Zero-Latency Audio Feedback (Reused AudioContext singleton)
 * 5. Instant Handheld USB/Bluetooth Barcode Scanner Gun Listener
 * 6. Direct Photo / Image File Barcode Decoder
 */
(function(window) {
  'use strict';

  class BarcodeScannerManager {
    constructor() {
      this.active = false;
      this.stream = null;
      this.videoTrack = null;
      this.videoEl = null;
      this.canvasEl = null;
      this.ctx = null;
      this.roiCanvasEl = null;
      this.roiCtx = null;
      this.animFrameId = null;
      this.videoFrameCallbackId = null;
      this.isProcessingFrame = false;

      this.hasNativeDetector = ('BarcodeDetector' in window);
      this.nativeDetector = null;
      this.fastZxingReader = null;
      this.robustZxingReader = null;
      this.zxingReader = null; // backward compatibility alias

      this.soundEnabled = true;
      this.audioCtx = null;
      this.torchEnabled = false;

      // Optical/Digital Zoom capability
      this.currentZoom = 1;
      this.zoomMin = 1;
      this.zoomMax = 1;

      this.lastScannedRaw = '';
      this.lastScannedTime = 0;
      this.debounceMs = 400; // 400ms rapid retail scanning debounce

      this.frameCount = 0;
      this.lastDecodeTime = 0;

      this.onScanCallbacks = [];
      this.onStatusChangeCallbacks = [];

      // Physical USB / Bluetooth scanner gun keystroke buffer
      this.hidBuffer = '';
      this.hidLastKeyTime = 0;

      this.dom = {};
    }

    async init() {
      this.dom = {
        viewport: document.getElementById('scanner-viewport'),
        laserLine: document.getElementById('laser-line'),
        scanFlash: document.getElementById('scan-flash'),
        btnToggle: document.getElementById('btn-toggle-scanner'),
        btnLabel: document.getElementById('scanner-btn-label'),
        camSelect: document.getElementById('camera-device-select'),
        hudCam: document.getElementById('hud-cam-status'),
        hudEngine: document.getElementById('hud-target-format'),
        btnTorch: document.getElementById('btn-toggle-torch'),
        btnZoom: document.getElementById('btn-toggle-zoom'),
        btnSound: document.getElementById('btn-toggle-sound'),
        soundLabel: document.getElementById('sound-state-label'),
        activeDot: document.getElementById('scanner-active-dot')
      };

      // 1. Initialize Native BarcodeDetector if available (Sub-10ms hardware GPU/NPU)
      if (this.hasNativeDetector) {
        try {
          const supportedFormats = await window.BarcodeDetector.getSupportedFormats();
          const targetFormats = ['code_128', 'ean_13', 'ean_8', 'code_39', 'upc_a', 'upc_e', 'itf', 'qr_code']
            .filter(f => supportedFormats.includes(f));

          if (targetFormats.length > 0) {
            this.nativeDetector = new window.BarcodeDetector({ formats: targetFormats });
            console.log('Native BarcodeDetector active with formats:', targetFormats);
          } else {
            this.nativeDetector = new window.BarcodeDetector();
          }
        } catch (e) {
          console.warn('Native BarcodeDetector init failed:', e);
          this.nativeDetector = null;
        }
      }

      // 2. Initialize Dual-Tier ZXing Readers (Fast Real-Time + Robust Fallback)
      if (window.ZXing) {
        try {
          const formats = [
            window.ZXing.BarcodeFormat.CODE_128,
            window.ZXing.BarcodeFormat.EAN_13,
            window.ZXing.BarcodeFormat.EAN_8,
            window.ZXing.BarcodeFormat.CODE_39,
            window.ZXing.BarcodeFormat.UPC_A,
            window.ZXing.BarcodeFormat.UPC_E,
            window.ZXing.BarcodeFormat.ITF,
            window.ZXing.BarcodeFormat.QR_CODE
          ];

          // 2A. Fast Reader: TRY_HARDER: false for instant sub-15ms video stream processing
          const fastHints = new Map();
          fastHints.set(window.ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
          fastHints.set(window.ZXing.DecodeHintType.TRY_HARDER, false);
          this.fastZxingReader = new window.ZXing.BrowserMultiFormatReader(fastHints, 10);

          // 2B. Robust Reader: TRY_HARDER: true for complex image uploads & deep passes
          const robustHints = new Map();
          robustHints.set(window.ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
          robustHints.set(window.ZXing.DecodeHintType.TRY_HARDER, true);
          this.robustZxingReader = new window.ZXing.BrowserMultiFormatReader(robustHints, 40);

          this.zxingReader = this.fastZxingReader;
          console.log('ZXing Turbo & Robust MultiFormatReaders initialized');
        } catch (e) {
          console.warn('ZXing init error:', e);
        }
      }

      // 3. Update HUD Engine Label
      if (this.dom.hudEngine) {
        if (this.nativeDetector && this.fastZxingReader) {
          this.dom.hudEngine.textContent = 'DUAL HYBRID 60 FPS (SUB-10MS)';
        } else if (this.nativeDetector) {
          this.dom.hudEngine.textContent = 'HARDWARE BarcodeDetector (SUB-10MS)';
        } else if (this.fastZxingReader) {
          this.dom.hudEngine.textContent = 'ZXING TURBO 1D/2D (FAST)';
        }
      }

      this.setupDOMEvents();
      this.setupHandheldGunListener();
      this.enumerateCameras();
    }

    ensureAudioContext() {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!this.audioCtx) {
          this.audioCtx = new AudioCtx();
        }
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume();
        }
      } catch (e) {}
    }

    setupDOMEvents() {
      if (this.dom.btnToggle) {
        this.dom.btnToggle.addEventListener('click', () => {
          this.ensureAudioContext();
          if (this.active) {
            this.stop();
          } else {
            this.start();
          }
        });
      }

      if (this.dom.camSelect) {
        this.dom.camSelect.addEventListener('change', () => {
          if (this.active) {
            this.stop();
            this.start();
          }
        });
      }

      if (this.dom.btnTorch) {
        this.dom.btnTorch.addEventListener('click', () => this.toggleTorch());
      }

      if (this.dom.btnZoom) {
        this.dom.btnZoom.addEventListener('click', () => this.toggleZoom());
      }

      if (this.dom.btnSound) {
        this.dom.btnSound.addEventListener('click', () => {
          this.soundEnabled = !this.soundEnabled;
          if (this.soundEnabled) this.ensureAudioContext();
          if (this.dom.soundLabel) {
            this.dom.soundLabel.textContent = this.soundEnabled ? 'Beep ON' : 'Beep Muted';
          }
          if (this.dom.btnSound) {
            this.dom.btnSound.classList.toggle('active', this.soundEnabled);
          }
        });
      }
    }

    /**
     * Physical USB / Bluetooth Handheld Barcode Scanner Gun Listener
     */
    setupHandheldGunListener() {
      window.addEventListener('keydown', (e) => {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        const isInput = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';
        
        const now = Date.now();
        const diff = now - this.hidLastKeyTime;
        this.hidLastKeyTime = now;

        if (e.key === 'Enter') {
          if (this.hidBuffer.length >= 3) {
            const scannedCode = this.hidBuffer.trim();
            this.hidBuffer = '';
            if (isInput) e.preventDefault();
            this.handleDetected(scannedCode, 'HANDHELD_LASER_GUN');
          }
          this.hidBuffer = '';
          return;
        }

        if (e.key.length === 1) {
          if (diff > 90) {
            this.hidBuffer = e.key;
          } else {
            this.hidBuffer += e.key;
          }
        }
      }, true);
    }

    async enumerateCameras() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        if (videoInputs.length > 0 && this.dom.camSelect) {
          this.dom.camSelect.innerHTML = '';

          videoInputs.forEach((dev, idx) => {
            const opt = document.createElement('option');
            opt.value = dev.deviceId;
            opt.textContent = dev.label || `Camera ${idx + 1}`;
            const labelLower = (dev.label || '').toLowerCase();
            if (labelLower.includes('back') || labelLower.includes('rear') || labelLower.includes('environment')) {
              opt.selected = true;
            }
            this.dom.camSelect.appendChild(opt);
          });
        }
      } catch (err) {
        console.warn('Camera enumeration error:', err);
      }
    }

    async start() {
      if (this.active) return;
      this.ensureAudioContext();

      const deviceId = this.dom.camSelect ? this.dom.camSelect.value : null;
      
      // Fast, battery-friendly, low-latency 720p 60FPS camera stream constraints
      const constraints = {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          frameRate: { ideal: 60, min: 30 }
        }
      };

      if (deviceId && deviceId !== 'environment' && deviceId !== 'user') {
        constraints.video.deviceId = { exact: deviceId };
      }

      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.videoTrack = this.stream.getVideoTracks()[0];

        // Apply continuous autofocus & auto-exposure for sharp retail barcode stripes
        if (this.videoTrack && this.videoTrack.applyConstraints && this.videoTrack.getCapabilities) {
          try {
            const caps = this.videoTrack.getCapabilities();
            const advanced = [];
            if (caps.focusMode && caps.focusMode.includes('continuous')) {
              advanced.push({ focusMode: 'continuous' });
            }
            if (caps.exposureMode && caps.exposureMode.includes('continuous')) {
              advanced.push({ exposureMode: 'continuous' });
            }
            if (caps.whiteBalanceMode && caps.whiteBalanceMode.includes('continuous')) {
              advanced.push({ whiteBalanceMode: 'continuous' });
            }
            if (advanced.length > 0) {
              await this.videoTrack.applyConstraints({ advanced });
            }
          } catch (e) {
            console.warn('Advanced camera constraints not applied:', e);
          }
        }

        // Prepare video element
        if (!this.videoEl) {
          this.videoEl = document.createElement('video');
          this.videoEl.setAttribute('playsinline', 'true');
          this.videoEl.setAttribute('autoplay', 'true');
          this.videoEl.muted = true;
          this.videoEl.style.width = '100%';
          this.videoEl.style.height = '100%';
          this.videoEl.style.objectFit = 'cover';
        }

        if (this.dom.viewport) {
          this.dom.viewport.innerHTML = '';
          this.dom.viewport.appendChild(this.videoEl);
        }
        this.videoEl.srcObject = this.stream;
        await this.videoEl.play();

        // Optimized Offscreen Processing Canvas
        if (!this.canvasEl) {
          this.canvasEl = document.createElement('canvas');
          this.ctx = this.canvasEl.getContext('2d', { willReadFrequently: true });
        }

        // Single-Pass Region-of-Interest (Center Reticle) Canvas
        if (!this.roiCanvasEl) {
          this.roiCanvasEl = document.createElement('canvas');
          this.roiCtx = this.roiCanvasEl.getContext('2d', { willReadFrequently: true });
        }

        this.active = true;
        this.isProcessingFrame = false;
        this.updateStatusUI(true);

        // Check hardware capabilities
        this.checkTorchCapability();
        this.checkZoomCapability();

        // Start High-FPS Scan Loop
        this.scanLoop();

        // Update camera list with granted labels
        this.enumerateCameras();

      } catch (err) {
        console.error('Camera start failed:', err);
        let msg = 'Could not access camera.';
        if (err.name === 'NotAllowedError') msg = 'Camera permission denied. Please allow camera permissions in your browser.';
        if (err.name === 'NotFoundError') msg = 'No camera found on this device.';
        alert(msg);
        this.stop();
      }
    }

    checkTorchCapability() {
      if (!this.videoTrack || !this.videoTrack.getCapabilities) return;
      const caps = this.videoTrack.getCapabilities();
      if (caps.torch && this.dom.btnTorch) {
        this.dom.btnTorch.style.display = 'inline-flex';
      }
    }

    async toggleTorch() {
      if (!this.videoTrack || !this.videoTrack.applyConstraints) return;
      try {
        this.torchEnabled = !this.torchEnabled;
        await this.videoTrack.applyConstraints({
          advanced: [{ torch: this.torchEnabled }]
        });
        if (this.dom.btnTorch) {
          this.dom.btnTorch.classList.toggle('active', this.torchEnabled);
        }
      } catch (e) {
        console.warn('Torch toggle failed:', e);
      }
    }

    checkZoomCapability() {
      if (!this.videoTrack || !this.videoTrack.getCapabilities) return;
      try {
        const caps = this.videoTrack.getCapabilities();
        if (caps.zoom && this.dom.btnZoom) {
          this.dom.btnZoom.style.display = 'inline-flex';
          this.zoomMin = caps.zoom.min || 1;
          this.zoomMax = caps.zoom.max || 1;
          this.currentZoom = this.zoomMin;
          this.dom.btnZoom.textContent = '1X';
          this.dom.btnZoom.classList.remove('active');
        } else if (this.dom.btnZoom) {
          this.dom.btnZoom.style.display = 'none';
        }
      } catch (e) {
        console.warn('Zoom check error:', e);
      }
    }

    async toggleZoom() {
      if (!this.videoTrack || !this.videoTrack.applyConstraints) return;
      try {
        const caps = this.videoTrack.getCapabilities ? this.videoTrack.getCapabilities() : {};
        if (!caps.zoom) return;

        const minZ = caps.zoom.min || 1;
        const maxZ = caps.zoom.max || 3;
        const isZoomed = (this.currentZoom > minZ + 0.1);
        const targetZoom = isZoomed ? minZ : Math.min(minZ * 2, maxZ);

        await this.videoTrack.applyConstraints({
          advanced: [{ zoom: targetZoom }]
        });
        this.currentZoom = targetZoom;
        if (this.dom.btnZoom) {
          this.dom.btnZoom.textContent = isZoomed ? '1X' : '2X';
          this.dom.btnZoom.classList.toggle('active', !isZoomed);
        }
      } catch (e) {
        console.warn('Zoom toggle failed:', e);
      }
    }

    stop() {
      this.active = false;
      this.isProcessingFrame = false;

      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }

      if (this.videoFrameCallbackId !== null && this.videoEl && 'cancelVideoFrameCallback' in this.videoEl) {
        try {
          this.videoEl.cancelVideoFrameCallback(this.videoFrameCallbackId);
        } catch (e) {}
        this.videoFrameCallbackId = null;
      }

      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
        this.videoTrack = null;
      }

      if (this.videoEl) {
        this.videoEl.pause();
        this.videoEl.srcObject = null;
      }

      if (this.dom.viewport) {
        this.dom.viewport.innerHTML = '';
      }

      if (this.dom.btnZoom) {
        this.dom.btnZoom.style.display = 'none';
        this.dom.btnZoom.classList.remove('active');
        this.dom.btnZoom.textContent = '1X';
        this.currentZoom = 1;
      }

      this.updateStatusUI(false);
    }

    updateStatusUI(isActive) {
      if (this.dom.btnToggle) {
        this.dom.btnToggle.classList.toggle('active', isActive);
      }
      if (this.dom.btnLabel) {
        this.dom.btnLabel.textContent = isActive ? 'STOP CAMERA SCANNER' : 'START CAMERA SCANNER';
      }
      if (this.dom.laserLine) {
        this.dom.laserLine.classList.toggle('scanning', isActive);
      }
      if (this.dom.hudCam) {
        this.dom.hudCam.textContent = isActive ? 'CAM: LIVE ACTIVE (60 FPS)' : 'CAM: OFF';
        this.dom.hudCam.classList.toggle('live-active', isActive);
      }
      if (this.dom.activeDot) {
        this.dom.activeDot.classList.toggle('active', isActive);
      }

      this.onStatusChangeCallbacks.forEach(cb => cb(isActive));
    }

    /**
     * Continuous Ultra-Fast Multi-Engine Detection Loop
     * - Native BarcodeDetector runs at full 60 FPS (0ms throttle) with zero canvas overhead
     * - Fast ZXing reader samples the reticle ROI directly (480x200) without intermediate canvas copies
     * - Occasional full-frame pass for difficult barcodes
     * - Uses requestVideoFrameCallback when available for hardware frame sync
     */
    async scanLoop() {
      if (!this.active || !this.videoEl) return;

      const scheduleNext = () => {
        if (!this.active || !this.videoEl) return;
        if ('requestVideoFrameCallback' in this.videoEl) {
          this.videoFrameCallbackId = this.videoEl.requestVideoFrameCallback(() => this.scanLoop());
        } else {
          this.animFrameId = requestAnimationFrame(() => this.scanLoop());
        }
      };

      const now = performance.now();
      // Zero throttle for native hardware detector; min 20ms for ZXing CPU binarizer
      const minInterval = this.nativeDetector ? 0 : 20;
      if (minInterval > 0 && (now - this.lastDecodeTime < minInterval)) {
        scheduleNext();
        return;
      }

      if (this.videoEl.readyState >= 2 && this.videoEl.videoWidth > 0 && !this.isProcessingFrame) {
        this.isProcessingFrame = true;
        this.lastDecodeTime = now;
        this.frameCount = (this.frameCount || 0) + 1;

        try {
          let detectedCode = null;
          let detectedFormat = null;

          // -------------------------------------------------------------
          // PASS 1: Hardware-Accelerated Native BarcodeDetector (Sub-10ms)
          // -------------------------------------------------------------
          if (this.nativeDetector) {
            try {
              const barcodes = await this.nativeDetector.detect(this.videoEl);
              if (barcodes && barcodes.length > 0) {
                const best = barcodes[0];
                detectedCode = best.rawValue;
                detectedFormat = best.format || '1D_BARCODE';
              }
            } catch (err) {
              // Fallback to ZXing
            }
          }

          // -------------------------------------------------------------
          // PASS 2: Ultra-Fast Direct Single-Pass ROI ZXing Decoder
          // -------------------------------------------------------------
          if (!detectedCode && (this.fastZxingReader || this.zxingReader) && window.ZXing) {
            const vw = this.videoEl.videoWidth;
            const vh = this.videoEl.videoHeight;

            // Direct 1-step sample of the center reticle into a compact 480x200 canvas
            // Avoids double-drawing video -> full canvas -> ROI canvas!
            const roiW = 480;
            const roiH = 200;

            if (this.roiCanvasEl.width !== roiW || this.roiCanvasEl.height !== roiH) {
              this.roiCanvasEl.width = roiW;
              this.roiCanvasEl.height = roiH;
            }

            // Reticle ROI: central 85% width, central 45% height
            const cropW = Math.round(vw * 0.85);
            const cropH = Math.round(vh * 0.45);
            const cropX = Math.round((vw - cropW) / 2);
            const cropY = Math.round((vh - cropH) / 2);

            this.roiCtx.drawImage(this.videoEl, cropX, cropY, cropW, cropH, 0, 0, roiW, roiH);

            try {
              const roiLum = new window.ZXing.HTMLCanvasElementLuminanceSource(this.roiCanvasEl);
              const roiBitmap = new window.ZXing.BinaryBitmap(new window.ZXing.HybridBinarizer(roiLum));
              const reader = this.fastZxingReader || this.zxingReader;
              const roiResult = reader.decodeBitmap(roiBitmap);

              if (roiResult && roiResult.getText()) {
                detectedCode = roiResult.getText();
                detectedFormat = roiResult.getBarcodeFormat() ? roiResult.getBarcodeFormat().toString() : 'CODE_128';
              }
            } catch (e) {
              // Normal miss in ROI
            }

            // -------------------------------------------------------------
            // PASS 3: Periodic Full-Frame Pass (Every 4th frame)
            // -------------------------------------------------------------
            if (!detectedCode && (this.frameCount % 4 === 0)) {
              try {
                const targetW = 640;
                const targetH = Math.round(vh * (targetW / vw));

                if (this.canvasEl.width !== targetW || this.canvasEl.height !== targetH) {
                  this.canvasEl.width = targetW;
                  this.canvasEl.height = targetH;
                }

                this.ctx.drawImage(this.videoEl, 0, 0, targetW, targetH);

                const lumSource = new window.ZXing.HTMLCanvasElementLuminanceSource(this.canvasEl);
                const binaryBitmap = new window.ZXing.BinaryBitmap(new window.ZXing.HybridBinarizer(lumSource));
                const fullReader = this.robustZxingReader || this.zxingReader;
                const result = fullReader.decodeBitmap(binaryBitmap);

                if (result && result.getText()) {
                  detectedCode = result.getText();
                  detectedFormat = result.getBarcodeFormat() ? result.getBarcodeFormat().toString() : 'CODE_128';
                }
              } catch (e) {
                // Normal miss
              }
            }
          }

          if (detectedCode) {
            this.handleDetected(detectedCode, detectedFormat || '1D_BARCODE');
          }
        } finally {
          this.isProcessingFrame = false;
        }
      }

      scheduleNext();
    }

    /**
     * Decode a Barcode Directly from an Uploaded Image or Photo File
     */
    async decodeImageFile(file) {
      if (!file) return false;

      try {
        const img = new Image();
        const url = URL.createObjectURL(file);

        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = url;
        });

        let scannedCode = null;
        let scannedFormat = 'IMAGE_UPLOAD';

        // 1. Hardware Native BarcodeDetector
        if (this.nativeDetector) {
          try {
            const barcodes = await this.nativeDetector.detect(img);
            if (barcodes && barcodes.length > 0) {
              scannedCode = barcodes[0].rawValue;
              scannedFormat = barcodes[0].format || '1D_BARCODE';
            }
          } catch (e) {}
        }

        // 2. ZXing Robust Decoder on Image Canvas (TRY_HARDER: true)
        if (!scannedCode && (this.robustZxingReader || this.zxingReader) && window.ZXing) {
          try {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth || img.width;
            c.height = img.naturalHeight || img.height;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const lum = new window.ZXing.HTMLCanvasElementLuminanceSource(c);
            const bitmap = new window.ZXing.BinaryBitmap(new window.ZXing.HybridBinarizer(lum));
            const reader = this.robustZxingReader || this.zxingReader;
            const res = reader.decodeBitmap(bitmap);

            if (res && res.getText()) {
              scannedCode = res.getText();
              scannedFormat = res.getBarcodeFormat() ? res.getBarcodeFormat().toString() : 'CODE_128';
            }
          } catch (e) {}
        }

        URL.revokeObjectURL(url);

        if (scannedCode) {
          this.handleDetected(scannedCode, scannedFormat);
          return true;
        } else {
          alert('Could not detect a clear barcode in this photo. Please hold closer with good lighting.');
          return false;
        }
      } catch (err) {
        console.error('decodeImageFile error:', err);
        alert('Could not process the selected image.');
        return false;
      }
    }

    /**
     * Centralized scan match handler
     */
    handleDetected(rawCode, format = 'UNKNOWN') {
      if (!rawCode) return;
      const code = String(rawCode).trim();
      const now = Date.now();

      // Debounce duplicate scans within 400ms for rapid scanning
      if (code === this.lastScannedRaw && (now - this.lastScannedTime) < this.debounceMs) {
        return;
      }

      this.lastScannedRaw = code;
      this.lastScannedTime = now;

      // Visual laser flash
      if (this.dom.scanFlash) {
        this.dom.scanFlash.classList.add('flash');
        setTimeout(() => this.dom.scanFlash.classList.remove('flash'), 180);
      }

      // Zero-latency audio chirp & haptic feedback
      this.playBeep();
      this.vibrate();

      // Notify subscribers
      this.onScanCallbacks.forEach(cb => cb(code, format));
    }

    onScan(callback) {
      if (typeof callback === 'function') {
        this.onScanCallbacks.push(callback);
      }
    }

    onStatusChange(callback) {
      if (typeof callback === 'function') {
        this.onStatusChangeCallbacks.push(callback);
      }
    }

    /**
     * Zero-latency laser chirp using singleton AudioContext
     */
    playBeep() {
      if (!this.soundEnabled) return;
      try {
        this.ensureAudioContext();
        if (!this.audioCtx) return;

        const ctx = this.audioCtx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(1046.50, now); // C6 tone
        osc.frequency.exponentialRampToValueAtTime(2093.00, now + 0.055); // C7 laser chirp

        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.08);
      } catch (e) {}
    }

    vibrate() {
      if (navigator.vibrate) {
        try {
          navigator.vibrate(80);
        } catch (e) {}
      }
    }
  }

  window.BarcodeScannerManager = BarcodeScannerManager;
})(window);
