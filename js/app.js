/**
 * Main Mobile App Controller — Scan Dock v2.0
 * Coordinates Gemini AI Fixture Analyzer, PDF Canvas Cropper,
 * Mobile Tab Navigation, Scanner, and Database Sync.
 */
(function(window) {
  'use strict';

  const state = {
    pdf: {
      file: null,
      blobUrl: null,
      name: '',
      sizeFormatted: 'No Document Active'
    },
    activeSection: '',
    activeTab: 'tab-scanner',
    newlinesFilter: 'ALL',
    newlinesSearch: '',
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
    const cropper = new window.PdfCropper();
    cropper.setAiService(ai);
    const db = new window.DbSync();

    window.App = { state, trimmer, scanner, planogram, ai, cropper, db };

    // 2. DOM Elements
    const el = {
      // Header & API Key Banner
      apiKeyBanner: document.getElementById('api-key-banner'),
      keyDot: document.getElementById('key-dot'),
      keyStatusText: document.getElementById('key-status-text'),
      btnBannerKeyAct: document.getElementById('btn-banner-key-act'),
      btnAiSettings: document.getElementById('btn-ai-settings'),
      apiKeyModal: document.getElementById('api-key-modal'),
      btnCloseApiKey: document.getElementById('btn-close-apikey'),
      apiKeyInput: document.getElementById('gemini-key-input'),
      btnSaveApiKey: document.getElementById('btn-save-apikey'),

      // Header Quick New Lines Pill
      btnQuickNewlines: document.getElementById('btn-quick-newlines'),
      hdrNewlinesCount: document.getElementById('hdr-newlines-count'),

      // Navigation Tabs
      navTabs: document.querySelectorAll('.nav-tab-btn'),
      tabScreens: document.querySelectorAll('.app-tab-screen'),
      navLogCount: document.getElementById('nav-log-count'),
      navBtnNewlines: document.getElementById('nav-btn-newlines'),
      navNewlinesCount: document.getElementById('nav-newlines-count'),

      // Fresh New Lines Tab Elements
      screenNewlinesBadge: document.getElementById('screen-newlines-badge'),
      metricNewlinesTotal: document.getElementById('metric-newlines-total'),
      metricSectionsCount: document.getElementById('metric-sections-count'),
      metricTopSection: document.getElementById('metric-top-section'),
      newlinesSectionFilter: document.getElementById('newlines-section-filter'),
      newlinesSearchInput: document.getElementById('newlines-search-input'),
      newlinesCatalogGrid: document.getElementById('newlines-catalog-grid'),

      // Scanner Viewport & Quick Controls
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
      btnVoiceScan: document.getElementById('btn-voice-scan'),
      btnSpeakPlacement: document.getElementById('btn-speak-placement'),
      ttsBtnLabel: document.getElementById('tts-btn-label'),
      btnRackVoiceSearch: document.getElementById('btn-rack-voice-search'),
      btnModalVoiceInput: document.getElementById('btn-modal-voice-input'),

      // Result Bottom Sheet Card (AI & Cropped PDF Snippet)
      locationHud: document.getElementById('location-hud'),
      hudBadgeLabel: document.getElementById('hud-badge-label'),
      hudSectionName: document.getElementById('hud-section-name'),
      hudPosBadge: document.getElementById('hud-pos-badge'),
      hudCodeVal: document.getElementById('hud-code-val'),
      hudPriceVal: document.getElementById('hud-price-val'),
      hudColorVal: document.getElementById('hud-color-val'),
      hudSlotType: document.getElementById('hud-slot-type'),
      hudNewlineBadge: document.getElementById('hud-newline-badge'),
      hudNewlineMetaItem: document.getElementById('hud-newline-meta-item'),
      hudNewlineVal: document.getElementById('hud-newline-val'),
      hudLabelSecond: document.getElementById('hud-label-second'),
      hudLabelThird: document.getElementById('hud-label-third'),
      hudLabelFourth: document.getElementById('hud-label-fourth'),
      aiPlacementText: document.getElementById('ai-placement-text'),
      croppedProductImg: document.getElementById('cropped-product-img'),
      hudCroppedHeaderTitle: document.getElementById('pdf-cropped-header-label') || document.getElementById('hud-cropped-header-title'),
      croppedFixtureImg: document.getElementById('cropped-fixture-img'),
      hudBeaconPoint: document.getElementById('hud-beacon-point'),
      hudBeaconBadge: document.getElementById('hud-beacon-badge'),
      hudFloorSlotTitle: document.getElementById('hud-floor-slot-title'),
      hudVisualRackWrap: document.getElementById('hud-visual-rack-wrap'),
      btnCloseHud: document.getElementById('btn-close-hud'),
      hudNotFoundActions: document.getElementById('hud-not-found-actions'),
      btnHudAdjustTrim: document.getElementById('btn-hud-adjust-trim'),
      btnHudUploadPdf: document.getElementById('btn-hud-upload-pdf'),

      // Rack Map Tab
      sectionPillsRow: document.getElementById('rack-section-selector'),
      rackSearchInput: document.getElementById('rack-search-input'),
      fullRackDisplay: document.getElementById('full-rack-display'),

      // PDF / Document Dock & Canvas Viewer
      pdfFileInput: document.getElementById('pdf-file-input'),
      pdfNameLabel: document.getElementById('pdf-name-label'),
      pdfSizeLabel: document.getElementById('pdf-size-label'),
      pdfDocBadge: document.getElementById('pdf-doc-badge'),
      btnRemovePdf: document.getElementById('btn-remove-pdf'),
      btnReplacePdf: document.getElementById('btn-replace-pdf'),
      aiExtractProgress: document.getElementById('ai-extract-progress'),
      aiExtractStatusText: document.getElementById('ai-extract-status-text'),
      docCurrentPage: document.getElementById('doc-current-page'),
      docTotalPages: document.getElementById('doc-total-pages'),
      btnDocPrev: document.getElementById('btn-doc-prev'),
      btnDocNext: document.getElementById('btn-doc-next'),
      btnDocZoomIn: document.getElementById('btn-doc-zoom-in'),
      btnDocZoomOut: document.getElementById('btn-doc-zoom-out'),
      btnDocFit: document.getElementById('btn-doc-fit'),
      docZoomVal: document.getElementById('doc-zoom-val'),
      docCanvasViewport: document.getElementById('doc-canvas-viewport'),
      docActiveCanvas: document.getElementById('doc-active-canvas'),
      docActiveImage: document.getElementById('doc-active-image'),
      docLoadingOverlay: document.getElementById('doc-loading-overlay'),

      // Log Tab
      resultsCountBadge: document.getElementById('results-count-badge'),
      searchInput: document.getElementById('search-results-input'),
      scansListContainer: document.getElementById('scans-list-container'),
      scansTbody: document.getElementById('scans-tbody'),
      tableEmptyState: document.getElementById('table-empty-state'),
      btnExportCsv: document.getElementById('btn-export-csv'),
      btnExportJson: document.getElementById('btn-export-json'),
      btnClearLog: document.getElementById('btn-clear-log'),

      // AI Chat Drawer
      btnOpenAi: document.getElementById('btn-open-ai'),
      aiDrawer: document.getElementById('ai-drawer'),
      btnCloseAi: document.getElementById('btn-close-ai'),
      aiMessages: document.getElementById('ai-messages'),
      aiInput: document.getElementById('ai-input'),
      btnAiSend: document.getElementById('btn-ai-send')
    };

    // 3. API Key Banner State
    function updateApiKeyUI() {
      const hasKey = ai.hasApiKey();
      if (el.keyDot) el.keyDot.classList.toggle('active', hasKey);
      if (el.keyStatusText) {
        el.keyStatusText.textContent = hasKey 
          ? 'Gemini AI Active (gemini-2.5-flash)' 
          : 'Gemini AI Key: Not Set (Using Local Engine)';
      }
      if (el.btnBannerKeyAct) {
        el.btnBannerKeyAct.textContent = hasKey ? 'Change' : 'Enter Key';
      }
    }
    updateApiKeyUI();

    if (el.btnBannerKeyAct) {
      el.btnBannerKeyAct.addEventListener('click', () => {
        if (el.apiKeyInput) el.apiKeyInput.value = ai.getApiKey();
        if (el.apiKeyModal) el.apiKeyModal.classList.add('open');
      });
    }

    if (el.btnAiSettings) {
      el.btnAiSettings.addEventListener('click', () => {
        if (el.apiKeyInput) el.apiKeyInput.value = ai.getApiKey();
        if (el.apiKeyModal) el.apiKeyModal.classList.add('open');
      });
    }

    if (el.btnCloseApiKey) {
      el.btnCloseApiKey.addEventListener('click', () => el.apiKeyModal.classList.remove('open'));
    }

    if (el.btnSaveApiKey) {
      el.btnSaveApiKey.addEventListener('click', () => {
        const key = el.apiKeyInput.value.trim();
        ai.setApiKey(key);
        updateApiKeyUI();
        if (el.apiKeyModal) el.apiKeyModal.classList.remove('open');
        showToast(key ? 'Gemini API Key saved' : 'Using local zero-latency engine', 'success');

        if (key) {
          cropper.analyzedPages.clear();
          cropper.analyzingPromises.clear();
          const newLinesItems = planogram.getNewLines();
          const pages = Array.from(new Set(newLinesItems.map(it => parseInt(it.page, 10) || 1)));
          pages.forEach(p => {
            cropper.analyzePageWithAI(p, newLinesItems.filter(it => (parseInt(it.page, 10) || 1) === p));
          });
        }
      });
    }

    // Start with a clean slate: 0 pre-recorded items until user uploads a PDF
    updateNewLinesCounters();
    updatePresetsShelf();
    updateSectionFilters();

    // 4. Tab Navigation Switcher
    function switchTab(targetTabId) {
      state.activeTab = targetTabId;

      el.navTabs.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === targetTabId);
      });

      el.tabScreens.forEach(screen => {
        screen.classList.toggle('active', screen.id === targetTabId);
      });

      if (targetTabId === 'tab-rack') {
        renderFullRackView(state.activeSection);
      } else if (targetTabId === 'tab-newlines') {
        renderNewLinesScreen();
      }
    }

    el.navTabs.forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
    });

    if (el.btnQuickNewlines) {
      el.btnQuickNewlines.addEventListener('click', () => switchTab('tab-newlines'));
    }

    // 5. Quick Trimmer on Scanner Screen
    function updateQuickTrimDisplay() {
      const n = trimmer.getTrim();
      if (el.quickTrimDisplay) el.quickTrimDisplay.textContent = n;
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

    // 6. Central Barcode Scan Processor (AI Explanation + Cropped PDF Snippet)
    async function handleScanEvent(rawCode, format = 'UNKNOWN') {
      const trimmedCode = trimmer.apply(rawCode);
      const now = new Date();

      // Cheatsheet Lookup (supports exact match, loose match, or raw document page text match)
      const product = planogram.lookup(trimmedCode) || planogram.lookup(rawCode);

      let locationLabel = 'Not in Cheatsheet';
      if (product) {
        locationLabel = `${product.section} • Pos #${product.position}`;
        state.activeSection = product.section;
        showToast(`📍 Found: ${product.section} Pos #${product.position}`, 'success');

        // Render AI Explanation and Cropped PDF Snippet
        await displayLocationResult(product, trimmedCode, rawCode);
      } else {
        showToast(`⚠️ Scanned: ${trimmedCode} (Not found in active doc)`, 'warning');
        // DO NOT HIDE HUD! Keep open with full AI diagnostic feedback!
        await displayNotFoundResult(trimmedCode, rawCode);
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
    scanner.onScan((code, format) => handleScanEvent(code, format));

    // 7A. Display AI Placement & Cropped PDF Snippet (Found Match)
    async function displayLocationResult(product, scannedCode, rawCode = '') {
      if (!el.locationHud || !product) return;

      // Normal Active State
      el.locationHud.classList.remove('hud-not-found');
      if (el.hudBadgeLabel) el.hudBadgeLabel.textContent = '📍 PLANOGRAM LOCATION IDENTIFIED';
      if (el.hudSectionName) el.hudSectionName.textContent = product.section;
      if (el.hudPosBadge) el.hudPosBadge.textContent = `POS #${product.position}`;

      // Reset spec labels & values
      if (el.hudCodeVal) el.hudCodeVal.textContent = product.code;
      if (el.hudLabelSecond) el.hudLabelSecond.textContent = 'Signage Price';
      if (el.hudPriceVal) {
        el.hudPriceVal.textContent = `₹${product.signage}`;
        el.hudPriceVal.classList.add('price');
      }
      if (el.hudLabelThird) el.hudLabelThird.textContent = 'Color / Shade';
      if (el.hudColorVal) el.hudColorVal.textContent = product.color;
      if (el.hudLabelFourth) el.hudLabelFourth.textContent = 'Fixture Slot';
      if (el.hudSlotType) el.hudSlotType.textContent = product.slotType || 'Hanger/Shelf';

      // NEW LINE Status & Glowing Badge
      const isNewLine = (product.newLine || '').toUpperCase() === 'YES';
      if (el.hudNewlineBadge) {
        if (isNewLine) {
          el.hudNewlineBadge.className = 'badge-new-line pulse-glow';
          el.hudNewlineBadge.innerHTML = '🔥 NEW LINE: YES';
        } else {
          el.hudNewlineBadge.className = 'badge-repeat-line';
          el.hudNewlineBadge.innerHTML = '📦 REPEAT LINE: NO';
        }
      }
      if (el.hudNewlineVal) {
        el.hudNewlineVal.textContent = isNewLine ? '🔥 YES (Fresh Launch)' : '📦 NO (Repeat / Carryover)';
        el.hudNewlineVal.style.color = isNewLine ? '#FF8A00' : '#8A99AD';
      }

      // Check if real PDF is loaded into viewer/cropper
      const hasRealDoc = Boolean(state.pdf && state.pdf.file) || (cropper.getPageCount() > 0 && Boolean(cropper.currentPdfDoc));
      if (el.hudCroppedHeaderTitle) {
        el.hudCroppedHeaderTitle.textContent = hasRealDoc
          ? 'CROPPED FROM PDF'
          : 'CATALOG SNIPPET';
      }

      // Hide troubleshooting actions
      if (el.hudNotFoundActions) el.hudNotFoundActions.style.display = 'none';

      // 7A-1. Get Gemini AI Placement Explanation (with resilient fallback)
      if (el.aiPlacementText) {
        el.aiPlacementText.textContent = 'Gemini AI generating exact placement instructions...';
        ai.explainPlacement(scannedCode, product)
          .then(text => {
            el.aiPlacementText.innerHTML = formatMarkdown(text);
          })
          .catch(err => {
            console.warn('ai.explainPlacement failed:', err);
            el.aiPlacementText.innerHTML =
              `📍 <strong>Placement:</strong> Hang/Place in <strong>${escapeHtml(product.section)}</strong> at <strong>Position #${escapeHtml(String(product.position))}</strong>.<br>` +
              `• <strong>Product:</strong> ${escapeHtml(product.color)} | <strong>Signage:</strong> ₹${escapeHtml(String(product.signage))} | <strong>New Line:</strong> ${escapeHtml(product.newLine || 'NO')}<br>` +
              (product.remarks ? `• <strong>Rule:</strong> <em>${escapeHtml(product.remarks)}</em>` : '');
          });
      }

      // 7A-2. Crop Exact Garment Snippet from PDF Canvas (with guaranteed fallback card)
      if (el.croppedProductImg) {
        el.croppedProductImg.alt = `Cropped PDF Snippet: ${product.code}`;
        cropper.cropProductSnippet(product)
          .then(dataUrl => {
            el.croppedProductImg.src = dataUrl || cropper.generateFallbackSnippet(product);
          })
          .catch(err => {
            console.warn('cropper.cropProductSnippet failed:', err);
            el.croppedProductImg.src = cropper.generateFallbackSnippet(product);
          });
      }

      // 7A-3. Crop Floor / Fixture Diagram & Activate Animated Radar Beacon ("Ye Yahan Pe Lagega")
      const pageNum = product.page || 1;
      if (el.croppedFixtureImg) {
        el.croppedFixtureImg.alt = `Floor Fixture Diagram: Page ${pageNum}`;
        cropper.cropFixtureSnippet(pageNum)
          .then(dataUrl => {
            el.croppedFixtureImg.src = dataUrl || cropper.generateFallbackFixtureSnippet(pageNum);
          })
          .catch(err => {
            console.warn('cropper.cropFixtureSnippet failed:', err);
            el.croppedFixtureImg.src = cropper.generateFallbackFixtureSnippet(pageNum);
          });
      }

      // Position Animated Radar Beacon
      if (el.hudBeaconPoint) {
        const coords = (planogram.getFixtureBeaconCoordinates && planogram.getFixtureBeaconCoordinates(product)) || { x: 50, y: 50, xPct: 50, yPct: 50 };
        const x = coords.xPct != null ? coords.xPct : (coords.x != null ? coords.x : 50);
        const y = coords.yPct != null ? coords.yPct : (coords.y != null ? coords.y : 50);
        
        el.hudBeaconPoint.style.left = `${x}%`;
        el.hudBeaconPoint.style.top = `${y}%`;
        el.hudBeaconPoint.style.display = 'flex';

        if (el.hudBeaconBadge) {
          el.hudBeaconBadge.textContent = `📍 YE YAHAN LAGEGA • #${product.position}`;
        }
        if (el.hudFloorSlotTitle) {
          el.hudFloorSlotTitle.textContent = `📍 SLOT #${product.position} (${product.slotType || 'Slot'})`;
        }
      }

      // 7A-4. Mini Rack Architecture Visualizer (with animated target slot blinking)
      if (el.hudVisualRackWrap) {
        el.hudVisualRackWrap.innerHTML = planogram.renderRackVisualizer(product);
      }

      el.locationHud.classList.add('active');

      if (state.activeTab !== 'tab-scanner') {
        switchTab('tab-scanner');
      }

      setTimeout(() => {
        el.locationHud.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }

    // 7B. Display AI Diagnostic Feedback (Item Not Found in Document)
    async function displayNotFoundResult(scannedCode, rawCode) {
      if (!el.locationHud) return;

      // Switch to warning state
      el.locationHud.classList.remove('active');
      void el.locationHud.offsetWidth; // Force reflow for clean CSS animation
      el.locationHud.classList.add('active', 'hud-not-found');

      if (el.hudBadgeLabel) el.hudBadgeLabel.textContent = '⚠️ NOT FOUND IN CURRENT CHEATSHEET';
      if (el.hudSectionName) el.hudSectionName.textContent = 'NOT IN CHEATSHEET';
      if (el.hudPosBadge) el.hudPosBadge.textContent = 'NO MATCH';

      // Diagnostic Spec Grid
      if (el.hudCodeVal) el.hudCodeVal.textContent = scannedCode;
      if (el.hudLabelSecond) el.hudLabelSecond.textContent = 'RAW SCANNED';
      if (el.hudPriceVal) {
        el.hudPriceVal.textContent = rawCode || scannedCode;
        el.hudPriceVal.classList.remove('price');
      }
      if (el.hudLabelThird) el.hudLabelThird.textContent = 'TRIM EXCLUDED';
      const n = trimmer.getTrim();
      if (el.hudColorVal) el.hudColorVal.textContent = `${n} digit${n === 1 ? '' : 's'}`;
      if (el.hudLabelFourth) el.hudLabelFourth.textContent = 'ACTIVE DOCUMENT';
      if (el.hudSlotType) el.hudSlotType.textContent = (state.pdf.name || 'Store Cheatsheet').slice(0, 16);

      if (el.hudNewlineBadge) {
        el.hudNewlineBadge.className = 'badge-repeat-line';
        el.hudNewlineBadge.innerHTML = 'NOT IN CHEATSHEET';
      }
      if (el.hudNewlineVal) {
        el.hudNewlineVal.textContent = 'N/A';
        el.hudNewlineVal.style.color = '#8A99AD';
      }

      // AI Diagnostic Explanation (with resilient fallback)
      if (el.aiPlacementText) {
        if (!state.pdf.name || planogram.getTotalCount() === 0) {
          el.aiPlacementText.innerHTML =
            `⚠️ <strong>No Planogram Document Loaded:</strong><br>` +
            `• You scanned barcode <code>${escapeHtml(scannedCode)}</code>, but no store planogram PDF is active.<br>` +
            `• Tap <strong>Upload PDF / Slide</strong> below to upload your planogram and activate product matching.`;
        } else if (ai.hasApiKey()) {
          el.aiPlacementText.textContent = 'Gemini AI diagnosing scanned barcode...';
          ai.explainNotFound(scannedCode, rawCode, n, state.pdf.name)
            .then(text => {
              el.aiPlacementText.innerHTML = formatMarkdown(text);
            })
            .catch(err => {
              console.warn('ai.explainNotFound failed:', err);
              el.aiPlacementText.innerHTML =
                `⚠️ <strong>Item Not Found:</strong> Code <code>${escapeHtml(scannedCode)}</code> has no matching slot in this cheatsheet.<br>` +
                `• Check trimming dial or upload the matching PDF cheatsheet.`;
            });
        } else {
          el.aiPlacementText.innerHTML =
            `⚠️ <strong>Item Not Found in Cheatsheet:</strong> Code <code>${escapeHtml(scannedCode)}</code> was not matched to any rack position in <em>${escapeHtml(state.pdf.name)}</em>.<br>` +
            `• Check trimming dial if barcode has trailing size/check digits.<br>` +
            `• Or verify you uploaded the correct fixture planogram document.`;
        }
      }

      // Diagnostic Snippet Graphic
      if (el.croppedProductImg) {
        el.croppedProductImg.alt = `Not in Cheatsheet: ${scannedCode}`;
        el.croppedProductImg.src = cropper.generateNotFoundSnippet(scannedCode, rawCode, state.pdf.name, n);
      }
      if (el.hudCroppedHeaderTitle) {
        el.hudCroppedHeaderTitle.textContent = 'DOCUMENT SCAN DIAGNOSTIC';
      }

      if (el.croppedFixtureImg) {
        el.croppedFixtureImg.src = cropper.generateFallbackFixtureSnippet ? cropper.generateFallbackFixtureSnippet(1) : '';
      }
      if (el.hudBeaconPoint) {
        el.hudBeaconPoint.style.display = 'none';
      }
      if (el.hudFloorSlotTitle) {
        el.hudFloorSlotTitle.textContent = 'NO ALLOCATED FIXTURE SLOT';
      }

      // Informative Rack Fallback
      if (el.hudVisualRackWrap) {
        if (planogram.getTotalCount() === 0) {
          el.hudVisualRackWrap.innerHTML = `
            <div class="result-remarks-banner" style="margin-top: 6px;">
              ⚠️ <strong>No Planogram Active:</strong> Please upload a store planogram PDF in the <strong>Cheatsheet Dock</strong> first to index products and verify fixture positions.
            </div>
          `;
        } else {
          el.hudVisualRackWrap.innerHTML = `
            <div class="result-remarks-banner" style="margin-top: 6px;">
              ⚠️ <strong>No Fixture Slot Found:</strong> Barcode <code>${escapeHtml(scannedCode)}</code> is not allocated to any hanger rail or shelf tier in <em>${escapeHtml(state.pdf.name)}</em>.
            </div>
          `;
        }
      }

      // Show Action Buttons for 1-Tap Troubleshooting
      if (el.hudNotFoundActions) el.hudNotFoundActions.style.display = 'flex';

      if (state.activeTab !== 'tab-scanner') {
        switchTab('tab-scanner');
      }

      el.locationHud.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    if (el.btnCloseHud) {
      el.btnCloseHud.addEventListener('click', () => {
        el.locationHud.classList.remove('active', 'hud-not-found');
      });
    }

    // Connect 1-Tap Troubleshooting buttons
    if (el.btnHudAdjustTrim) {
      el.btnHudAdjustTrim.addEventListener('click', () => switchTab('tab-trim'));
    }
    if (el.btnHudUploadPdf) {
      el.btnHudUploadPdf.addEventListener('click', () => switchTab('tab-pdf'));
    }

    // 8. Fresh New Lines Tab & Section Controller
    function updateNewLinesCounters() {
      const totalNewLines = planogram.getNewLinesCount ? planogram.getNewLinesCount() : 0;
      if (el.hdrNewlinesCount) {
        el.hdrNewlinesCount.textContent = totalNewLines;
        el.hdrNewlinesCount.style.display = totalNewLines > 0 ? 'inline-block' : 'none';
      }
      if (el.navNewlinesCount) {
        el.navNewlinesCount.textContent = totalNewLines;
        el.navNewlinesCount.style.display = totalNewLines > 0 ? 'inline-block' : 'none';
      }
      if (el.screenNewlinesBadge) el.screenNewlinesBadge.textContent = `${totalNewLines} New Lines`;
      if (el.metricNewlinesTotal) el.metricNewlinesTotal.textContent = totalNewLines;

      const bySection = planogram.getNewLinesBySection ? planogram.getNewLinesBySection() : {};
      const activeSections = Object.keys(bySection).filter(s => bySection[s].length > 0);
      if (el.metricSectionsCount) el.metricSectionsCount.textContent = activeSections.length;

      let topSec = '—';
      let maxLen = 0;
      activeSections.forEach(s => {
        if (bySection[s].length > maxLen) {
          maxLen = bySection[s].length;
          topSec = s;
        }
      });
      if (el.metricTopSection) {
        el.metricTopSection.textContent = maxLen > 0 ? `${topSec.replace(' DENIM', '').replace(' ESSENTIALS', '')} (${maxLen})` : '—';
      }
    }

    function renderNewLinesScreen() {
      updateNewLinesCounters();
      if (!el.newlinesCatalogGrid) return;

      if (planogram.getTotalCount() === 0) {
        el.newlinesCatalogGrid.innerHTML = `
          <div class="empty-newlines-state">
            <div class="empty-state-icon">📄</div>
            <div class="empty-state-title">No Planogram PDF Uploaded</div>
            <div class="empty-state-desc">Upload your store cheatsheet or visual merchandising PDF to extract New Lines and verify garment positions.</div>
            <button type="button" class="btn-primary-laser" id="btn-empty-upload-newlines" style="max-width: 240px; margin: 0 auto; height: 38px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              Upload Planogram PDF
            </button>
          </div>
        `;
        const btnUpload = document.getElementById('btn-empty-upload-newlines');
        if (btnUpload && el.pdfFileInput) {
          btnUpload.addEventListener('click', () => el.pdfFileInput.click());
        }
        return;
      }

      const allNewLines = planogram.getAllNewLines ? planogram.getAllNewLines() : [];
      const filterSec = state.newlinesFilter || 'ALL';
      const search = (state.newlinesSearch || '').toLowerCase().trim();

      let filtered = allNewLines;
      if (filterSec !== 'ALL') {
        filtered = filtered.filter(item => item.section === filterSec);
      }
      if (search) {
        filtered = filtered.filter(item => 
          item.code.toLowerCase().includes(search) ||
          item.color.toLowerCase().includes(search) ||
          String(item.signage).includes(search) ||
          (item.slotType && item.slotType.toLowerCase().includes(search)) ||
          item.section.toLowerCase().includes(search)
        );
      }

      if (filtered.length === 0) {
        el.newlinesCatalogGrid.innerHTML = `
          <div class="empty-table-state" style="grid-column: 1 / -1; padding: 40px 20px;">
            <div style="font-size: 28px; margin-bottom: 8px;">🔍</div>
            <div style="font-weight: 600; color: var(--ink);">No New Line products found</div>
            <div style="font-size: 12px; color: var(--muted); margin-top: 4px;">Try changing the section filter or search term.</div>
          </div>
        `;
        return;
      }

      el.newlinesCatalogGrid.innerHTML = filtered.map(item => {
        return `
          <div class="newline-card" data-code="${escapeHtml(item.code)}">
            <!-- Full Width Card Top Row -->
            <div class="newline-card-toprow">
              <div class="newline-top-left">
                <span class="newline-pos-badge">POS #${item.position}</span>
                <span class="newline-section-pill">${escapeHtml(item.section)}</span>
              </div>
              <span class="badge-new-line pulse-glow">🔥 NEW LINE</span>
            </div>

            <!-- Card Main Row: Thumbnail + Info -->
            <div class="newline-card-main">
              <div class="newline-thumb-wrap">
                <img class="newline-thumb-img" id="thumb-${item.code}" alt="${escapeHtml(item.color)}" src="${cropper.generateFallbackSnippet(item)}">
              </div>

              <div class="newline-card-info">
                <div class="newline-title-row">
                  <span class="newline-color-title">${escapeHtml(item.color)}</span>
                  <span class="newline-price-tag">₹${item.signage}</span>
                </div>

                <div class="newline-code-chip">
                  <span class="newline-code-lbl">CODE:</span>
                  <span class="newline-code-val">${escapeHtml(item.code)}</span>
                </div>

                <div class="newline-meta-slot">
                  📍 <strong>Slot:</strong> ${escapeHtml(item.slotType || 'Hanger/Shelf')}
                </div>

                ${item.remarks ? `<div class="newline-card-remarks">💡 ${escapeHtml(item.remarks)}</div>` : ''}

                <div class="newline-actions-row">
                  <button type="button" class="btn-locate-floor" data-code="${escapeHtml(item.code)}" title="Locate on Floor Fixture & Blink">
                    📍 Locate & Blink
                  </button>
                  <button type="button" class="btn-sim-scan" data-code="${escapeHtml(item.code)}" title="Simulate Barcode Scan">
                    ⚡ Scan
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Async load real cropped garment snippet for each card thumbnail
      filtered.forEach(item => {
        const thumbImg = document.getElementById(`thumb-${item.code}`);
        if (thumbImg) {
          cropper.cropProductSnippet(item).then(url => {
            if (url) thumbImg.src = url;
          }).catch(() => {});
        }
      });

      // When Gemini Vision finishes analyzing a page, automatically refresh any visible card thumbnails
      cropper.onPageAiAnalyzed = (pageNum) => {
        filtered.forEach(item => {
          if ((parseInt(item.page, 10) || 1) === pageNum) {
            const thumbImg = document.getElementById(`thumb-${item.code}`);
            if (thumbImg) {
              cropper.cropProductSnippet(item).then(url => {
                if (url) thumbImg.src = url;
              }).catch(() => {});
            }
          }
        });
      };

      // Attach button events
      el.newlinesCatalogGrid.querySelectorAll('.btn-locate-floor').forEach(btn => {
        btn.addEventListener('click', async () => {
          const code = btn.getAttribute('data-code');
          const prod = planogram.lookup(code);
          if (prod) {
            state.activeSection = prod.section;
            await displayLocationResult(prod, prod.code);
            showToast(`Blinking floor fixture for Slot #${prod.position}`, 'success');
          }
        });
      });

      el.newlinesCatalogGrid.querySelectorAll('.btn-sim-scan').forEach(btn => {
        btn.addEventListener('click', () => {
          const code = btn.getAttribute('data-code');
          handleScanEvent(code, 'CODE_128');
        });
      });
    }

    // New Lines Section Filter Listeners
    if (el.newlinesSectionFilter) {
      el.newlinesSectionFilter.querySelectorAll('.btn-section-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          el.newlinesSectionFilter.querySelectorAll('.btn-section-pill').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.newlinesFilter = btn.getAttribute('data-filter');
          renderNewLinesScreen();
        });
      });
    }

    // New Lines Search Input
    if (el.newlinesSearchInput) {
      el.newlinesSearchInput.addEventListener('input', (e) => {
        state.newlinesSearch = e.target.value;
        renderNewLinesScreen();
      });
    }

    // Initialize New Lines counters on boot
    updateNewLinesCounters();

    // Proactively warm up AI Vision crops for New Lines on boot if Gemini is active
    if (ai.hasApiKey()) {
      setTimeout(() => {
        const newLinesItems = planogram.getNewLines();
        const pages = Array.from(new Set(newLinesItems.map(it => parseInt(it.page, 10) || 1)));
        pages.forEach(p => {
          cropper.analyzePageWithAI(p, newLinesItems.filter(it => (parseInt(it.page, 10) || 1) === p));
        });
      }, 600);
    }

    // 8. Visual Rack Map Tab Renderer
    function renderFullRackView(sectionName, searchFilter = '') {
      if (!el.fullRackDisplay) return;

      if (planogram.getTotalCount() === 0) {
        el.fullRackDisplay.innerHTML = `
          <div class="empty-newlines-state">
            <div class="empty-state-icon">🏗️</div>
            <div class="empty-state-title">No Floor Fixtures Active</div>
            <div class="empty-state-desc">Upload a planogram PDF in the Cheatsheet Dock to activate fixture racks, hanging rails, and shelf slot maps.</div>
            <button type="button" class="btn-primary-laser" id="btn-empty-upload-rack" style="max-width: 240px; margin: 0 auto; height: 38px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              Upload Planogram PDF
            </button>
          </div>
        `;
        const btnUpload = document.getElementById('btn-empty-upload-rack');
        if (btnUpload && el.pdfFileInput) {
          btnUpload.addEventListener('click', () => el.pdfFileInput.click());
        }
        return;
      }

      const items = planogram.getAllItems().filter(it => it.section === sectionName);
      if (items.length === 0) {
        el.fullRackDisplay.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--muted); font-size: 13px;">No items found in section ${escapeHtml(sectionName || 'selected')}</div>`;
        return;
      }

      const query = (searchFilter || '').toLowerCase().trim();
      const firstItem = items[0];

      // Sort items by actual planned position
      const sorted = [...items].sort((a, b) => (parseInt(a.position, 10) || 0) - (parseInt(b.position, 10) || 0));

      const hangers = [];
      const shelves = [];

      sorted.forEach((it, idx) => {
        const slotType = (it.slotType || '').toLowerCase();
        const shelf = (it.shelf || '').toLowerCase();
        if (slotType.includes('hanger') || slotType.includes('shacket') || shelf.includes('hanger') || shelf.includes('top') || (idx < 4 && !shelf.includes('shelf') && !shelf.includes('stack') && !slotType.includes('shelf') && !slotType.includes('stack'))) {
          hangers.push(it);
        } else {
          shelves.push(it);
        }
      });

      const renderSlot = (it, isHanger = false) => {
        const pos = it.position;
        const matchesQuery = query && (it.code.includes(query) || (it.color || '').toLowerCase().includes(query) || String(pos) === query);
        const isNewLine = String(it.newLine || '').trim().toUpperCase() === 'YES';
        return `
          <div class="rack-slot ${isHanger ? 'hanger-slot' : 'shelf-slot'} ${matchesQuery ? 'active-slot slot-blinking-target' : ''} ${isNewLine ? 'slot-is-new-line' : ''}" 
               data-pos="${pos}" data-code="${escapeHtml(it.code)}" style="cursor: pointer;" title="Code: ${escapeHtml(it.code)} • ${escapeHtml(it.color)} (Click to view)">
            ${isHanger ? '<div class="slot-hanger-hook"></div>' : ''}
            <div class="slot-box">
              <div class="slot-top-labels">
                <span class="slot-pos-badge">#${pos}</span>
                ${isNewLine ? '<span class="slot-new-tag">NEW</span>' : ''}
              </div>
              <span class="slot-item-name">${escapeHtml(it.color || 'Opt ' + pos)}</span>
              <span class="slot-item-price">₹${it.signage || ''}</span>
            </div>
          </div>
        `;
      };

      const hangersHtml = hangers.map(it => renderSlot(it, true)).join('');
      const shelvesHtml = shelves.map(it => renderSlot(it, false)).join('');

      el.fullRackDisplay.innerHTML = `
        <div class="visual-rack-container">
          <div class="rack-header-label">
            <span>RACK SECTION: ${sectionName}</span>
            <span class="badge-active-pos">${items.length} POSITIONS (SLOTS #${sorted[0].position}&ndash;#${sorted[sorted.length - 1].position})</span>
          </div>
          ${hangers.length > 0 ? `
            <div class="rack-rail-label">TOP HANGING RAIL (${hangers.length} options)</div>
            <div class="rack-hanger-row">${hangersHtml}</div>
          ` : ''}
          ${shelves.length > 0 ? `
            <div class="rack-rail-label" style="margin-top: 10px;">FOLDED SHELF TIERS (${shelves.length} options)</div>
            <div class="rack-shelf-grid">${shelvesHtml}</div>
          ` : ''}
          ${firstItem && firstItem.remarks ? `<div style="font-size: 11px; color: #FFB5AF; margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px;">📋 Display Rule: ${escapeHtml(firstItem.remarks)}</div>` : ''}
        </div>
      `;

      // Make slots clickable so tapping any slot navigates to it and displays its HUD
      el.fullRackDisplay.querySelectorAll('.rack-slot[data-code]').forEach(slotEl => {
        slotEl.addEventListener('click', () => {
          const code = slotEl.getAttribute('data-code');
          if (code) {
            handleScanEvent(code, 'MANUAL_SELECTION');
          }
        });
      });
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

    // 9. Interactive Document Canvas Viewer Controller
    const docViewer = {
      currentPage: 1,
      totalPages: 1,
      zoom: 1.0,
      isImage: false,

      async renderPage(pageNum) {
        if (this.isImage) return;
        const total = cropper.getPageCount() || 1;
        this.totalPages = total;
        this.currentPage = Math.max(1, Math.min(pageNum, total));

        if (el.docCurrentPage) el.docCurrentPage.textContent = this.currentPage;
        if (el.docTotalPages) el.docTotalPages.textContent = this.totalPages;
        if (el.btnDocPrev) el.btnDocPrev.disabled = (this.currentPage <= 1);
        if (el.btnDocNext) el.btnDocNext.disabled = (this.currentPage >= this.totalPages);

        if (el.docLoadingOverlay) el.docLoadingOverlay.style.display = 'flex';
        const pageData = await cropper.renderPage(this.currentPage);
        if (el.docLoadingOverlay) el.docLoadingOverlay.style.display = 'none';

        if (pageData && pageData.canvas && el.docActiveCanvas) {
          el.docActiveCanvas.style.display = 'block';
          if (el.docActiveImage) el.docActiveImage.style.display = 'none';

          el.docActiveCanvas.width = pageData.canvas.width;
          el.docActiveCanvas.height = pageData.canvas.height;
          const ctx = el.docActiveCanvas.getContext('2d');
          ctx.drawImage(pageData.canvas, 0, 0);
          this.applyZoom();
        }
      },

      displayImage(imgElement) {
        this.isImage = true;
        this.totalPages = 1;
        this.currentPage = 1;
        if (el.docCurrentPage) el.docCurrentPage.textContent = '1';
        if (el.docTotalPages) el.docTotalPages.textContent = '1';
        if (el.btnDocPrev) el.btnDocPrev.disabled = true;
        if (el.btnDocNext) el.btnDocNext.disabled = true;

        if (el.docActiveCanvas) {
          el.docActiveCanvas.style.display = 'block';
          el.docActiveCanvas.width = imgElement.naturalWidth || imgElement.width || 1200;
          el.docActiveCanvas.height = imgElement.naturalHeight || imgElement.height || 800;
          const ctx = el.docActiveCanvas.getContext('2d');
          ctx.drawImage(imgElement, 0, 0, el.docActiveCanvas.width, el.docActiveCanvas.height);
        }
        if (el.docActiveImage) el.docActiveImage.style.display = 'none';
        this.applyZoom();
      },

      applyZoom() {
        if (el.docActiveCanvas) {
          el.docActiveCanvas.style.transform = `scale(${this.zoom})`;
        }
        if (el.docActiveImage) {
          el.docActiveImage.style.transform = `scale(${this.zoom})`;
        }
        if (el.docZoomVal) el.docZoomVal.textContent = `${Math.round(this.zoom * 100)}%`;
      },

      renderDefaultCheatsheetView() {
        if (!el.docActiveCanvas) return;
        this.isImage = false;
        this.totalPages = 0;
        this.currentPage = 0;
        if (el.docCurrentPage) el.docCurrentPage.textContent = '0';
        if (el.docTotalPages) el.docTotalPages.textContent = '0';
        if (el.btnDocPrev) el.btnDocPrev.disabled = true;
        if (el.btnDocNext) el.btnDocNext.disabled = true;

        const c = el.docActiveCanvas;
        c.width = 1100;
        c.height = 700;
        const ctx = c.getContext('2d');

        // Dark Blueprint Canvas background
        ctx.fillStyle = '#0E1217';
        ctx.fillRect(0, 0, c.width, c.height);

        // Header Title
        ctx.fillStyle = '#181E27';
        ctx.fillRect(0, 0, c.width, 60);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('CHEATSHEET PDF VIEWER • READY FOR UPLOAD', 30, 38);

        // Central Empty State Graphic
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.strokeRect(200, 140, 700, 420);
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(26, 98, 198, 0.08)';
        ctx.fillRect(202, 142, 696, 416);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('NO PLANOGRAM DOCUMENT ACTIVE', 550, 320);

        ctx.fillStyle = '#8C93A0';
        ctx.font = '14px sans-serif';
        ctx.fillText('Click "Upload Document" above to upload your store planogram PDF or slides.', 550, 360);
        ctx.fillText('Products, new lines, and fixture coordinates will be deployed across the app instantly.', 550, 390);

        ctx.textAlign = 'left';
        this.applyZoom();
      }
    };

    // Initialize document canvas viewer
    docViewer.renderDefaultCheatsheetView();

    // Document Viewer Toolbar Listeners
    if (el.btnDocPrev) {
      el.btnDocPrev.addEventListener('click', () => docViewer.renderPage(docViewer.currentPage - 1));
    }
    if (el.btnDocNext) {
      el.btnDocNext.addEventListener('click', () => docViewer.renderPage(docViewer.currentPage + 1));
    }
    if (el.btnDocZoomIn) {
      el.btnDocZoomIn.addEventListener('click', () => {
        docViewer.zoom = Math.min(2.5, docViewer.zoom + 0.25);
        docViewer.applyZoom();
      });
    }
    if (el.btnDocZoomOut) {
      el.btnDocZoomOut.addEventListener('click', () => {
        docViewer.zoom = Math.max(0.5, docViewer.zoom - 0.25);
        docViewer.applyZoom();
      });
    }
    if (el.btnDocFit) {
      el.btnDocFit.addEventListener('click', () => {
        docViewer.zoom = 1.0;
        docViewer.applyZoom();
      });
    }

    // Dynamic Rack & New Lines Section Filter Buttons
    function updateSectionFilters() {
      const items = planogram.getAllItems();
      const sections = [...new Set(items.map(it => it.section).filter(Boolean))];

      // Update Rack Section Selector
      if (el.sectionPillsRow) {
        if (sections.length === 0) {
          el.sectionPillsRow.innerHTML = '';
        } else {
          if (!sections.includes(state.activeSection)) {
            state.activeSection = sections[0];
          }
          el.sectionPillsRow.innerHTML = sections.map(sec => {
            const isActive = sec === state.activeSection ? 'active' : '';
            return `<button type="button" class="btn-section-pill ${isActive}" data-section="${escapeHtml(sec)}">${escapeHtml(sec)}</button>`;
          }).join('');

          el.sectionPillsRow.querySelectorAll('.btn-section-pill').forEach(btn => {
            btn.addEventListener('click', () => {
              el.sectionPillsRow.querySelectorAll('.btn-section-pill').forEach(b => b.classList.remove('active'));
              btn.classList.add('active');
              state.activeSection = btn.getAttribute('data-section');
              renderFullRackView(state.activeSection, el.rackSearchInput ? el.rackSearchInput.value : '');
            });
          });
        }
      }

      // Update New Lines Section Filter
      if (el.newlinesSectionFilter) {
        const bySection = planogram.getNewLinesBySection ? planogram.getNewLinesBySection() : {};
        const nlSections = Object.keys(bySection).filter(s => bySection[s].length > 0);
        if (nlSections.length === 0) {
          el.newlinesSectionFilter.innerHTML = '<button type="button" class="btn-section-pill active" data-filter="ALL">ALL NEW LINES</button>';
        } else {
          el.newlinesSectionFilter.innerHTML = `
            <button type="button" class="btn-section-pill ${state.newlinesFilter === 'ALL' ? 'active' : ''}" data-filter="ALL">ALL NEW LINES</button>
            ${nlSections.map(sec => {
              const isActive = sec === state.newlinesFilter ? 'active' : '';
              const shortName = sec.replace(' DENIM', '').replace(' ESSENTIALS', '');
              return `<button type="button" class="btn-section-pill ${isActive}" data-filter="${escapeHtml(sec)}">${escapeHtml(shortName)}</button>`;
            }).join('')}
          `;

          el.newlinesSectionFilter.querySelectorAll('.btn-section-pill').forEach(btn => {
            btn.addEventListener('click', () => {
              el.newlinesSectionFilter.querySelectorAll('.btn-section-pill').forEach(b => b.classList.remove('active'));
              btn.classList.add('active');
              state.newlinesFilter = btn.getAttribute('data-filter');
              renderNewLinesScreen();
            });
          });
        }
      }
    }

    // Dynamic Sample Codes Carousel & Simulator Presets
    function updatePresetsShelf() {
      const track = document.getElementById('presets-scroll-track');
      const modalPresetsGrid = document.getElementById('modal-presets-grid');
      const items = planogram.getAllItems();

      if (items.length === 0) {
        if (track) {
          track.innerHTML = `<span class="presets-empty-hint" style="font-size: 11.5px; color: var(--muted); padding: 4px 8px;">Upload a Planogram PDF in Cheatsheet Dock to activate test barcodes</span>`;
        }
        if (modalPresetsGrid) {
          modalPresetsGrid.innerHTML = `<span style="font-size: 11.5px; color: var(--muted); padding: 8px 4px; grid-column: 1 / -1;">Upload a Planogram PDF to activate test preset buttons</span>`;
        }
        return;
      }

      // Pick up to 8 sample items from the catalog
      const sampleItems = [];
      const newLines = items.filter(it => (it.newLine || '').toUpperCase() === 'YES');
      newLines.slice(0, 4).forEach(it => sampleItems.push(it));

      items.forEach(it => {
        if (sampleItems.length < 8 && !sampleItems.some(x => x.code === it.code)) {
          sampleItems.push(it);
        }
      });

      if (track) {
        track.innerHTML = sampleItems.map(it => {
          const isNL = (it.newLine || '').toUpperCase() === 'YES';
          const tag = `${it.section.split(' ')[0]} Pos ${it.position}${isNL ? ' (New Line)' : ''}`;
          return `
            <button type="button" class="chip-sample-code preset-code-btn" data-code="${escapeHtml(it.code)}" data-format="CODE_128">
              <span class="chip-tag">${escapeHtml(tag)}</span>
              <span class="chip-num">${escapeHtml(it.code)}</span>
            </button>
          `;
        }).join('');

        track.querySelectorAll('.preset-code-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const code = btn.getAttribute('data-code');
            const format = btn.getAttribute('data-format') || 'PRESET';
            handleScanEvent(code, format);
          });
        });
      }

      if (modalPresetsGrid) {
        modalPresetsGrid.innerHTML = sampleItems.map(it => {
          const secShort = it.section.split(' ')[0];
          return `
            <button type="button" class="btn-tool-chip preset-code-btn" data-code="${escapeHtml(it.code)}" data-format="CODE_128">
              ${escapeHtml(secShort)}: ${escapeHtml(it.code)} (${escapeHtml(it.color || 'Option ' + it.position)})
            </button>
          `;
        }).join('');

        modalPresetsGrid.querySelectorAll('.preset-code-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const code = btn.getAttribute('data-code');
            const format = btn.getAttribute('data-format') || 'PRESET';
            handleScanEvent(code, format);
            if (el.simModal) el.simModal.classList.remove('open');
          });
        });
      }
    }

    // 10. Document Upload & Multi-Tier AI/Canvas Extraction
    async function loadPdf(file) {
      if (!file) return;
      if (state.pdf.blobUrl) URL.revokeObjectURL(state.pdf.blobUrl);

      state.pdf.file = file;
      state.pdf.name = file.name;
      state.pdf.blobUrl = URL.createObjectURL(file);

      if (el.pdfNameLabel) el.pdfNameLabel.textContent = file.name;
      if (el.pdfSizeLabel) el.pdfSizeLabel.textContent = `Uploaded ${new Date().toLocaleTimeString()}`;
      if (el.pdfDocBadge) {
        const ext = file.name.split('.').pop().toUpperCase();
        el.pdfDocBadge.textContent = ext || 'DOC';
      }

      if (el.aiExtractProgress) el.aiExtractProgress.style.display = 'flex';
      showToast(`Loading document: ${file.name}...`, 'info');

      try {
        const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name);

        if (isImage) {
          const img = new Image();
          img.src = state.pdf.blobUrl;
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });

          await cropper.loadImageDocument(img);
          docViewer.displayImage(img);

          // If Gemini API Key is available, extract items with Vision!
          if (ai.hasApiKey()) {
            if (el.aiExtractStatusText) el.aiExtractStatusText.textContent = 'Gemini AI Vision analyzing slide...';
            const visionItems = await ai.extractPlanogramWithGeminiVision(cropper.getAllCanvases(), (c, t, m) => {
              if (el.aiExtractStatusText) el.aiExtractStatusText.textContent = m;
            });
            if (visionItems && visionItems.length > 0) {
              planogram.setItems(visionItems, file.name);
              updateNewLinesCounters();
              renderNewLinesScreen();
              updateSectionFilters();
              updatePresetsShelf();
              if (el.pdfSizeLabel) el.pdfSizeLabel.textContent = `1 Slide • ${visionItems.length} Products Indexed by AI`;
              showToast(`Slide Analyzed: ${visionItems.length} items extracted by Gemini Vision!`, 'success');
            } else {
              showToast('Slide loaded and ready for scanning', 'success');
            }
          } else {
            showToast('Slide loaded into dock', 'success');
          }
        } else {
          // PDF document
          const buffer = await file.arrayBuffer();

          // 1. Render all pages into canvases for visual cropping & viewer
          await cropper.loadPdfDocument(buffer);
          docViewer.isImage = false;
          docViewer.totalPages = cropper.getPageCount() || 1;
          await docViewer.renderPage(1);

          // 2. Parse Text with Multi-tier local extractor
          const res = await planogram.parsePdfFile(file);

          // 3. Update planogram status and storage
          if (el.pdfSizeLabel) {
            el.pdfSizeLabel.textContent = `${cropper.getPageCount()} Pages • ${res.count} Products Indexed & Active`;
          }
          db.saveLocalPlanogram(file.name, planogram.getAllItems());
          updateNewLinesCounters();
          renderNewLinesScreen();
          updateSectionFilters();
          updatePresetsShelf();
          if (planogram.getAllItems().length > 0) {
            state.activeSection = planogram.getAllItems()[0].section;
          }
          showToast(`PDF Analyzed: ${res.count} products indexed and active!`, 'success');

          // If Gemini API Key is available and document had pages with subset/scanned text, enrich with Vision
          if (ai.hasApiKey() && (res.extractedCount || 0) < 20) {
            ai.extractPlanogramWithGeminiVision(cropper.getAllCanvases()).then(visionItems => {
              if (visionItems && visionItems.length > 0) {
                const added = planogram.addItems(visionItems);
                if (added > 0) {
                  db.saveLocalPlanogram(file.name, planogram.getAllItems());
                  updateNewLinesCounters();
                  renderNewLinesScreen();
                  updateSectionFilters();
                  updatePresetsShelf();
                  if (el.pdfSizeLabel) {
                    el.pdfSizeLabel.textContent = `${cropper.getPageCount()} Pages • ${planogram.getTotalCount()} Products Indexed & Active`;
                  }
                }
              }
            }).catch(console.warn);
          }

          // 4. Proactive AI Vision Cropping for New Lines & Active Pages
          if (ai.hasApiKey()) {
            const allItems = planogram.getAllItems();
            const pagesToWarm = Array.from(new Set(allItems.map(it => it.page || 1))).slice(0, 4);
            (async () => {
              for (const p of pagesToWarm) {
                const pItems = allItems.filter(it => (it.page || 1) === p);
                await cropper.analyzePageWithAI(p, pItems);
              }
              // Refresh thumbnails in New Lines tab if open
              renderNewLinesScreen();
            })().catch(console.warn);
          }
        }

        if (el.aiExtractProgress) el.aiExtractProgress.style.display = 'none';
      } catch (err) {
        console.error('Document loading error:', err);
        if (el.aiExtractProgress) el.aiExtractProgress.style.display = 'none';
        showToast('Document loaded (ready for scan)', 'info');
      }
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
        state.pdf.name = '';
        state.pdf.blobUrl = null;
        state.pdf.sizeFormatted = 'No Document Active';
        state.activeSection = '';

        planogram.clear();
        cropper.clear();
        updateNewLinesCounters();
        renderNewLinesScreen();
        renderFullRackView('');
        updateSectionFilters();
        updatePresetsShelf();

        if (el.pdfNameLabel) el.pdfNameLabel.textContent = 'No Document Uploaded';
        if (el.pdfSizeLabel) el.pdfSizeLabel.textContent = '0 Pages • 0 Products Indexed';
        if (el.pdfDocBadge) el.pdfDocBadge.textContent = 'NO DOC';

        docViewer.renderDefaultCheatsheetView();
        showToast('Document removed. Catalog reset to 0.', 'info');
      });
    }

    // 10. Presets & Simulator Modal
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

    // 11. Image Barcode Decoder
    if (el.imageUpload) {
      el.imageUpload.addEventListener('change', async (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        showToast('Analyzing photo barcode...', 'info');
        const success = await scanner.decodeImageFile(file);
        if (!success) {
          showToast('No clear barcode detected in photo. Ensure tag is flat and well-lit.', 'error');
        }
        e.target.value = '';
      });
    }

    // 11B. Voice Barcode Detection & Speech Guidance
    const voice = window.voiceService;

    // Viewfinder Voice Barcode Scan Button
    if (el.btnVoiceScan) {
      el.btnVoiceScan.addEventListener('click', () => {
        if (!voice || !voice.isSpeechRecognitionSupported()) {
          showToast('Speech Recognition not supported in this browser. Use Chrome/Edge.', 'error');
          return;
        }

        if (voice.isListening()) {
          voice.stopListening();
          el.btnVoiceScan.classList.remove('listening');
          showToast('Voice scanning stopped', 'info');
          return;
        }

        el.btnVoiceScan.classList.add('listening');
        showToast('🎙️ Listening... Speak barcode digits (e.g. "301081626")', 'info');

        voice.startListening({
          onStart: () => {
            el.btnVoiceScan.classList.add('listening');
          },
          onResult: ({ transcript, code, isFinal }) => {
            if (code) {
              voice.stopListening();
              el.btnVoiceScan.classList.remove('listening');
              showToast(`Voice detected barcode: ${code}`, 'success');
              handleScanEvent(code, 'VOICE_DETECTED');
            } else if (isFinal && transcript) {
              voice.stopListening();
              el.btnVoiceScan.classList.remove('listening');
              const found = planogram.searchProducts(transcript);
              if (found && found.length > 0) {
                showToast(`Voice matched item: ${found[0].color} (${found[0].code})`, 'success');
                handleScanEvent(found[0].code, 'VOICE_SEARCH');
              } else {
                showToast(`Spoken: "${transcript}" (No digits detected)`, 'error');
              }
            }
          },
          onEnd: () => {
            el.btnVoiceScan.classList.remove('listening');
          },
          onError: (err) => {
            el.btnVoiceScan.classList.remove('listening');
            if (err === 'not-allowed') {
              showToast('Microphone access blocked. Please allow mic in browser settings.', 'error');
            } else if (err !== 'no-speech') {
              showToast(`Voice error: ${err}`, 'error');
            }
          }
        });
      });
    }

    // Modal Voice Barcode Input
    if (el.btnModalVoiceInput && el.manualInput) {
      el.btnModalVoiceInput.addEventListener('click', () => {
        if (!voice || !voice.isSpeechRecognitionSupported()) {
          showToast('Speech Recognition not supported in this browser.', 'error');
          return;
        }

        if (voice.isListening()) {
          voice.stopListening();
          el.btnModalVoiceInput.classList.remove('listening');
          return;
        }

        el.btnModalVoiceInput.classList.add('listening');
        showToast('🎙️ Speak barcode digits...', 'info');

        voice.startListening({
          onResult: ({ transcript, code, isFinal }) => {
            if (code) {
              el.manualInput.value = code;
              voice.stopListening();
              el.btnModalVoiceInput.classList.remove('listening');
              showToast(`Spoken Code: ${code}`, 'success');
            } else if (isFinal && transcript) {
              el.manualInput.value = transcript;
              voice.stopListening();
              el.btnModalVoiceInput.classList.remove('listening');
            }
          },
          onEnd: () => {
            el.btnModalVoiceInput.classList.remove('listening');
          },
          onError: (err) => {
            el.btnModalVoiceInput.classList.remove('listening');
            showToast(`Voice error: ${err}`, 'error');
          }
        });
      });
    }

    // Rack Map Voice Search
    if (el.btnRackVoiceSearch && el.rackSearchInput) {
      el.btnRackVoiceSearch.addEventListener('click', () => {
        if (!voice || !voice.isSpeechRecognitionSupported()) {
          showToast('Speech Recognition not supported in this browser.', 'error');
          return;
        }

        if (voice.isListening()) {
          voice.stopListening();
          el.btnRackVoiceSearch.classList.remove('listening');
          return;
        }

        el.btnRackVoiceSearch.classList.add('listening');
        showToast('🎙️ Speak search term (e.g. "White", "301081626")...', 'info');

        voice.startListening({
          onResult: ({ transcript, code, isFinal }) => {
            const query = code || transcript;
            el.rackSearchInput.value = query;
            el.rackSearchInput.dispatchEvent(new Event('input'));
            if (isFinal) {
              voice.stopListening();
              el.btnRackVoiceSearch.classList.remove('listening');
            }
          },
          onEnd: () => {
            el.btnRackVoiceSearch.classList.remove('listening');
          },
          onError: () => {
            el.btnRackVoiceSearch.classList.remove('listening');
          }
        });
      });
    }

    // AI Placement Read Aloud (TTS)
    if (el.btnSpeakPlacement && el.aiPlacementText) {
      el.btnSpeakPlacement.addEventListener('click', () => {
        if (!voice || !voice.isTtsSupported()) {
          showToast('Speech synthesis not available in this browser.', 'error');
          return;
        }

        if (voice.isSpeaking()) {
          voice.stopSpeaking();
          el.btnSpeakPlacement.classList.remove('speaking');
          if (el.ttsBtnLabel) el.ttsBtnLabel.textContent = 'Speak';
          return;
        }

        const textToRead = el.aiPlacementText.innerText || el.aiPlacementText.textContent;
        if (!textToRead) return;

        el.btnSpeakPlacement.classList.add('speaking');
        if (el.ttsBtnLabel) el.ttsBtnLabel.textContent = 'Stop';

        voice.speak(textToRead, {
          onEnd: () => {
            el.btnSpeakPlacement.classList.remove('speaking');
            if (el.ttsBtnLabel) el.ttsBtnLabel.textContent = 'Speak';
          },
          onError: () => {
            el.btnSpeakPlacement.classList.remove('speaking');
            if (el.ttsBtnLabel) el.ttsBtnLabel.textContent = 'Speak';
          }
        });
      });
    }

    // 12. Results Log List (Mobile Cards)
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

      // Mobile Cards
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

      // Desktop Table
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

      // Dynamic Action Listeners
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
        if (confirm('Clear all scanned records?')) {
          state.results = [];
          renderResultsList();
          showToast('Log cleared', 'info');
        }
      });
    }

    // CSV & JSON Exports
    if (el.btnExportCsv) {
      el.btnExportCsv.addEventListener('click', () => {
        if (state.results.length === 0) return;
        const headers = ['Index', 'Time', 'Format', 'Saved Code', 'Planogram Location', 'Trim Digits'];
        const rows = state.results.map((r, i) => [
          state.results.length - i,
          `"${r.timestamp}"`,
          `"${r.format}"`,
          `"${r.savedCode.replace(/"/g, '""')}"`,
          `"${r.locationInfo.replace(/"/g, '""')}"`,
          r.trimmedN
        ]);
        const csv = '\uFEFF' + [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');
        downloadFile(csv, `scan-dock-${Date.now()}.csv`, 'text/csv;charset=utf-8;');
        showToast('CSV export downloaded', 'success');
      });
    }

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

    // 13. AI Assistant Drawer
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
    let html = escapeHtml(text)
      .replace(/&amp;bull;/g, '•')
      .replace(/&amp;nbsp;/g, ' ')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

    // Convert ### headings into structured glassmorphic cards/headers
    html = html.replace(/(?:^|<br>|\n)###\s*(📍\s*KAHAN\s*LAGEGA[^\n<]*)/gi, '<div class="ai-vm-card kahan-card"><div class="ai-vm-badge kahan-badge">📍 KAHAN LAGEGA (Where to Place)</div><div class="ai-vm-body">');
    html = html.replace(/(?:^|<br>|\n)###\s*(👔\s*KAISE\s*LAGEGA[^\n<]*)/gi, '</div></div><div class="ai-vm-card kaise-card"><div class="ai-vm-badge kaise-badge">👔 KAISE LAGEGA (How to Display)</div><div class="ai-vm-body">');
    html = html.replace(/(?:^|<br>|\n)###\s*(💡\s*AI\s*(?:VM\s*)?TIPS[^\n<]*)/gi, '</div></div><div class="ai-vm-card tips-card"><div class="ai-vm-badge tips-badge">💡 AI VM TIPS &amp; RULES (PDF Research)</div><div class="ai-vm-body">');
    html = html.replace(/(?:^|<br>|\n)###\s*([^\n<]+)/gi, '</div></div><div class="ai-vm-card"><div class="ai-vm-badge">$1</div><div class="ai-vm-body">');

    if (html.includes('<div class="ai-vm-card')) {
      html += '</div></div>';
    }

    html = html.replace(/\n/g, '<br>');
    return html;
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
