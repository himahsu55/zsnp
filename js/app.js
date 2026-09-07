/**
 * Main Application Orchestrator — Scan Dock
 * Coordinates Scanner, Trimmer, Planogram Engine, and AI Service.
 */
(function(window) {
  'use strict';

  // Global State
  const state = {
    pdf: {
      file: null,
      blobUrl: null,
      name: 'Default Retail Cheatsheet (M6-M10 & MT2)',
      sizeFormatted: 'Preloaded Planogram'
    },
    results: [] // Array of { id, time, timestamp, format, savedCode, trimmedN, linkedPdf, locationInfo }
  };

  document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Engines
    const trimmer = new window.TrimmerManager();
    trimmer.init(0); // Default 0 trim (or user can step to 4)

    const scanner = new window.BarcodeScannerManager();
    scanner.init();

    const planogram = new window.PlanogramEngine();
    const ai = new window.AiService(planogram);

    window.App = { state, trimmer, scanner, planogram, ai };

    // 2. DOM Elements
    const el = {
      // Header Telemetry
      clock: document.getElementById('clock-display'),
      telemPdf: document.getElementById('telem-pdf-status'),
      dotPdf: document.getElementById('dot-pdf'),
      telemScanner: document.getElementById('telem-scanner-status'),
      dotScanner: document.getElementById('dot-scanner'),

      // Step nodes
      step1: document.getElementById('step-node-1'),
      step2: document.getElementById('step-node-2'),
      step3: document.getElementById('step-node-3'),
      step4: document.getElementById('step-node-4'),

      // PDF elements
      pdfDropzone: document.getElementById('pdf-dropzone'),
      pdfFileInput: document.getElementById('pdf-file-input'),
      pdfMetaBanner: document.getElementById('pdf-meta-banner'),
      pdfNameLabel: document.getElementById('pdf-name-label'),
      pdfSizeLabel: document.getElementById('pdf-size-label'),
      btnRemovePdf: document.getElementById('btn-remove-pdf'),
      btnReplacePdf: document.getElementById('btn-replace-pdf'),
      pdfPlaceholder: document.getElementById('pdf-placeholder'),
      pdfFrame: document.getElementById('pdf-frame'),
      pdfStateBadge: document.getElementById('pdf-state-badge'),

      // Location HUD Banner
      locationHud: document.getElementById('location-hud'),
      hudSectionName: document.getElementById('hud-section-name'),
      hudPosBadge: document.getElementById('hud-pos-badge'),
      hudCodeVal: document.getElementById('hud-code-val'),
      hudPriceVal: document.getElementById('hud-price-val'),
      hudColorVal: document.getElementById('hud-color-val'),
      hudSlotType: document.getElementById('hud-slot-type'),
      hudRemarksText: document.getElementById('hud-remarks-text'),
      hudVisualRackWrap: document.getElementById('hud-visual-rack-wrap'),
      btnCloseHud: document.getElementById('btn-close-hud'),

      // AI Drawer
      btnOpenAi: document.getElementById('btn-open-ai'),
      aiDrawer: document.getElementById('ai-drawer'),
      btnCloseAi: document.getElementById('btn-close-ai'),
      aiMessages: document.getElementById('ai-messages'),
      aiInput: document.getElementById('ai-input'),
      btnAiSend: document.getElementById('btn-ai-send'),
      btnAiSettings: document.getElementById('btn-ai-settings'),

      // API Key Modal
      apiKeyModal: document.getElementById('api-key-modal'),
      btnCloseApiKey: document.getElementById('btn-close-apikey'),
      apiKeyInput: document.getElementById('gemini-key-input'),
      btnSaveApiKey: document.getElementById('btn-save-apikey'),

      // Simulator Modal
      btnSimulate: document.getElementById('btn-simulate-modal'),
      simModal: document.getElementById('simulate-dialog'),
      btnCloseSim: document.getElementById('btn-close-sim'),
      btnCancelSim: document.getElementById('btn-cancel-sim'),
      btnSubmitSim: document.getElementById('btn-submit-sim'),
      manualInput: document.getElementById('manual-barcode-input'),
      manualFormat: document.getElementById('manual-format-select'),

      // Image file scanner
      imageUpload: document.getElementById('barcode-image-upload'),

      // Results Table
      resultsCount: document.getElementById('results-count-badge'),
      searchInput: document.getElementById('search-results-input'),
      tableBody: document.getElementById('scans-tbody'),
      tableEmpty: document.getElementById('table-empty-state'),
      btnExportCsv: document.getElementById('btn-export-csv'),
      btnExportJson: document.getElementById('btn-export-json'),
      btnClearLog: document.getElementById('btn-clear-log'),

      // Toasts
      toastContainer: document.getElementById('toast-container')
    };

    // 3. Digital Clock
    function updateClock() {
      if (el.clock) el.clock.textContent = new Date().toTimeString().split(' ')[0];
    }
    setInterval(updateClock, 1000);
    updateClock();

    // 4. Central Scan Processing Callback
    function handleScanEvent(rawCode, format = 'UNKNOWN') {
      const trimmedCode = trimmer.apply(rawCode);
      const now = new Date();

      // Look up in Planogram Cheatsheet
      const product = planogram.lookup(trimmedCode) || planogram.lookup(rawCode);

      let locationLabel = 'Not in Cheatsheet';
      if (product) {
        locationLabel = `${product.section} (Pos ${product.position})`;
        displayLocationHud(product);
        showToast(`📍 Found: ${product.section} • Pos #${product.position} (${product.color})`, 'success');
      } else {
        showToast(`Scanned: ${trimmedCode}`, 'info');
      }

      // Record entry
      const record = {
        id: 'scan_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        time: now.toLocaleTimeString(),
        timestamp: now.toISOString(),
        format: format.replace('1D_', '').replace('_', '-'),
        savedCode: trimmedCode || '[TRIMMED EMPTY]',
        rawCode: rawCode,
        trimmedN: trimmer.getTrim(),
        locationInfo: locationLabel,
        productMatch: product || null,
        linkedPdf: state.pdf.name
      };

      state.results.unshift(record);
      renderResultsTable();
      updateWorkflowSteps();
    }

    // Connect Scanner Callback
    scanner.onScan((code, format) => {
      handleScanEvent(code, format);
    });

    scanner.onStatusChange((isActive) => {
      if (el.telemScanner) {
        el.telemScanner.textContent = isActive ? 'LIVE SCANNING' : 'Standby';
      }
      if (el.dotScanner) {
        el.dotScanner.classList.toggle('active', isActive);
      }
      updateWorkflowSteps();
    });

    // 5. Display Location HUD Card
    function displayLocationHud(product) {
      if (!el.locationHud || !product) return;

      el.hudSectionName.textContent = product.section;
      el.hudPosBadge.textContent = `POSITION #${product.position}`;
      el.hudCodeVal.textContent = product.code;
      el.hudPriceVal.textContent = `₹${product.signage}`;
      el.hudColorVal.textContent = product.color;
      el.hudSlotType.textContent = product.slotType || 'Hanger / Shelf';

      if (product.remarks) {
        el.hudRemarksText.style.display = 'block';
        el.hudRemarksText.textContent = `Instruction: ${product.remarks}`;
      } else {
        el.hudRemarksText.style.display = 'none';
      }

      // Render Visual Rack
      el.hudVisualRackWrap.innerHTML = planogram.renderRackVisualizer(product);
      el.locationHud.classList.add('active');

      // Scroll smoothly into view if on mobile
      el.locationHud.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    if (el.btnCloseHud) {
      el.btnCloseHud.addEventListener('click', () => {
        el.locationHud.classList.remove('active');
      });
    }

    // 6. PDF Upload & PDF.js Parsing
    function loadPdf(file) {
      if (!file) return;
      if (state.pdf.blobUrl) URL.revokeObjectURL(state.pdf.blobUrl);

      state.pdf.file = file;
      state.pdf.name = file.name;
      state.pdf.sizeFormatted = formatBytes(file.size);
      state.pdf.blobUrl = URL.createObjectURL(file);

      if (el.pdfNameLabel) el.pdfNameLabel.textContent = file.name;
      if (el.pdfSizeLabel) el.pdfSizeLabel.textContent = `${state.pdf.sizeFormatted} • Uploaded ${new Date().toLocaleTimeString()}`;

      if (el.pdfDropzone) el.pdfDropzone.style.display = 'none';
      if (el.pdfMetaBanner) el.pdfMetaBanner.style.display = 'flex';
      if (el.pdfPlaceholder) el.pdfPlaceholder.style.display = 'none';
      if (el.pdfFrame) {
        el.pdfFrame.style.display = 'block';
        el.pdfFrame.src = state.pdf.blobUrl;
      }

      if (el.telemPdf) el.telemPdf.textContent = file.name;
      if (el.dotPdf) el.dotPdf.classList.add('active');
      if (el.pdfStateBadge) {
        el.pdfStateBadge.textContent = 'Linked & Parsed';
        el.pdfStateBadge.style.color = 'var(--ok)';
      }

      showToast(`Loading & Parsing: ${file.name}...`, 'info');

      // Client-side PDF.js parse
      planogram.parsePdfFile(file).then(res => {
        if (res.success) {
          showToast(`PDF Cheatsheet Indexed: ${res.count} products mapped`, 'success');
        } else {
          showToast(`PDF loaded. (Using active cheatsheet catalog)`, 'info');
        }
      });

      updateWorkflowSteps();
    }

    if (el.pdfFileInput) {
      el.pdfFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          loadPdf(e.target.files[0]);
        }
      });
    }

    if (el.pdfDropzone) {
      ['dragenter', 'dragover'].forEach(name => {
        el.pdfDropzone.addEventListener(name, (e) => {
          e.preventDefault();
          el.pdfDropzone.classList.add('dragover');
        });
      });
      ['dragleave', 'drop'].forEach(name => {
        el.pdfDropzone.addEventListener(name, (e) => {
          e.preventDefault();
          el.pdfDropzone.classList.remove('dragover');
        });
      });
      el.pdfDropzone.addEventListener('drop', (e) => {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          loadPdf(e.dataTransfer.files[0]);
        }
      });
    }

    if (el.btnRemovePdf) {
      el.btnRemovePdf.addEventListener('click', () => {
        if (state.pdf.blobUrl) URL.revokeObjectURL(state.pdf.blobUrl);
        state.pdf.file = null;
        state.pdf.name = 'Default Cheatsheet Catalog';
        state.pdf.blobUrl = null;

        if (el.pdfDropzone) el.pdfDropzone.style.display = 'block';
        if (el.pdfMetaBanner) el.pdfMetaBanner.style.display = 'none';
        if (el.pdfFrame) {
          el.pdfFrame.style.display = 'none';
          el.pdfFrame.src = '';
        }
        if (el.pdfPlaceholder) el.pdfPlaceholder.style.display = 'flex';
        if (el.telemPdf) el.telemPdf.textContent = 'Catalog Active';
        if (el.dotPdf) el.dotPdf.classList.remove('active');
        if (el.pdfStateBadge) {
          el.pdfStateBadge.textContent = 'Catalog Ready';
          el.pdfStateBadge.style.color = '';
        }
        updateWorkflowSteps();
        showToast('PDF unlinked', 'info');
      });
    }

    if (el.btnReplacePdf) {
      el.btnReplacePdf.addEventListener('click', () => el.pdfFileInput.click());
    }

    // 7. Image Barcode Decoder
    if (el.imageUpload) {
      el.imageUpload.addEventListener('change', async (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = async () => {
          showToast('Decoding image barcode...', 'info');
          if ('BarcodeDetector' in window) {
            try {
              const detector = new window.BarcodeDetector();
              const codes = await detector.detect(img);
              if (codes && codes.length > 0) {
                handleScanEvent(codes[0].rawValue, codes[0].format);
                URL.revokeObjectURL(img.src);
                return;
              }
            } catch (err) {}
          }
          if (window.ZXing) {
            try {
              const reader = new window.ZXing.BrowserMultiFormatReader();
              const res = await reader.decodeFromImageElement(img);
              if (res) {
                handleScanEvent(res.getText(), res.getBarcodeFormat().toString());
                URL.revokeObjectURL(img.src);
                return;
              }
            } catch (err) {}
          }
          showToast('No clear barcode detected in photo', 'error');
          URL.revokeObjectURL(img.src);
        };
        e.target.value = '';
      });
    }

    // 8. Simulator Modal
    if (el.btnSimulate) {
      el.btnSimulate.addEventListener('click', () => {
        if (el.simModal) el.simModal.classList.add('open');
      });
    }

    if (el.btnCloseSim) {
      el.btnCloseSim.addEventListener('click', () => el.simModal.classList.remove('open'));
    }
    if (el.btnCancelSim) {
      el.btnCancelSim.addEventListener('click', () => el.simModal.classList.remove('open'));
    }

    document.querySelectorAll('.preset-code-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.getAttribute('data-code');
        const format = btn.getAttribute('data-format') || 'PRESET';
        handleScanEvent(code, format);
        if (el.simModal) el.simModal.classList.remove('open');
      });
    });

    if (el.btnSubmitSim) {
      el.btnSubmitSim.addEventListener('click', () => {
        const code = el.manualInput.value.trim();
        const format = el.manualFormat.value;
        if (!code) {
          showToast('Please enter a barcode string', 'error');
          return;
        }
        handleScanEvent(code, format);
        if (el.simModal) el.simModal.classList.remove('open');
      });
    }

    // 9. AI Assistant Drawer
    if (el.btnOpenAi) {
      el.btnOpenAi.addEventListener('click', () => {
        if (el.aiDrawer) el.aiDrawer.classList.add('open');
      });
    }

    if (el.btnCloseAi) {
      el.btnCloseAi.addEventListener('click', () => {
        if (el.aiDrawer) el.aiDrawer.classList.remove('open');
      });
    }

    async function sendAiQuestion() {
      const q = el.aiInput.value.trim();
      if (!q) return;

      appendAiMessage(q, 'user');
      el.aiInput.value = '';

      const typingMsg = appendAiMessage('Thinking...', 'bot');

      try {
        const answer = await ai.ask(q);
        typingMsg.innerHTML = formatMarkdown(answer);
      } catch (err) {
        typingMsg.textContent = 'Error: ' + err.message;
      }
    }

    if (el.btnAiSend) el.btnAiSend.addEventListener('click', sendAiQuestion);
    if (el.aiInput) {
      el.aiInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendAiQuestion();
      });
    }

    function appendAiMessage(text, sender) {
      const msg = document.createElement('div');
      msg.className = `ai-msg ${sender}`;
      msg.textContent = text;
      el.aiMessages.appendChild(msg);
      el.aiMessages.scrollTop = el.aiMessages.scrollHeight;
      return msg;
    }

    // 10. API Key Modal
    if (el.btnAiSettings) {
      el.btnAiSettings.addEventListener('click', () => {
        if (el.apiKeyInput) el.apiKeyInput.value = ai.getApiKey();
        if (el.apiKeyModal) el.apiKeyModal.classList.add('open');
      });
    }

    if (el.btnCloseApiKey) {
      el.btnCloseApiKey.addEventListener('click', () => {
        if (el.apiKeyModal) el.apiKeyModal.classList.remove('open');
      });
    }

    if (el.btnSaveApiKey) {
      el.btnSaveApiKey.addEventListener('click', () => {
        const key = el.apiKeyInput.value.trim();
        ai.setApiKey(key);
        if (el.apiKeyModal) el.apiKeyModal.classList.remove('open');
        showToast(key ? 'Gemini API Key saved' : 'API Key removed (using local engine)', 'success');
      });
    }

    // 11. Results Table Rendering & Exports
    function renderResultsTable() {
      const filter = el.searchInput ? el.searchInput.value.trim().toLowerCase() : '';
      const filtered = state.results.filter(item => {
        if (!filter) return true;
        return item.savedCode.toLowerCase().includes(filter) ||
               item.format.toLowerCase().includes(filter) ||
               item.locationInfo.toLowerCase().includes(filter) ||
               item.time.toLowerCase().includes(filter);
      });

      const total = state.results.length;
      if (el.resultsCount) el.resultsCount.textContent = `${total} Scan${total === 1 ? '' : 's'}`;

      const hasData = total > 0;
      if (el.btnExportCsv) el.btnExportCsv.disabled = !hasData;
      if (el.btnExportJson) el.btnExportJson.disabled = !hasData;
      if (el.btnClearLog) el.btnClearLog.disabled = !hasData;

      if (filtered.length === 0) {
        if (el.tableBody) el.tableBody.innerHTML = '';
        if (el.tableEmpty) el.tableEmpty.style.display = 'flex';
        return;
      }

      if (el.tableEmpty) el.tableEmpty.style.display = 'none';

      if (el.tableBody) {
        el.tableBody.innerHTML = filtered.map((item, idx) => `
          <tr data-id="${item.id}">
            <td style="font-family: var(--font-mono); font-size: 11px; color: var(--muted);">${total - idx}</td>
            <td class="col-time">${item.time}</td>
            <td><span class="col-format">${item.format}</span></td>
            <td>
              <div class="col-code">
                <span>${escapeHtml(item.savedCode)}</span>
                <button type="button" class="btn-row-action copy-code-btn" data-code="${escapeHtml(item.savedCode)}" title="Copy code">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
              </div>
            </td>
            <td>
              <span class="col-location">${escapeHtml(item.locationInfo)}</span>
            </td>
            <td style="font-family: var(--font-mono); font-size: 11px; color: var(--laser);">-${item.trimmedN}d</td>
            <td class="col-actions">
              <button type="button" class="btn-row-action delete delete-row-btn" data-id="${item.id}" title="Delete entry">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </td>
          </tr>
        `).join('');

        // Copy button listeners
        el.tableBody.querySelectorAll('.copy-code-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const code = btn.getAttribute('data-code');
            navigator.clipboard.writeText(code).then(() => {
              showToast(`Copied: ${code}`, 'success');
            });
          });
        });

        // Delete button listeners
        el.tableBody.querySelectorAll('.delete-row-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            state.results = state.results.filter(r => r.id !== id);
            renderResultsTable();
            showToast('Scan entry removed', 'info');
          });
        });
      }
    }

    if (el.searchInput) {
      el.searchInput.addEventListener('input', renderResultsTable);
    }

    if (el.btnClearLog) {
      el.btnClearLog.addEventListener('click', () => {
        if (state.results.length === 0) return;
        if (confirm('Clear all scanned entries from this session?')) {
          state.results = [];
          renderResultsTable();
          showToast('Scanned results log cleared', 'info');
        }
      });
    }

    // CSV Export
    if (el.btnExportCsv) {
      el.btnExportCsv.addEventListener('click', () => {
        if (state.results.length === 0) return;
        const headers = ['Index', 'Timestamp', 'Barcode Format', 'Saved (Trimmed) Code', 'Planogram Rack Location', 'Trim Digits Excluded', 'Linked Cheatsheet'];
        const rows = state.results.map((r, i) => [
          state.results.length - i,
          `"${r.timestamp}"`,
          `"${r.format}"`,
          `"${r.savedCode.replace(/"/g, '""')}"`,
          `"${r.locationInfo.replace(/"/g, '""')}"`,
          r.trimmedN,
          `"${r.linkedPdf.replace(/"/g, '""')}"`
        ]);
        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');
        downloadFile(csvContent, `scan-dock-export-${Date.now()}.csv`, 'text/csv;charset=utf-8;');
        showToast('CSV export downloaded', 'success');
      });
    }

    // JSON Export
    if (el.btnExportJson) {
      el.btnExportJson.addEventListener('click', () => {
        if (state.results.length === 0) return;
        const payload = {
          terminal: 'Scan Dock Office Terminal',
          exportDate: new Date().toISOString(),
          totalScans: state.results.length,
          cheatsheet: state.pdf.name,
          scans: state.results
        };
        downloadFile(JSON.stringify(payload, null, 2), `scan-dock-export-${Date.now()}.json`, 'application/json');
        showToast('JSON export downloaded', 'success');
      });
    }

    // 12. Workflow Steps
    function updateWorkflowSteps() {
      const hasPdf = Boolean(state.pdf.file);
      const hasScans = state.results.length > 0;
      const isScanning = scanner.active;

      if (el.step1) el.step1.className = 'step-node ' + (hasPdf ? 'completed' : 'current');
      if (el.step2) el.step2.className = 'step-node ' + (hasPdf ? 'completed' : '');
      if (el.step3) {
        if (isScanning) el.step3.className = 'step-node current';
        else if (hasScans) el.step3.className = 'step-node completed';
        else el.step3.className = 'step-node';
      }
      if (el.step4) el.step4.className = 'step-node ' + (hasScans ? 'completed' : '');
    }

    // Initial render
    updateWorkflowSteps();
    renderResultsTable();

    // Welcome toast
    showToast('Scan Dock Terminal Ready • 6-Page Cheatsheet Loaded', 'success');
  });

  // Helpers
  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatMarkdown(text) {
    if (!text) return '';
    return escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        ${type === 'success' ? '<polyline points="20 6 9 17 4 12"></polyline>' : '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'}
      </svg>
      <span>${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'all 0.2s';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

})(window);
