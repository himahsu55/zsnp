/**
 * Main Mobile App Controller — Scan Dock v2.0
 * Handles Mobile Tab Navigation, Quick Scanner View, Visual Rack Section Switcher,
 * Instant Result Bottom Sheet, and CSV/JSON Exports.
 */
(function(window) {
  'use strict';

  const state = {
    pdf: {
      file: null,
      blobUrl: null,
      name: 'Default Cheatsheet (M6-M10 & MT2)',
      sizeFormatted: 'Preloaded Catalog'
    },
    activeSection: 'M6 DENIM',
    activeTab: 'tab-scanner',
    results: []
  };

  document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Core Engines
    const trimmer = new window.TrimmerManager();
    trimmer.init(0); // Default 0 trim

    const scanner = new window.BarcodeScannerManager();
    scanner.init();

    const planogram = new window.PlanogramEngine();
    const ai = new window.AiService(planogram);

    window.App = { state, trimmer, scanner, planogram, ai };

    // 2. DOM Elements
    const el = {
      // Header status
      catalogLabel: document.getElementById('header-catalog-label'),
      scannerLabel: document.getElementById('header-scanner-label'),
      scannerDot: document.getElementById('header-scanner-dot'),
      trimLabel: document.getElementById('header-trim-label'),

      // Navigation
      navTabs: document.querySelectorAll('.nav-tab-btn'),
      tabScreens: document.querySelectorAll('.app-tab-screen'),
      navLogCount: document.getElementById('nav-log-count'),

      // Scanner View Elements
      quickTrimDisplay: document.getElementById('quick-trim-display'),
      btnQuickTrimMinus: document.getElementById('btn-quick-trim-minus'),
      btnQuickTrimPlus: document.getElementById('btn-quick-trim-plus'),
      imageUpload: document.getElementById('barcode-image-upload'),
      btnSimulate: document.getElementById('btn-simulate-modal'),
      simModal: document.getElementById('simulate-dialog'),
      btnCloseSim: document.getElementById('btn-close-sim'),
      btnCancelSim: document.getElementById('btn-cancel-sim'),
      btnSubmitSim: document.getElementById('btn-submit-sim'),
      manualInput: document.getElementById('manual-barcode-input'),
      manualFormat: document.getElementById('manual-format-select'),

      // Result Bottom Sheet Card
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

      // Rack Map Tab
      sectionPillsRow: document.getElementById('rack-section-selector'),
      rackSearchInput: document.getElementById('rack-search-input'),
      fullRackDisplay: document.getElementById('full-rack-display'),

      // PDF Cheatsheet Tab
      pdfDropzone: document.getElementById('pdf-dropzone'),
      pdfFileInput: document.getElementById('pdf-file-input'),
      pdfNameLabel: document.getElementById('pdf-name-label'),
      pdfSizeLabel: document.getElementById('pdf-size-label'),
      btnRemovePdf: document.getElementById('btn-remove-pdf'),
      btnReplacePdf: document.getElementById('btn-replace-pdf'),
      pdfPlaceholder: document.getElementById('pdf-placeholder'),
      pdfFrame: document.getElementById('pdf-frame'),

      // Log Tab
      resultsCountBadge: document.getElementById('results-count-badge'),
      searchInput: document.getElementById('search-results-input'),
      scansListContainer: document.getElementById('scans-list-container'),
      scansTbody: document.getElementById('scans-tbody'),
      tableEmptyState: document.getElementById('table-empty-state'),
      btnExportCsv: document.getElementById('btn-export-csv'),
      btnExportJson: document.getElementById('btn-export-json'),
      btnClearLog: document.getElementById('btn-clear-log'),

      // AI Drawer & Key Modal
      btnOpenAi: document.getElementById('btn-open-ai'),
      aiDrawer: document.getElementById('ai-drawer'),
      btnCloseAi: document.getElementById('btn-close-ai'),
      aiMessages: document.getElementById('ai-messages'),
      aiInput: document.getElementById('ai-input'),
      btnAiSend: document.getElementById('btn-ai-send'),
      btnAiSettings: document.getElementById('btn-ai-settings'),
      apiKeyModal: document.getElementById('api-key-modal'),
      btnCloseApiKey: document.getElementById('btn-close-apikey'),
      apiKeyInput: document.getElementById('gemini-key-input'),
      btnSaveApiKey: document.getElementById('btn-save-apikey')
    };

    // 3. Tab Navigation Switcher
    function switchTab(targetTabId) {
      state.activeTab = targetTabId;

      // Update Nav Buttons
      el.navTabs.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === targetTabId);
      });

      // Update Tab Screens
      el.tabScreens.forEach(screen => {
        screen.classList.toggle('active', screen.id === targetTabId);
      });

      // If switching to Rack tab, render current section rack
      if (targetTabId === 'tab-rack') {
        renderFullRackView(state.activeSection);
      }
    }

    el.navTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        switchTab(tab);
      });
    });

    // 4. Quick Trimmer on Scanner Screen
    function updateQuickTrimDisplay() {
      const n = trimmer.getTrim();
      if (el.quickTrimDisplay) el.quickTrimDisplay.textContent = `${n} digit${n === 1 ? '' : 's'}`;
      if (el.trimLabel) el.trimLabel.textContent = `Trim: -${n}`;
    }

    if (el.btnQuickTrimMinus) {
      el.btnQuickTrimMinus.addEventListener('click', () => {
        trimmer.setTrim(trimmer.getTrim() - 1);
        updateQuickTrimDisplay();
      });
    }

    if (el.btnQuickTrimPlus) {
      el.btnQuickTrimPlus.addEventListener('click', () => {
        trimmer.setTrim(trimmer.getTrim() + 1);
        updateQuickTrimDisplay();
      });
    }

    trimmer.onTrimChange(() => updateQuickTrimDisplay());
    updateQuickTrimDisplay();

    // 5. Central Barcode Scan Processor
    function handleScanEvent(rawCode, format = 'UNKNOWN') {
      const trimmedCode = trimmer.apply(rawCode);
      const now = new Date();

      // Planogram Cheatsheet Lookup
      const product = planogram.lookup(trimmedCode) || planogram.lookup(rawCode);

      let locationLabel = 'Not in Cheatsheet';
      if (product) {
        locationLabel = `${product.section} • Pos #${product.position}`;
        state.activeSection = product.section;
        displayLocationHud(product);
        showToast(`📍 Found: ${product.section} Pos #${product.position}`, 'success');
      } else {
        showToast(`Scanned: ${trimmedCode}`, 'info');
      }

      // Record in Session Log
      const record = {
        id: 'scan_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        timestamp: now.toISOString(),
        format: format.replace('1D_', '').replace('_', '-'),
        savedCode: trimmedCode || '[EMPTY]',
        rawCode: rawCode,
        trimmedN: trimmer.getTrim(),
        locationInfo: locationLabel,
        productMatch: product || null,
        linkedPdf: state.pdf.name
      };

      state.results.unshift(record);
      renderResultsList();
    }

    // Connect Scanner Callbacks
    scanner.onScan((code, format) => {
      handleScanEvent(code, format);
    });

    scanner.onStatusChange((isActive) => {
      if (el.scannerLabel) {
        el.scannerLabel.textContent = isActive ? 'Live Scanning 60 FPS' : 'Scanner Standby';
      }
      if (el.scannerDot) {
        el.scannerDot.classList.toggle('active', isActive);
      }
    });

    // 6. Display Location Bottom Card
    function displayLocationHud(product) {
      if (!el.locationHud || !product) return;

      el.hudSectionName.textContent = product.section;
      el.hudPosBadge.textContent = `POS #${product.position}`;
      el.hudCodeVal.textContent = product.code;
      el.hudPriceVal.textContent = `₹${product.signage}`;
      el.hudColorVal.textContent = product.color;
      el.hudSlotType.textContent = product.slotType || 'Hanger/Shelf';

      if (product.remarks) {
        el.hudRemarksText.style.display = 'block';
        el.hudRemarksText.textContent = product.remarks;
      } else {
        el.hudRemarksText.style.display = 'none';
      }

      // Render Visual Rack
      el.hudVisualRackWrap.innerHTML = planogram.renderRackVisualizer(product);
      el.locationHud.classList.add('active');

      // If user is on another tab, switch to scanner to see the result
      if (state.activeTab !== 'tab-scanner') {
        switchTab('tab-scanner');
      }

      el.locationHud.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    if (el.btnCloseHud) {
      el.btnCloseHud.addEventListener('click', () => {
        el.locationHud.classList.remove('active');
      });
    }

    // 7. Full Rack View Tab Renderer
    function renderFullRackView(sectionName, searchFilter = '') {
      if (!el.fullRackDisplay) return;

      const items = planogram.getAllItems().filter(it => it.section === sectionName);
      if (items.length === 0) {
        el.fullRackDisplay.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--muted);">No items found in section ${sectionName}</div>`;
        return;
      }

      const query = (searchFilter || '').toLowerCase().trim();
      const firstItem = items[0];

      let hangersHtml = '';
      let shelvesHtml = '';

      for (let pos = 1; pos <= Math.min(4, items.length); pos++) {
        const it = items.find(x => x.position === pos);
        const matchesQuery = query && it && (it.code.includes(query) || it.color.toLowerCase().includes(query));
        hangersHtml += `
          <div class="rack-slot ${matchesQuery ? 'active-slot' : ''}">
            <span class="slot-pos-badge">#${pos}</span>
            <span class="slot-item-name">${it ? it.color : 'Opt ' + pos}</span>
            <span style="font-family: var(--font-mono); font-size: 8.5px; color: #55E497;">₹${it ? it.signage : ''}</span>
          </div>
        `;
      }

      for (let pos = 5; pos <= items.length; pos++) {
        const it = items.find(x => x.position === pos);
        const matchesQuery = query && it && (it.code.includes(query) || it.color.toLowerCase().includes(query));
        shelvesHtml += `
          <div class="rack-slot ${matchesQuery ? 'active-slot' : ''}">
            <span class="slot-pos-badge">#${pos}</span>
            <span class="slot-item-name">${it ? it.color : 'Opt ' + pos}</span>
            <span style="font-family: var(--font-mono); font-size: 8.5px; color: #55E497;">₹${it ? it.signage : ''}</span>
          </div>
        `;
      }

      el.fullRackDisplay.innerHTML = `
        <div class="visual-rack-container">
          <div class="rack-header-label">
            <span>RACK SECTION: ${sectionName}</span>
            <span class="badge-active-pos">${items.length} POSITIONS</span>
          </div>
          <div class="rack-rail-label">TOP HANGING RAIL</div>
          <div class="rack-hanger-row">${hangersHtml}</div>
          <div class="rack-rail-label" style="margin-top: 8px;">FOLDED SHELF TIERS</div>
          <div class="rack-shelf-grid">${shelvesHtml}</div>
          ${firstItem && firstItem.remarks ? `<div style="font-size: 11px; color: #FFB5AF; margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px;">Instruction: ${firstItem.remarks}</div>` : ''}
        </div>
      `;
    }

    if (el.sectionPillsRow) {
      el.sectionPillsRow.querySelectorAll('.btn-section-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          el.sectionPillsRow.querySelectorAll('.btn-section-pill').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.activeSection = btn.getAttribute('data-section');
          renderFullRackView(state.activeSection, el.rackSearchInput ? el.rackSearchInput.value : '');
        });
      });
    }

    if (el.rackSearchInput) {
      el.rackSearchInput.addEventListener('input', (e) => {
        renderFullRackView(state.activeSection, e.target.value);
      });
    }

    // 8. Cheatsheet PDF Loading & Parsing
    function loadPdf(file) {
      if (!file) return;
      if (state.pdf.blobUrl) URL.revokeObjectURL(state.pdf.blobUrl);

      state.pdf.file = file;
      state.pdf.name = file.name;
      state.pdf.blobUrl = URL.createObjectURL(file);

      if (el.pdfNameLabel) el.pdfNameLabel.textContent = file.name;
      if (el.pdfSizeLabel) el.pdfSizeLabel.textContent = `Uploaded ${new Date().toLocaleTimeString()}`;

      if (el.pdfPlaceholder) el.pdfPlaceholder.style.display = 'none';
      if (el.pdfFrame) {
        el.pdfFrame.style.display = 'block';
        el.pdfFrame.src = state.pdf.blobUrl;
      }

      if (el.catalogLabel) el.catalogLabel.textContent = file.name;
      showToast(`Loading & Parsing: ${file.name}...`, 'info');

      planogram.parsePdfFile(file).then(res => {
        if (res.success) {
          if (el.pdfSizeLabel) el.pdfSizeLabel.textContent = `${res.count} Products Indexed`;
          if (el.catalogLabel) el.catalogLabel.textContent = `${file.name} (${res.count} items)`;
          showToast(`PDF Cheatsheet Indexed: ${res.count} items`, 'success');
        } else {
          showToast('Using active cheatsheet catalog', 'info');
        }
      });
    }

    if (el.btnReplacePdf && el.pdfFileInput) {
      el.btnReplacePdf.addEventListener('click', () => el.pdfFileInput.click());
      el.pdfFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) loadPdf(e.target.files[0]);
      });
    }

    if (el.btnRemovePdf) {
      el.btnRemovePdf.addEventListener('click', () => {
        if (state.pdf.blobUrl) URL.revokeObjectURL(state.pdf.blobUrl);
        state.pdf.file = null;
        state.pdf.name = 'Default Cheatsheet (M6-M10 & MT2)';
        state.pdf.blobUrl = null;

        if (el.pdfNameLabel) el.pdfNameLabel.textContent = 'Store Cheatsheet (M6-M10 & MT2)';
        if (el.pdfSizeLabel) el.pdfSizeLabel.textContent = '6 Pages • 62 Products Indexed';
        if (el.catalogLabel) el.catalogLabel.textContent = 'M6-M10 & MT2 (62 items)';
        if (el.pdfFrame) {
          el.pdfFrame.style.display = 'none';
          el.pdfFrame.src = '';
        }
        if (el.pdfPlaceholder) el.pdfPlaceholder.style.display = 'flex';
        showToast('Reset to default Cheatsheet', 'info');
      });
    }

    // 9. Presets & Simulator Modal
    document.querySelectorAll('.preset-code-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.getAttribute('data-code');
        const format = btn.getAttribute('data-format') || 'PRESET';
        handleScanEvent(code, format);
        if (el.simModal) el.simModal.classList.remove('open');
      });
    });

    if (el.btnSimulate) el.btnSimulate.addEventListener('click', () => el.simModal.classList.add('open'));
    if (el.btnCloseSim) el.btnCloseSim.addEventListener('click', () => el.simModal.classList.remove('open'));
    if (el.btnCancelSim) el.btnCancelSim.addEventListener('click', () => el.simModal.classList.remove('open'));

    if (el.btnSubmitSim) {
      el.btnSubmitSim.addEventListener('click', () => {
        const code = el.manualInput.value.trim();
        const format = el.manualFormat.value;
        if (!code) return;
        handleScanEvent(code, format);
        el.simModal.classList.remove('open');
      });
    }

    // 10. Photo / Image File Barcode Scan
    if (el.imageUpload) {
      el.imageUpload.addEventListener('change', async (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = async () => {
          showToast('Analyzing photo barcode...', 'info');
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
          showToast('No barcode found in photo', 'error');
          URL.revokeObjectURL(img.src);
        };
        e.target.value = '';
      });
    }

    // 11. Results Log List (Mobile Cards + Desktop Table)
    function renderResultsList() {
      const filter = el.searchInput ? el.searchInput.value.trim().toLowerCase() : '';
      const filtered = state.results.filter(item => {
        if (!filter) return true;
        return item.savedCode.toLowerCase().includes(filter) ||
               item.format.toLowerCase().includes(filter) ||
               item.locationInfo.toLowerCase().includes(filter) ||
               item.time.toLowerCase().includes(filter);
      });

      const total = state.results.length;
      if (el.resultsCountBadge) el.resultsCountBadge.textContent = `${total} Scan${total === 1 ? '' : 's'}`;
      if (el.navLogCount) {
        el.navLogCount.textContent = total;
        el.navLogCount.style.display = total > 0 ? 'inline-block' : 'none';
      }

      const hasData = total > 0;
      if (el.btnExportCsv) el.btnExportCsv.disabled = !hasData;
      if (el.btnExportJson) el.btnExportJson.disabled = !hasData;
      if (el.btnClearLog) el.btnClearLog.disabled = !hasData;

      if (filtered.length === 0) {
        if (el.scansListContainer) el.scansListContainer.innerHTML = '';
        if (el.scansTbody) el.scansTbody.innerHTML = '';
        if (el.tableEmptyState) el.tableEmptyState.style.display = 'flex';
        return;
      }

      if (el.tableEmptyState) el.tableEmptyState.style.display = 'none';

      // 11A. Mobile Cards List
      if (el.scansListContainer) {
        el.scansListContainer.innerHTML = filtered.map(item => `
          <div class="mobile-log-card" data-id="${item.id}">
            <div class="log-card-left">
              <div class="log-card-code">${escapeHtml(item.savedCode)}</div>
              <div class="log-card-meta">
                <span>${item.time}</span> &bull; 
                <span>${item.format}</span> &bull; 
                <span class="log-card-loc-pill">${escapeHtml(item.locationInfo)}</span>
              </div>
            </div>
            <div class="log-card-actions">
              <button type="button" class="btn-row-action copy-code-btn" data-code="${escapeHtml(item.savedCode)}" title="Copy">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
              <button type="button" class="btn-row-action delete delete-row-btn" data-id="${item.id}" title="Delete">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>
        `).join('');
      }

      // 11B. Desktop Table
      if (el.scansTbody) {
        el.scansTbody.innerHTML = filtered.map((item, idx) => `
          <tr data-id="${item.id}">
            <td style="font-family: var(--font-mono); font-size: 11px; color: var(--muted);">${total - idx}</td>
            <td style="font-family: var(--font-mono); font-size: 11px;">${item.time}</td>
            <td style="font-family: var(--font-mono); font-size: 11px;">${item.format}</td>
            <td style="font-family: var(--font-mono); font-weight: 700;">${escapeHtml(item.savedCode)}</td>
            <td style="color: var(--ok); font-weight: 700; font-family: var(--font-mono);">${escapeHtml(item.locationInfo)}</td>
            <td style="font-family: var(--font-mono); color: var(--laser); font-size: 11px;">-${item.trimmedN}d</td>
            <td style="text-align: right;">
              <button type="button" class="btn-row-action delete delete-row-btn" data-id="${item.id}" title="Delete">&times;</button>
            </td>
          </tr>
        `).join('');
      }

      // Event Handlers for Copy & Delete
      document.querySelectorAll('.copy-code-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const c = btn.getAttribute('data-code');
          navigator.clipboard.writeText(c).then(() => showToast(`Copied: ${c}`, 'success'));
        });
      });

      document.querySelectorAll('.delete-row-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          state.results = state.results.filter(r => r.id !== id);
          renderResultsList();
        });
      });
    }

    if (el.searchInput) el.searchInput.addEventListener('input', renderResultsList);

    if (el.btnClearLog) {
      el.btnClearLog.addEventListener('click', () => {
        if (state.results.length === 0) return;
        if (confirm('Clear all scanned entries?')) {
          state.results = [];
          renderResultsList();
          showToast('Scanned log cleared', 'info');
        }
      });
    }

    // CSV Export
    if (el.btnExportCsv) {
      el.btnExportCsv.addEventListener('click', () => {
        if (state.results.length === 0) return;
        const headers = ['Index', 'Time', 'Format', 'Saved Code', 'Planogram Rack Location', 'Trim Digits'];
        const rows = state.results.map((r, i) => [
          state.results.length - i,
          `"${r.timestamp}"`,
          `"${r.format}"`,
          `"${r.savedCode.replace(/"/g, '""')}"`,
          `"${r.locationInfo.replace(/"/g, '""')}"`,
          r.trimmedN
        ]);
        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');
        downloadFile(csvContent, `scan-dock-${Date.now()}.csv`, 'text/csv;charset=utf-8;');
        showToast('CSV export downloaded', 'success');
      });
    }

    // JSON Export
    if (el.btnExportJson) {
      el.btnExportJson.addEventListener('click', () => {
        if (state.results.length === 0) return;
        const payload = {
          terminal: 'Scan Dock Mobile Terminal',
          date: new Date().toISOString(),
          totalScans: state.results.length,
          scans: state.results
        };
        downloadFile(JSON.stringify(payload, null, 2), `scan-dock-${Date.now()}.json`, 'application/json');
        showToast('JSON export downloaded', 'success');
      });
    }

    // 12. AI Assistant Drawer
    if (el.btnOpenAi) el.btnOpenAi.addEventListener('click', () => el.aiDrawer.classList.add('open'));
    if (el.btnCloseAi) el.btnCloseAi.addEventListener('click', () => el.aiDrawer.classList.remove('open'));

    async function sendAiQuestion(text) {
      const q = text || (el.aiInput ? el.aiInput.value.trim() : '');
      if (!q) return;

      appendAiMessage(q, 'user');
      if (el.aiInput) el.aiInput.value = '';

      const typingMsg = appendAiMessage('Thinking...', 'bot');
      try {
        const answer = await ai.ask(q);
        typingMsg.innerHTML = formatMarkdown(answer);
      } catch (err) {
        typingMsg.textContent = 'Error: ' + err.message;
      }
    }

    if (el.btnAiSend) el.btnAiSend.addEventListener('click', () => sendAiQuestion());
    if (el.aiInput) {
      el.aiInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendAiQuestion();
      });
    }

    document.querySelectorAll('.quick-prompt-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.getAttribute('data-prompt');
        sendAiQuestion(prompt);
      });
    });

    function appendAiMessage(text, sender) {
      const msg = document.createElement('div');
      msg.className = `ai-msg ${sender}`;
      msg.textContent = text;
      el.aiMessages.appendChild(msg);
      el.aiMessages.scrollTop = el.aiMessages.scrollHeight;
      return msg;
    }

    // 13. API Key Modal
    if (el.btnAiSettings) {
      el.btnAiSettings.addEventListener('click', () => {
        if (el.apiKeyInput) el.apiKeyInput.value = ai.getApiKey();
        if (el.apiKeyModal) el.apiKeyModal.classList.add('open');
      });
    }
    if (el.btnCloseApiKey) el.btnCloseApiKey.addEventListener('click', () => el.apiKeyModal.classList.remove('open'));
    if (el.btnSaveApiKey) {
      el.btnSaveApiKey.addEventListener('click', () => {
        const key = el.apiKeyInput.value.trim();
        ai.setApiKey(key);
        el.apiKeyModal.classList.remove('open');
        showToast(key ? 'Gemini API Key saved' : 'Using local zero-latency engine', 'success');
      });
    }

    // Initial render
    renderResultsList();
  });

  // Utility Helpers
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
    }, 2800);
  }

})(window);
