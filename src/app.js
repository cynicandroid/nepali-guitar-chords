import { readJson, writeJson } from './state/storage.js';
import { parseStrummingPattern } from './audio/strumming-config.js';
import { DRUM_BEATS } from './audio/drum-config.js';
import { TABLA_BOL_SAMPLES, TABLA_SAMPLE_FILES } from './audio/tabla-config.js';
import { getAudioContext } from './audio/audio-context.js';
import { createDrumVoicePlayer } from './audio/drum-machine.js';
import { createTablaSamplePlayer } from './audio/tabla-machine.js';
import { createStrummingPlayer } from './audio/strumming-player.js';
import { renderDirectory, renderFavorites } from './views/directory.js';
import { renderHelpView } from './views/help.js';
import { createFavoritesStore } from './state/favorites.js';
import { createSongHistoryStore } from './state/history.js';

let songs = [];
const FAVORITES_STORAGE_KEY = 'nepali-guitar-chords-favorites';
const favoritesStore = createFavoritesStore(FAVORITES_STORAGE_KEY);
const favoriteSongs = favoritesStore.indices;
const songHistory = createSongHistoryStore('nepali-guitar-chords-song-history');
const SAMPLER_SETTINGS_STORAGE_KEY = 'nepali-guitar-chords-sampler-settings';
let currentSongIndex = -1;
let returnLetter = null;
let helpReturnSongIndex = null;
let transposeOffset = 0;
let currentFontSize = 13; // px; matches the Markdown code-block baseline
let autoScrolling = false;
const SCROLL_SPEEDS = [0.1, 0.25, 0.5, 0.75, 1, 2];
const SCROLL_SPEED_SCALE = 0.25;
let scrollSpeed = 1;
let scrollPaused = false;
let scrollInterval = null;
let scrollDistanceRemainder = 0;

// Strumming player state
let strummingPlaying = false;
let drumMachineInterval = null;
let drumMachineStep = 0;
let drumMachinePlaying = false;
let selectedDrumBeat = 'pop-44';
let drumBpm = 100;
let drumSamplerExpanded = false;
let rhythmSamplerExpanded = false;
let currentStrokesList = [];
let strumBpm = 90;
let audioContext = null;
let metronomePlaying = false;
let metronomeInterval = null;
let metronomeStep = 0;
let metronomeBpm = 90;
let metronomeAccent = true;
let performanceControlsExpanded = false;
let screenAwakeEnabled = true;
let wakeLock = null;
let tablaStartToken = 0;
const drumVoicePlayer = createDrumVoicePlayer();
const tablaSamplePlayer = createTablaSamplePlayer({
    sampleFiles: TABLA_SAMPLE_FILES,
    bolSamples: TABLA_BOL_SAMPLES
});
const strummingPlayer = createStrummingPlayer({
    getContext: () => (audioContext ||= getAudioContext()),
    getSampledGuitar: () => ({
        instrument: window._tone_0250_SoundBlasterOld_sf2,
        instrumentName: '_tone_0250_SoundBlasterOld_sf2',
        Player: window.WebAudioFontPlayer
    }),
    onStroke: highlightStroke
});
const dom = {};
let deferredInstallPrompt = null;
let waitingServiceWorker = null;
let reloadingForUpdate = false;

const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const CHORD_REGEX = /\b([A-G][#b]?(?:m|min|maj|dim|aug|sus|add|m7|maj7|7|9|11|13|add9|sus2|sus4|2|4|5|6)*(?:\/[A-G][#b]?)?)\b/g;

function cacheDom() {
    [
        'contentContainer', 'viewerHeader', 'songList', 'searchInput',
        'transposeDisplay', 'songTitleDisplay', 'badgeCapo', 'badgeGenre',
        'badgeStrummingText', 'strummingPlayBtn', 'scrollControls', 'scrollBtn',
        'scrollPlayPauseBtn', 'scrollSpeedLabel', 'installBtn'
    ].forEach(id => {
        dom[id] = document.getElementById(id);
    });
}

function bindEvents() {
    dom.searchInput.addEventListener('input', handleSearch);
}

async function init() {
    cacheDom();
    bindEvents();
    registerServiceWorker();
    setupInstallPrompt();

    try {
        const response = await fetch('songs.json');
        songs = await response.json();
        songs.sort((left, right) => left.title.localeCompare(right.title));
        loadSamplerSettings();
        loadFavoriteSongs();
        songHistory.load();
        renderSongList(songs);
        showHome();
    } catch (e) {
        console.error("Failed to load songs.json", e);
        dom.contentContainer.innerHTML = `
            <div class="content-card">
                <h3>Error loading songs</h3>
                <p>Please make sure songs.json exists in the directory.</p>
            </div>
        `;
    }
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(registration => {
        if (registration.waiting && navigator.serviceWorker.controller) showAppUpdate(registration.waiting);
        registration.addEventListener('updatefound', () => {
            const installingWorker = registration.installing;
            if (!installingWorker) return;
            installingWorker.addEventListener('statechange', () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    showAppUpdate(installingWorker);
                }
            });
        });
        registration.update().catch(error => console.warn('App update check failed:', error));
    }).catch(error => {
        console.warn('Service worker registration failed:', error);
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloadingForUpdate) return;
        reloadingForUpdate = false;
        window.location.reload();
    });
    document.getElementById('applyAppUpdate')?.addEventListener('click', () => {
        if (!waitingServiceWorker) return;
        reloadingForUpdate = true;
        waitingServiceWorker.postMessage({ type: 'SKIP_WAITING' });
    });
    document.getElementById('dismissAppUpdate')?.addEventListener('click', () => {
        document.getElementById('appUpdateBanner').hidden = true;
    });
}

function showAppUpdate(worker) {
    waitingServiceWorker = worker;
    const banner = document.getElementById('appUpdateBanner');
    if (banner) banner.hidden = false;
}

function setupInstallPrompt() {
    if (isAppInstalled()) return;
    // Keep an install affordance visible on browsers without beforeinstallprompt
    // as well; the click handler gives those browsers their manual instructions.
    dom.installBtn.hidden = false;

    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        deferredInstallPrompt = event;
        dom.installBtn.hidden = false;
    });

    window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        dom.installBtn.hidden = true;
    });
}

function isAppInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

async function installApp() {
    if (!deferredInstallPrompt) {
        if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            showInstallHelp();
        } else {
            alert(getInstallInstructions());
        }
        return;
    }

    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === 'accepted') dom.installBtn.hidden = true;
    deferredInstallPrompt = null;
}

function showInstallHelp() {
    const modal = document.getElementById('installHelpModal');
    if (!modal) return;
    modal.hidden = false;
    const closeButton = modal.querySelector('.install-help-close');
    if (closeButton) closeButton.focus();
}

function closeInstallHelp() {
    const modal = document.getElementById('installHelpModal');
    if (modal) modal.hidden = true;
}

function getInstallInstructions() {
    const userAgent = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
    const isAndroid = /Android/i.test(userAgent);
    const isFirefox = /Firefox/i.test(userAgent);
    const isSafari = /Safari/i.test(userAgent) && !/Chrome|CriOS|Android/i.test(userAgent);
    const isWindows = /Windows/i.test(userAgent);
    const isMac = /Macintosh|Mac OS X/i.test(userAgent);

    if (isIOS) {
        return 'On iPhone or iPad: open your browser’s Share menu, choose “Add to Home Screen,” then tap Add.';
    }
    if (isAndroid && isFirefox) {
        return 'In Firefox for Android: open the browser menu and choose “Install” or “Add to Home screen.”';
    }
    if (isAndroid) {
        return 'In Android Chrome: open the browser menu and choose “Install app” or “Add to Home screen.”';
    }
    if (isWindows) {
        return 'In Chrome or Edge on Windows: choose the Install icon in the address bar, or open the browser menu and choose “Install app.”';
    }
    if (isMac && isSafari) {
        return 'In Safari on macOS: open the File menu and choose “Add to Dock.”';
    }
    if (isMac) {
        return 'In Chrome or Edge on macOS: choose the Install icon in the address bar, or choose “Install app” from the browser menu.';
    }
    return 'Open your browser menu and choose “Install app” or “Add to Home Screen.”';
}

function renderSongList(list) {
    const container = dom.songList;
    container.innerHTML = '';
    list.forEach((song, idx) => {
        const originalIndex = songs.indexOf(song);
        const genre = String(song.genre || '').trim();
        const genreMeta = genre && !['none', 'n/a'].includes(genre.toLowerCase())
            ? `<span>🎵 ${escapeHtml(genre)}</span>`
            : '';
        const singer = String(song.singer || '').trim();
        const singerMeta = singer && !['unknown', 'none', 'n/a'].includes(singer.toLowerCase())
            ? `<span>🎤 ${escapeHtml(singer)}</span>`
            : '';
        const capo = String(song.capo || '').trim();
        const capoMeta = capo && !/^(?:none|no\s*capo|n\/a)\b/i.test(capo)
            ? `<span>👆 ${escapeHtml(capo)}</span>`
            : '';
        const div = document.createElement('div');
        div.className = `song-item ${originalIndex === currentSongIndex && currentSongIndex !== -1 ? 'active' : ''}`;
        div.dataset.songIndex = String(originalIndex);
        div.onclick = () => selectSong(originalIndex);
        div.innerHTML = `
            <div class="song-item-title">${escapeHtml(song.title)}</div>
            <div class="song-meta-info">
                ${capoMeta}
                ${genreMeta}
                ${singerMeta}
            </div>
        `;
        container.appendChild(div);
    });
}

function handleSearch(e) {
    const term = e.target.value.toLowerCase();
    const filtered = songs.filter(s => 
        s.title.toLowerCase().includes(term) || 
        (s.genre && s.genre.toLowerCase().includes(term)) ||
        (s.capo && s.capo.toLowerCase().includes(term)) ||
        (s.singer && s.singer.toLowerCase().includes(term))
    );
    renderSongList(filtered);
    if (currentSongIndex === -1) {
        renderSearchDirectory(filtered, term);
    }
}

function renderSearchDirectory(list, term = '') {
    const container = dom.contentContainer;
    if (!container) return;
    if (!term) {
        showHome();
        return;
    }

    container.innerHTML = renderDirectory({ songs, listedSongs: list, escapeHtml, title: 'Search Results', description: `${list.length} song${list.length === 1 ? '' : 's'} found.`, searchable: true });
    container.scrollTop = 0;
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
}

function showHome() {
    helpReturnSongIndex = null;
    currentSongIndex = -1;
    stopStrummingPlayer();
    stopDrumMachine();
    stopTablaMachine();
    document.getElementById('viewerHeader').style.display = 'none';
    document.getElementById('backToListBtn').hidden = true;
    dom.searchInput.value = '';
    renderSongList(songs);
    
    document.querySelectorAll('.song-item').forEach(item => item.classList.remove('active'));
    if (autoScrolling) toggleAutoScroll();
    stopMetronome();
    releaseWakeLock();

    document.getElementById('contentContainer').innerHTML = renderDirectory({ songs, escapeHtml, title: 'Nepali Guitar Chords Collection', description: 'Welcome to the digital songbook containing chords and lyrics for over 200+ popular Nepali, and some Hindi, and English songs. Click any song below or search in the sidebar to view chords, transpose keys, and auto-scroll.' });
    document.getElementById('contentContainer').scrollTop = 0;
}

function showHelp(circleKey = null, returnSongIndex = null) {
    helpReturnSongIndex = returnSongIndex;
    currentSongIndex = -1;
    stopStrummingPlayer();
    stopDrumMachine();
    stopTablaMachine();
    document.getElementById('viewerHeader').style.display = 'none';
    document.getElementById('backToListBtn').hidden = true;
    document.querySelectorAll('.song-item').forEach(item => item.classList.remove('active'));
    if (autoScrolling) toggleAutoScroll();
    stopMetronome();
    releaseWakeLock();

    document.getElementById('contentContainer').innerHTML = renderHelpView({
        circleKey,
        canReturnToSong: helpReturnSongIndex !== null
    });
    const contentContainer = document.getElementById('contentContainer');
    contentContainer.scrollTop = 0;
    if (circleKey) {
        requestAnimationFrame(() => {
            const circle = document.getElementById('circleOfFifths');
            if (!circle) return;
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            if (isMobile) {
                circle.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            const top = circle.offsetTop - Math.max(24, (contentContainer.clientHeight - circle.offsetHeight) / 2);
            contentContainer.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        });
    }
}

function showCircleOfFifths(key = songs[currentSongIndex]?.key) {
    if (key && key !== 'N/A') showHelp(key, currentSongIndex >= 0 ? currentSongIndex : null);
}

function returnToSong() {
    if (helpReturnSongIndex === null) return;
    const songIndex = helpReturnSongIndex;
    helpReturnSongIndex = null;
    currentSongIndex = songIndex;
    document.getElementById('viewerHeader').style.display = 'flex';
    document.getElementById('backToListBtn').hidden = false;
    document.querySelectorAll('.song-item').forEach((item, index) => {
        item.classList.toggle('active', Number(item.dataset.songIndex) === songIndex);
    });
    renderCurrentSong();
    document.getElementById('contentContainer').scrollTop = 0;
}

function showFavorites() {
    helpReturnSongIndex = null;
    currentSongIndex = -1;
    stopStrummingPlayer();
    stopDrumMachine();
    stopTablaMachine();
    document.getElementById('viewerHeader').style.display = 'none';
    document.getElementById('backToListBtn').hidden = true;
    document.querySelectorAll('.song-item').forEach(item => item.classList.remove('active'));
    if (autoScrolling) toggleAutoScroll();
    stopMetronome();
    releaseWakeLock();

    const { favorites, html } = renderFavorites({ songs, favoriteSongs, escapeHtml, songHistory });
    renderSongList(favorites);
    document.getElementById('contentContainer').innerHTML = html;
    document.getElementById('contentContainer').scrollTop = 0;
}

function loadFavoriteSongs() {
    favoritesStore.load(songs);
}

function saveFavoriteSongs() {
    favoritesStore.save(songs);
}

function toggleFavorite() {
    if (currentSongIndex < 0) return;
    favoritesStore.toggle(currentSongIndex);
    saveFavoriteSongs();
    updateFavoriteButton();
    if (document.querySelector('.favorites-card')) showFavorites();
}

function updateFavoriteButton() {
    const button = document.getElementById('favoriteToggle');
    if (!button) return;
    const selected = favoriteSongs.has(currentSongIndex);
    button.textContent = selected ? '★' : '☆';
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', selected ? 'Remove from favorites' : 'Add to favorites');
    button.title = selected ? 'Remove from favorites' : 'Add to favorites';
}

function selectSong(index, sourceLetter = null) {
    currentSongIndex = index;
    songHistory.record(songs[index]);
    requestWakeLock();
    const titleInitial = songs[index]?.title?.[0]?.toUpperCase() || '#';
    returnLetter = sourceLetter || (/[A-Z]/.test(titleInitial) ? titleInitial : '#');
    document.getElementById('backToListBtn').hidden = false;
    transposeOffset = 0;
    stopStrummingPlayer();
    stopDrumMachine();
    stopTablaMachine();
    document.getElementById('transposeDisplay').innerText = `Key: 0`;
    document.getElementById('viewerHeader').style.display = 'flex';
    
    const items = document.querySelectorAll('.song-item');
    items.forEach((item, idx) => {
        const origIdx = songs.indexOf(songs[idx]);
        item.classList.toggle('active', origIdx === currentSongIndex);
    });

    renderCurrentSong();
    
    const container = document.getElementById('contentContainer');
    container.scrollTop = 0;
    if (window.matchMedia('(max-width: 768px)').matches) window.scrollTo(0, 0);
    if (autoScrolling) toggleAutoScroll();
}

function goBackToSongList() {
    const letter = returnLetter;
    showHome();
    if (!letter) return;
    const section = document.getElementById(`letter-${letter}`);
    if (section) section.scrollIntoView({ block: 'start' });
}

function renderCurrentSong() {
    if (currentSongIndex < 0 || currentSongIndex >= songs.length) return;
    const song = songs[currentSongIndex];

    document.getElementById('songTitleDisplay').innerText = song.title;
    updateFavoriteButton();
    const capo = String(song.capo || '').trim();
    const capoBadge = document.getElementById('badgeCapo');
    const hasCapoDisplay = capo && !/^(?:none|no\s*capo|n\/a)\b/i.test(capo);
    capoBadge.style.display = hasCapoDisplay ? '' : 'none';
    if (hasCapoDisplay) capoBadge.innerText = `Capo: ${capo}`;
    document.getElementById('badgeKey').innerText = `Key: ${song.key || 'N/A'}`;
    document.getElementById('badgeGenre').innerText = `Genre: ${song.genre || 'N/A'}`;
    document.getElementById('badgeStrummingText').innerText = `Strumming: ${song.strumming || 'N/A'}`;

    // Hide/show play button depending on whether strumming is available
    const playBtn = document.getElementById('strummingPlayBtn');
    if (!song.strumming || song.strumming.toLowerCase() === 'n/a') {
        playBtn.style.display = 'none';
    } else {
        playBtn.style.display = 'inline-flex';
    }

    let htmlContent = '';
    song.lines.forEach(lineObj => {
        let text = lineObj.text;
        text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        if (lineObj.is_chord) {
            text = text.replace(CHORD_REGEX, (match) => {
                const transposed = transposeChord(match, transposeOffset);
                return `<span class="chord">${transposed}</span>`;
            });
        }
        htmlContent += text + '\n';
    });

    selectedDrumBeat = DRUM_BEATS[selectedDrumBeat] ? selectedDrumBeat : 'pop-44';
    drumBpm = Number.isFinite(drumBpm) ? drumBpm : 100;
    document.getElementById('contentContainer').innerHTML = `
        <section class="performance-panel" aria-label="Performance controls">
            <div class="performance-heading" onclick="togglePerformanceControls()" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); togglePerformanceControls(); }" role="button" tabindex="0">
                <h5>🎵 Controls</h5>
                <div class="performance-heading-actions"><button class="drum-machine-toggle" id="performanceControlsToggle" onclick="event.stopPropagation(); togglePerformanceControls()" aria-label="Expand controls" aria-expanded="false" aria-controls="performanceControlsBody">+</button></div>
            </div>
            <div class="performance-controls" id="performanceControlsBody" hidden>
                <label>Metronome tempo <span id="metronomeBpmLabel">${metronomeBpm} BPM</span>
                    <input id="metronomeBpmInput" type="range" min="30" max="220" value="${metronomeBpm}" oninput="setMetronomeBpm(this.value)">
                </label>
                <label class="metronome-accent"><input id="metronomeAccentInput" type="checkbox" ${metronomeAccent ? 'checked' : ''} onchange="setMetronomeAccent(this.checked)"> Accent first beat</label>
                <label class="metronome-accent"><input id="screenAwakeInput" type="checkbox" ${screenAwakeEnabled ? 'checked' : ''} onchange="setScreenAwake(this.checked)"> Keep screen awake</label>
                <button class="btn btn-primary" id="metronomePlayBtn" onclick="toggleMetronome()">▶ Start metronome</button>
            </div>
        </section>
        <section class="drum-machine-panel rhythm-sampler-panel" aria-label="Rhythm samplers">
            <div class="drum-machine-heading" onclick="toggleRhythmSamplerPanel()" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleRhythmSamplerPanel(); }" role="button" tabindex="0">
                <h5>🥁 Rhythm Samplers</h5>
                <button class="drum-machine-toggle" id="rhythmSamplerToggle" onclick="event.stopPropagation(); toggleRhythmSamplerPanel()" aria-label="${rhythmSamplerExpanded ? 'Collapse' : 'Expand'} rhythm samplers" aria-expanded="${rhythmSamplerExpanded}" aria-controls="rhythmSamplerBody">${rhythmSamplerExpanded ? '−' : '+'}</button>
            </div>
            <div class="rhythm-sampler-body" id="rhythmSamplerBody"${rhythmSamplerExpanded ? '' : ' hidden'}>
            <div class="rhythm-sampler-subsection">
            <div class="drum-machine-heading subsection-heading" onclick="toggleDrumMachinePanel()" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleDrumMachinePanel(); }" role="button" tabindex="0">
                <h5>🥁 Drum Beat Sampler</h5>
                <button class="drum-machine-toggle" id="drumMachineToggle" onclick="event.stopPropagation(); toggleDrumMachinePanel()" aria-label="${drumSamplerExpanded ? 'Collapse' : 'Expand'} drum beat sampler" aria-expanded="${drumSamplerExpanded}" aria-controls="drumMachineBody">${drumSamplerExpanded ? '−' : '+'}</button>
            </div>
            <div class="drum-machine-body" id="drumMachineBody"${drumSamplerExpanded ? '' : ' hidden'}>
                <div class="drum-machine-controls">
                    <label>Beat
                        <select id="drumBeatSelect" onchange="selectDrumBeat(this.value)">
                            <option value="pop-44">Pop · 4/4</option>
                            <option value="rock-44">Rock · 4/4</option>
                            <option value="pop-34">Pop · 3/4</option>
                            <option value="rock-34">Rock · 3/4</option>
                        <option value="pop-24">Pop · 2/4</option>
                        <option value="rock-24">Rock · 2/4</option>
                        <option value="jazz-44">Jazz · 4/4</option>
                        <option value="jazz-34">Jazz · 3/4</option>
                        <option value="jazz-24">Jazz · 2/4</option>
                        <option value="funk-44">Funk · 4/4</option>
                        <option value="funk-34">Funk · 3/4</option>
                        <option value="funk-24">Funk · 2/4</option>
                        <option value="disco-44">Disco · 4/4</option>
                        <option value="disco-34">Disco · 3/4</option>
                        <option value="disco-24">Disco · 2/4</option>
                        <option value="hiphop-44">Hip Hop · 4/4</option>
                        <option value="hiphop-34">Hip Hop · 3/4</option>
                        <option value="hiphop-24">Hip Hop · 2/4</option>
                        </select>
                    </label>
                    <label class="drum-tempo-control">Tempo <span id="drumBpmLabel">100 BPM</span>
                        <input id="drumBpmInput" type="range" min="60" max="180" value="100" oninput="setDrumBpm(this.value)">
                    </label>
                    <button class="btn btn-primary" id="drumPlayBtn" onclick="toggleDrumMachine()">▶ Play beat</button>
                </div>
                <div class="drum-beat-indicator" id="drumBeatIndicator" aria-live="off"></div>
            </div>
            </div>
            <div class="rhythm-sampler-subsection tabla-subsection">
            <div class="drum-machine-heading subsection-heading" onclick="toggleTablaMachinePanel()" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleTablaMachinePanel(); }" role="button" tabindex="0">
                <h5>🪘 Tabla ko Taal Ma</h5>
                <button class="drum-machine-toggle" id="tablaMachineToggle" onclick="event.stopPropagation(); toggleTablaMachinePanel()" aria-label="${tablaSamplerExpanded ? 'Collapse' : 'Expand'} tabla sampler" aria-expanded="${tablaSamplerExpanded}" aria-controls="tablaMachineBody">${tablaSamplerExpanded ? '−' : '+'}</button>
            </div>
            <div class="drum-machine-body" id="tablaMachineBody"${tablaSamplerExpanded ? '' : ' hidden'}>
                <div class="drum-machine-controls">
                    <label>Note
                        <select id="tablaNoteSelect" onchange="setTablaNote(this.value)">
                            <option value="C">C</option><option value="C#">C#</option><option value="D">D</option><option value="D#">D#</option>
                            <option value="E">E</option><option value="F">F</option><option value="F#">F#</option><option value="G">G</option>
                            <option value="G#">G#</option><option value="A" selected>A</option><option value="A#">A#</option><option value="B">B</option>
                        </select>
                    </label>
                    <label>Taal
                        <select id="tablaTaalSelect" onchange="setTablaTaal(this.value)">
                            <option value="teentaal">Teentaal · 16</option>
                            <option value="dadra">Dadra · 6</option>
                            <option value="keherwa">Keherwa · 8</option>
                            <option value="jhaptaal">Jhaptaal · 10</option>
                            <option value="rupak">Rupak · 7</option>
                            <option value="ektaal">Ektaal · 12</option>
                            <option value="deepchandi">Deepchandi · 14</option>
                            <option value="dhamar">Dhamar · 14</option>
                            <option value="chautaal">Chautaal · 12</option>
                            <option value="jhumra">Jhumra · 14</option>
                            <option value="jhaptaal-open">Jhaptaal · Open Na · 10</option>
                            <option value="keherwa-open">Keherwa · Open Na · 8</option>
                            <option value="dadra-sharp">Dadra · Sharp Na · 6</option>
                        </select>
                    </label>
                    <label class="drum-tempo-control">Tempo <span id="tablaBpmLabel">100 BPM</span>
                        <input id="tablaBpmInput" type="range" min="30" max="220" value="100" oninput="setTablaBpm(this.value)">
                    </label>
                    <button class="btn btn-primary" id="tablaPlayBtn" onclick="toggleTablaMachine()">▶ Play tabla</button>
                </div>
                <div class="drum-beat-indicator" id="tablaBeatIndicator" aria-live="off"></div>
            </div>
            </div>
            </div>
        </section>
        <div class="strumming-player-panel" id="strummingPlayerPanel">
            <div class="strumming-header">
                <h3>🎸 Strumming Pattern Visualizer: <span id="strumPatternTitle">${escapeHtml(song.strumming || '')}</span></h3>
                <button class="btn" onclick="toggleStrummingPlayer()">✕ Close</button>
            </div>
            <div class="strumming-strokes-row" id="strokesRow">
                <!-- Populated dynamically -->
            </div>
            <div class="strumming-controls">
                <button class="btn btn-primary" id="strumPlayPauseBtn" onclick="toggleStrummingPlayback()">▶️ Play Rhythm</button>
                <button class="btn" onclick="adjustStrumBpm(-10)">🐢 Slower</button>
                <span id="strumBpmLabel" style="font-weight: 600; font-size: 0.9rem;">90 BPM</span>
                <button class="btn" onclick="adjustStrumBpm(10)">🐇 Faster</button>
            </div>
        </div>
        <div class="content-card">
        <pre id="songPre" style="font-size: ${currentFontSize}px;">${htmlContent}</pre>
        <div class="song-footer-back-wrap">
            <button class="btn song-footer-back" onclick="goBackToSongList()"><span aria-hidden="true">←</span><span>Back</span></button>
        </div>
        </div>
    `;
    syncSamplerControls();
    renderDrumBeatIndicator();
    renderTablaIndicator();
}

function toggleDrumMachinePanel() {
    const body = document.getElementById('drumMachineBody');
    const toggle = document.getElementById('drumMachineToggle');
    if (!body || !toggle) return;
    const expanded = body.hidden;
    body.hidden = !expanded;
    drumSamplerExpanded = expanded;
    saveSamplerSettings();
    toggle.textContent = expanded ? '−' : '+';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} drum beat sampler`);
    if (!expanded) stopDrumMachine();
}

function toggleRhythmSamplerPanel() {
    const body = document.getElementById('rhythmSamplerBody');
    const toggle = document.getElementById('rhythmSamplerToggle');
    if (!body || !toggle) return;
    const expanded = body.hidden;
    body.hidden = !expanded;
    rhythmSamplerExpanded = expanded;
    toggle.textContent = expanded ? '−' : '+';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} rhythm samplers`);
    if (!expanded) {
        stopDrumMachine();
        stopTablaMachine();
    }
}

function togglePerformanceControls() {
    const body = document.getElementById('performanceControlsBody');
    const toggle = document.getElementById('performanceControlsToggle');
    if (!body || !toggle) return;
    const expanded = body.hidden;
    body.hidden = !expanded;
    performanceControlsExpanded = expanded;
    toggle.textContent = expanded ? '−' : '+';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} performance controls`);
}

function playMetronomeClick(time, accented = false) {
    audioContext ||= getAudioContext();
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(accented ? 1500 : 950, time);
    gain.gain.setValueAtTime(accented ? 0.22 : 0.14, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(time);
    oscillator.stop(time + 0.08);
}

function playMetronomeStep() {
    if (!audioContext) return;
    playMetronomeClick(audioContext.currentTime, metronomeAccent && metronomeStep === 0);
    metronomeStep = (metronomeStep + 1) % 4;
}

function startMetronome() {
    audioContext ||= getAudioContext();
    if (!audioContext) return;
    if (audioContext.state === 'suspended') audioContext.resume();
    clearInterval(metronomeInterval);
    metronomePlaying = true;
    metronomeStep = 0;
    playMetronomeStep();
    metronomeInterval = setInterval(playMetronomeStep, 60000 / metronomeBpm);
    updateMetronomeControls();
    requestWakeLock();
}

function stopMetronome() {
    clearInterval(metronomeInterval);
    metronomeInterval = null;
    metronomePlaying = false;
    metronomeStep = 0;
    updateMetronomeControls();
}

function toggleMetronome() {
    if (metronomePlaying) stopMetronome();
    else startMetronome();
}

function setMetronomeBpm(value) {
    metronomeBpm = Math.max(30, Math.min(220, Number(value) || 90));
    const label = document.getElementById('metronomeBpmLabel');
    if (label) label.textContent = `${metronomeBpm} BPM`;
    if (metronomePlaying) startMetronome();
}

function setMetronomeAccent(value) {
    metronomeAccent = Boolean(value);
}

function updateMetronomeControls() {
    const button = document.getElementById('metronomePlayBtn');
    const toolbarButton = document.getElementById('metronomeBtn');
    if (button) button.textContent = metronomePlaying ? '⏹ Stop metronome' : '▶ Start metronome';
    if (toolbarButton) toolbarButton.classList.toggle('btn-primary', metronomePlaying);
}

async function requestWakeLock() {
    if (!screenAwakeEnabled || !('wakeLock' in navigator) || document.visibilityState !== 'visible' || wakeLock) return;
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (error) {
        console.warn('Screen wake lock is unavailable:', error);
    }
}

function setScreenAwake(value) {
    screenAwakeEnabled = Boolean(value);
    if (screenAwakeEnabled) requestWakeLock();
    else releaseWakeLock();
}

async function releaseWakeLock() {
    if (!wakeLock) return;
    try { await wakeLock.release(); } catch (error) { console.warn('Could not release screen wake lock:', error); }
    wakeLock = null;
}

function toggleFullscreen() {
    const target = document.querySelector('main');
    if (!target) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else if (target.requestFullscreen) target.requestFullscreen().catch(() => showFullscreenFallback());
    else showFullscreenFallback();
}

function showFullscreenFallback() {
    console.warn('Fullscreen is unavailable; use the browser menu instead.');
}

function handleVisibilityChange() {
    if (document.visibilityState === 'visible' && currentSongIndex >= 0) requestWakeLock();
}

function selectDrumBeat(value) {
    selectedDrumBeat = DRUM_BEATS[value] ? value : 'pop-44';
    drumMachineStep = 0;
    saveSamplerSettings();
    if (drumMachinePlaying) {
        stopDrumMachine();
        startDrumMachine();
    } else {
        renderDrumBeatIndicator();
    }
}

function setDrumBpm(value) {
    drumBpm = Number(value);
    saveSamplerSettings();
    document.getElementById('drumBpmLabel').textContent = `${drumBpm} BPM`;
    if (drumMachinePlaying) {
        stopDrumMachine();
        startDrumMachine();
    }
}

function renderDrumBeatIndicator(activeBeat = -1) {
    const indicator = document.getElementById('drumBeatIndicator');
    if (!indicator) return;
    const beat = DRUM_BEATS[selectedDrumBeat];
    indicator.innerHTML = Array.from({ length: beat.meter }, (_, index) =>
        `<span class="drum-beat-dot${index === activeBeat ? ' active' : ''}" aria-label="Beat ${index + 1}">${index + 1}</span>`
    ).join('');
}

function toggleDrumMachine() {
    if (drumMachinePlaying) stopDrumMachine();
    else startDrumMachine();
}

function startDrumMachine() {
    audioContext ||= getAudioContext();
    if (!audioContext) return;
    if (tablaPlaying) {
        stopTablaMachine();
        collapseTablaMachinePanel();
    }
    if (audioContext.state === 'suspended') audioContext.resume();
    drumMachinePlaying = true;
    drumMachineStep = 0;
    document.getElementById('drumPlayBtn').textContent = '⏹ Stop beat';
    renderDrumBeatIndicator();
    playDrumMachineStep();
    drumMachineInterval = setInterval(playDrumMachineStep, 60000 / drumBpm / 2);
}

function stopDrumMachine() {
    clearInterval(drumMachineInterval);
    drumMachineInterval = null;
    drumMachinePlaying = false;
    drumMachineStep = 0;
    const button = document.getElementById('drumPlayBtn');
    if (button) button.textContent = '▶ Play beat';
    renderDrumBeatIndicator();
}

function playDrumMachineStep() {
    const beat = DRUM_BEATS[selectedDrumBeat];
    const beatIndex = Math.floor(drumMachineStep / 2);
    renderDrumBeatIndicator(beatIndex);
    const now = audioContext.currentTime;
    if (beat.kick.includes(drumMachineStep)) playDrumHit('kick', now);
    if (beat.snare.includes(drumMachineStep)) playDrumHit('snare', now);
    if (beat.hat.includes(drumMachineStep)) playDrumHit('hat', now);
    drumMachineStep = (drumMachineStep + 1) % (beat.meter * 2);
}

function playDrumHit(type, time) {
    drumVoicePlayer.play(type, audioContext, time);
}

const TABLA_TAALS = {
    teentaal: { meter: 16, bols: ['Dha', 'Dhin', 'Dhin', 'Dha', 'Dha', 'Dhin', 'Dhin', 'Dha', 'Dha', 'Tin', 'Tin', 'Ta', 'Ta', 'Dhin', 'Dhin', 'Dha'] },
    dadra: { meter: 6, bols: ['Dha', 'Dhi', 'Na', 'Dha', 'Tu', 'Na'] },
    keherwa: { meter: 8, bols: ['Dha', 'Ge', 'Na', 'Ti', 'Na', 'Ka', 'Dhi', 'Na'] },
    jhaptaal: { meter: 10, bols: ['Dhi', 'Na', 'Dhi', 'Dhi', 'Na', 'Tin', 'Na', 'Dhi', 'Dhi', 'Na'] },
    rupak: { meter: 7, bols: ['Tin', 'Tin', 'Na', 'Dhin', 'Na', 'Dhin', 'Na'] },
    ektaal: { meter: 12, bols: ['Dhin', 'Dhin', 'DhaGe', 'Tirakita', 'Tu', 'Na', 'Kat', 'Ta', 'Dhin', 'Dhin', 'DhaGe', 'Dhin'] },
    deepchandi: { meter: 14, bols: ['Dha', 'Dhin', 'Dha', 'Dha', 'Dha', 'Tin', 'Ta', 'Ta', 'Tin', 'Dha', 'Dhin', 'Dha', 'Dha', 'Dha'] },
    dhamar: { meter: 14, bols: ['Ka', 'Dhi', 'Ta', 'Dhi', 'Ta', 'Dha', 'Ge', 'Ti', 'Ta', 'Ki', 'Ta', 'Dhi', 'Ta', 'Dha'] },
    chautaal: { meter: 12, bols: ['Dha', 'Dha', 'Dhin', 'Ta', 'Kit', 'Dha', 'Dhin', 'Ta', 'Tit', 'Kat', 'Gadi', 'Ghen'] },
    jhumra: { meter: 14, bols: ['Dhin', 'Dha', 'Dhin', 'Dha', 'Tin', 'Ta', 'Dhin', 'Dha', 'Dhin', 'Dha', 'Tin', 'Ta', 'Dhin', 'Dha'] },
    'jhaptaal-open': { meter: 10, bols: ['Dhi', 'NaOpen', 'Dhi', 'Dhi', 'NaOpen', 'Tin', 'NaOpen', 'Dhi', 'Dhi', 'NaOpen'] },
    'keherwa-open': { meter: 8, bols: ['Dha', 'Ge', 'NaOpen', 'TeNe', 'NaOpen', 'Ke', 'Dhi', 'NaOpen'] },
    'dadra-sharp': { meter: 6, bols: ['Dha', 'Dhi', 'NaSharp', 'Dha', 'Tu', 'NaSharp'] }
};
let tablaPlaying = false;
let tablaInterval = null;
let tablaStep = 0;
let tablaBpm = 100;
let tablaNote = 'A';
let tablaTaal = 'teentaal';
let tablaSamplerExpanded = false;
function toggleTablaMachinePanel() {
    const body = document.getElementById('tablaMachineBody');
    const toggle = document.getElementById('tablaMachineToggle');
    if (!body || !toggle) return;
    const expanded = body.hidden;
    body.hidden = !expanded;
    tablaSamplerExpanded = expanded;
    saveSamplerSettings();
    toggle.textContent = expanded ? '−' : '+';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} tabla sampler`);
    if (!expanded) stopTablaMachine();
}

function collapseDrumMachinePanel() {
    drumSamplerExpanded = false;
    const body = document.getElementById('drumMachineBody');
    const toggle = document.getElementById('drumMachineToggle');
    if (body) body.hidden = true;
    if (toggle) {
        toggle.textContent = '+';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Expand drum beat sampler');
    }
    saveSamplerSettings();
}

function collapseTablaMachinePanel() {
    tablaSamplerExpanded = false;
    const body = document.getElementById('tablaMachineBody');
    const toggle = document.getElementById('tablaMachineToggle');
    if (body) body.hidden = true;
    if (toggle) {
        toggle.textContent = '+';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Expand tabla sampler');
    }
    saveSamplerSettings();
}

function setTablaBpm(value) {
    tablaBpm = Number(value);
    saveSamplerSettings();
    const label = document.getElementById('tablaBpmLabel');
    if (label) label.textContent = `${tablaBpm} BPM`;
    if (tablaPlaying) startTablaMachine();
}

function setTablaNote(value) {
    tablaNote = value;
    saveSamplerSettings();
}

function setTablaTaal(value) {
    tablaTaal = TABLA_TAALS[value] ? value : 'teentaal';
    tablaStep = 0;
    saveSamplerSettings();
    renderTablaIndicator();
    if (tablaPlaying) startTablaMachine();
}

function renderTablaIndicator(activeBeat = -1) {
    const indicator = document.getElementById('tablaBeatIndicator');
    if (!indicator) return;
    const taal = TABLA_TAALS[tablaTaal];
    indicator.innerHTML = Array.from({ length: taal.meter }, (_, index) =>
        `<span class="drum-beat-dot${index === activeBeat ? ' active' : ''}" aria-label="Matra ${index + 1}">${index + 1}</span>`
    ).join('');
}

function loadSamplerSettings() {
    const saved = readJson(SAMPLER_SETTINGS_STORAGE_KEY, {});
    if (DRUM_BEATS[saved.drumBeat]) selectedDrumBeat = saved.drumBeat;
    if (Number.isFinite(Number(saved.drumBpm))) drumBpm = Number(saved.drumBpm);
    if (typeof saved.tablaNote === 'string') tablaNote = saved.tablaNote;
    if (TABLA_TAALS[saved.tablaTaal]) tablaTaal = saved.tablaTaal;
    if (Number.isFinite(Number(saved.tablaBpm))) tablaBpm = Number(saved.tablaBpm);
    if (typeof saved.drumSamplerExpanded === 'boolean') drumSamplerExpanded = saved.drumSamplerExpanded;
    if (typeof saved.tablaSamplerExpanded === 'boolean') tablaSamplerExpanded = saved.tablaSamplerExpanded;
}

function saveSamplerSettings() {
    writeJson(SAMPLER_SETTINGS_STORAGE_KEY, {
        drumBeat: selectedDrumBeat,
        drumBpm,
        tablaNote,
        tablaTaal,
        tablaBpm,
        drumSamplerExpanded,
        tablaSamplerExpanded
    });
}

function syncSamplerControls() {
    const drumSelect = document.getElementById('drumBeatSelect');
    const drumTempo = document.getElementById('drumBpmInput');
    const tablaNoteSelect = document.getElementById('tablaNoteSelect');
    const tablaTaalSelect = document.getElementById('tablaTaalSelect');
    const tablaTempo = document.getElementById('tablaBpmInput');
    if (drumSelect) drumSelect.value = selectedDrumBeat;
    if (drumTempo) drumTempo.value = String(drumBpm);
    if (tablaNoteSelect) tablaNoteSelect.value = tablaNote;
    if (tablaTaalSelect) tablaTaalSelect.value = tablaTaal;
    if (tablaTempo) tablaTempo.value = String(tablaBpm);
    const drumLabel = document.getElementById('drumBpmLabel');
    const tablaLabel = document.getElementById('tablaBpmLabel');
    if (drumLabel) drumLabel.textContent = `${drumBpm} BPM`;
    if (tablaLabel) tablaLabel.textContent = `${tablaBpm} BPM`;
}

function toggleTablaMachine() {
    if (tablaPlaying) stopTablaMachine();
    else startTablaMachine();
}

async function loadTablaSamples() {
    audioContext ||= getAudioContext();
    if (!audioContext) throw new Error('Web Audio is not supported in this browser.');
    return tablaSamplePlayer.load(audioContext);
}

async function startTablaMachine() {
    const startToken = ++tablaStartToken;
    audioContext ||= getAudioContext();
    if (!audioContext) return;
    if (drumMachinePlaying) {
        stopDrumMachine();
        collapseDrumMachinePanel();
    }
    if (audioContext.state === 'suspended') audioContext.resume();
    try {
        await loadTablaSamples();
    } catch (error) {
        console.error('Tabla samples could not be loaded:', error);
        const button = document.getElementById('tablaPlayBtn');
        if (button) button.textContent = '⚠ Tabla samples unavailable';
        return;
    }
    if (startToken !== tablaStartToken) return;
    clearInterval(tablaInterval);
    tablaPlaying = true;
    tablaStep = 0;
    const button = document.getElementById('tablaPlayBtn');
    if (button) button.textContent = '⏹ Stop tabla';
    playTablaStep();
    tablaInterval = setInterval(playTablaStep, 60000 / tablaBpm);
}

function stopTablaMachine() {
    tablaStartToken += 1;
    clearInterval(tablaInterval);
    tablaInterval = null;
    tablaPlaying = false;
    tablaStep = 0;
    const button = document.getElementById('tablaPlayBtn');
    if (button) button.textContent = '▶ Play tabla';
    renderTablaIndicator();
}

function getTablaNoteFrequency() {
    const notes = { C: 261.63, 'C#': 277.18, D: 293.66, 'D#': 311.13, E: 329.63, F: 349.23, 'F#': 369.99, G: 392, 'G#': 415.3, A: 440, 'A#': 466.16, B: 493.88 };
    return notes[tablaNote] || 440;
}

function playTablaStep() {
    const taal = TABLA_TAALS[tablaTaal];
    renderTablaIndicator(tablaStep);
    playTablaBol(taal.bols[tablaStep], audioContext.currentTime);
    tablaStep = (tablaStep + 1) % taal.meter;
}

function playTablaBol(bol, time) {
    const playbackRate = getTablaNoteFrequency() / 440;
    tablaSamplePlayer.playBol(bol, audioContext, time, playbackRate);
}

// Strumming Player Logic
function toggleStrummingPlayer() {
    const panel = document.getElementById('strummingPlayerPanel');
    if (!panel) return;
    
    const isOpen = panel.classList.toggle('active');
    if (isOpen) {
        buildStrokesCards();
    } else {
        stopStrummingPlayer();
    }
}

function parseStrummingStrokes(strumStr) {
    return parseStrummingPattern(strumStr);
}

function buildStrokesCards() {
    if (currentSongIndex < 0) return;
    const song = songs[currentSongIndex];
    currentStrokesList = parseStrummingStrokes(song.strumming);
    
    const row = document.getElementById('strokesRow');
    if (!row) return;

    row.innerHTML = currentStrokesList.map((stroke, idx) => {
        let icon = '↓';
        let label = 'Down';
        if (stroke === 'U') { icon = '↑'; label = 'Up'; }
        else if (stroke === 'C') { icon = '✋'; label = 'Chuck / Slap'; }
        else if (stroke === 'M' || stroke === 'X') { icon = '✖'; label = 'Mute'; }
        else if (stroke === 'S') { icon = '✋'; label = 'Slap'; }

        return `
            <div class="stroke-card" id="stroke-${idx}">
                <div class="stroke-icon">${icon}</div>
                <div class="stroke-label">${label}</div>
            </div>
        `;
    }).join('');
}

function toggleStrummingPlayback() {
    const btn = document.getElementById('strumPlayPauseBtn');
    if (!strummingPlayer.isPlaying) {
        if (currentStrokesList.length === 0) buildStrokesCards();
        strummingPlaying = strummingPlayer.start(currentStrokesList, strumBpm);
        if (strummingPlaying && btn) btn.innerText = '⏸️ Pause';
    } else {
        stopStrummingPlayer();
    }
}

function highlightStroke(index) {
    document.querySelectorAll('.stroke-card').forEach((card, idx) => {
        card.classList.toggle('active', idx === index);
    });
}

function stopStrummingPlayer() {
    strummingPlaying = false;
    strummingPlayer.stop();
    const btn = document.getElementById('strumPlayPauseBtn');
    if (btn) btn.innerText = '▶️ Play Rhythm';
    document.querySelectorAll('.stroke-card').forEach(card => card.classList.remove('active'));
}

function adjustStrumBpm(delta) {
    strumBpm = Math.max(40, Math.min(200, strumBpm + delta));
    document.getElementById('strumBpmLabel').innerText = `${strumBpm} BPM`;
    if (strummingPlaying) {
        strummingPlayer.restart(strumBpm);
    }
}

function transposeChord(chordStr, semitones) {
    if (semitones === 0) return chordStr;
    
    if (chordStr.includes('/')) {
        const parts = chordStr.split('/');
        return transposeChord(parts[0], semitones) + '/' + transposeChord(parts[1], semitones);
    }

    const match = chordStr.match(/^([A-G][#b]?)(.*)$/);
    if (!match) return chordStr;

    const root = match[1];
    const suffix = match[2];

    let noteList = root.includes('b') ? NOTES_FLAT : NOTES_SHARP;
    let index = noteList.indexOf(root);
    if (index === -1) {
        index = NOTES_SHARP.indexOf(root);
        noteList = NOTES_SHARP;
    }
    if (index === -1) return chordStr;

    let newIndex = (index + semitones) % 12;
    if (newIndex < 0) newIndex += 12;

    return noteList[newIndex] + suffix;
}

function transpose(semitones) {
    transposeOffset += semitones;
    document.getElementById('transposeDisplay').innerText = `Key: ${transposeOffset > 0 ? '+' + transposeOffset : transposeOffset}`;
    renderCurrentSong();
}

function adjustFontSize(delta) {
    currentFontSize = Math.max(10, Math.min(24, currentFontSize + delta));
    const pre = document.getElementById('songPre');
    if (pre) pre.style.fontSize = `${currentFontSize}px`;
}

function toggleTheme() {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme');
    body.setAttribute('data-theme', currentTheme === 'dark' ? 'light' : 'dark');
}

function toggleAutoScroll() {
    autoScrolling = !autoScrolling;
    const controls = document.getElementById('scrollControls');
    const btn = document.getElementById('scrollBtn');
    if (autoScrolling) {
        scrollPaused = false;
        controls.classList.add('active');
        if (btn) btn.classList.add('btn-primary');
        updateScrollPlayPauseButton();
        startAutoScrollInterval();
    } else {
        controls.classList.remove('active');
        if (btn) btn.classList.remove('btn-primary');
        clearInterval(scrollInterval);
        scrollInterval = null;
    }
}

function startAutoScrollInterval() {
    clearInterval(scrollInterval);
    if (!autoScrolling || scrollPaused) return;

    const container = document.getElementById('contentContainer');
    scrollDistanceRemainder = 0;
    scrollInterval = setInterval(() => {
        const mobile = window.matchMedia('(max-width: 768px)').matches;
        // Accumulate fractional movement so the slowest presets still scroll.
        scrollDistanceRemainder += scrollSpeed * SCROLL_SPEED_SCALE;
        const distance = Math.floor(scrollDistanceRemainder);
        if (distance > 0) {
            scrollDistanceRemainder -= distance;
            if (mobile) window.scrollBy(0, distance);
            else container.scrollTop += distance;
        }
        const atEnd = mobile
            ? window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
            : container.scrollTop + container.clientHeight >= container.scrollHeight;
        if (atEnd) {
            scrollPaused = true;
            clearInterval(scrollInterval);
            scrollInterval = null;
            updateScrollPlayPauseButton();
        }
    }, 50);
}

function toggleScrollPlayback() {
    if (!autoScrolling) return;
    scrollPaused = !scrollPaused;
    if (scrollPaused) {
        clearInterval(scrollInterval);
        scrollInterval = null;
    } else {
        startAutoScrollInterval();
    }
    updateScrollPlayPauseButton();
}

function updateScrollPlayPauseButton() {
    const btn = document.getElementById('scrollPlayPauseBtn');
    if (!btn) return;
    btn.innerText = scrollPaused ? '▶' : '⏸';
    btn.title = scrollPaused ? 'Resume auto scroll' : 'Pause auto scroll';
}

function changeScrollSpeed(delta) {
    const currentIndex = SCROLL_SPEEDS.indexOf(scrollSpeed);
    const nextIndex = Math.max(0, Math.min(SCROLL_SPEEDS.length - 1, currentIndex + delta));
    scrollSpeed = SCROLL_SPEEDS[nextIndex];
    document.getElementById('scrollSpeedLabel').innerText = `Speed: ${formatScrollSpeed(scrollSpeed)}x`;
    if (autoScrolling && !scrollPaused) startAutoScrollInterval();
}

function formatScrollSpeed(speed) {
    return String(speed);
}

// The UI currently contains inline event handlers. Keep these public while
// the application is progressively split into modules.
Object.assign(window, {
    showHome, showHelp, showCircleOfFifths, showFavorites, selectSong, goBackToSongList, returnToSong,
    toggleFavorite, transpose, adjustFontSize, toggleTheme,
    toggleAutoScroll, toggleScrollPlayback, changeScrollSpeed,
    toggleStrummingPlayer, toggleStrummingPlayback, adjustStrumBpm,
    toggleDrumMachinePanel, selectDrumBeat, setDrumBpm, toggleDrumMachine,
    toggleTablaMachinePanel, toggleTablaMachine, setTablaBpm, setTablaNote,
    setTablaTaal, installApp, showInstallHelp, closeInstallHelp,
    toggleMetronome, setMetronomeBpm, setMetronomeAccent, toggleFullscreen,
    togglePerformanceControls, toggleRhythmSamplerPanel, setScreenAwake
});

document.addEventListener('visibilitychange', handleVisibilityChange);
document.addEventListener('fullscreenchange', () => {
    const button = document.getElementById('fullscreenBtn');
    if (button) button.textContent = document.fullscreenElement ? '⛶ Exit fullscreen' : '⛶ Fullscreen';
});
document.addEventListener('DOMContentLoaded', init);
