const DEFAULT_API_KEY = "AQ.Ab8RN6KU0Z6CQCqxRjn3WeYrb5yIOm0ol8hXlHlUa4FfGUqp-A";

/**
 * CivicResolve - Single-Page Application Logic
 * Modern municipal complaint triage powered by Google Gemini API & localStorage
 */

// ==========================================================================
// Supported Gemini Models List (Edit here to change models across the entire app)
// ==========================================================================
const GEMINI_MODELS = [
  { id: 'gemini-flash-lite-latest', label: 'gemini-flash-lite-latest (Fast & Recommended)', isDefault: true },
  { id: 'gemini-flash-latest', label: 'gemini-flash-latest' },
  { id: 'gemini-pro-latest', label: 'gemini-pro-latest (High Intelligence)' },
  { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
  { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' }
];

const DEFAULT_GEMINI_MODEL = (GEMINI_MODELS.find(m => m.isDefault) || GEMINI_MODELS[0]).id;

// Request Timeout in Milliseconds (30 seconds)
const GEMINI_REQUEST_TIMEOUT_MS = 30000;

// Retry delays in milliseconds: 2s, 4s, 8s
const RETRY_DELAYS = [2000, 4000, 8000];

// ==========================================================================
// IndexedDB Photo Storage (Blobs keyed by complaint ID)
// ==========================================================================

const IDB_NAME = 'civicresolve_photos';
const IDB_STORE = 'photos';
const IDB_VERSION = 1;

function openPhotoDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

async function savePhotoToIDB(complaintId, blob) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(blob, complaintId);
    tx.oncomplete = () => resolve();
    tx.onerror = e => reject(e.target.error);
    tx.onabort = e => reject(e.target.error);
  });
}

async function loadPhotoFromIDB(complaintId) {
  try {
    const db = await openPhotoDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(complaintId);
      req.onsuccess = e => resolve(e.target.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (_) {
    return null;
  }
}

async function deletePhotoFromIDB(complaintId) {
  try {
    const db = await openPhotoDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(complaintId);
  } catch (_) {}
}

/**
 * Load a complaint's photo from IDB and return a temporary object URL.
 * Returns null if no photo exists or on any error.
 * Caller is responsible for revoking the URL when no longer needed.
 */
async function loadComplaintPhoto(complaintId) {
  try {
    const blob = await loadPhotoFromIDB(complaintId);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  } catch (_) {
    return null;
  }
}

/**
 * Returns the neutral SVG icon HTML to show when there is no photo.
 */
function neutralPhotoIcon(size = 28) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>`;
}

/**
 * Builds the HTML string for a photo thumbnail container.
 * After inserting into the DOM, call hydratePhotoThumbnails() to load images.
 */
function photoThumbHtml(complaintId, hasPhoto, extraClass = '', clickable = true) {
  const clickAttr = hasPhoto && clickable
    ? `onclick="openLightbox('${complaintId}')" role="button" tabindex="0" aria-label="View full-size photo"`
    : '';
  const hasPhotoClass = hasPhoto ? 'has-photo' : '';
  const loadingClass = hasPhoto ? 'thumb-loading' : '';
  return `<div class="photo-thumb-wrap ${extraClass} ${hasPhotoClass} ${loadingClass}"
               data-photo-id="${complaintId}"
               data-has-photo="${hasPhoto ? 'true' : 'false'}"
               ${clickAttr}>
    <img class="thumb-img" src="" alt="">
    <div class="thumb-placeholder">${neutralPhotoIcon()}</div>
  </div>`;
}

/**
 * Finds all [data-photo-id] elements in the DOM that have data-has-photo="true"
 * and loads their images from IndexedDB asynchronously.
 */
async function hydratePhotoThumbnails() {
  const thumbs = document.querySelectorAll('[data-photo-id][data-has-photo="true"]');
  for (const el of thumbs) {
    // Skip already-loaded thumbnails
    if (el.classList.contains('thumb-loaded')) continue;
    const id = el.dataset.photoId;
    const url = await loadComplaintPhoto(id);
    if (!url) {
      // No blob found — show neutral icon, stop loading animation
      el.classList.remove('thumb-loading');
      continue;
    }
    const img = el.querySelector('.thumb-img');
    if (!img) { URL.revokeObjectURL(url); continue; }
    img.onload = () => {
      el.classList.remove('thumb-loading');
      el.classList.add('thumb-loaded');
      // Revoke after a minute to free memory but keep image usable while visible
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      el.classList.remove('thumb-loading');
    };
    img.src = url;
  }
}

// ==========================================================================
// Lightbox
// ==========================================================================

async function openLightbox(complaintId) {
  const lb = document.getElementById('photo-lightbox');
  const img = document.getElementById('lightbox-img');
  if (!lb || !img) return;

  // Show backdrop immediately with a placeholder state
  img.src = '';
  lb.classList.remove('hidden');

  const url = await loadComplaintPhoto(complaintId);
  if (!url) {
    lb.classList.add('hidden');
    return;
  }

  img.onload = () => {
    // Revoke after a generous delay so the image stays visible
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    lb.classList.add('hidden');
  };
  img.src = url;
}

function closeLightbox() {
  const lb = document.getElementById('photo-lightbox');
  const img = document.getElementById('lightbox-img');
  if (lb) lb.classList.add('hidden');
  if (img) img.src = '';
}

/**
 * Normalizes model name to canonical 'models/model-name' format expected by Google Gemini REST APIs
 */
function formatModelPath(modelName) {
  if (!modelName) return `models/${DEFAULT_GEMINI_MODEL}`;
  const clean = modelName.trim().replace(/^models\//, '');
  return `models/${clean}`;
}
const formatModelName = formatModelPath;

/**
 * Returns a human-friendly model name without the 'models/' prefix
 */
function getDisplayModelName(modelName) {
  if (!modelName) return DEFAULT_GEMINI_MODEL;
  return modelName.trim().replace(/^models\//, '');
}

/**
 * Returns the alternate model when retries fail
 */
function getAlternateModel(currentModel) {
  const clean = getDisplayModelName(currentModel);
  if (clean === 'gemini-flash-lite-latest') {
    return 'gemini-flash-latest';
  } else {
    return 'gemini-flash-lite-latest';
  }
}

/**
 * Redacts any API key from URLs, error messages, and logs (replaces key with '**')
 */
function maskApiKey(text, apiKey) {
  if (!text) return '';
  let sanitized = String(text);
  if (apiKey && apiKey.trim().length > 0) {
    const rawKey = apiKey.trim();
    sanitized = sanitized.split(rawKey).join('**');
    const encodedKey = encodeURIComponent(rawKey);
    if (encodedKey !== rawKey) {
      sanitized = sanitized.split(encodedKey).join('**');
    }
  }
  // Mask any query parameter key=VALUE with key=**
  sanitized = sanitized.replace(/([?&]key=)[^&\s"'>]+/gi, '$1**');
  // Mask any header x-goog-api-key: VALUE with x-goog-api-key: **
  sanitized = sanitized.replace(/(x-goog-api-key[:=]\s*)[^\s,"'>]+/gi, '$1**');
  // Mask common Google API key pattern AIzaSy...
  sanitized = sanitized.replace(/AIzaSy[A-Za-z0-9_-]{20,}/g, '**');
  return sanitized;
}

/**
 * Creates an AbortController with a 30-second timeout
 */
function createFetchTimeout(timeoutMs = GEMINI_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error('TIMEOUT'));
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId)
  };
}

/**
 * Sends a generateContent request to Gemini API.
 * Automatically retries up to 3 times on 503, 429, or timeout with 2s, 4s, 8s backoff,
 * then automatically switches to the alternate model if retries on the primary model fail.
 */
async function sendGeminiRequestWithRetryAndFallback({
  apiKey,
  initialModel,
  body,
  onStatusUpdate = () => {}
}) {
  const modelsToTry = [
    initialModel || DEFAULT_GEMINI_MODEL,
    getAlternateModel(initialModel || DEFAULT_GEMINI_MODEL)
  ];

  let lastFailure = null;

  for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
    const activeModel = modelsToTry[mIdx];
    const displayModel = getDisplayModelName(activeModel);
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/${formatModelPath(activeModel)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
    const maskedUrl = `https://generativelanguage.googleapis.com/v1beta/${formatModelPath(activeModel)}:generateContent?key=**`;
    const isFallback = (mIdx > 0);

    if (isFallback) {
      onStatusUpdate(`Switched to alternate model '${displayModel}' after initial model failed.`);
    }

    // 1 initial attempt + 3 retries = 4 attempts max per model
    const maxAttempts = 1 + RETRY_DELAYS.length;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const attemptLabel = attempt === 1 
        ? `${displayModel}` 
        : `${displayModel} (Retry ${attempt - 1}/3)`;
      
      onStatusUpdate(`Requesting ${attemptLabel}...`);

      const { signal, cleanup } = createFetchTimeout(GEMINI_REQUEST_TIMEOUT_MS);
      const startTime = Date.now();

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey.trim()
          },
          body: JSON.stringify(body),
          signal: signal
        });

        const elapsed = Date.now() - startTime;

        if (!response.ok) {
          let errorText = '';
          try {
            const errJson = await response.json();
            errorText = errJson?.error?.message ? `${errJson.error.message} (status: ${errJson.error.status || response.status})` : JSON.stringify(errJson);
          } catch (_) {
            try {
              errorText = await response.text();
            } catch (_) {}
          }

          if (!errorText) {
            errorText = `HTTP ${response.status} ${response.statusText}`;
          }

          const sanitizedErrorText = maskApiKey(errorText, apiKey);
          const httpError = new Error(`HTTP ${response.status} ${response.statusText}: ${sanitizedErrorText}`);
          httpError.status = response.status;
          httpError.url = maskedUrl;
          httpError.model = displayModel;
          httpError.rawError = sanitizedErrorText;
          throw httpError;
        }

        const jsonResponse = await response.json();
        cleanup();

        // If fallback model succeeded, update storage & UI so it becomes the selected model
        if (isFallback) {
          localStorage.setItem(STORAGE_MODEL_KEY, activeModel);
          populateModelDropdown();
          updateApiStatusIndicator();
        }

        return {
          data: jsonResponse,
          modelUsed: displayModel,
          wasFallback: isFallback,
          originalModel: getDisplayModelName(initialModel),
          elapsedMs: elapsed,
          urlUsed: maskedUrl
        };

      } catch (err) {
        cleanup();

        const isTimeout = (err.name === 'AbortError' || signal.aborted || err.message === 'TIMEOUT');
        const is503 = (err.status === 503);
        const is429 = (err.status === 429);
        const isRetryable = isTimeout || is503 || is429;

        let fullErrorText = err.rawError || err.message || String(err);
        if (isTimeout) {
          fullErrorText = `Request timed out after ${GEMINI_REQUEST_TIMEOUT_MS / 1000} seconds. The Gemini API server did not respond.`;
        } else if (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) {
          fullErrorText = `Network Error (${err.message}). Unable to reach generativelanguage.googleapis.com.`;
        }

        lastFailure = {
          model: displayModel,
          url: maskedUrl,
          errorText: maskApiKey(fullErrorText, apiKey),
          status: err.status || (isTimeout ? 408 : 'NETWORK_ERROR'),
          isTimeout: isTimeout
        };

        // If retryable and we haven't exhausted our 3 retries:
        if (isRetryable && attempt <= RETRY_DELAYS.length) {
          const waitMs = RETRY_DELAYS[attempt - 1];
          const reasonTag = isTimeout ? 'Timed out (30s)' : `HTTP ${err.status}`;
          onStatusUpdate(`${reasonTag} on ${displayModel}. Retrying in ${waitMs / 1000}s (Attempt ${attempt}/3)...`);
          await new Promise(r => setTimeout(r, waitMs));
          continue; // retry attempt
        }

        // If not a retryable error (e.g. 400 Invalid Key, 403 Forbidden, 404 Model Not Found):
        if (!isRetryable) {
          throw lastFailure;
        }

        // If we exhausted all 3 retries on this model, break out to switch model
        break;
      }
    } // end attempts for this model

    // If first model failed all retries, inform user that we're switching models
    if (mIdx === 0 && modelsToTry.length > 1) {
      const nextModel = getDisplayModelName(modelsToTry[1]);
      onStatusUpdate(`All 3 retries on ${displayModel} failed. Automatically switching to other model: ${nextModel}...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  } // end models loop

  // If both models failed
  throw lastFailure;
}

// Storage Keys
const STORAGE_COMPLAINTS_KEY = 'civicresolve_complaints_v1';
const STORAGE_API_KEY = 'civicresolve_gemini_api_key';
const STORAGE_MODEL_KEY = 'civicresolve_gemini_model';

// Application State
let appState = {
  currentView: 'citizen', // 'citizen' | 'admin'
  complaints: [],
  selectedImageBase64: null,
  activeFilterStatusCitizen: 'ALL',
  adminFilters: {
    search: '',
    status: 'ALL',
    priority: 'ALL'
  },
  latestTriage: null
};

// ==========================================================================
// Sample Data Generator with Clean SVGs
// ==========================================================================

function createSvgPlaceholder(iconType, bgGradient, title) {
  let iconSvg = '';
  if (iconType === 'pothole') {
    iconSvg = `<circle cx="100" cy="75" r="35" fill="#334155" opacity="0.6"/>
               <ellipse cx="102" cy="78" width="45" height="20" fill="#0f172a"/>
               <path d="M50 85 Q90 100 150 85" stroke="#ef4444" stroke-width="4" stroke-dasharray="6,4"/>`;
  } else if (iconType === 'garbage') {
    iconSvg = `<rect x="65" y="45" width="70" height="65" rx="6" fill="#047857"/>
               <path d="M60 45 L140 45 L130 35 L70 35 Z" fill="#065f46"/>
               <line x1="85" y1="58" x2="85" y2="95" stroke="#ffffff" stroke-width="3"/>
               <line x1="100" y1="58" x2="100" y2="95" stroke="#ffffff" stroke-width="3"/>
               <line x1="115" y1="58" x2="115" y2="95" stroke="#ffffff" stroke-width="3"/>
               <circle cx="145" cy="40" r="8" fill="#f59e0b"/>`;
  } else if (iconType === 'light') {
    iconSvg = `<line x1="100" y1="30" x2="100" y2="120" stroke="#475569" stroke-width="8"/>
               <path d="M80 35 Q100 20 120 35 Z" fill="#334155"/>
               <polygon points="100,38 85,60 115,60" fill="#fef08a" opacity="0.4"/>
               <path d="M90 60 L110 60 L105 80 L95 80 Z" fill="#e2e8f0"/>
               <line x1="75" y1="35" x2="125" y2="75" stroke="#ef4444" stroke-width="3"/>`;
  } else if (iconType === 'water') {
    iconSvg = `<rect x="40" y="65" width="120" height="24" rx="4" fill="#0284c7"/>
               <ellipse cx="100" cy="65" rx="8" ry="4" fill="#38bdf8"/>
               <path d="M100 65 Q95 30 110 20 Q125 35 100 65" fill="#38bdf8" opacity="0.85"/>
               <circle cx="85" cy="35" r="4" fill="#38bdf8"/>
               <circle cx="120" cy="30" r="5" fill="#38bdf8"/>
               <ellipse cx="100" cy="100" rx="40" ry="10" fill="#0284c7" opacity="0.3"/>`;
  } else {
    // Damaged road
    iconSvg = `<rect x="30" y="30" width="140" height="90" rx="8" fill="#475569"/>
               <line x1="100" y1="30" x2="100" y2="120" stroke="#f8fafc" stroke-width="4" stroke-dasharray="10,8"/>
               <path d="M60 45 L85 75 L75 95 L95 110" stroke="#f59e0b" stroke-width="4" fill="none"/>
               <path d="M120 50 L135 70" stroke="#f59e0b" stroke-width="3" fill="none"/>`;
  }

  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150">
    <defs>
      <linearGradient id="bg_${iconType}" x1="0%" y1="0%" x2="100%" y2="100%">
        ${bgGradient}
      </linearGradient>
    </defs>
    <rect width="200" height="150" fill="url(#bg_${iconType})"/>
    ${iconSvg}
    <text x="100" y="138" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto" font-size="11" font-weight="600" fill="#ffffff" text-anchor="middle" opacity="0.9">${title}</text>
  </svg>`;

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
}

function getInitialSampleComplaints() {
  const now = Date.now();
  const ONE_HOUR = 3600 * 1000;
  const ONE_DAY = 24 * ONE_HOUR;

  return [
    {
      id: 'CR-1001',
      title: 'Hazardous deep pothole on Main Street near 5th Ave',
      category: 'Roads & Infrastructure',
      description: 'Severe 8-inch deep cavity in the right northbound lane. Vehicles are violently jarring and swerving dangerously into oncoming traffic to avoid rim punctures.',
      location: 'Main St & 5th Avenue crossing (Northbound)',
      status: 'In Progress',
      priority: 'High',
      reason: 'Deep road cavity poses immediate hazard to vehicles and two-wheeler cyclists.',
      recommended_department: 'Department of Public Works (Road Maintenance)',
      createdAt: new Date(now - 3 * ONE_HOUR).toISOString(),
      updatedAt: new Date(now - 1 * ONE_HOUR).toISOString(),
      timeline: [
        { status: 'Reported', timestamp: new Date(now - 3 * ONE_HOUR).toISOString() },
        { status: 'In Progress', timestamp: new Date(now - 1 * ONE_HOUR).toISOString() }
      ],
      hasPhoto: false
    },
    {
      id: 'CR-1002',
      title: 'Overflowing commercial waste dumpster behind Central Market',
      category: 'Sanitation & Waste',
      description: 'The communal municipal garbage dumpster has been overflowing onto the pedestrian pathway for two days, attracting rodents, stray animals, and generating severe odor.',
      location: 'Central Market Back Alley, Stall #18',
      status: 'Reported',
      priority: 'Medium',
      reason: 'Accumulated solid waste causes hygienic concern and odor in residential zone.',
      recommended_department: 'Bureau of Sanitation & Waste Management',
      createdAt: new Date(now - 6 * ONE_HOUR).toISOString(),
      updatedAt: new Date(now - 6 * ONE_HOUR).toISOString(),
      timeline: [
        { status: 'Reported', timestamp: new Date(now - 6 * ONE_HOUR).toISOString() }
      ],
      hasPhoto: false
    },
    {
      id: 'CR-1003',
      title: 'Dark pedestrian crosswalk due to broken streetlight',
      category: 'Street Lighting',
      description: 'Streetlight pole #42 outside the elementary school has been flickering and completely extinguished for three nights, creating a dark pedestrian danger zone.',
      location: 'Westside Elementary School Crosswalk, 8th Ave',
      status: 'In Progress',
      priority: 'Medium',
      reason: 'Unlit intersection reduces nighttime pedestrian visibility near school zone.',
      recommended_department: 'Municipal Bureau of Street Lighting',
      createdAt: new Date(now - 1 * ONE_DAY).toISOString(),
      updatedAt: new Date(now - 4 * ONE_HOUR).toISOString(),
      timeline: [
        { status: 'Reported', timestamp: new Date(now - 1 * ONE_DAY).toISOString() },
        { status: 'In Progress', timestamp: new Date(now - 4 * ONE_HOUR).toISOString() }
      ],
      hasPhoto: false
    },
    {
      id: 'CR-1004',
      title: 'High-pressure water main burst flooding roadway and sidewalk',
      category: 'Water & Sewage',
      description: 'Potable water main ruptured beneath sidewalk curb, gushing high-volume water across two lanes of traffic and threatening foundation washout.',
      location: '240 Grand Avenue near Central Station',
      status: 'Reported',
      priority: 'Critical',
      reason: 'High-pressure water loss and severe roadway foundation flooding posing immediate structural hazard.',
      recommended_department: 'Municipal Water & Sewer Authority',
      createdAt: new Date(now - 45 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 45 * 60 * 1000).toISOString(),
      timeline: [
        { status: 'Reported', timestamp: new Date(now - 45 * 60 * 1000).toISOString() }
      ],
      hasPhoto: false
    },
    {
      id: 'CR-1005',
      title: 'Cracked asphalt and crumbling road shoulder along Riverbank Way',
      category: 'Roads & Infrastructure',
      description: 'Extensive alligator cracking and edge subsidence across a 150-meter strip. No deep holes yet, but asphalt is degrading from winter runoff.',
      location: 'Riverbank Way, Mile Marker 4',
      status: 'Resolved',
      priority: 'Low',
      reason: 'Non-emergency structural surface wear requiring scheduled milling and resurfacing.',
      recommended_department: 'Highway Maintenance Division',
      createdAt: new Date(now - 3 * ONE_DAY).toISOString(),
      updatedAt: new Date(now - 1 * ONE_DAY).toISOString(),
      timeline: [
        { status: 'Reported', timestamp: new Date(now - 3 * ONE_DAY).toISOString() },
        { status: 'In Progress', timestamp: new Date(now - 2 * ONE_DAY).toISOString() },
        { status: 'Resolved', timestamp: new Date(now - 1 * ONE_DAY).toISOString() }
      ],
      hasPhoto: false
    }
  ];
}

// ==========================================================================
// Initialization & LocalStorage Management
// ==========================================================================

function loadComplaints() {
  try {
    const rawData = localStorage.getItem(STORAGE_COMPLAINTS_KEY);
    if (!rawData) {
      const initial = getInitialSampleComplaints();
      saveComplaints(initial);
      return initial;
    }
    let parsed = JSON.parse(rawData);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const initial = getInitialSampleComplaints();
      saveComplaints(initial);
      return initial;
    }
    // Strip old base64/SVG 'image' field from every record; ensure hasPhoto flag exists
    // Also ensure timeline exists with believable timestamps for older records
    parsed = parsed.map(c => {
      const { image, ...rest } = c; // drop old image field (never stored in localStorage now)
      if (!('hasPhoto' in rest)) rest.hasPhoto = false;

      if (!Array.isArray(rest.timeline) || rest.timeline.length === 0) {
        const created = rest.createdAt || new Date().toISOString();
        const updated = rest.updatedAt || created;
        const tl = [{ status: 'Reported', timestamp: created }];
        if (rest.status === 'In Progress') {
          tl.push({ status: 'In Progress', timestamp: updated });
        } else if (rest.status === 'Resolved') {
          const tCreated = new Date(created).getTime();
          const tUpdated = new Date(updated).getTime();
          const mid = new Date(tCreated + (tUpdated - tCreated) * 0.5).toISOString();
          tl.push({ status: 'In Progress', timestamp: mid });
          tl.push({ status: 'Resolved', timestamp: updated });
        }
        rest.timeline = tl;
      }
      return rest;
    });
    return parsed;
  } catch (e) {
    console.error('Error loading complaints from localStorage:', e);
    const initial = getInitialSampleComplaints();
    return initial;
  }
}

function saveComplaints(complaints) {
  try {
    localStorage.setItem(STORAGE_COMPLAINTS_KEY, JSON.stringify(complaints));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
    showToast('Storage Limit', 'Could not save report image due to browser storage limits.', 'error');
  }
}

function getStoredApiKey() {
  return localStorage.getItem(STORAGE_API_KEY) || (DEFAULT_API_KEY.indexOf('PASTE') === 0 ? '' : DEFAULT_API_KEY);
}

function getStoredModel() {
  const stored = localStorage.getItem(STORAGE_MODEL_KEY);
  const isValid = GEMINI_MODELS.some(m => m.id === stored);
  if (stored && isValid) {
    return stored;
  }
  // Automatically fallback/upgrade old deprecated models (e.g. gemini-1.5-flash) to default
  localStorage.setItem(STORAGE_MODEL_KEY, DEFAULT_GEMINI_MODEL);
  return DEFAULT_GEMINI_MODEL;
}

function populateModelDropdown() {
  const select = document.getElementById('gemini-model-select');
  if (!select) return;
  const currentModel = getStoredModel();
  select.innerHTML = GEMINI_MODELS.map(m => `
    <option value="${m.id}" ${m.id === currentModel ? 'selected' : ''}>
      ${escapeHtml(m.label)}
    </option>
  `).join('');
  updateTestButtonLabel();
}

function handleModelChange() {
  updateTestButtonLabel();
}

function updateTestButtonLabel() {
  const select = document.getElementById('gemini-model-select');
  const testText = document.getElementById('test-btn-text');
  if (testText) {
    const selectedModel = select ? select.value : getStoredModel();
    testText.textContent = `Test Key (${getDisplayModelName(selectedModel)})`;
  }
}

function updateApiStatusIndicator() {
  const apiKey = getStoredApiKey();
  const badge = document.getElementById('api-status-badge');
  const badgeText = document.getElementById('api-status-text');
  const banner = document.getElementById('api-reminder-banner');

  if (apiKey && apiKey.trim().length > 5) {
    badge.className = 'api-status-pill configured';
    badgeText.textContent = `Gemini: Active (${getStoredModel().replace('gemini-', '')})`;
    banner.classList.add('hidden');
  } else {
    badge.className = 'api-status-pill unconfigured';
    badgeText.textContent = 'Gemini: Key Needed';
    banner.classList.remove('hidden');
  }
}

// ==========================================================================
// View Switching Logic (Citizen vs Admin)
// ==========================================================================

function switchView(viewName) {
  appState.currentView = viewName;

  const citizenSection = document.getElementById('citizen-view');
  const adminSection = document.getElementById('admin-view');
  const citizenBtn = document.getElementById('view-citizen-btn');
  const adminBtn = document.getElementById('view-admin-btn');

  if (viewName === 'citizen') {
    citizenSection.classList.add('active');
    adminSection.classList.remove('active');
    citizenBtn.classList.add('active');
    citizenBtn.setAttribute('aria-selected', 'true');
    adminBtn.classList.remove('active');
    adminBtn.setAttribute('aria-selected', 'false');
    renderCitizenComplaints();
  } else {
    citizenSection.classList.remove('active');
    adminSection.classList.add('active');
    citizenBtn.classList.remove('active');
    citizenBtn.setAttribute('aria-selected', 'false');
    adminBtn.classList.add('active');
    adminBtn.setAttribute('aria-selected', 'true');
    renderAdminComplaints();
  }
}

// ==========================================================================
// Image Upload & Preview Handler
// ==========================================================================

function handleImageSelection(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Invalid File', 'Please upload an image file (PNG, JPG, WebP).', 'error');
    return;
  }

  // Compress / read via canvas to avoid bloating localStorage
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      // Resize to reasonable maximum bounds (max 1000px width/height)
      const maxDim = 1000;
      let width = img.width;
      let height = img.height;

      if (width > height && width > maxDim) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else if (height > maxDim) {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
      appState.selectedImageBase64 = compressedDataUrl;

      // Update UI preview
      document.getElementById('image-preview').src = compressedDataUrl;
      document.getElementById('image-preview-container').classList.remove('hidden');
      document.getElementById('dropzone-placeholder').classList.add('hidden');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeSelectedImage() {
  appState.selectedImageBase64 = null;
  document.getElementById('comp-image').value = '';
  document.getElementById('image-preview').src = '';
  document.getElementById('image-preview-container').classList.add('hidden');
  document.getElementById('dropzone-placeholder').classList.remove('hidden');
}

// Geolocation helper
function detectUserLocation() {
  const locInput = document.getElementById('comp-location');
  if (!navigator.geolocation) {
    showToast('GPS Unavailable', 'Geolocation is not supported by your browser.', 'info');
    return;
  }

  showToast('Locating...', 'Detecting your coordinates...', 'info');
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude.toFixed(5);
      const lng = position.coords.longitude.toFixed(5);
      locInput.value = `Near Lat ${lat}, Lng ${lng} (Auto-detected)`;
      showToast('Location Set', 'Captured GPS coordinates.', 'success');
    },
    (err) => {
      console.warn('Geolocation error:', err);
      showToast('Location Notice', 'Could not obtain exact GPS. Please type your street address.', 'info');
    },
    { timeout: 7000 }
  );
}

// ==========================================================================
// Gemini API Integration & Heuristic Fallback
// ==========================================================================

/**
 * Sends complaint to Google Gemini API
 * Expects JSON output with category, priority, reason, recommended_department
 */
async function callGeminiTriageAPI(complaintData) {
  const apiKey = getStoredApiKey();
  const selectedModel = getStoredModel();

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('NO_API_KEY');
  }

  // System and context prompt
  const systemPrompt = `You are an expert municipal civic triage AI for the city operations center.
Analyze the citizen complaint below and evaluate its urgency, public safety risk, and infrastructure impact.

Complaint Details:
- Title: ${complaintData.title}
- Citizen Selected Category: ${complaintData.category}
- Location: ${complaintData.location}
- Description: ${complaintData.description}

You MUST return ONLY a valid JSON object matching this schema without any markdown formatting or commentary:
{
  "category": "One of [Roads & Infrastructure, Sanitation & Waste, Street Lighting, Water & Sewage, Public Safety, Parks & Recreation, Traffic & Transit, Other]",
  "priority": "Low" | "Medium" | "High" | "Critical",
  "reason": "A precise, one-line justification for this priority level based on public safety, urgency, and citizen impact.",
  "recommended_department": "Name of appropriate municipal department (e.g., Department of Public Works, Water & Sewer Authority, Bureau of Sanitation, Bureau of Street Lighting, Department of Transportation, Police/Fire Safety)"
}

Guidelines for Priority:
- Critical: Imminent danger to life/limb, burst major water mains, structural collapses, live electrical hazards, active road cave-ins.
- High: Severe hazards, deep potholes on high-speed roads, open manholes, non-working traffic lights at busy intersections.
- Medium: Standard maintenance defects, overflowing garbage, broken streetlights in quiet areas, non-blocking street debris.
- Low: Cosmetic wear, faded road markings, routine park maintenance, minor graffiti.`;

  // Build request payload
  const parts = [{ text: systemPrompt }];

  // If user provided photo evidence, include multimodal inlineData
  if (complaintData.imageBase64 && complaintData.imageBase64.startsWith('data:image/')) {
    try {
      const mimeMatch = complaintData.imageBase64.match(/^data:([^;]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const base64Data = complaintData.imageBase64.split(',')[1];
      if (base64Data) {
        parts.push({
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        });
      }
    } catch (err) {
      console.warn('Could not attach image to Gemini payload:', err);
    }
  }

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: parts
      }
    ],
    generationConfig: {
      temperature: 0.2
    }
  };

  const submitText = document.getElementById('submit-btn-text');

  const result = await sendGeminiRequestWithRetryAndFallback({
    apiKey: apiKey,
    initialModel: selectedModel,
    body: requestBody,
    onStatusUpdate: (msg) => {
      if (submitText) submitText.textContent = msg;
    }
  });

  const rawText = result.data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    throw {
      model: result.modelUsed,
      url: result.urlUsed,
      errorText: 'Empty response candidates returned from Gemini API.'
    };
  }

  // Parse JSON response (clearing any markdown ticks if present)
  let cleanedText = rawText.trim();
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  let parsed;
  try {
    parsed = JSON.parse(cleanedText);
  } catch (parseErr) {
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw {
        model: result.modelUsed,
        url: result.urlUsed,
        errorText: `Failed to parse JSON response: ${rawText.slice(0, 150)}`
      };
    }
  }

  // Validate fields
  return {
    category: parsed.category || complaintData.category,
    priority: normalizePriority(parsed.priority),
    reason: parsed.reason || 'Assessed by municipal AI triage protocol.',
    recommended_department: parsed.recommended_department || getDepartmentForCategory(complaintData.category),
    modelUsed: result.modelUsed,
    wasFallback: result.wasFallback
  };
}

function normalizePriority(val) {
  if (!val) return 'Medium';
  const clean = val.trim();
  if (/^critical$/i.test(clean)) return 'Critical';
  if (/^high$/i.test(clean)) return 'High';
  if (/^medium$/i.test(clean)) return 'Medium';
  if (/^low$/i.test(clean)) return 'Low';
  return 'Medium';
}

function getDepartmentForCategory(category) {
  switch (category) {
    case 'Roads & Infrastructure': return 'Department of Public Works';
    case 'Sanitation & Waste': return 'Bureau of Sanitation & Waste Management';
    case 'Street Lighting': return 'Municipal Bureau of Street Lighting';
    case 'Water & Sewage': return 'Municipal Water & Sewer Authority';
    case 'Public Safety': return 'Department of Public Safety & Civil Defense';
    case 'Parks & Recreation': return 'Parks and Greenspace Bureau';
    case 'Traffic & Transit': return 'Transportation & Traffic Management';
    default: return 'City Municipal Operations Center';
  }
}

/**
 * Intelligent Fallback Triage (when Gemini call fails or API key is absent)
 */
function heuristicFallbackTriage(complaintData) {
  const text = (complaintData.title + ' ' + complaintData.description).toLowerCase();
  let priority = 'Medium';
  let reason = 'Standard municipal queue dispatch.';

  if (text.includes('burst') || text.includes('rupture') || text.includes('collapse') || text.includes('fire') || text.includes('hazard') || text.includes('danger') || text.includes('flood')) {
    priority = 'Critical';
    reason = 'Urgent public safety and property damage threat flagged by automated triage rule.';
  } else if (text.includes('pothole') || text.includes('traffic') || text.includes('severe') || text.includes('broken light') || text.includes('pedestrian')) {
    priority = 'High';
    reason = 'Active civic infrastructure defect requiring accelerated dispatch.';
  } else if (text.includes('garbage') || text.includes('trash') || text.includes('odor') || text.includes('leak') || text.includes('light')) {
    priority = 'Medium';
    reason = 'Standard utility/sanitation maintenance priority based on citizen report.';
  } else {
    priority = 'Low';
    reason = 'Routine municipal maintenance and inspection schedule.';
  }

  return {
    category: complaintData.category,
    priority: priority,
    reason: reason,
    recommended_department: getDepartmentForCategory(complaintData.category)
  };
}

// ==========================================================================
// Complaint Submission Flow
// ==========================================================================

async function handleComplaintSubmit(event) {
  event.preventDefault();

  const titleInput = document.getElementById('comp-title');
  const catInput = document.getElementById('comp-category');
  const locInput = document.getElementById('comp-location');
  const descInput = document.getElementById('comp-description');
  const submitBtn = document.getElementById('submit-btn');
  const submitSpinner = document.getElementById('submit-spinner');
  const submitText = document.getElementById('submit-btn-text');

  const title = titleInput.value.trim();
  const category = catInput.value;
  const location = locInput.value.trim();
  const description = descInput.value.trim();

  if (!title || !category || !location || !description) {
    showToast('Missing Fields', 'Please complete all required fields.', 'error');
    return;
  }

  // Set loading state
  submitBtn.disabled = true;
  submitSpinner.classList.remove('hidden');
  submitText.textContent = 'Analyzing with Gemini AI...';

  const newId = 'CR-' + Math.floor(1000 + Math.random() * 9000);
  const complaintDraft = {
    id: newId,
    title,
    category,
    location,
    description,
    imageBase64: appState.selectedImageBase64 || null
  };

  let triageResult;
  let usedAi = false;

  try {
    triageResult = await callGeminiTriageAPI(complaintDraft);
    usedAi = true;
    const modelNote = triageResult.wasFallback 
      ? ` (Switched to ${triageResult.modelUsed})` 
      : ` (${triageResult.modelUsed})`;
    showToast('AI Triage Complete', `Gemini categorized this as ${triageResult.priority} priority${modelNote}!`, 'success');
  } catch (err) {
    const rawKey = getStoredApiKey();
    const model = err.model || getStoredModel();
    const safeUrl = maskApiKey(err.url, rawKey);
    const safeReason = maskApiKey(err.errorText || err.message || String(err), rawKey);

    console.warn(`Gemini triage fallback triggered for ${model}: ${safeReason}`);

    let friendlyMsg = '';
    if (err.message === 'NO_API_KEY') {
      friendlyMsg = 'Gemini API Key is missing. Stored report with automatic default triage. Paste your key in Settings to unlock real-time Gemini analysis.';
    } else {
      const urlText = safeUrl ? ` | URL: ${safeUrl}` : '';
      friendlyMsg = `Model: ${model}${urlText} | Error: ${safeReason}. Default fallback triage assigned.`;
    }

    showToast('Triage Notice', friendlyMsg, 'error');
    triageResult = heuristicFallbackTriage(complaintDraft);
  } finally {
    // Reset loading state
    submitBtn.disabled = false;
    submitSpinner.classList.add('hidden');
    submitText.textContent = 'Submit & Analyze with Gemini';
  }

  // Finalize complaint object
  // Save photo to IndexedDB (never to localStorage)
  let hasPhoto = false;
  if (appState.selectedImageBase64) {
    try {
      const res = await fetch(appState.selectedImageBase64);
      const blob = await res.blob();
      await savePhotoToIDB(newId, blob);
      hasPhoto = true;
    } catch (saveErr) {
      console.warn('Could not save photo to IndexedDB:', saveErr);
      showToast('Photo Save Failed', 'Could not save your photo to local storage. The complaint was saved without it.', 'error');
    }
  }

  const nowIso = new Date().toISOString();
  const newComplaint = {
    id: newId,
    title: title,
    category: triageResult.category || category,
    description: description,
    location: location,
    status: 'Reported',
    priority: triageResult.priority,
    reason: triageResult.reason,
    recommended_department: triageResult.recommended_department,
    createdAt: nowIso,
    updatedAt: nowIso,
    timeline: [
      { status: 'Reported', timestamp: nowIso }
    ],
    hasPhoto: hasPhoto,
    triagedByAi: usedAi
  };

  // Prepend to complaints array
  appState.complaints.unshift(newComplaint);
  saveComplaints(appState.complaints);

  // Update spotlight card
  renderSpotlightCard(newComplaint);

  // Clear Form
  document.getElementById('complaint-form').reset();
  removeSelectedImage();

  // Re-render list
  renderCitizenComplaints();
  updateHeaderCounts();
}

// ==========================================================================
// Rendering: Citizen View
// ==========================================================================

function renderSpotlightCard(complaint) {
  const container = document.getElementById('spotlight-body');
  const timestampSpan = document.getElementById('spotlight-timestamp');

  if (!complaint) {
    container.innerHTML = `
      <div class="spotlight-welcome">
        <p>Submit a new complaint or click any complaint from the list below to inspect Gemini's priority rating, public safety reason, and department assignment.</p>
      </div>
    `;
    timestampSpan.textContent = 'Ready for Inspection';
    return;
  }

  timestampSpan.textContent = `Analyzed for ${complaint.id}`;

  const prioClass = `badge-prio-${complaint.priority.toLowerCase()}`;
  const statusClass = `badge-status-${complaint.status.toLowerCase().replace(' ', '-')}`;

  container.innerHTML = `
    <div style="margin-bottom: 0.85rem;">
      <h3 style="font-size: 1.15rem; color: #0f172a; margin-bottom: 0.25rem;">${escapeHtml(complaint.title)}</h3>
      <p style="font-size: 0.8125rem; color: #64748b;">${escapeHtml(complaint.location)} &bull; Reported ${timeAgo(complaint.createdAt)}</p>
    </div>

    <div class="ai-verdict-grid">
      <div class="ai-verdict-cell">
        <span class="ai-verdict-label">Assessed Priority</span>
        <div class="ai-verdict-value">
          <span class="badge ${prioClass}">${complaint.priority}</span>
        </div>
      </div>
      <div class="ai-verdict-cell">
        <span class="ai-verdict-label">Assigned Department</span>
        <div class="ai-verdict-value" style="font-size: 0.875rem;">
          ${escapeHtml(complaint.recommended_department)}
        </div>
      </div>
      <div class="ai-verdict-cell">
        <span class="ai-verdict-label">Verified Category</span>
        <div class="ai-verdict-value" style="font-size: 0.875rem;">
          ${escapeHtml(complaint.category)}
        </div>
      </div>
      <div class="ai-verdict-cell">
        <span class="ai-verdict-label">Current Status</span>
        <div class="ai-verdict-value">
          <span class="badge ${statusClass}">${complaint.status}</span>
        </div>
      </div>
    </div>

    <div class="ai-reason-quote">
      <div class="ai-reason-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        AI Urgency & Public Safety Assessment
      </div>
      <p class="ai-reason-text">"${escapeHtml(complaint.reason)}"</p>
    </div>
  `;
}

// ==========================================================================
// Status Timeline Helpers & Rendering
// ==========================================================================

/**
 * Formats an ISO date string into a friendly localized timeline date and time.
 * e.g., "Nov 21, 10:30 AM"
 */
function formatTimelineDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return '';
  const isDifferentYear = d.getFullYear() !== new Date().getFullYear();
  const datePart = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(isDifferentYear ? { year: 'numeric' } : {})
  });
  const timePart = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  });
  return `${datePart}, ${timePart}`;
}

/**
 * Returns the latest recorded timestamp for a specific status on a complaint.
 */
function getTimelineTimestamp(comp, stepName) {
  if (Array.isArray(comp.timeline)) {
    for (let i = comp.timeline.length - 1; i >= 0; i--) {
      if (comp.timeline[i] && comp.timeline[i].status === stepName && comp.timeline[i].timestamp) {
        return comp.timeline[i].timestamp;
      }
    }
  }
  // Fallback to createdAt / updatedAt
  if (stepName === 'Reported') return comp.createdAt || null;
  if (stepName === 'In Progress' && (comp.status === 'In Progress' || comp.status === 'Resolved')) {
    return comp.updatedAt || comp.createdAt || null;
  }
  if (stepName === 'Resolved' && comp.status === 'Resolved') {
    return comp.updatedAt || comp.createdAt || null;
  }
  return null;
}

/**
 * Generates the HTML for the small vertical status timeline on a Citizen card.
 */
function renderCardTimeline(comp) {
  const steps = ['Reported', 'In Progress', 'Resolved'];
  const currentStatus = comp.status || 'Reported';

  const statusRank = {
    'Reported': 0,
    'In Progress': 1,
    'Resolved': 2
  };
  const currentRank = statusRank[currentStatus] ?? 0;

  const stepsHtml = steps.map((stepName, idx) => {
    const isCompleted = idx <= currentRank;
    const isCurrent = idx === currentRank;
    const isLast = idx === steps.length - 1;
    const isLineCompleted = idx < currentRank;

    let stepClass = 'timeline-step';
    if (isCompleted) {
      stepClass += ' completed';
      if (currentStatus === 'Resolved') {
        stepClass += ' resolved';
      } else if (currentStatus === 'In Progress' && isCurrent) {
        stepClass += ' in-progress';
      }
    } else {
      stepClass += ' pending';
    }

    const timestamp = getTimelineTimestamp(comp, stepName);
    const dateText = isCompleted && timestamp
      ? escapeHtml(formatTimelineDate(timestamp))
      : '<span class="timeline-date-pending">Pending</span>';

    const lineHtml = !isLast
      ? `<span class="timeline-line ${isLineCompleted ? 'completed-line' : ''}"></span>`
      : '';

    return `
      <div class="${stepClass}">
        <div class="timeline-node">
          <span class="timeline-dot"></span>
          ${lineHtml}
        </div>
        <div class="timeline-content">
          <span class="timeline-label">${escapeHtml(stepName)}</span>
          <span class="timeline-date">${dateText}</span>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="card-timeline-wrap">
      <div class="timeline-header">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        Status Timeline
      </div>
      <div class="vertical-timeline">
        ${stepsHtml}
      </div>
    </div>
  `;
}

function renderCitizenComplaints() {
  const listContainer = document.getElementById('citizen-complaints-list');
  const filterSelect = document.getElementById('citizen-filter-status');
  const selectedStatus = filterSelect.value;

  let filtered = appState.complaints;
  if (selectedStatus !== 'ALL') {
    filtered = filtered.filter(c => c.status === selectedStatus);
  }

  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <div class="card empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
        <h4>No Complaints Found</h4>
        <p>No complaints match the filter "${selectedStatus}".</p>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = filtered.map(comp => {
    const prioClass = `badge-prio-${comp.priority.toLowerCase()}`;
    const statusClass = `badge-status-${comp.status.toLowerCase().replace(' ', '-')}`;
    const thumbHtml = photoThumbHtml(comp.id, !!comp.hasPhoto, 'citizen-thumb');

    return `
      <article class="complaint-card" onclick="selectComplaint('${comp.id}')">
        <div class="complaint-card-top">
          <div class="complaint-meta-wrap">
            <span class="code-badge">${comp.id}</span>
            <span class="badge ${prioClass}">${comp.priority}</span>
            <span class="badge ${statusClass}">${comp.status}</span>
          </div>
          <span class="time-ago">${timeAgo(comp.createdAt)}</span>
        </div>

        <div class="complaint-main-row">
          ${thumbHtml}
          <div class="complaint-details">
            <h4 class="complaint-title">${escapeHtml(comp.title)}</h4>
            <p class="complaint-desc">${escapeHtml(comp.description)}</p>
            <div class="complaint-location-line">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <span>${escapeHtml(comp.location)}</span>
            </div>
          </div>
        </div>

        ${renderCardTimeline(comp)}

        <div class="complaint-footer">
          <div class="dept-tag" title="Recommended Department">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 21h18M5 21V7l7-4 7 4v14M9 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4"/>
            </svg>
            <span>${escapeHtml(comp.recommended_department)}</span>
          </div>
          <span class="badge-cat">${escapeHtml(comp.category)}</span>
        </div>
      </article>
    `;
  }).join('');

  // Load photos asynchronously after DOM is updated
  hydratePhotoThumbnails();
}

function selectComplaint(id) {
  const found = appState.complaints.find(c => c.id === id);
  if (found) {
    renderSpotlightCard(found);
    // Smooth scroll up to spotlight card
    document.getElementById('ai-spotlight-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ==========================================================================
// Rendering: Admin View & Statistics
// ==========================================================================

function renderAdminComplaints() {
  const searchVal = document.getElementById('admin-search-input').value.trim().toLowerCase();
  const statusVal = document.getElementById('admin-filter-status').value;
  const prioVal = document.getElementById('admin-filter-priority').value;

  let filtered = appState.complaints.filter(c => {
    // Search filter
    if (searchVal) {
      const matchText = (c.title + ' ' + c.description + ' ' + c.location + ' ' + c.recommended_department + ' ' + c.id).toLowerCase();
      if (!matchText.includes(searchVal)) return false;
    }
    // Status filter
    if (statusVal !== 'ALL' && c.status !== statusVal) {
      return false;
    }
    // Priority filter
    if (prioVal !== 'ALL' && c.priority !== prioVal) {
      return false;
    }
    return true;
  });

  const tbody = document.getElementById('admin-complaints-tbody');
  const emptyState = document.getElementById('admin-empty-state');

  updateAdminStats();

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  tbody.innerHTML = filtered.map(comp => {
    const prioClass = `badge-prio-${comp.priority.toLowerCase()}`;
    const statusClass = comp.status.replace(/\s+/g, '-');
    const thumbHtml = photoThumbHtml(comp.id, !!comp.hasPhoto, 'admin-thumb', true);

    return `
      <tr>
        <td>
          <div class="admin-table-issue-cell">
            ${thumbHtml}
            <div>
              <div class="code-badge" style="display:inline-block; margin-bottom:4px;">${comp.id}</div>
              <div class="admin-table-title">${escapeHtml(comp.title)}</div>
              <div class="admin-table-loc">${escapeHtml(comp.location)}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="badge-cat">${escapeHtml(comp.category)}</span>
        </td>
        <td>
          <span class="badge ${prioClass}">${comp.priority}</span>
          <div class="admin-reason-text" title="${escapeHtml(comp.reason)}">
            ${escapeHtml(comp.reason)}
          </div>
        </td>
        <td>
          <span class="dept-tag">${escapeHtml(comp.recommended_department)}</span>
        </td>
        <td>
          <select 
            class="status-select ${statusClass}" 
            onchange="updateComplaintStatus('${comp.id}', this.value)"
            aria-label="Change status for ${comp.id}"
          >
            <option value="Reported" ${comp.status === 'Reported' ? 'selected' : ''}>Reported</option>
            <option value="In Progress" ${comp.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
            <option value="Resolved" ${comp.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
          </select>
        </td>
        <td>
          <div style="display:flex; gap:0.4rem;">
            <button class="admin-action-btn" onclick="openDetailModal('${comp.id}')" title="Inspect full details">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
            <button class="admin-action-btn" onclick="deleteComplaint('${comp.id}')" title="Delete complaint" style="color:#ef4444;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Load admin thumbnail photos asynchronously
  hydratePhotoThumbnails();
}

function updateComplaintStatus(id, newStatus) {
  const index = appState.complaints.findIndex(c => c.id === id);
  if (index !== -1) {
    const oldStatus = appState.complaints[index].status;
    if (oldStatus === newStatus) return;

    const nowIso = new Date().toISOString();
    appState.complaints[index].status = newStatus;
    appState.complaints[index].updatedAt = nowIso;

    // Ensure timeline array exists
    if (!Array.isArray(appState.complaints[index].timeline)) {
      appState.complaints[index].timeline = [
        { status: 'Reported', timestamp: appState.complaints[index].createdAt || nowIso }
      ];
    }

    // Append new status change with timestamp
    appState.complaints[index].timeline.push({
      status: newStatus,
      timestamp: nowIso
    });

    saveComplaints(appState.complaints);

    showToast('Status Updated', `${id} changed from "${oldStatus}" to "${newStatus}"`, 'success');

    // Update counts & UI
    updateHeaderCounts();
    renderAdminComplaints();
    renderCitizenComplaints();

    // If spotlight card shows this complaint, refresh it
    const spotlightTitle = document.getElementById('spotlight-timestamp');
    if (spotlightTitle && spotlightTitle.textContent.includes(id)) {
      renderSpotlightCard(appState.complaints[index]);
    }
  }
}

function deleteComplaint(id) {
  if (confirm(`Are you sure you want to remove complaint #${id}?`)) {
    appState.complaints = appState.complaints.filter(c => c.id !== id);
    saveComplaints(appState.complaints);
    deletePhotoFromIDB(id); // clean up IDB photo blob
    showToast('Deleted', `Complaint #${id} has been removed.`, 'info');
    updateHeaderCounts();
    renderAdminComplaints();
    renderCitizenComplaints();
    renderSpotlightCard(null);
  }
}

function filterAdminByPriority(prio) {
  const prioSelect = document.getElementById('admin-filter-priority');
  prioSelect.value = prio;
  renderAdminComplaints();
}

function updateAdminStats() {
  const all = appState.complaints;
  const total = all.length;
  const reported = all.filter(c => c.status === 'Reported').length;
  const inProgress = all.filter(c => c.status === 'In Progress').length;
  const resolved = all.filter(c => c.status === 'Resolved').length;

  const critical = all.filter(c => c.priority === 'Critical').length;
  const high = all.filter(c => c.priority === 'High').length;
  const medium = all.filter(c => c.priority === 'Medium').length;
  const low = all.filter(c => c.priority === 'Low').length;

  document.getElementById('admin-count-total').textContent = total;
  document.getElementById('admin-count-reported').textContent = reported;
  document.getElementById('admin-count-progress').textContent = inProgress;
  document.getElementById('admin-count-resolved').textContent = resolved;

  document.getElementById('admin-prio-critical').textContent = critical;
  document.getElementById('admin-prio-high').textContent = high;
  document.getElementById('admin-prio-medium').textContent = medium;
  document.getElementById('admin-prio-low').textContent = low;

  updateHeaderCounts();
}

function updateHeaderCounts() {
  const total = appState.complaints.length;
  const resolved = appState.complaints.filter(c => c.status === 'Resolved').length;

  const adminBadge = document.getElementById('admin-badge-count');
  const citizenTotal = document.getElementById('citizen-total-count');
  const citizenResolved = document.getElementById('citizen-resolved-count');

  if (adminBadge) adminBadge.textContent = total;
  if (citizenTotal) citizenTotal.textContent = total;
  if (citizenResolved) citizenResolved.textContent = resolved;
}

// ==========================================================================
// Settings Modal & API Key Management
// ==========================================================================

function openSettingsModal() {
  const modal = document.getElementById('settings-modal');
  const keyInput = document.getElementById('gemini-api-key');
  const resultBox = document.getElementById('test-connection-result');

  keyInput.value = getStoredApiKey();
  populateModelDropdown();
  resultBox.classList.add('hidden');
  resultBox.textContent = '';

  modal.classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('gemini-api-key');
  const icon = document.getElementById('eye-icon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;
  } else {
    input.type = 'password';
    icon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
  }
}

function saveApiKey(event) {
  event.preventDefault();
  const keyInput = document.getElementById('gemini-api-key');
  const modelSelect = document.getElementById('gemini-model-select');

  const newKey = keyInput.value.trim();
  const newModel = modelSelect.value;

  localStorage.setItem(STORAGE_API_KEY, newKey);
  localStorage.setItem(STORAGE_MODEL_KEY, newModel);

  updateApiStatusIndicator();
  closeSettingsModal();
  showToast('Settings Saved', `Gemini configuration saved with model ${newModel}.`, 'success');
}

function clearApiKey() {
  if (confirm('Are you sure you want to remove your Gemini API key from localStorage?')) {
    localStorage.removeItem(STORAGE_API_KEY);
    document.getElementById('gemini-api-key').value = '';
    updateApiStatusIndicator();
    showToast('API Key Cleared', 'Gemini API key was removed from this browser.', 'info');
  }
}

async function testGeminiConnection() {
  const keyInput = document.getElementById('gemini-api-key');
  const modelSelect = document.getElementById('gemini-model-select');
  const resultBox = document.getElementById('test-connection-result');
  const testSpinner = document.getElementById('test-btn-spinner');
  const testText = document.getElementById('test-btn-text');
  const testBtn = document.getElementById('test-key-btn');

  const key = keyInput.value.trim();
  const rawModel = modelSelect ? modelSelect.value : getStoredModel();
  const displayModel = getDisplayModelName(rawModel);

  if (!key) {
    resultBox.className = 'test-result-box error';
    resultBox.innerHTML = `<strong>Missing Key:</strong> Please paste your Gemini API key in the field above before testing.`;
    resultBox.classList.remove('hidden');
    return;
  }

  // Update UI to testing state
  if (testBtn) testBtn.disabled = true;
  if (testSpinner) testSpinner.classList.remove('hidden');
  testText.textContent = `Testing (${displayModel})...`;
  resultBox.className = 'test-result-box hidden';
  resultBox.textContent = '';

  const testBody = {
    contents: [
      {
        parts: [{ text: 'Ping. Respond with pong.' }]
      }
    ]
  };

  try {
    const result = await sendGeminiRequestWithRetryAndFallback({
      apiKey: key,
      initialModel: rawModel,
      body: testBody,
      onStatusUpdate: (msg) => {
        testText.textContent = msg;
        resultBox.className = 'test-result-box info';
        resultBox.innerHTML = `<span class="btn-spinner" style="display:inline-block; vertical-align:middle; width:13px; height:13px; margin-right:6px; border:2px solid rgba(30,64,175,0.3); border-top-color:#1e40af;"></span> ${escapeHtml(msg)}`;
        resultBox.classList.remove('hidden');
      }
    });

    resultBox.className = 'test-result-box success';
    const switchNotice = result.wasFallback
      ? `<div style="margin-top:0.35rem; color:#047857;"><em>Notice: Automatically switched from <code>${escapeHtml(result.originalModel)}</code> to <code>${escapeHtml(result.modelUsed)}</code> after retries.</em></div>`
      : '';

    resultBox.innerHTML = `
      <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:#059669; flex-shrink:0;">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <strong>Connection Succeeded!</strong>
      </div>
      <div>Successfully verified API key using model <code>${escapeHtml(result.modelUsed)}</code> in <strong>${result.elapsedMs}ms</strong>.</div>
      <div style="font-size:0.75rem; color:#475569; margin-top:0.35rem; word-break:break-all;"><strong>Exact URL:</strong> <code>${escapeHtml(maskApiKey(result.urlUsed, key))}</code></div>
      ${switchNotice}
    `;
    resultBox.classList.remove('hidden');
    testText.textContent = `Verified (${result.modelUsed})`;

  } catch (err) {
    const failedModel = err.model || displayModel;
    const defaultFailUrl = `https://generativelanguage.googleapis.com/v1beta/${formatModelPath(failedModel)}:generateContent?key=**`;
    const failedUrl = maskApiKey(err.url || defaultFailUrl, key);
    const fullError = maskApiKey(err.errorText || err.message || String(err), key);

    resultBox.className = 'test-result-box error';
    resultBox.innerHTML = `
      <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.4rem;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:#dc2626; flex-shrink:0;">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <strong>Gemini Request Failed</strong>
      </div>
      <div style="font-size:0.8125rem; display:flex; flex-direction:column; gap:0.35rem;">
        <div><strong>Model Name:</strong> <code>${escapeHtml(failedModel)}</code></div>
        <div><strong>Exact URL Path:</strong> <code style="word-break:break-all;">${escapeHtml(failedUrl)}</code></div>
        <div><strong>Full Error Text:</strong></div>
        <pre style="background:rgba(0,0,0,0.06); padding:0.5rem; border-radius:4px; font-size:0.75rem; white-space:pre-wrap; word-break:break-word; max-height:160px; overflow-y:auto; color:#991b1b; margin-top:0.2rem;">${escapeHtml(fullError)}</pre>
      </div>
    `;
    resultBox.classList.remove('hidden');
    testText.textContent = `Failed (${failedModel})`;

  } finally {
    if (testSpinner) testSpinner.classList.add('hidden');
    if (testBtn) testBtn.disabled = false;
  }
}

function restoreSampleData() {
  if (confirm('Reset complaints list to the 5 standard sample complaints? Any custom reports will be overwritten.')) {
    const samples = getInitialSampleComplaints();
    appState.complaints = samples;
    saveComplaints(samples);
    updateHeaderCounts();
    renderCitizenComplaints();
    renderAdminComplaints();
    renderSpotlightCard(samples[0]);
    closeSettingsModal();
    showToast('Reset Complete', 'Reloaded 5 sample municipal complaints.', 'success');
  }
}

function openResetModal() {
  restoreSampleData();
}

function exportComplaintsData() {
  const jsonStr = JSON.stringify(appState.complaints, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `civicresolve_complaints_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Export Ready', 'Complaints exported to JSON file.', 'success');
}

// ==========================================================================
// Detail Modal
// ==========================================================================

function openDetailModal(id) {
  const complaint = appState.complaints.find(c => c.id === id);
  if (!complaint) return;

  const modal = document.getElementById('detail-modal');
  const title = document.getElementById('detail-modal-title');
  const idBadge = document.getElementById('detail-modal-id');
  const body = document.getElementById('detail-modal-body');

  title.textContent = complaint.title;
  idBadge.textContent = complaint.id;

  const prioClass = `badge-prio-${complaint.priority.toLowerCase()}`;
  const statusClass = `badge-status-${complaint.status.toLowerCase().replace(' ', '-')}`;

  body.innerHTML = `
    <div class="detail-grid">
      <div class="detail-img-wrap">
        ${photoThumbHtml(complaint.id, !!complaint.hasPhoto, 'detail-thumb', true)}
      </div>
      <div class="detail-info">
        <div class="detail-status-bar">
          <div>
            <span style="font-size:0.75rem; color:#64748b; font-weight:600; text-transform:uppercase;">Current Status</span>
            <div style="margin-top:2px;"><span class="badge ${statusClass}">${complaint.status}</span></div>
          </div>
          <div>
            <span style="font-size:0.75rem; color:#64748b; font-weight:600; text-transform:uppercase;">Priority Tier</span>
            <div style="margin-top:2px;"><span class="badge ${prioClass}">${complaint.priority}</span></div>
          </div>
        </div>

        <div class="detail-field">
          <label>Location & Landmark</label>
          <p>${escapeHtml(complaint.location)}</p>
        </div>

        <div class="detail-field">
          <label>Issue Description</label>
          <p>${escapeHtml(complaint.description)}</p>
        </div>

        <div class="detail-field">
          <label>Assigned Department</label>
          <p><strong>${escapeHtml(complaint.recommended_department)}</strong></p>
        </div>

        <div class="ai-reason-quote">
          <div class="ai-reason-title">Gemini AI Public Safety Reasoning</div>
          <p class="ai-reason-text">"${escapeHtml(complaint.reason)}"</p>
        </div>

        <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.5rem;">
          Submitted: ${new Date(complaint.createdAt).toLocaleString()} &bull; Last updated: ${new Date(complaint.updatedAt).toLocaleString()}
        </div>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');

  // Load photo from IDB asynchronously (the thumb-wrap is now in the DOM)
  hydratePhotoThumbnails();
}

function closeDetailModal() {
  document.getElementById('detail-modal').classList.add('hidden');
}

function handleModalBackdropClick(event, modalId) {
  if (event.target.id === modalId) {
    document.getElementById(modalId).classList.add('hidden');
  }
}

// ==========================================================================
// Toast System
// ==========================================================================

function showToast(title, message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
  } else if (type === 'error') {
    iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  } else {
    iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  }

  toast.innerHTML = `
    <div class="toast-icon">${iconSvg}</div>
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(title)}</div>
      <div class="toast-msg">${escapeHtml(message)}</div>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    setTimeout(() => toast.remove(), 200);
  }, 4200);
}

// ==========================================================================
// Utility Functions
// ==========================================================================

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function timeAgo(isoDate) {
  if (!isoDate) return 'recently';
  const seconds = Math.floor((new Date() - new Date(isoDate)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ==========================================================================
// Bootstrap
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Load data from localStorage
  appState.complaints = loadComplaints();

  // Set up API key status and populate model list
  populateModelDropdown();
  updateApiStatusIndicator();

  // Render initial views
  renderCitizenComplaints();
  updateHeaderCounts();

  // Pre-select first complaint in spotlight card
  if (appState.complaints.length > 0) {
    renderSpotlightCard(appState.complaints[0]);
  }

  // Setup Drag & Drop for Image Upload
  const dropzone = document.getElementById('upload-dropzone');
  if (dropzone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.borderColor = 'var(--primary)';
        dropzone.style.backgroundColor = 'var(--primary-soft)';
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.borderColor = '';
        dropzone.style.backgroundColor = '';
      }, false);
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        const fakeEvent = { target: { files: files } };
        handleImageSelection(fakeEvent);
      }
    }, false);
  }

  // Keyboard shortcut: Escape to close modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSettingsModal();
      closeDetailModal();
      closeLightbox();
    }
  });
});
