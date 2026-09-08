/**
 * Voice Service Module — Speech-to-Text & Text-to-Speech Integration
 * 1. Real-time voice barcode & command detection via Web Speech API (SpeechRecognition)
 * 2. Voice readout for Gemini AI placement advice via SpeechSynthesis
 * 3. Handles multilingual spoken digits (English + Hindi number words)
 */
(function(window) {
  'use strict';

  // Mapping of number words to digits for English & Hindi
  const NUMBER_WORDS = {
    'zero': '0', 'oh': '0', 'shunya': '0', 'sunya': '0',
    'one': '1', 'won': '1', 'ek': '1',
    'two': '2', 'to': '2', 'too': '2', 'do': '2',
    'three': '3', 'teen': '3',
    'four': '4', 'for': '4', 'fore': '4', 'char': '4', 'chaar': '4',
    'five': '5', 'panch': '5', 'paanch': '5',
    'six': '6', 'chhe': '6', 'che': '6',
    'seven': '7', 'saat': '7',
    'eight': '8', 'ate': '8', 'aath': '8',
    'nine': '9', 'nau': '9'
  };

  class VoiceService {
    constructor() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognitionAvailable = Boolean(SpeechRecognition);
      this.recognition = null;
      this.isListeningActive = false;
      this.ttsAvailable = ('speechSynthesis' in window);
      this.currentUtterance = null;
      this.activeListeners = {
        onResult: null,
        onStart: null,
        onEnd: null,
        onError: null
      };

      if (this.recognitionAvailable) {
        try {
          this.recognition = new SpeechRecognition();
          this.recognition.continuous = false;
          this.recognition.interimResults = true;
          this.recognition.maxAlternatives = 3;
          this.recognition.lang = navigator.language || 'en-US';

          this.setupRecognitionEvents();
        } catch (e) {
          console.warn('SpeechRecognition initialization error:', e);
          this.recognitionAvailable = false;
        }
      }
    }

    setupRecognitionEvents() {
      if (!this.recognition) return;

      this.recognition.onstart = () => {
        this.isListeningActive = true;
        if (this.activeListeners.onStart) this.activeListeners.onStart();
      };

      this.recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        transcript = transcript.trim();

        const isFinal = event.results[event.results.length - 1].isFinal;
        const parsedCode = this.extractBarcodeFromText(transcript);

        if (this.activeListeners.onResult) {
          this.activeListeners.onResult({
            transcript,
            code: parsedCode,
            isFinal
          });
        }
      };

      this.recognition.onerror = (event) => {
        this.isListeningActive = false;
        console.warn('SpeechRecognition error:', event.error);
        if (this.activeListeners.onError) {
          this.activeListeners.onError(event.error);
        }
      };

      this.recognition.onend = () => {
        this.isListeningActive = false;
        if (this.activeListeners.onEnd) {
          this.activeListeners.onEnd();
        }
      };
    }

    /**
     * Converts spoken words into pure barcode digits
     * e.g., "three zero one zero eight one six two six" -> "301081626"
     * e.g., "code 301081626 please" -> "301081626"
     */
    extractBarcodeFromText(rawText) {
      if (!rawText) return '';

      // Normalize words
      const cleaned = rawText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
      const words = cleaned.split(/\s+/).filter(Boolean);

      let digitStr = '';
      for (const w of words) {
        if (/^\d+$/.test(w)) {
          digitStr += w;
        } else if (NUMBER_WORDS[w] !== undefined) {
          digitStr += NUMBER_WORDS[w];
        }
      }

      if (digitStr.length >= 4) {
        return digitStr;
      }

      // If no discrete sequence was found, extract any continuous digit sequence
      const match = rawText.match(/\d{4,15}/);
      if (match) return match[0];

      return digitStr || rawText.trim();
    }

    /**
     * Start listening for speech
     */
    startListening(options = {}) {
      if (!this.recognitionAvailable || !this.recognition) {
        if (options.onError) {
          options.onError('not-supported');
        }
        return false;
      }

      // If already speaking, cancel TTS
      this.stopSpeaking();

      this.activeListeners = {
        onResult: options.onResult || null,
        onStart: options.onStart || null,
        onEnd: options.onEnd || null,
        onError: options.onError || null
      };

      try {
        if (this.isListeningActive) {
          this.recognition.stop();
        }
        this.recognition.start();
        return true;
      } catch (err) {
        console.warn('Error starting speech recognition:', err);
        if (options.onError) options.onError(err.message || 'start-failed');
        return false;
      }
    }

    /**
     * Stop listening
     */
    stopListening() {
      if (this.recognition && this.isListeningActive) {
        try {
          this.recognition.stop();
        } catch (e) {
          console.warn('Error stopping recognition:', e);
        }
      }
      this.isListeningActive = false;
    }

    isListening() {
      return this.isListeningActive;
    }

    isSpeechRecognitionSupported() {
      return this.recognitionAvailable;
    }

    isTtsSupported() {
      return this.ttsAvailable;
    }

    /**
     * Speak text using Web Speech Synthesis
     */
    speak(text, options = {}) {
      if (!this.ttsAvailable || !window.speechSynthesis) {
        if (options.onError) options.onError('tts-not-supported');
        return false;
      }

      // Cancel any ongoing speech
      this.stopSpeaking();

      // Clean HTML tags and markdown formatting for clean narration
      const cleanText = text
        .replace(/<[^>]*>/g, ' ')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/📍|📌|💰|🎨|🗺️|📋|⚠️|💡/g, '')
        .replace(/&bull;/g, ', ')
        .replace(/&times;/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleanText) return false;

      try {
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = options.rate || 1.0;
        utterance.pitch = options.pitch || 1.0;
        utterance.lang = options.lang || 'en-US';

        // Prefer natural voices if available
        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          const preferred = voices.find(v => (v.lang.includes('en') || v.lang.includes('IN')) && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')));
          if (preferred) utterance.voice = preferred;
        }

        utterance.onend = () => {
          this.currentUtterance = null;
          if (options.onEnd) options.onEnd();
        };

        utterance.onerror = (e) => {
          this.currentUtterance = null;
          console.warn('TTS utterance error:', e);
          if (options.onError) options.onError(e);
        };

        this.currentUtterance = utterance;
        window.speechSynthesis.speak(utterance);
        return true;
      } catch (err) {
        console.warn('TTS speech execution error:', err);
        return false;
      }
    }

    /**
     * Stop speaking
     */
    stopSpeaking() {
      if (this.ttsAvailable && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      this.currentUtterance = null;
    }

    isSpeaking() {
      return Boolean(this.ttsAvailable && window.speechSynthesis && window.speechSynthesis.speaking);
    }
  }

  // Export as Singleton
  window.VoiceService = VoiceService;
  window.voiceService = new VoiceService();
})(window);
