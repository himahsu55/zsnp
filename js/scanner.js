/**
 * Ultra-Fast Multi-Engine Barcode Scanner Module
 * 1. Hardware-accelerated Native BarcodeDetector (Sub-15ms RFID-like speed)
 * 2. ZXing-JS MultiFormatReader fallback (Precision retail 1D/2D decoding)
 * 3. Physical USB/Bluetooth Handheld Barcode Scanner Gun Listener (Keyboard HID burst)
 * 4. Camera Torch/Flashlight & High-FPS Camera Stream
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
      this.animFrameId = null;

      this.hasNativeDetector = ('BarcodeDetector' in window);
      this.nativeDetector = null;
      this.zxingReader = null;

      this.soundEnabled = true;
      this.torchEnabled = false;
      this.lastScannedRaw = '';
      this.lastScannedTime = 0;
      this.debounceMs = 1200; // Fast 1.2s duplicate debounce

      this.onScanCallbacks = [];
      this.onStatusChangeCallbacks = [];

      // Physical USB / Bluetooth scanner gun keystroke buffer
      this.hidBuffer = '';
      this.hidLastKeyTime = 0;
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
        btnSound: document.getElementById('btn-toggle-sound'),
        soundLabel: document.getElementById('sound-state-label'),
        activeDot: document.getElementById('scanner-active-dot')
      };

      // Initialize Native BarcodeDetector if available
      if (this.hasNativeDetector) {
        try {
          const supportedFormats = await window.BarcodeDetector.getSupportedFormats();
          const targetFormats = ['code_128', 'ean_13', 'ean_8', 'code_39', 'upc_a', 'upc_e', 'qr_code']
            .filter(f => supportedFormats.includes(f));

          this.nativeDetector = new window.BarcodeDetector({
            formats: targetFormats.length > 0 ? targetFormats : supportedFormats
          });
          if (this.dom.hudEngine) {
            this.dom.hudEngine.textContent = 'HARDWARE BarcodeDetector (60 FPS)';
          }
        } catch (e) {
          console.warn('Native BarcodeDetector init failed, will use ZXing/Quagga fallback:', e);
          this.hasNativeDetector = false;
        }
      }

      // Initialize ZXing fallback if library is present
      if (!this.hasNativeDetector && window.ZXing) {
        try {
          this.zxingReader = new window.ZXing.BrowserMultiFormatReader();
          if (this.dom.hudEngine) {
            this.dom.hudEngine.textContent = 'ZXING RETAIL 1D/2D PRECISION';
          }
        } catch (e) {
          console.warn('ZXing init error:', e);
        }
      }

      this.setupDOMEvents();
      this.setupHandheldGunListener();
      this.enumerateCameras();
    }

    setupDOMEvents() {
      if (this.dom.btnToggle) {
        this.dom.btnToggle.addEventListener('click', () => {
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

      if (this.dom.btnSound) {
        this.dom.btnSound.addEventListener('click', () => {
          this.soundEnabled = !this.soundEnabled;
          if (this.dom.soundLabel) {
            this.dom.soundLabel.textContent = this.soundEnabled ? 'Beep ON' : 'Beep Muted';
          }
        });
      }
    }

    /**
     * Physical USB / Bluetooth Handheld Barcode Scanner Gun Listener
     * Captures rapid keystrokes (< 40ms inter-character time) terminating with Enter
     */
    setupHandheldGunListener() {
      window.addEventListener('keydown', (e) => {
        // Ignore if user is intentionally typing in an input or textarea
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        const isInput = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';
        
        // If user is focused on general inputs, allow handheld gun if the typing is abnormally fast (< 35ms)
        const now = Date.now();
        const diff = now - this.hidLastKeyTime;
        this.hidLastKeyTime = now;

        if (e.key === 'Enter') {
          if (this.hidBuffer.length >= 3) {
            const scannedCode = this.hidBuffer.trim();
            this.hidBuffer = '';
            // If it was typed into an input, prevent submitting form
            if (isInput) e.preventDefault();
            this.handleDetected(scannedCode, 'HANDHELD_LASER_GUN');
          }
          this.hidBuffer = '';
          return;
        }

        // Only record printable characters
        if (e.key.length === 1) {
          if (diff > 90) {
            // New entry started
            this.hidBuffer = e.key;
          } else {
            // Rapid keystroke burst from scanner gun
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

          // Prefer back/rear environment camera
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

      const deviceId = this.dom.camSelect ? this.dom.camSelect.value : null;
      const constraints = {
        audio: false,
        video: {
          width: { min: 640, ideal: 1920 },
          height: { min: 480, ideal: 1080 },
          frameRate: { ideal: 60, min: 24 }
        }
      };

      if (deviceId && deviceId !== 'environment' && deviceId !== 'user') {
        constraints.video.deviceId = { exact: deviceId };
      } else {
        constraints.video.facingMode = { ideal: 'environment' };
      }

      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.videoTrack = this.stream.getVideoTracks()[0];

        // Prepare video DOM
        if (!this.videoEl) {
          this.videoEl = document.createElement('video');
          this.videoEl.setAttribute('playsinline', 'true');
          this.videoEl.setAttribute('autoplay', 'true');
          this.videoEl.muted = true;
          this.videoEl.style.width = '100%';
          this.videoEl.style.height = '100%';
          this.videoEl.style.objectFit = 'cover';
        }

        this.dom.viewport.innerHTML = '';
        this.dom.viewport.appendChild(this.videoEl);
        this.videoEl.srcObject = this.stream;
        await this.videoEl.play();

        // Canvas for frame processing
        if (!this.canvasEl) {
          this.canvasEl = document.createElement('canvas');
          this.ctx = this.canvasEl.getContext('2d', { willReadFrequently: true });
        }

        this.active = true;
        this.updateStatusUI(true);

        // Check torch capability
        this.checkTorchCapability();

        // Start High-FPS Scan Loop
        this.scanLoop();

        // Update camera list with granted labels
        this.enumerateCameras();

      } catch (err) {
        console.error('Camera start failed:', err);
        let msg = 'Could not access camera.';
        if (err.name === 'NotAllowedError') msg = 'Camera permission denied. Please allow camera permissions.';
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

    stop() {
      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
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

      this.active = false;
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
     * Continuous Ultra-Fast Detection Loop
     */
    async scanLoop() {
      if (!this.active || !this.videoEl) return;

      if (this.videoEl.readyState >= 2) {
        // Priority 1: Native BarcodeDetector (Super Fast, Hardware Accelerated)
        if (this.hasNativeDetector && this.nativeDetector) {
          try {
            const barcodes = await this.nativeDetector.detect(this.videoEl);
            if (barcodes && barcodes.length > 0) {
              const best = barcodes[0];
              this.handleDetected(best.rawValue, best.format || '1D_BARCODE');
            }
          } catch (err) {
            // Continue next frame
          }
        }
        // Priority 2: ZXing fallback via video stream
        else if (window.ZXing && this.zxingReader) {
          try {
            // ZXing decode from canvas
            this.canvasEl.width = this.videoEl.videoWidth;
            this.canvasEl.height = this.videoEl.videoHeight;
            this.ctx.drawImage(this.videoEl, 0, 0, this.canvasEl.width, this.canvasEl.height);
            
            const lumSource = new window.ZXing.HTMLCanvasElementLuminanceSource(this.canvasEl);
            const binaryBitmap = new window.ZXing.BinaryBitmap(new window.ZXing.HybridBinarizer(lumSource));
            const result = this.zxingReader.decode(binaryBitmap);
            if (result && result.getText()) {
              this.handleDetected(result.getText(), result.getBarcodeFormat() ? result.getBarcodeFormat().toString() : 'ZXING');
            }
          } catch (e) {
            // Normal scan miss, keep looping
          }
        }
        // Priority 3: Quagga decode if present
        else if (window.Quagga) {
          // Handled via Quagga onDetected if configured
        }
      }

      if (this.active) {
        this.animFrameId = requestAnimationFrame(() => this.scanLoop());
      }
    }

    /**
     * Centralized scan match handler
     */
    handleDetected(rawCode, format = 'UNKNOWN') {
      if (!rawCode) return;
      const code = String(rawCode).trim();
      const now = Date.now();

      // Debounce duplicate scans
      if (code === this.lastScannedRaw && (now - this.lastScannedTime) < this.debounceMs) {
        return;
      }

      this.lastScannedRaw = code;
      this.lastScannedTime = now;

      // Visual flash
      if (this.dom.scanFlash) {
        this.dom.scanFlash.classList.add('flash');
        setTimeout(() => this.dom.scanFlash.classList.remove('flash'), 180);
      }

      // Audio Beep & Haptic
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

    playBeep() {
      if (!this.soundEnabled) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(1046.50, ctx.currentTime); // C6 tone
        osc.frequency.exponentialRampToValueAtTime(2093.00, ctx.currentTime + 0.07); // C7 laser chirp

        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.11);
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
