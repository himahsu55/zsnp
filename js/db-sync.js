/**
 * Database & Storage Sync Module
 * Stores structured Cheatsheet planogram items in local storage / IndexedDB
 * and provides MongoDB Atlas Data API / REST endpoints sync.
 */
(function(window) {
  'use strict';

  class DbSync {
    constructor() {
      this.storageKey = 'scandock_planogram_db';
      this.mongoConfigKey = 'scandock_mongo_config';
    }

    saveLocalPlanogram(pdfName, items) {
      try {
        const payload = {
          pdfName,
          savedAt: new Date().toISOString(),
          totalCount: items.length,
          items
        };
        localStorage.setItem(this.storageKey, JSON.stringify(payload));
        return true;
      } catch (e) {
        console.warn('LocalStorage save failed:', e);
        return false;
      }
    }

    getLocalPlanogram() {
      try {
        const raw = localStorage.getItem(this.storageKey);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }

    saveMongoConfig(config) {
      try {
        localStorage.setItem(this.mongoConfigKey, JSON.stringify(config));
      } catch (e) {}
    }

    getMongoConfig() {
      try {
        const raw = localStorage.getItem(this.mongoConfigKey);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }
  }

  window.DbSync = DbSync;
})(window);
