/* =========================================
   RadioTV Indonesia — Script (halaman radio / TV)
   ========================================= */
(() => {
  'use strict';

  const page = document.body.dataset.page === 'tv' ? 'tv' : 'radio';
  const isTv = page === 'tv';

  // --- Data ---
  const dataEl = document.getElementById('stations-data');
  const DATA_URL = 'stations.json';
  const AUTO_REFRESH_MS = 24 * 60 * 60 * 1000;
  const LAST_REFRESH_KEY = 'tvradio_last_refresh';
  const OFFLINE_KEY = 'tvradio_offline_marks';
  const EXCLUDE_KEY = 'tvradio_exclude_geo';
  const VIEW_KEY = 'tvradio_view';
  const HIDE_KEY = 'tvradio_hide_offline';
  const SORT_KEY = 'tvradio_tv_sort';
  const CACHE_KEY = 'tvradio_cache_video';
  const VIDEO_CACHE_NAME = 'tvradio-video-v1';
  const CACHE_PRESETS = {
    off: { enabled: false, maxEntries: 0, prefetchSegments: 0, prefetchBudgetMs: 0, maxBufferLength: 45, maxMaxBufferLength: 90, maxBufferSize: 45 * 1000 * 1000 },
    small: { enabled: true, maxEntries: 80, prefetchSegments: 4, prefetchBudgetMs: 2500, maxBufferLength: 30, maxMaxBufferLength: 60, maxBufferSize: 30 * 1000 * 1000 },
    medium: { enabled: true, maxEntries: 180, prefetchSegments: 8, prefetchBudgetMs: 4500, maxBufferLength: 60, maxMaxBufferLength: 120, maxBufferSize: 60 * 1000 * 1000 },
    large: { enabled: true, maxEntries: 420, prefetchSegments: 14, prefetchBudgetMs: 7000, maxBufferLength: 90, maxMaxBufferLength: 180, maxBufferSize: 90 * 1000 * 1000 },
  };
  const ALT_SOURCES = [
    'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8',
    'https://m3u8-player.net/id/free-indonesia-iptv-playlist/',
  ];
  const ALT_CACHE_KEY = 'tvradio_alt_streams_v1';
  const ALT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;


  function dedupe(list) {
    const seen = new Set();
    return list.filter((s) => {
      if (!s || !s.id || seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }

  let stations = [];
  try {
    const raw = dataEl ? JSON.parse(dataEl.textContent || '[]') : window.STATIONS_DATA;
    stations = dedupe(Array.isArray(raw) ? raw : []);
  } catch (e) {
    console.error('Gagal memuat data stasiun:', e);
  }

  // --- DOM ---
  const listEl = document.getElementById('station-list');
  const emptyEl = document.getElementById('station-empty');
  const countEl = document.getElementById('station-count');
  const provinsiGrid = document.getElementById('provinsi-grid');
  const filterTabs = document.getElementById('filter-tabs');
  const searchInput = document.getElementById('search');
  const navToggle = document.querySelector('.nav-toggle');
  const navMenu = document.getElementById('nav-menu');
  const refreshBtn = document.getElementById('refresh-btn');
  const updateText = document.getElementById('update-text');
  const hideOfflineInput = document.getElementById('hide-offline');
  const autoNextInput = document.getElementById('auto-next-buffer');
  const viewToggle = document.getElementById('view-toggle');
  const sortGroup = document.getElementById('sort-group');
  const cacheSizeSelect = document.getElementById('cache-size');
  const scanBtn = document.getElementById('scan-btn');
  const countryClear = document.getElementById('country-clear');
  const themeSelect = document.getElementById('theme-select');
  const settingsFab = document.getElementById('settings-fab');
  const settingsPanel = document.getElementById('settings-panel');
  const settingsBackdrop = document.getElementById('settings-backdrop');
  const settingsClose = document.getElementById('settings-close');

  // Donation modal
  const donateBtn = document.getElementById('donate-btn');
  const donateModal = document.getElementById('donate-modal');
  const donateClose = document.getElementById('donate-close');
  const donateBackdrop = document.getElementById('donate-backdrop');
  const donateCopy = document.getElementById('donate-copy');
  const DONATE_NUMBER = '085323073037';

  // Audio player
  const fp = document.getElementById('floating-player');
  const fpType = document.getElementById('fp-type');
  const fpTitle = document.getElementById('fp-title');
  const fpSub = document.getElementById('fp-sub');
  const fpClose = document.getElementById('fp-close');
  const fpPlay = document.getElementById('fp-play');
  const fpStop = document.getElementById('fp-stop');
  const fpVol = document.getElementById('fp-vol');
  const fpStatus = document.getElementById('fp-status');

  // Video modal
  const videoModal = document.getElementById('video-modal');
  const videoPlayer = document.getElementById('video-player');
  const videoTitle = document.getElementById('video-title');
  const videoSub = document.getElementById('video-sub');
  const videoStatus = document.getElementById('video-status');
  const videoOverlay = document.getElementById('video-overlay');
  const videoOverlayText = document.getElementById('video-overlay-text');
  const videoClose = document.getElementById('video-close');
  const videoBackdrop = document.getElementById('video-backdrop');
  const videoPrev = document.getElementById('video-prev');
  const videoNext = document.getElementById('video-next');
  const scanProgress = document.getElementById('scan-progress');
  const scanProgressFill = document.getElementById('scan-progress-fill');
  const scanProgressText = document.getElementById('scan-progress-text');
  const scanList = document.getElementById('scan-list');

  // --- State ---
  let currentStation = null;
  let audio = null;
  let hls = null;
  let videoHls = null;
  let videoStation = null;
  let pageFilter = isTv ? 'nasional' : 'all';
  let searchQuery = '';
  let provinceFilter = '';
  let countryFilters = (new URLSearchParams(location.search).get('country') || localStorage.getItem('tvradio_country') || '')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  let gridView = (localStorage.getItem(VIEW_KEY) || 'grid') === 'grid';
  let hideOffline = (localStorage.getItem(HIDE_KEY) || 'true') === 'true';
  const AUTO_NEXT_KEY = 'tvradio_autonext_buffer';
  let autoNextOnBuffer = (localStorage.getItem(AUTO_NEXT_KEY) || 'true') === 'true';
  let tvSort = localStorage.getItem(SORT_KEY) || 'name';
  function normalizeCacheSize(v) {
    if (v === 'true') return 'medium';
    if (v === 'false' || !v) return 'off';
    return CACHE_PRESETS[v] ? v : 'off';
  }
  let cacheSize = normalizeCacheSize(localStorage.getItem(CACHE_KEY));
  let cacheVideo = CACHE_PRESETS[cacheSize].enabled;
  let prefetchAbort = null;
  let videoSession = 0;
  let bufferWatchdog = null;
  let bufferWatchdog2 = null;
  let bufferStartAt = 0;
  let bufferStartStationId = null;
  const BUFFER_STATS_KEY = 'tvradio_buffer_stats';
  let bufferStats = {};
  try { bufferStats = JSON.parse(localStorage.getItem(BUFFER_STATS_KEY) || '{}') || {}; } catch { bufferStats = {}; }
  function saveBufferStats() {
    try { localStorage.setItem(BUFFER_STATS_KEY, JSON.stringify(bufferStats)); } catch { /* ignore */ }
  }
  function setBufferStat(id, ms) {
    if (!id) return;
    bufferStats[id] = ms;
    saveBufferStats();
    refreshBufferLine(id);
    if (scanning) updateScanProgress();
  }
  let scanning = false;
  let scanQueue = [];
  let scanIndex = 0;
  let scanTimer = null;
  let scanInternalPlay = false;
  let scanAdvanceLock = 0;
  let scanModeTimer = null;
  function bufferLevel(ms) {
    if (!ms || ms <= 0) return '';
    if (ms < 3000) return 'green';
    if (ms < 5000) return 'yellow';
    return 'red';
  }
  function refreshBufferLine(id) {
    const row = listEl ? listEl.querySelector(`.row[data-id="${id}"]`) : null;
    if (!row) return;
    let line = row.querySelector('.row-buffer-line');
    const ms = bufferStats[id];
    const lvl = bufferLevel(ms);
    if (!lvl) { if (line) line.remove(); return; }
    if (!line) { line = document.createElement('span'); line.className = 'row-buffer-line'; row.appendChild(line); }
    line.className = 'row-buffer-line ' + lvl;
    line.title = `Buffer: ${(ms / 1000).toFixed(1)}s`;
  }
  let altStreamsReady = false;
  let altByName = new Map();

  function normalizeName(name) {
    return String(name || '').toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function parseM3u8(text) {
    const entries = [];
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXTINF:')) {
        const comma = line.lastIndexOf(',');
        const name = comma >= 0 ? line.slice(comma + 1).trim() : '';
        const url = lines[i + 1].trim();
        if (name && url && /^https?:\/\//i.test(url)) {
          entries.push({ name, url });
        }
      }
    }
    return entries;
  }

  async function fetchPlaylistText(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  function loadAltFromStorage() {
    try {
      const raw = JSON.parse(localStorage.getItem(ALT_CACHE_KEY) || '{}');
      const now = Date.now();
      for (const [key, arr] of Object.entries(raw)) {
        if (!Array.isArray(arr)) continue;
        const valid = arr.filter(a => a.url && now - Number(a.at || 0) < ALT_CACHE_TTL_MS);
        if (valid.length) altByName.set(key, valid);
      }
    } catch { /* ignore */ }
  }
  function saveAltToStorage() {
    try {
      const raw = {};
      altByName.forEach((arr, key) => { raw[key] = arr; });
      localStorage.setItem(ALT_CACHE_KEY, JSON.stringify(raw));
    } catch { /* ignore */ }
  }

  async function loadAlternatives() {
    if (altStreamsReady) return altByName;
    altStreamsReady = true;
    loadAltFromStorage();
    let fetched = 0;
    for (const src of ALT_SOURCES) {
      try {
        const text = await fetchPlaylistText(src);
        const entries = parseM3u8(text);
        for (const e of entries) {
          const key = normalizeName(e.name);
          if (!key) continue;
          if (!altByName.has(key)) altByName.set(key, []);
          const arr = altByName.get(key);
          if (!arr.some(a => a.url === e.url)) {
            arr.push({ url: e.url, source: src, at: Date.now() });
            fetched++;
          }
        }
      } catch (err) {
        console.warn('Gagal muat playlist alternatif ' + src + ':', err.message);
      }
    }
    // Attach alternatif ke stasiun TV (nama, kota, provinsi).
    pageStations().filter((s) => s.type === 'tv').forEach((s) => {
      const alts = collectAlts(s);
      if (alts.length) s.alternatives = alts;
    });
    saveAltToStorage();
    return altByName;
  }

  function collectAlts(station) {
    const keys = [
      normalizeName(station.name),
      normalizeName(station.city || ''),
      normalizeName(station.province || ''),
      normalizeName((station.city || '') + ' ' + (station.province || '')),
    ];
    const seen = new Set();
    const out = [];
    for (const k of keys) {
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const arr = altByName.get(k) || [];
      for (const a of arr) {
        if (!seen.has(a.url)) { seen.add(a.url); out.push(a.url); }
      }
    }
    return out;
  }

  let lastRefresh = Number(localStorage.getItem(LAST_REFRESH_KEY)) || 0;
  let offlineMarks = loadOfflineMarks();
  let refreshing = false;

  const FAVORITES_KEY = 'tvradio_favorites';
  let favorites = loadFavorites();

  function loadFavorites() {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  function saveFavorites() {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch { /* ignore */ }
  }
  function isFavorite(id) { return favorites.includes(id); }
  function toggleFavorite(id) {
    favorites = isFavorite(id) ? favorites.filter((f) => f !== id) : favorites.concat(id);
    saveFavorites();
  }

  // --- Status & refresh ---
  function loadOfflineMarks() {
    try {
      const raw = JSON.parse(localStorage.getItem(OFFLINE_KEY) || '{}');
      const now = Date.now();
      const clean = {};
      Object.entries(raw).forEach(([id, mark]) => {
        if (mark && now - Number(mark.at || 0) < AUTO_REFRESH_MS) clean[id] = mark;
      });
      return clean;
    } catch { return {}; }
  }
  function saveOfflineMarks() {
    try { localStorage.setItem(OFFLINE_KEY, JSON.stringify(offlineMarks)); } catch { /* ignore */ }
  }
  function loadExcludeMarks() {
    try { return JSON.parse(localStorage.getItem(EXCLUDE_KEY) || '{}') || {}; } catch { return {}; }
  }
  function saveExcludeMarks() {
    try { localStorage.setItem(EXCLUDE_KEY, JSON.stringify(excludeMarks)); } catch { /* ignore */ }
  }
  let excludeMarks = loadExcludeMarks();
  function isExcluded(station) {
    return Boolean(station && excludeMarks[station.id]);
  }
  function excludeStation(station, reason) {
    if (!station) return;
    excludeMarks[station.id] = { at: Date.now(), reason: reason || 'Geo-block/CORS' };
    saveExcludeMarks();
  }
  function unexcludeStation(station) {
    if (!station || !excludeMarks[station.id]) return;
    delete excludeMarks[station.id];
    saveExcludeMarks();
  }
  function statusOf(station) {
    if (offlineMarks[station.id]) return 'offline';
    return station.status || 'unknown';
  }
  function offlineReason(station) {
    const mark = offlineMarks[station.id];
    if (mark && mark.reason) return mark.reason;
    if (station.status === 'offline') {
      const code = station.httpCode ? ` (HTTP ${station.httpCode})` : '';
      return `Server stream tidak merespons saat pengecekan${code}.`;
    }
    return 'Kanal ditandai offline.';
  }
  const GEO_BLOCK_CODES = new Set([400, 401, 403, 405, 406, 429, 451]);
  function isGeoBlocked(station) {
    if (!station) return false;
    const code = Number(station.httpCode || 0);
    if (GEO_BLOCK_CODES.has(code)) return true;
    const mark = offlineMarks[station.id];
    const reason = String((mark && mark.reason) || '');
    return /geo-block|cors|alternatif gagal/i.test(reason);
  }
  function markOffline(station, reason) {
    if (!station) return;
    offlineMarks[station.id] = { at: Date.now(), reason };
    saveOfflineMarks();
    if (/geo-block|cors/i.test(String(reason || '')) || GEO_BLOCK_CODES.has(Number(station.httpCode || 0))) {
      excludeStation(station, reason || 'Geo-block/CORS');
    }
    refreshStatusUI();
  }
  function markOnline(station) {
    if (!station) return;
    let changed = false;
    if (offlineMarks[station.id]) { delete offlineMarks[station.id]; saveOfflineMarks(); changed = true; }
    if (excludeMarks[station.id]) { delete excludeMarks[station.id]; saveExcludeMarks(); changed = true; }
    if (changed) refreshStatusUI();
  }

  function updateStatusBadges() {
    const byId = new Map(stations.map((s) => [s.id, s]));
    listEl.querySelectorAll('.row').forEach((row) => {
      const station = byId.get(row.dataset.id);
      if (!station) return;
      const status = statusOf(station);
      row.dataset.status = status;
      const actions = row.querySelector('.row-actions');
      if (!actions) return;
      let badge = actions.querySelector('.row-status');
      if (status === 'unknown') {
        if (badge) badge.remove();
        return;
      }
      if (!badge) {
        badge = document.createElement('span');
        actions.prepend(badge);
      }
      if (status === 'offline') {
        badge.className = 'row-status offline';
        badge.textContent = 'Off';
        badge.title = offlineReason(station);
      } else {
        badge.className = 'row-status online';
        badge.textContent = '';
        badge.title = 'Stream aktif saat pengecekan terakhir';
      }
    });
  }

  function refreshStatusUI() {
    if (hideOffline) render();
    else updateStatusBadges();
    updateInfoBar();
  }

  function formatWhen(ts) {
    if (!ts) return 'data bawaan halaman';
    try {
      return new Date(ts).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    } catch { return new Date(ts).toLocaleString(); }
  }

  function pageStations() {
    return stations.filter((s) => s.type === page);
  }

  // Notifikasi singkat menggantikan bar status yang dihapus.
  let toastTimer = null;
  function toast(message) {
    let el = document.getElementById('app-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'app-toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  function updateInfoBar(message) {
    if (message) {
      if (updateText) updateText.textContent = message;
      else toast(message);
      return;
    }
    if (!updateText) return;
    const own = pageStations();
    const offline = own.filter((s) => statusOf(s) === 'offline').length;
    const unknown = own.filter((s) => statusOf(s) === 'unknown').length;
    updateText.textContent =
      `${own.length} ${isTv ? 'kanal' : 'stasiun'} · ${formatWhen(lastRefresh)} · ${offline} offline` +
      (unknown ? ` · ${unknown} belum terverifikasi` : '');
  }

  async function refreshData(manual) {
    if (refreshing) return;
    refreshing = true;
    if (manual && updateText) updateInfoBar('Memuat daftar terbaru…');
    if (refreshBtn) refreshBtn.classList.add('busy');
    try {
      if (location.protocol === 'file:') {
        throw new Error('buka lewat server (http), bukan file://');
      }
      const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const fresh = dedupe(await res.json());
      if (!fresh.length) throw new Error('data kosong');
      const sameOrder =
        fresh.length === stations.length &&
        fresh.every((s, i) => s.id === stations[i].id);
      const scrollY = window.scrollY;
      if (sameOrder) {
        // Objek yang sama dipakai baris, jadi URL/status baru langsung terpakai.
        fresh.forEach((s, i) => Object.assign(stations[i], s));
      } else {
        stations = fresh;
        render();
        renderProvinsi();
      }
      lastRefresh = Date.now();
      try { localStorage.setItem(LAST_REFRESH_KEY, String(lastRefresh)); } catch { /* ignore */ }
      let changedExclude = false;
      fresh.forEach((s) => {
        if (excludeMarks[s.id]) {
          const code = Number(s.httpCode || 0);
          if (s.status === 'online' && !GEO_BLOCK_CODES.has(code)) {
            delete excludeMarks[s.id];
            changedExclude = true;
          }
        }
      });
      if (changedExclude) saveExcludeMarks();
      refreshStatusUI();
      if (window.scrollY !== scrollY) window.scrollTo(0, scrollY);
      if (manual) toast('Daftar diperbarui');
    } catch (err) {
      updateInfoBar(`Gagal memperbarui (${err.message}). Menampilkan data tersimpan.`);
    } finally {
      refreshing = false;
      if (refreshBtn) refreshBtn.classList.remove('busy');
    }
  }

  // --- Helpers ---
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function regionOf(station) {
    if (station.province && station.province !== 'Indonesia') return station.province;
    return 'Indonesia';
  }

  function flagEmoji(cc) {
    const code = String(cc || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return '';
    return String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0)));
  }

  function matchesSearch(s, q) {
    if (!q) return true;
    const needle = q.toLowerCase();
    return [s.name, s.city, s.province, s.desc, s.category]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(needle));
  }

  function matchesFilter(s, filter) {
    if (filter === 'all') return true;
    if (filter === 'favorit') return isFavorite(s.id);
    return s.category === filter;
  }

  // --- Urutan kanal TV: nama / lokasi / kategori ---
  function sortItems(items) {
    if (!isTv) return items;
    const arr = items.slice();
    const byName = (a, b) => String(a.name || '')
      .localeCompare(String(b.name || ''), 'id', { numeric: true, sensitivity: 'base' });
    if (tvSort === 'location') {
      arr.sort((a, b) =>
        String(regionOf(a)).localeCompare(String(regionOf(b)), 'id', { sensitivity: 'base' }) ||
        String(a.city || '').localeCompare(String(b.city || ''), 'id', { sensitivity: 'base' }) ||
        byName(a, b));
    } else if (tvSort === 'category') {
      arr.sort((a, b) =>
        String(a.category || 'lainnya').localeCompare(String(b.category || 'lainnya'), 'id', { sensitivity: 'base' }) ||
        byName(a, b));
    } else {
      arr.sort(byName);
    }
    return arr;
  }

  function syncSortUI() {
    if (!sortGroup) return;
    sortGroup.querySelectorAll('.sort-btn').forEach((b) => {
      const active = b.dataset.sort === tvSort;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  }

  function applySort(value) {
    tvSort = ['name', 'location', 'category'].includes(value) ? value : 'name';
    try { localStorage.setItem(SORT_KEY, tvSort); } catch { /* ignore */ }
    syncSortUI();
    render();
  }

  function visibleStation(s) {
    return s.type === page &&
      !(hideOffline && (statusOf(s) === 'offline' || isGeoBlocked(s) || isExcluded(s))) &&
      (!countryFilters.length || countryFilters.includes(String(s.country || '').toUpperCase())) &&
      (!provinceFilter || (s.province || 'Indonesia') === provinceFilter) &&
      matchesFilter(s, pageFilter) &&
      matchesSearch(s, searchQuery);
  }

  function markPlayingRow() {
    listEl.querySelectorAll('.row.is-playing').forEach((el) => el.classList.remove('is-playing'));
    if (!currentStation) return;
    const row = listEl.querySelector(`.row[data-id="${currentStation.id}"]`);
    if (row) row.classList.add('is-playing');
  }

  // --- Render row ---
  function createRow(station) {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.id = station.id;
    const status = statusOf(station);
    row.dataset.status = status;
    row.setAttribute('role', 'listitem');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-label', `Putar ${station.name}`);

    const favActive = isFavorite(station.id);
    const ICONS = {
      radio: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="8" width="20" height="13" rx="2.5"/><path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3H9"/><circle cx="8" cy="14.5" r="2.6"/><path d="M14.5 12.5H19M14.5 16.5H19"/></svg>',
      tv: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2.5"/><path d="M17 2l-5 5-5-5"/></svg>'
    };
    const icon = ICONS[isTv ? 'tv' : 'radio'];
    const logo = station.logo
      ? `${icon}<img src="${escapeHtml(station.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer"
          onerror="this.remove()" />`
      : icon;
    const statusBadge = status === 'offline'
      ? `<span class="row-status offline" title="${escapeHtml(offlineReason(station))}">Off</span>`
      : status === 'online'
        ? '<span class="row-status online" title="Stream aktif saat pengecekan terakhir"></span>'
        : '';
    const flag = flagEmoji(station.country);
    const flagHtml = flag ? `<span class="row-flag" title="${escapeHtml(station.country || '')}">${flag}</span>` : '';

    row.innerHTML = `
      <div class="row-logo">${logo}</div>
      <div class="row-main">
        <span class="row-name">${flagHtml}${escapeHtml(station.name)}</span>
        <span class="row-region">${escapeHtml(regionOf(station))}</span>
      </div>
      <div class="row-actions">
        ${statusBadge}
        <button class="row-fav ${favActive ? 'active' : ''}" type="button"
          aria-label="Favorit ${escapeHtml(station.name)}" aria-pressed="${favActive}">${favActive ? '♥' : '♡'}</button>
        <button class="row-play" type="button" aria-label="Putar ${escapeHtml(station.name)}">▶</button>
      </div>
    `;

    const favBtn = row.querySelector('.row-fav');
    const playBtn = row.querySelector('.row-play');
    // Di TV, baris adalah satu-satunya target fokus remote.
    if (isTv) {
      favBtn.tabIndex = -1;
      playBtn.tabIndex = -1;
    }

    const play = (e) => {
      if (e) e.stopPropagation();
      playStation(station);
    };
    const toggleFav = (e) => {
      if (e) e.stopPropagation();
      toggleFavorite(station.id);
      render();
      const rowAfter = listEl.querySelector(`.row[data-id="${station.id}"]`);
      if (rowAfter) {
        const btn = rowAfter.querySelector('.row-fav');
        if (btn) btn.focus();
      }
    };
    row.addEventListener('click', (e) => {
      if (e.target.closest('.row-fav')) return;
      play();
    });
    row.addEventListener('keydown', (e) => {
      if (e.target.closest('.row-fav')) return;
      const key = e.key;
      if (key === 'f' || key === 'F') { e.preventDefault(); toggleFav(); return; }
      if (key === 'Enter' || key === ' ') { e.preventDefault(); play(); }
    });
    row.addEventListener('focus', () => {
      row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    playBtn.addEventListener('click', play);
    favBtn.addEventListener('click', toggleFav);

    const msBuf = bufferStats[station.id];
    const lvlBuf = bufferLevel(msBuf);
    if (lvlBuf) {
      const line = document.createElement('span');
      line.className = 'row-buffer-line ' + lvlBuf;
      line.title = `Buffer: ${(msBuf / 1000).toFixed(1)}s`;
      row.appendChild(line);
    }
    if (currentStation && currentStation.id === station.id) row.classList.add('is-playing');
    return row;
  }

  function render() {
    const items = sortItems(stations.filter(visibleStation));
    const frag = document.createDocumentFragment();
    const groupByAlpha = !gridView && isTv && tvSort === 'name';
    const showFavSection = pageFilter !== 'favorit';
    const favItems = showFavSection ? items.filter((s) => isFavorite(s.id)) : [];
    const restItems = showFavSection ? items.filter((s) => !isFavorite(s.id)) : items;

    if (favItems.length) {
      const sep = document.createElement('div');
      sep.className = 'list-group fav-group';
      sep.setAttribute('role', 'separator');
      sep.textContent = '★ Favorit';
      frag.appendChild(sep);
      favItems.forEach((s) => frag.appendChild(createRow(s)));
    }

    let lastLetter = '';
    restItems.forEach((s) => {
      if (groupByAlpha) {
        const raw = String(s.name || '').trim();
        const ch = raw ? raw[0].toUpperCase() : '#';
        const letter = /[A-Z0-9]/.test(ch) ? (/[0-9]/.test(ch) ? '0-9' : ch) : '#';
        if (letter !== lastLetter) {
          lastLetter = letter;
          const sep = document.createElement('div');
          sep.className = 'list-group';
          sep.setAttribute('role', 'separator');
          sep.textContent = letter;
          frag.appendChild(sep);
        }
      }
      frag.appendChild(createRow(s));
    });
    listEl.replaceChildren(frag);

    emptyEl.hidden = items.length !== 0;
    if (countryClear) {
      if (countryFilters.length) {
        let label = countryFilters.length === 1 ? countryFilters[0] : `${countryFilters.length} negara`;
        if (countryFilters.length === 1) { try { label = new Intl.DisplayNames(['id'], { type: 'region' }).of(countryFilters[0]) || label; } catch {} }
        countryClear.hidden = false;
        countryClear.textContent = `🌍 ${label} ✕`;
      } else {
        countryClear.hidden = true;
        countryClear.textContent = '';
      }
    }
    if (countEl) countEl.textContent = `${items.length} ${isTv ? 'kanal' : 'stasiun'}`;
  }

  // --- Province chips ---
  function renderProvinsi() {
    if (!provinsiGrid) return;
    const map = new Map();
    pageStations().forEach((s) => {
      const prov = s.province || 'Indonesia';
      map.set(prov, (map.get(prov) || 0) + 1);
    });

    const sorted = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'id'));
    const frag = document.createDocumentFragment();
    sorted.forEach(([name, count]) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (provinceFilter === name ? ' active' : '');
      chip.setAttribute('aria-pressed', String(provinceFilter === name));
      chip.title = 'Klik lagi untuk menghapus filter';
      chip.innerHTML = `📍 ${escapeHtml(name)} <span class="n">${count}</span>`;
      chip.addEventListener('click', () => {
        provinceFilter = provinceFilter === name ? '' : name;
        provinsiGrid.querySelectorAll('.chip').forEach((c) => {
          const active = c === chip && provinceFilter === name;
          c.classList.toggle('active', active);
          c.setAttribute('aria-pressed', String(active));
        });
        render();
        document.getElementById('utama').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      frag.appendChild(chip);
    });
    provinsiGrid.replaceChildren(frag);
  }

  function applyView() {
    listEl.classList.toggle('view-grid', gridView);
    if (!viewToggle) return;
    viewToggle.textContent = gridView ? '☰ Daftar' : '▦ Grid';
    viewToggle.setAttribute('aria-pressed', String(gridView));
    viewToggle.title = gridView ? 'Kembali ke tampilan daftar' : 'Ubah ke tampilan grid';
  }

  // --- Audio player ---
  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'none';
    audio.addEventListener('playing', () => {
      setStatus('Sedang diputar');
      markOnline(currentStation);
      if (scanning && currentStation && bufferStartAt && bufferStartStationId === currentStation.id) {
        setBufferStat(currentStation.id, Date.now() - bufferStartAt);
        bufferStartAt = 0; bufferStartStationId = null;
        clearBufferWatchdog();
        setTimeout(() => { if (scanning) advanceScan(); }, 400);
      }
    });
    audio.addEventListener('pause', () => { if (currentStation) setStatus('Dijeda'); });
    audio.addEventListener('waiting', () => setStatus('Memuat…'));
    audio.addEventListener('error', () => {
      if (!currentStation || !audio.getAttribute('src')) return;
      setStatus('Gagal memuat stream. Coba stasiun lain.');
      markOffline(currentStation, 'Gagal diputar di browser ini (bisa geo-blocked/CORS).');
      if (scanning) { clearBufferWatchdog(); setTimeout(() => { if (scanning) advanceScan(); }, 300); }
    });
    audio.addEventListener('ended', () => setStatus('Stream berakhir'));
    return audio;
  }
  function setStatus(msg) { if (fpStatus) fpStatus.textContent = msg; }
  function setOverlayLevel(level) {
    if (!videoOverlay) return;
    videoOverlay.classList.remove('level-green', 'level-yellow', 'level-red');
    if (level) videoOverlay.classList.add('level-' + level);
  }
  function showVideoOverlay(msg, level) {
    if (videoOverlayText) videoOverlayText.textContent = msg || 'Memuat…';
    if (level !== undefined) setOverlayLevel(level || '');
    if (videoOverlay) videoOverlay.hidden = false;
  }
  function hideVideoOverlay() {
    if (videoOverlay) { videoOverlay.hidden = true; setOverlayLevel(''); }
  }
  function setVideoStatus(msg) {
    if (videoStatus) videoStatus.textContent = msg;
    const m = String(msg || '');
    const watchdogActive = !!(bufferWatchdog || bufferWatchdog2);
    if (/memuat|buffer|menyimpan|cache|mencoba alternatif|menghubungkan/i.test(m)) {
      if (!watchdogActive) showVideoOverlay(m);
      else if (videoOverlayText) videoOverlayText.textContent = m;
    } else if (/sedang ditonton|klik tombol putar|dijeda|stream berakhir/i.test(m)) {
      hideVideoOverlay();
      if (/sedang ditonton/i.test(m)) clearBufferWatchdog();
    } else if (/gagal|tidak tersedia|offline|geo-block/i.test(m)) {
      hideVideoOverlay();
    }
    if (/memuat stream|buffer|mencoba alternatif/i.test(m) && !/menyimpan video ke cache/i.test(m)) armBufferWatchdog();
  }

  function stopAudio() {
    if (hls) { try { hls.destroy(); } catch { /* ignore */ } hls = null; }
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    fpPlay.textContent = '▶';
  }

  // --- Cache video (Cache Storage) ---
  function videoCacheSupported() {
    return 'caches' in window && window.isSecureContext;
  }

  function openVideoCache() {
    return caches.open(VIDEO_CACHE_NAME);
  }

  function cachePreset() { return CACHE_PRESETS[cacheSize] || CACHE_PRESETS.off; }
  async function pruneVideoCache() {
    try {
      const preset = cachePreset();
      if (!preset.enabled) return;
      const cache = await openVideoCache();
      const keys = await cache.keys();
      const extra = keys.length - preset.maxEntries;
      for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
    } catch { /* ignore */ }
  }

  function fetchWithTimeout(url, ms, outerSignal) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    if (outerSignal) {
      if (outerSignal.aborted) ctrl.abort();
      else outerSignal.addEventListener('abort', () => ctrl.abort(), { once: true });
    }
    return fetch(url, { signal: ctrl.signal, cache: 'no-store' })
      .finally(() => clearTimeout(timer));
  }

  async function fetchCachedText(cache, url, signal) {
    const hit = await cache.match(url);
    if (hit) return hit.text();
    const res = await fetchWithTimeout(url, 12000, signal);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    try {
      await cache.put(url, new Response(text, {
        headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'X-TVRadio-Text': '1' },
      }));
    } catch { /* ignore */ }
    return text;
  }

  // Pilih varian kualitas terendah (paling ringan untuk jaringan jelek).
  function parseVariant(playlist, baseUrl) {
    const lines = playlist.split(/\r?\n/);
    let best = null;
    let bestBw = Infinity;
    let index = -1;
    let level = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
      const bw = Number((line.match(/BANDWIDTH=(\d+)/) || [])[1] || 0);
      const next = lines.slice(i + 1).find((l) => l.trim() && !l.trim().startsWith('#'));
      if (next && bw < bestBw) { bestBw = bw; best = next.trim(); index = level; }
      level++;
    }
    if (!best) return null;
    return { url: new URL(best, baseUrl).href, levelIndex: index };
  }

  function parseSegments(playlist, baseUrl) {
    const lines = playlist.split(/\r?\n/);
    const urls = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('#EXT-X-MAP:')) {
        const m = line.match(/URI="([^"]+)"/);
        if (m) urls.push(new URL(m[1], baseUrl).href);
        continue;
      }
      if (line.startsWith('#')) continue;
      urls.push(new URL(line, baseUrl).href);
    }
    return urls;
  }

  // Unduh playlist + beberapa segmen pertama ke Cache Storage sebelum diputar.
  async function prefetchHls(url, signal) {
    if (!videoCacheSupported()) return null;
    const cache = await openVideoCache();
    const master = await fetchCachedText(cache, url, signal);
    let playlistUrl = url;
    let playlistText = master;
    let levelIndex = -1;
    if (master && master.includes('#EXT-X-STREAM-INF')) {
      const variant = parseVariant(master, url);
      if (variant) {
        playlistUrl = variant.url;
        levelIndex = variant.levelIndex;
        playlistText = await fetchCachedText(cache, playlistUrl, signal);
      }
    }
    if (!playlistText) return { levelIndex, cached: 0 };
    const preset = cachePreset();
    const segments = parseSegments(playlistText, playlistUrl).slice(0, preset.prefetchSegments || 8);
    let done = 0;
    let idx = 0;
    const workers = Array.from({ length: Math.min(3, segments.length || 1) }, async () => {
      while (idx < segments.length) {
        if (signal && signal.aborted) break;
        const i = idx++;
        const seg = segments[i];
        try {
          if (await cache.match(seg)) { done++; continue; }
        } catch { /* ignore */ }
        setVideoStatus(`Menyimpan video ke cache… ${Math.round((done / segments.length) * 100)}%`);
        try {
          const res = await fetchWithTimeout(seg, 10000, signal);
          if (!res.ok) continue;
          const buf = await res.arrayBuffer();
          await cache.put(seg, new Response(buf, {
            headers: { 'Content-Type': res.headers.get('Content-Type') || 'video/mp2t' },
          }));
          done++;
          setVideoStatus(`Menyimpan video ke cache… ${Math.round((done / segments.length) * 100)}%`);
        } catch { /* lanjut */ }
      }
    });
    await Promise.all(workers);
    await pruneVideoCache();
    return { levelIndex, cached: done };
  }

  // Loader hls.js: pakai cache bila ada, simpan respons baru ke cache.
  function createCachingLoader() {
    const Base = window.Hls.DefaultConfig.loader;

    function CachingLoader(config) {
      this.inner = new Base(config);
      this.stats = this.inner.stats;
      window.__clCreated = (window.__clCreated || 0) + 1;
    }
    CachingLoader.prototype.load = function (context, config, callbacks) {
      const self = this;
      const url = context.url;
      window.__clLoads = (window.__clLoads || 0) + 1;
      window.__clUrls = (window.__clUrls || []).concat(url.slice(-40));
      const canCache = cacheVideo && /^https?:/i.test(url) &&
        context.rangeStart == null && context.rangeEnd == null;
      window.__clCanCache = (window.__clCanCache || 0) + (canCache ? 1 : 0);
      if (!canCache) { self.inner.load(context, config, callbacks); return; }

      openVideoCache().then((cache) => cache.match(url)).then((hit) => {
        if (!hit) {
          const wrapped = {
            onSuccess(response, stats, ctx, networkDetails) {
              try {
                if (response && response.data != null) {
                  const isText = typeof response.data === 'string';
                  const body = isText ? response.data : response.data.slice(0);
                  const headers = { 'X-TVRadio-Text': isText ? '1' : '0' };
                  const ct = networkDetails && networkDetails.getResponseHeader
                    ? networkDetails.getResponseHeader('Content-Type') : null;
                  if (ct) headers['Content-Type'] = ct;
                  cache.put(url, new Response(body, { headers })).then(pruneVideoCache).catch(() => {});
                }
              } catch { /* ignore */ }
              callbacks.onSuccess(response, stats, ctx, networkDetails);
            },
            onError: callbacks.onError,
            onTimeout: callbacks.onTimeout,
            onProgress: callbacks.onProgress,
          };
          self.inner.load(context, config, wrapped);
          return;
        }
        const isText = hit.headers.get('X-TVRadio-Text') === '1';
        const read = isText ? hit.text() : hit.arrayBuffer();
        read.then((data) => {
          const stats = self.inner.stats;
          const size = typeof data === 'string' ? data.length : data.byteLength;
          stats.loaded = size;
          stats.total = size;
          stats.loading.start = stats.loading.start || performance.now();
          stats.loading.first = performance.now();
          stats.loading.end = performance.now();
          stats.bwEstimate = Math.max(stats.bwEstimate || 0, 8000000);
          callbacks.onSuccess({ url, data, code: 200 }, stats, context, hit);
        }).catch(() => self.inner.load(context, config, callbacks));
      }).catch(() => self.inner.load(context, config, callbacks));
    };
    CachingLoader.prototype.abort = function () {
      try { this.inner.abort(); } catch { /* ignore */ }
    };
    CachingLoader.prototype.destroy = function () {
      try { this.inner.destroy(); } catch { /* ignore */ }
    };
    CachingLoader.prototype.getCacheAge = function () {
      return this.inner.getCacheAge ? this.inner.getCacheAge() : null;
    };
    CachingLoader.prototype.getResponseHeader = function (name) {
      return this.inner.getResponseHeader ? this.inner.getResponseHeader(name) : null;
    };
    return CachingLoader;
  }

  function visibleTvItems() {
    return sortItems(stations.filter(visibleStation));
  }
  function glowNavBtn(btn) {
    if (!btn) return;
    btn.classList.add('glow');
    clearTimeout(btn._glowTimer);
    btn._glowTimer = setTimeout(() => btn.classList.remove('glow'), 350);
  }
  function clearBufferWatchdog() {
    if (bufferWatchdog) { clearTimeout(bufferWatchdog); bufferWatchdog = null; }
    if (bufferWatchdog2) { clearTimeout(bufferWatchdog2); bufferWatchdog2 = null; }
    if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
  }
  function armBufferWatchdog() {
    if (bufferWatchdog || bufferWatchdog2 || scanTimer) return;
    if (!videoStation || videoModal.hidden) return;
    const station = videoStation;
    const session = videoSession;
    bufferStartAt = Date.now();
    bufferStartStationId = station.id;
    showVideoOverlay(scanning ? 'Scanning…' : 'Memuat video…', 'green');

    if (scanning) {
      bufferWatchdog = setTimeout(() => {
        bufferWatchdog = null;
        if (session !== videoSession || videoStation !== station) return;
        setBufferStat(station.id, 4000);
        showVideoOverlay('Scan: 3-5s (kuning)…', 'yellow');
        if (videoStatus) videoStatus.textContent = 'Scan: 3-5s (kuning)…';
      }, 3000);
      bufferWatchdog2 = setTimeout(() => {
        bufferWatchdog2 = null;
        if (session !== videoSession || videoStation !== station) return;
        setBufferStat(station.id, 7000);
        showVideoOverlay('Scan: 6-10s (merah)…', 'red');
        if (videoStatus) videoStatus.textContent = 'Scan: 6-10s (merah)…';
      }, 6000);
      scanTimer = setTimeout(() => {
        scanTimer = null;
        if (session !== videoSession || videoStation !== station) return;
        setBufferStat(station.id, 10000);
        showVideoOverlay('Scan: timeout 10s', 'red');
        if (videoStatus) videoStatus.textContent = 'Scan: timeout 10s';
        setTimeout(() => { if (scanning) advanceScan(); }, 250);
      }, 10000);
      return;
    }

    bufferWatchdog = setTimeout(() => {
      bufferWatchdog = null;
      if (session !== videoSession || videoStation !== station || videoModal.hidden) return;
      if (videoPlayer && videoPlayer.paused) return;
      setBufferStat(station.id, 3000);
      showVideoOverlay('Memuat lambat… (3s)', 'yellow');
      if (videoStatus) videoStatus.textContent = 'Memuat lambat… (3s)';
    }, 3000);

    bufferWatchdog2 = setTimeout(() => {
      bufferWatchdog2 = null;
      if (session !== videoSession || videoStation !== station || videoModal.hidden) return;
      if (videoPlayer && videoPlayer.paused) return;
      setBufferStat(station.id, 6000);
      showVideoOverlay('Buffering lama… (6s)', 'red');
      if (videoStatus) videoStatus.textContent = 'Buffering lama… (6s)';
    }, 6000);

    scanTimer = setTimeout(() => {
      scanTimer = null;
      if (session !== videoSession || videoStation !== station || videoModal.hidden) return;
      if (videoPlayer && videoPlayer.paused) return;
      setBufferStat(station.id, 10000);
      showVideoOverlay('Buffering > 10 detik', 'red');
      if (videoStatus) videoStatus.textContent = 'Buffering > 10 detik';
      if (!autoNextOnBuffer) {
        clearBufferWatchdog();
        armBufferWatchdog();
        showVideoOverlay('Menunggu buffering… (auto-next off)', 'yellow');
        if (videoStatus) videoStatus.textContent = 'Menunggu buffering… (auto-next off)';
        return;
      }
      const move = window.confirm('Buffering lebih dari 10 detik. Pindah ke kanal berikutnya?\n\nOK = Pindah, Batal = Tetap menunggu.');
      if (session !== videoSession || videoStation !== station) return;
      if (move) {
        markOffline(station, 'Buffering > 10 detik');
        excludeStation(station, 'Buffering > 10 detik');
        switchVideoBy(1);
      } else {
        clearBufferWatchdog();
        armBufferWatchdog();
        showVideoOverlay('Menunggu buffering…', 'yellow');
        if (videoStatus) videoStatus.textContent = 'Menunggu buffering…';
      }
    }, 10000);
  }
  function switchVideoBy(delta) {
    if (!isTv) return;
    const items = visibleTvItems();
    if (!items.length) return;
    const idx = videoStation ? items.findIndex((s) => s.id === videoStation.id) : -1;
    const next = idx < 0 ? 0 : (idx + delta + items.length) % items.length;
    glowNavBtn(delta < 0 ? videoPrev : videoNext);
    playVideo(items[next]);
  }

  function setScanMode(on) {
    if (scanModeTimer) { clearTimeout(scanModeTimer); scanModeTimer = null; }
    if (videoModal) videoModal.classList.toggle('scan-mode', !!on);
    if (scanProgress) scanProgress.hidden = !on;
    if (scanList) { scanList.hidden = !on; if (!on) scanList.innerHTML = ''; }
  }
  function renderScanList() {
    if (!scanList) return;
    scanList.innerHTML = '';
    const frag = document.createDocumentFragment();
    scanQueue.forEach((st, i) => {
      const item = document.createElement('div');
      const lvl = bufferLevel(bufferStats[st.id]);
      item.className = 'scan-item' + (i === scanIndex ? ' active' : '') + (lvl ? ' ' + lvl : '');
      item.dataset.id = st.id;
      item.innerHTML = `<span class="dot"></span><span class="name">${escapeHtml(st.name || '')}</span>`;
      item.addEventListener('click', () => { if (scanning) { scanIndex = i - 1; scanAdvanceLock = 0; advanceScan(); } });
      frag.appendChild(item);
    });
    scanList.appendChild(frag);
  }
  function updateScanProgress() {
    const total = scanQueue.length || 1;
    const done = Math.min(scanIndex + 1, total);
    const pct = Math.round((done / total) * 100);
    if (scanProgressFill) scanProgressFill.style.width = pct + '%';
    if (scanProgressText) scanProgressText.textContent = scanning ? `Scanning ${done}/${total}` : `Selesai ${total}/${total}`;
    if (scanList) {
      scanList.querySelectorAll('.scan-item').forEach((el, i) => {
        el.classList.toggle('active', i === scanIndex);
        const id = el.dataset.id;
        const lvl = bufferLevel(bufferStats[id]);
        el.classList.remove('green','yellow','red');
        if (lvl) el.classList.add(lvl);
      });
      const active = scanList.querySelector('.scan-item.active');
      if (active) active.scrollIntoView({ block: 'nearest' });
    }
  }
  function stopScan(msg) {
    scanning = false;
    if (scanProgressFill) scanProgressFill.style.width = '100%';
    if (scanProgressText) scanProgressText.textContent = 'Scan selesai';
    scanModeTimer = setTimeout(() => { scanModeTimer = null; setScanMode(false); }, 800);
    scanQueue = [];
    scanIndex = 0;
    scanAdvanceLock = 0;
    if (scanBtn) { scanBtn.classList.remove('busy'); scanBtn.textContent = '🔍 Scan Kanal'; }
    if (msg) toast(msg);
  }
  function advanceScan() {
    if (!scanning) return;
    const now = Date.now();
    if (now - scanAdvanceLock < 800) return;
    scanAdvanceLock = now;
    scanIndex++;
    if (scanIndex >= scanQueue.length) {
      stopScan(`Scan selesai: ${scanQueue.length} kanal`);
      return;
    }
    const st = scanQueue[scanIndex];
    if (scanBtn) scanBtn.textContent = `⏳ Scan ${scanIndex + 1}/${scanQueue.length}`;
    updateScanProgress();
    scanInternalPlay = true;
    playStation(st);
    scanInternalPlay = false;
  }
  function startScan() {
    if (scanning) { stopScan('Scan dihentikan'); return; }
    const items = stations.filter(visibleStation);
    if (!items.length) { toast('Tidak ada kanal untuk discan'); return; }
    scanning = true;
    scanQueue = items.slice();
    scanIndex = 0;
    if (scanBtn) { scanBtn.classList.add('busy'); scanBtn.textContent = `⏳ Scan 1/${scanQueue.length}`; }
    toast(`Mulai scan ${scanQueue.length} kanal…`);
    setScanMode(isTv);
    if (isTv) { renderScanList(); updateScanProgress(); }
    scanInternalPlay = true;
    playStation(scanQueue[0]);
    scanInternalPlay = false;
  }

  function closeVideo() {
    videoSession++;
    clearBufferWatchdog();
    if (prefetchAbort) { try { prefetchAbort.abort(); } catch { /* ignore */ } prefetchAbort = null; }
    videoStation = null;
    if (videoHls) { try { videoHls.destroy(); } catch { /* ignore */ } videoHls = null; }
    if (videoPlayer) { videoPlayer.pause(); videoPlayer.removeAttribute('src'); videoPlayer.load(); }
    videoModal.hidden = true;
    document.body.classList.remove('video-open');
  }

  // Susun daftar candidate stream: utama dulu, baru alternatif dari playlist eksternal.
  function streamCandidates(station) {
    const list = [];
    if (station.stream) list.push(station.stream);
    if (Array.isArray(station.alternatives)) {
      for (const u of station.alternatives) if (!list.includes(u)) list.push(u);
    }
    return list;
  }

  function playVideo(station) {
    videoSession++;
    clearBufferWatchdog();
    if (prefetchAbort) { try { prefetchAbort.abort(); } catch { /* ignore */ } prefetchAbort = null; }
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    if (hls) { try { hls.destroy(); } catch { /* ignore */ } hls = null; }
    currentStation = null;
    markPlayingRow();
    fp.hidden = true;
    videoStation = station;
    document.body.classList.remove('player-open');
    document.body.classList.add('video-open');

    videoTitle.textContent = station.name || 'Channel TV';
    videoSub.textContent = regionOf(station);
    videoModal.hidden = false;
    setVideoStatus('Memuat stream…');

    loadAlternatives();
    if (!station.stream && (!Array.isArray(station.alternatives) || !station.alternatives.length)) {
      setVideoStatus('Stream tidak tersedia.');
      markOffline(station, 'Stream tidak tersedia');
      excludeStation(station, 'Stream tidak tersedia');
      if (scanning) { setBufferStat(station.id, 10000); clearBufferWatchdog(); setTimeout(() => { if (scanning) advanceScan(); }, 300); }
      return;
    }
    tryNextStream(station, 0);
  }

  async function tryNextStream(station, index) {
    if (videoStation !== station) return;
    const candidates = streamCandidates(station);
    if (index >= candidates.length) {
      setVideoStatus('Semua stream gagal diputar. Kanal mungkin offline atau geo-blocked.');
      markOffline(station, 'Semua alternatif gagal (geo-blocked/CORS).');
      excludeStation(station, 'Semua alternatif gagal');
      if (scanning) {
        setBufferStat(station.id, 10000);
        clearBufferWatchdog();
        setTimeout(() => { if (scanning) advanceScan(); }, 350);
      }
      return;
    }
    const url = candidates[index];
    const isHls = /\.m3u8(\?|$)/i.test(url) || /playlist\.m3u8/i.test(url);
    setVideoStatus(index === 0 ? 'Memuat stream…' : `Mencoba alternatif ${index + 1}/${candidates.length}…`);

    if (!isHls || !window.Hls || !window.Hls.isSupported()) {
      videoPlayer.src = url;
      videoPlayer.play().then(() => {
        setVideoStatus('Sedang ditonton');
        markOnline(station);
      }).catch((err) => {
        setVideoStatus('Klik tombol putar pada video.');
        videoPlayer.onerror = () => tryNextStream(station, index + 1);
      });
      return;
    }

    startHlsVideo(station, url, videoSession, index, candidates.length);
  }

  // Konfigurasi hls.js: cepat mulai, stabil saat jaringan jelek, max 720p.
  function stableHlsConfig(extra) {
    const preset = cachePreset();
    const cfg = {
      enableWorker: true,
      lowLatencyMode: false,
      startLevel: 0,
      capLevelToPlayerSize: false,
      autoStartLoad: true,
      maxBufferLength: preset.maxBufferLength || 60,
      maxMaxBufferLength: preset.maxMaxBufferLength || 120,
      maxBufferSize: preset.maxBufferSize || (60 * 1000 * 1000),
      backBufferLength: 30,
      maxBufferHole: 1.5,
      highBufferWatchdogPeriod: 2,
      fragLoadingTimeOut: 20000,
      manifestLoadingTimeOut: 15000,
      levelLoadingTimeOut: 15000,
      fragLoadingMaxRetry: 6,
      fragLoadingMaxRetryTimeout: 15000,
      manifestLoadingMaxRetry: 4,
      manifestLoadingMaxRetryTimeout: 12000,
      levelLoadingMaxRetry: 4,
      levelLoadingMaxRetryTimeout: 12000,
      startFragPrefetch: true,
      testBandwidth: true,
      progressive: true,
      appendErrorMaxRetry: 3,
      nudgeOffset: 0.1,
      nudgeMaxRetry: 5,
    };
    if (extra) Object.assign(cfg, extra);
    return cfg;
  }

  async function startHlsVideo(station, url, session, index, total) {
    if (session !== videoSession || videoStation !== station) return;
    const preset = cachePreset();
    const useCacheLoader = preset.enabled && videoCacheSupported();

    if (useCacheLoader) {
      prefetchAbort = new AbortController();
      setVideoStatus('Memuat & caching…');
      const bg = prefetchHls(url, prefetchAbort.signal).catch(() => null);
      bg.then(() => { if (session === videoSession) pruneVideoCache(); });
    } else {
      setVideoStatus('Memuat stream…');
    }

    const cfg = stableHlsConfig(useCacheLoader ? { loader: createCachingLoader() } : {});
    cfg.startLevel = 0;

    videoHls = new window.Hls(cfg);
    videoHls.loadSource(url);
    videoHls.attachMedia(videoPlayer);
    let resolved = false;
    videoHls.on(window.Hls.Events.MANIFEST_PARSED, () => {
      if (resolved) return;
      try {
        const levels = (videoHls.levels || []).map((l, i) => ({ i, h: l.height || 0 }));
        const cap = levels.filter((l) => l.h > 0 && l.h <= 720).pop();
        if (cap) videoHls.autoLevelCapping = cap.i;
        else if (levels.length) videoHls.autoLevelCapping = 0;
        videoHls.nextLoadLevel = 0;
        videoHls.startLoad(0);
      } catch { /* ignore */ }
      resolved = true;
      setVideoStatus('Sedang ditonton');
      markOnline(station);
      videoPlayer.play().catch(() => setVideoStatus('Klik tombol putar pada video.'));
    });
    videoHls.on(window.Hls.Events.ERROR, (_, data) => {
      if (resolved) return;
      if (data && data.fatal) {
        resolved = true;
        try { if (prefetchAbort) prefetchAbort.abort(); } catch {}
        tryNextStream(station, index + 1);
      }
    });
    const onStalled = () => {
      if (resolved || !videoStation || videoStation !== station) return;
      showVideoOverlay('Buffering… mencoba memulihkan');
      try { videoHls.startLoad(); } catch {}
      armBufferWatchdog();
    };
    videoPlayer.addEventListener('stalled', onStalled);
    videoPlayer.addEventListener('error', () => {
      if (resolved) return;
      resolved = true;
      tryNextStream(station, index + 1);
    }, { once: true });
  }

  function armAudioScan(station) {
    clearBufferWatchdog();
    bufferStartAt = Date.now();
    bufferStartStationId = station.id;
    
    bufferWatchdog = setTimeout(() => {
      bufferWatchdog = null;
      if (!scanning || !currentStation || currentStation.id !== station.id) return;
      setBufferStat(station.id, 4000);
      setStatus('Scan: 3-5s (kuning)…');
    }, 3000);
    bufferWatchdog2 = setTimeout(() => {
      bufferWatchdog2 = null;
      if (!scanning || !currentStation || currentStation.id !== station.id) return;
      setBufferStat(station.id, 7000);
      setStatus('Scan: 6-10s (merah)…');
    }, 6000);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      if (!scanning || !currentStation || currentStation.id !== station.id) return;
      setBufferStat(station.id, 10000);
      setStatus('Scan: timeout 10s');
      setTimeout(() => { if (scanning) advanceScan(); }, 250);
    }, 10000);
  }

  function playAudio(station) {
    closeVideo();
    currentStation = station;
    markPlayingRow();
    fp.hidden = false;
    document.body.classList.add('player-open');
    fpType.textContent = '📻';
    fpTitle.textContent = station.name || 'Stasiun';
    fpSub.textContent = regionOf(station);

    const a = ensureAudio();
    stopAudio();
    setStatus('Memuat…');

    if (!station.stream) {
      setStatus('Stream tidak tersedia.');
      if (scanning) setTimeout(() => { if (scanning) advanceScan(); }, 300);
      return;
    }

    const url = station.stream;
    const isHls = /\.m3u8(\?|$)/i.test(url) || /chunklist|\.mpd/i.test(url);

    if (isHls && window.Hls && window.Hls.isSupported()) {
      hls = new window.Hls(stableHlsConfig());
      hls.loadSource(url);
      hls.attachMedia(a);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        a.play().catch(() => setStatus('Tekan tombol putar untuk memulai.'));
      });
      hls.on(window.Hls.Events.ERROR, (_, data) => {
        if (data && data.fatal) {
          setStatus('Gagal memutar stream.');
          markOffline(station, 'Gagal diputar di browser ini (bisa geo-blocked/CORS).');
        }
      });
    } else {
      a.src = url;
      a.play().catch(() => setStatus('Tekan tombol putar untuk memulai.'));
    }
    if (scanning) armAudioScan(station);
    fpPlay.textContent = '⏸';
  }

  function playStation(station) {
    if (scanning && !scanInternalPlay) stopScan('Scan dihentikan');
    if (isTv) playVideo(station);
    else playAudio(station);
  }

  // --- Player controls ---
  if (fpPlay) {
    fpPlay.addEventListener('click', () => {
      const a = ensureAudio();
      if (!currentStation) return;
      if (a.paused) {
        a.play().then(() => { fpPlay.textContent = '⏸'; }).catch(() => setStatus('Tidak bisa memutar. Coba lagi.'));
      } else { a.pause(); fpPlay.textContent = '▶'; }
    });
  }
  if (fpStop) fpStop.addEventListener('click', () => { stopAudio(); currentStation = null; markPlayingRow(); });
  if (fpClose) {
    fpClose.addEventListener('click', () => {
      stopAudio();
      currentStation = null;
      markPlayingRow();
      fp.hidden = true;
      document.body.classList.remove('player-open');
    });
  }
  if (fpVol) fpVol.addEventListener('input', () => { ensureAudio().volume = parseFloat(fpVol.value); });
  if (videoClose) videoClose.addEventListener('click', () => { if (scanning) stopScan('Scan dihentikan'); closeVideo(); });
  if (videoBackdrop) videoBackdrop.addEventListener('click', () => { if (scanning) stopScan('Scan dihentikan'); closeVideo(); });
  if (videoPrev) videoPrev.addEventListener('click', (e) => { e.stopPropagation(); switchVideoBy(-1); });
  if (videoNext) videoNext.addEventListener('click', (e) => { e.stopPropagation(); switchVideoBy(1); });
  document.addEventListener('keydown', (e) => {
    if (videoModal && !videoModal.hidden) {
      const k = e.key;
      if (k === 'Escape' || k === 'Backspace' || e.keyCode === 4) { e.preventDefault(); if (scanning) stopScan('Scan dihentikan'); closeVideo(); return; }
      if (k === 'ArrowLeft' || k === 'MediaTrackPrevious' || k === 'ChannelDown') { e.preventDefault(); switchVideoBy(-1); return; }
      if (k === 'ArrowRight' || k === 'MediaTrackNext' || k === 'ChannelUp') { e.preventDefault(); switchVideoBy(1); return; }
    }
  }, true);
  if (videoPlayer) {
    videoPlayer.addEventListener('playing', () => {
      if (videoStation) {
        markOnline(videoStation);
        if (bufferStartAt && bufferStartStationId === videoStation.id) {
          setBufferStat(videoStation.id, Date.now() - bufferStartAt);
          bufferStartAt = 0; bufferStartStationId = null;
        }
      }
      clearBufferWatchdog();
      setVideoStatus('Sedang ditonton');
      if (scanning && videoStation) {
        setTimeout(() => { if (scanning) advanceScan(); }, 500);
      }
    });
    videoPlayer.addEventListener('waiting', () => {
      if (videoStation && !videoModal.hidden) {
        armBufferWatchdog();
        if (!(bufferWatchdog || bufferWatchdog2)) return;
        if (videoOverlay && videoOverlay.classList.contains('level-yellow')) return;
        if (videoOverlay && videoOverlay.classList.contains('level-red')) return;
        showVideoOverlay('Buffering…');
      }
    });
    videoPlayer.addEventListener('canplay', () => {
      if (videoStation && videoPlayer.paused) showVideoOverlay('Klik tombol putar pada video.');
    });
    videoPlayer.addEventListener('error', () => {
      if (!videoStation || !videoPlayer.getAttribute('src')) return;
      setVideoStatus('Gagal memuat stream. Kanal ditandai offline (bisa geo-blocked/CORS).');
      markOffline(videoStation, 'Gagal diputar di browser ini (bisa geo-blocked/CORS).');
      excludeStation(videoStation, 'Gagal diputar');
      if (scanning) {
        setBufferStat(videoStation.id, 10000);
        clearBufferWatchdog();
        setTimeout(() => { if (scanning) advanceScan(); }, 350);
      }
    });
  }

  // --- Filter kategori ---
  if (filterTabs) {
    if (filterTabs.tagName === 'SELECT') {
      filterTabs.value = pageFilter;
      filterTabs.addEventListener('change', () => {
        pageFilter = filterTabs.value || 'all';
        if (scanning) stopScan('Scan dihentikan');
        render();
      });
    } else {
      filterTabs.querySelectorAll('.tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          filterTabs.querySelectorAll('.tab').forEach((t) => {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
          });
          tab.classList.add('active');
          tab.setAttribute('aria-selected', 'true');
          pageFilter = tab.dataset.filter || 'all';
          if (scanning) stopScan('Scan dihentikan');
          render();
        });
      });
    }
  }

  // --- Search (opsional: hanya aktif bila kotak pencarian ada) ---
  let searchTimer = null;
  function applySearch(scroll) {
    if (!searchInput) return;
    searchQuery = searchInput.value.trim();
    render();
    if (scroll) document.getElementById('utama').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => applySearch(false), 150);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); applySearch(true); }
    });
    const searchBtn = document.querySelector('.search-btn');
    if (searchBtn) searchBtn.addEventListener('click', () => applySearch(true));
  }

  // --- Refresh manual & otomatis 6 jam ---
  if (refreshBtn) {
    refreshBtn.addEventListener('click', (e) => {
      e.preventDefault(); // jangan pernah reload halaman
      refreshData(true);
    });
  }
  const THEME_KEY = 'tvradio_theme';
  function applyTheme(theme, save) {
    const t = ['dark','win11','mac','ubuntu','minimalis'].includes(theme) ? theme : 'dark';
    document.body.dataset.theme = t;
    if (themeSelect) themeSelect.value = t;
    if (save) try { localStorage.setItem(THEME_KEY, t); } catch {}
  }
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark', false);
  if (themeSelect) {
    themeSelect.addEventListener('change', () => applyTheme(themeSelect.value, true));
  }
  function openSettings(open) {
    if (!settingsPanel) return;
    const mobile = window.matchMedia('(max-width: 768px)').matches;
    if (!mobile) {
      settingsPanel.classList.remove('open');
      if (settingsBackdrop) settingsBackdrop.hidden = true;
      if (settingsFab) settingsFab.setAttribute('aria-expanded','false');
      return;
    }
    const on = !!open;
    settingsPanel.classList.toggle('open', on);
    if (settingsBackdrop) settingsBackdrop.hidden = !on;
    if (settingsFab) settingsFab.setAttribute('aria-expanded', String(on));
  }
  if (settingsFab) settingsFab.addEventListener('click', () => openSettings(!settingsPanel || !settingsPanel.classList.contains('open')));
  if (settingsClose) settingsClose.addEventListener('click', () => openSettings(false));
  if (settingsBackdrop) settingsBackdrop.addEventListener('click', () => openSettings(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') openSettings(false); });
  window.addEventListener('resize', () => { if (!window.matchMedia('(max-width: 768px)').matches) openSettings(false); });
  openSettings(false);
  if (scanBtn) {
    scanBtn.addEventListener('click', (e) => {
      e.preventDefault();
      startScan();
    });
  }
  if (countryClear) {
    countryClear.addEventListener('click', () => {
      countryFilters = [];
      try { localStorage.setItem('tvradio_country', ''); } catch {}
      const url = new URL(location.href); url.searchParams.delete('country'); history.replaceState({}, '', url);
      render(); renderProvinsi();
    });
  }
  if (viewToggle) {
    viewToggle.addEventListener('click', () => {
      gridView = !gridView;
      try { localStorage.setItem(VIEW_KEY, gridView ? 'grid' : 'list'); } catch { /* ignore */ }
      applyView();
    });
  }
  if (hideOfflineInput) {
    hideOfflineInput.checked = hideOffline;
    hideOfflineInput.addEventListener('change', () => {
      hideOffline = hideOfflineInput.checked;
      try { localStorage.setItem(HIDE_KEY, hideOffline ? 'true' : 'false'); } catch { /* ignore */ }
      render();
    });
  }
  if (autoNextInput) {
    autoNextInput.checked = autoNextOnBuffer;
    autoNextInput.addEventListener('change', () => {
      autoNextOnBuffer = autoNextInput.checked;
      try { localStorage.setItem(AUTO_NEXT_KEY, autoNextOnBuffer ? 'true' : 'false'); } catch { /* ignore */ }
    });
  }

  // --- Urutkan kanal TV ---
  if (sortGroup) {
    sortGroup.querySelectorAll('.sort-btn').forEach((btn) => {
      btn.addEventListener('click', () => applySort(btn.dataset.sort || 'name'));
    });
    syncSortUI();
  }

  // --- Cache video size ---
  function setCacheSize(value, notify) {
    const size = normalizeCacheSize(String(value));
    if (size !== 'off' && !videoCacheSupported()) {
      cacheSize = 'off'; cacheVideo = false;
      if (cacheSizeSelect) cacheSizeSelect.value = 'off';
      if (notify) toast('Cache video tidak didukung di perangkat ini');
      return false;
    }
    cacheSize = size;
    cacheVideo = CACHE_PRESETS[cacheSize].enabled;
    if (cacheSizeSelect) cacheSizeSelect.value = cacheSize;
    try { localStorage.setItem(CACHE_KEY, cacheSize); } catch { /* ignore */ }
    if (notify) {
      const label = { off: 'Off', small: 'Kecil', medium: 'Sedang', large: 'Besar' }[cacheSize] || cacheSize;
      toast(cacheSize === 'off' ? 'Cache video nonaktif' : `Cache video: ${label}`);
    }
    return true;
  }
  if (cacheSizeSelect) {
    cacheSizeSelect.value = cacheSize;
    cacheSizeSelect.addEventListener('change', () => setCacheSize(cacheSizeSelect.value, true));
  }

  // --- Donasi DANA ---
  function openDonate() {
    if (!donateModal) return;
    donateModal.hidden = false;
    document.body.classList.add('donate-open');
    if (donateClose) donateClose.focus();
  }
  function closeDonate() {
    if (!donateModal || donateModal.hidden) return;
    donateModal.hidden = true;
    document.body.classList.remove('donate-open');
    if (donateBtn) donateBtn.focus();
  }
  async function copyDonateNumber() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(DONATE_NUMBER);
        toast(`Nomor DANA disalin: ${DONATE_NUMBER}`);
        return;
      }
      throw new Error('clipboard tidak tersedia');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = DONATE_NUMBER;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
      toast(ok ? `Nomor DANA disalin: ${DONATE_NUMBER}` : `Nomor DANA: ${DONATE_NUMBER}`);
    }
  }
  if (donateBtn) donateBtn.addEventListener('click', openDonate);
  if (donateClose) donateClose.addEventListener('click', closeDonate);
  if (donateBackdrop) donateBackdrop.addEventListener('click', closeDonate);
  if (donateCopy) donateCopy.addEventListener('click', copyDonateNumber);
  if (donateModal) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !donateModal.hidden) closeDonate();
    });
  }
  if (location.protocol !== 'file:') {
    if (!lastRefresh || Date.now() - lastRefresh >= AUTO_REFRESH_MS) refreshData(false);
    setInterval(() => {
      if (document.visibilityState === 'visible') refreshData(false);
    }, AUTO_REFRESH_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh >= AUTO_REFRESH_MS) {
        refreshData(false);
      }
    });
  }

  // --- Mobile nav ---
  if (navToggle && navMenu) {
    const closeNav = () => {
      navMenu.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    };
    navToggle.addEventListener('click', () => {
      const open = navMenu.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
    navMenu.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeNav));
    const navClose = navMenu.querySelector('.nav-close');
    if (navClose) navClose.addEventListener('click', closeNav);
    navMenu.addEventListener('click', (e) => {
      if (e.target === navMenu || e.target.tagName === 'UL') closeNav();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navMenu.classList.contains('open')) closeNav();
    });
  }

  // --- Init ---
  render();
  renderProvinsi();
  loadAlternatives();
  applyView();
  updateInfoBar();
  window.TVRadio = {
    page,
    refresh: () => refreshData(true),
    getStations: () => stations,
    statusOf,
    setView: (mode) => {
      gridView = mode === 'grid';
      applyView();
    },
    setHideOffline: (value) => {
      hideOffline = Boolean(value);
      if (hideOfflineInput) hideOfflineInput.checked = hideOffline;
      render();
    },
    setSort: (value) => applySort(value),
    getSort: () => tvSort,
    setCacheVideo: (value) => setCacheSize(value === true ? 'medium' : value === false ? 'off' : value, false),
    getCacheVideo: () => cacheVideo,
    setCacheSize: (value) => setCacheSize(value, false),
    getCacheSize: () => cacheSize,
    cacheInfo: async () => {
      if (!videoCacheSupported()) return { supported: false, entries: 0 };
      const cache = await openVideoCache();
      const keys = await cache.keys();
      return { supported: true, entries: keys.length };
    },
    clearCache: async () => {
      if (!videoCacheSupported()) return false;
      try { return await caches.delete(VIDEO_CACHE_NAME); } catch { return false; }
    },
    openDonate,
  };
})();
