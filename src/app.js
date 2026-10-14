let songs = [];
const favoriteSongs = new Set();
const FAVORITES_STORAGE_KEY = 'nepali-guitar-chords-favorites';
const SAMPLER_SETTINGS_STORAGE_KEY = 'nepali-guitar-chords-sampler-settings';
let currentSongIndex = -1;
let returnLetter = null;
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
let drumNoiseBuffer = null;
let selectedDrumBeat = 'pop-44';
let drumBpm = 100;
let drumSamplerExpanded = false;
let tanpuraPluckIndex = 0;
let tanpuraDroneOscillators = [];
let tanpuraSa = 'C#';
let tanpuraPattern = 'PSSS';
let tanpuraVolume = 0.7;
let strummingInterval = null;
let strummingLoopTimeout = null;
let currentStrokeIndex = 0;
let currentStrokesList = [];
let strumBpm = 90;
let audioContext = null;
let webAudioFontPlayer = null;
let webAudioFontReady = false;
const G_CHORD_MIDI = [43, 47, 50, 55, 59, 67];
const dom = {};
let deferredInstallPrompt = null;

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
        loadSamplerSettings();
        loadFavoriteSongs();
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
    navigator.serviceWorker.register('sw.js').catch(error => {
        console.warn('Service worker registration failed:', error);
    });
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
        const div = document.createElement('div');
        div.className = `song-item ${originalIndex === currentSongIndex && currentSongIndex !== -1 ? 'active' : ''}`;
        div.onclick = () => selectSong(originalIndex);
        div.innerHTML = `
            <div class="song-item-title">${escapeHtml(song.title)}</div>
            <div class="song-meta-info">
                <span>🎸 ${escapeHtml(song.capo || 'No Capo')}</span>
                <span>🎵 ${escapeHtml(song.genre || 'Music')}</span>
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
        (s.capo && s.capo.toLowerCase().includes(term))
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

    const letters = Array.from(new Set(list.map(song => {
        const first = song.title?.[0]?.toUpperCase() || '#';
        return /[A-Z]/.test(first) ? first : '#';
    }))).sort((a, b) => a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b));

    const sections = letters.map(letter => {
        const letterSongs = list.filter(song => {
            const first = song.title?.[0]?.toUpperCase() || '#';
            return (/^[A-Z]$/.test(first) ? first : '#') === letter;
        });
        return `
            <div class="directory-section" id="mobile-search-letter-${letter}">
                <div class="directory-letter">${letter}</div>
                <div class="directory-songs-grid">
                    ${letterSongs.map(song => {
                        const index = songs.indexOf(song);
                        const capoText = song.capo && song.capo.toLowerCase() !== 'none' ? `Capo: ${song.capo}` : '';
                        return `<div class="directory-song-card" onclick="selectSong(${index}, '${letter}')">
                            <div class="directory-song-title">${escapeHtml(song.title)}</div>
                            ${capoText ? `<div class="directory-song-capo">🎸 ${escapeHtml(capoText)}</div>` : ''}
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
    }).join('');

    container.innerHTML = `
        <div class="content-card" style="max-width: 1000px;">
            <div class="home-hero">
                <h2>Search Results</h2>
                <p>${list.length} song${list.length === 1 ? '' : 's'} found.</p>
            </div>
            <div class="directory-container">
                ${sections || '<p class="favorites-empty">No matching songs found.</p>'}
            </div>
        </div>`;
    container.scrollTop = 0;
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
}

function showHome() {
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

    const letters = sortedLetters();
    let alphabetHtml = letters.map(let => `<a href="#letter-${let}" class="alphabet-btn">${let}</a>`).join('');
    
    let sectionsHtml = '';
    letters.forEach(letter => {
        const letterSongs = songs.filter(s => {
            const first = s.title ? s.title[0].toUpperCase() : '#';
            const key = first.match(/[A-Z]/) ? first : '#';
            return key === letter;
        });

        if (letterSongs.length > 0) {
            let songCards = letterSongs.map(s => {
                const origIdx = songs.indexOf(s);
                const capoText = s.capo && s.capo.toLowerCase() !== 'none' ? `Capo: ${s.capo}` : '';
                return `
                    <div class="directory-song-card" onclick="selectSong(${origIdx}, '${letter}')">
                        <div class="directory-song-title">${escapeHtml(s.title)}</div>
                        ${capoText ? `<div class="directory-song-capo">🎸 ${escapeHtml(capoText)}</div>` : ''}
                    </div>
                `;
            }).join('');

            sectionsHtml += `
                <div class="directory-section" id="letter-${letter}">
                    <div class="directory-letter">${letter}</div>
                    <div class="directory-songs-grid">
                        ${songCards}
                    </div>
                </div>
            `;
        }
    });

    document.getElementById('contentContainer').innerHTML = `
        <div class="content-card" style="max-width: 1000px;">
            <div class="home-hero">
                <h2>Nepali Guitar Chords Collection</h2>
                <p>Welcome to the digital songbook containing chords and lyrics for over 200+ popular Nepali, and some Hindi, and English songs. Click any song below or search in the sidebar to view chords, transpose keys, and auto-scroll.</p>
            </div>
            <div class="alphabet-nav">
                ${alphabetHtml}
            </div>
            <div class="directory-container">
                ${sectionsHtml}
            </div>
            <footer class="collection-credit">Collection from Saroj Poudyal.</footer>
        </div>
    `;
    document.getElementById('contentContainer').scrollTop = 0;
}

function showHelp() {
    currentSongIndex = -1;
    stopStrummingPlayer();
    stopDrumMachine();
    stopTablaMachine();
    document.getElementById('viewerHeader').style.display = 'none';
    document.getElementById('backToListBtn').hidden = true;
    document.querySelectorAll('.song-item').forEach(item => item.classList.remove('active'));
    if (autoScrolling) toggleAutoScroll();

    document.getElementById('contentContainer').innerHTML = `
        <div class="content-card help-content-card">
            <div class="help-header">
                <div>
                    <h1>Guitar Chord Help</h1>
                    <p>Use these reference charts to look up guitar chord shapes, chord relationships, and the circle of fifths.</p>
                </div>
                <a class="btn btn-primary request-songs-btn" href="mailto:cynicandroid@gmail.com?subject=Please%20add%20chords%20for%20this%20song" title="Request more songs"><span aria-hidden="true">✉️</span><span>Request More Songs</span></a>
            </div>
            <div class="help-images">
                <section class="help-image-card">
                    <h2>Guitar Chords</h2>
                    <img src="Guitar%20Tabs/guitar-chords.jpg" alt="Guitar chord reference chart" loading="lazy">
                </section>
                <section class="help-image-card">
                    <h2>Guitar Chord Chart</h2>
                    <img src="Guitar%20Tabs/guitar-chord-chart.png" alt="Guitar chord chart" loading="lazy">
                </section>
                <section class="help-image-card">
                    <h2>Circle of Fifths</h2>
                    <img src="Guitar%20Tabs/circle-of-fifths.webp" alt="Circle of fifths reference diagram" loading="lazy">
                </section>
                <div>
                    <footer class="collection-credit">Happy Playing Sathi - From Saroj Poudyal</footer>
                </div>
            </div>
        </div>
    `;
    document.getElementById('contentContainer').scrollTop = 0;
}

function showFavorites() {
    currentSongIndex = -1;
    stopStrummingPlayer();
    stopDrumMachine();
    stopTablaMachine();
    document.getElementById('viewerHeader').style.display = 'none';
    document.getElementById('backToListBtn').hidden = true;
    document.querySelectorAll('.song-item').forEach(item => item.classList.remove('active'));
    if (autoScrolling) toggleAutoScroll();

    const favorites = songs.filter((_, index) => favoriteSongs.has(index));
    renderSongList(favorites);
    const content = favorites.length
        ? `<div class="directory-songs-grid">${favorites.map(song => {
            const index = songs.indexOf(song);
            const capoText = song.capo && song.capo.toLowerCase() !== 'none' ? `Capo: ${escapeHtml(song.capo)}` : '';
            return `<div class="directory-song-card" onclick="selectSong(${index})"><div class="directory-song-title">${escapeHtml(song.title)}</div>${capoText ? `<div class="directory-song-capo">🎸 ${capoText}</div>` : ''}</div>`;
        }).join('')}</div>`
        : '<p class="favorites-empty">No favorite songs yet. Open a song and tap ☆ to add it here.</p>';

    document.getElementById('contentContainer').innerHTML = `
        <div class="content-card favorites-card">
            <div class="help-header"><div><h1>☆ Favorite Songs</h1><p>${favorites.length} song${favorites.length === 1 ? '' : 's'} selected for this session.</p></div>
            <button class="btn btn-primary" onclick="showHome()" title="Return to the song list">🏠 Home</button></div>
            ${content}
        </div>`;
    document.getElementById('contentContainer').scrollTop = 0;
}

function loadFavoriteSongs() {
    try {
        const storedFavorites = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || '[]');
        if (!Array.isArray(storedFavorites)) return;
        songs.forEach((song, index) => {
            if (storedFavorites.includes(song.filename)) favoriteSongs.add(index);
        });
    } catch (error) {
        console.warn('Could not load saved favorites:', error);
    }
}

function saveFavoriteSongs() {
    try {
        const filenames = Array.from(favoriteSongs, index => songs[index]?.filename).filter(Boolean);
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(filenames));
    } catch (error) {
        console.warn('Could not save favorites:', error);
    }
}

function toggleFavorite() {
    if (currentSongIndex < 0) return;
    if (favoriteSongs.has(currentSongIndex)) favoriteSongs.delete(currentSongIndex);
    else favoriteSongs.add(currentSongIndex);
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

function sortedLetters() {
    const setLetters = new Set();
    songs.forEach(s => {
        const first = s.title ? s.title[0].toUpperCase() : '#';
        const key = first.match(/[A-Z]/) ? first : '#';
        setLetters.add(key);
    });
    return Array.from(setLetters).sort((a, b) => {
        if (a === '#') return 1;
        if (b === '#') return -1;
        return a.localeCompare(b);
    });
}

function selectSong(index, sourceLetter = null) {
    currentSongIndex = index;
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
    document.getElementById('badgeCapo').innerText = `Capo: ${song.capo || 'None'}`;
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
        <section class="drum-machine-panel" aria-label="Drum beat sampler">
            <div class="drum-machine-heading" onclick="toggleDrumMachinePanel()" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleDrumMachinePanel(); }" role="button" tabindex="0">
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
        </section>
        <section class="drum-machine-panel tabla-machine-panel" aria-label="Tabla ko Taal Ma">
            <div class="drum-machine-heading" onclick="toggleTablaMachinePanel()" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleTablaMachinePanel(); }" role="button" tabindex="0">
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

const DRUM_BEATS = {
    'pop-44':  { meter: 4, kick: [0, 4],    snare: [2, 6],    hat: [0, 1, 2, 3, 4, 5, 6, 7] },
    'rock-44': { meter: 4, kick: [0, 3, 4], snare: [2, 6],    hat: [0, 2, 4, 6] },
    'pop-34':  { meter: 3, kick: [0],       snare: [2, 4],    hat: [0, 2, 4] },
    'rock-34': { meter: 3, kick: [0, 4],    snare: [2],      hat: [0, 2, 4] },
    'pop-24':  { meter: 2, kick: [0],       snare: [2],      hat: [0, 1, 2, 3] },
    'rock-24': { meter: 2, kick: [0, 2],    snare: [1, 3],   hat: [0, 1, 2, 3] },
    'jazz-44': { meter: 4, kick: [0, 4],    snare: [2, 6],   hat: [1, 3, 5, 7] },
    'jazz-34': { meter: 3, kick: [0],       snare: [2, 4],   hat: [1, 3, 5] },
    'jazz-24': { meter: 2, kick: [0],       snare: [2],     hat: [1, 3] },
    'funk-44': { meter: 4, kick: [0, 3, 5], snare: [2, 6],   hat: [0, 1, 2, 3, 4, 5, 6, 7] },
    'funk-34': { meter: 3, kick: [0, 3],    snare: [2, 4],   hat: [0, 1, 2, 3, 4, 5] },
    'funk-24': { meter: 2, kick: [0, 3],    snare: [2],     hat: [0, 1, 2, 3] },
    'disco-44': { meter: 4, kick: [0, 2, 4, 6], snare: [2, 6], hat: [0, 1, 2, 3, 4, 5, 6, 7] },
    'disco-34': { meter: 3, kick: [0, 2, 4], snare: [2, 4],  hat: [0, 1, 2, 3, 4, 5] },
    'disco-24': { meter: 2, kick: [0, 2],    snare: [2],     hat: [0, 1, 2, 3] },
    'hiphop-44': { meter: 4, kick: [0, 5],   snare: [2, 6],  hat: [0, 1, 2, 3, 4, 5, 6, 7] },
    'hiphop-34': { meter: 3, kick: [0, 4],   snare: [2],     hat: [0, 2, 3, 4, 5] },
    'hiphop-24': { meter: 2, kick: [0, 3],   snare: [2],     hat: [0, 1, 2, 3] },
    // Tanpura plucks are synthesized by playTanpuraPluck(). A pluck occurs
    // every two beats, producing the familiar Sa-Sa-Pa-Sa cycle.
    'tanpura-pa': { meter: 4, kind: 'tanpura', drone: 'Pa' },
    'tanpura-ma': { meter: 4, kind: 'tanpura', drone: 'Ma' },
    'tanpura-ni': { meter: 4, kind: 'tanpura', drone: 'Ni' }
};

function selectDrumBeat(value) {
    selectedDrumBeat = DRUM_BEATS[value] ? value : 'pop-44';
    drumMachineStep = 0;
    tanpuraPluckIndex = 0;
    const selectedBeat = DRUM_BEATS[selectedDrumBeat];
    if (selectedBeat.kind === 'tanpura') {
        tanpuraSa = selectedBeat.sa;
        tanpuraPattern = selectedBeat.pattern;
    }
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
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (tablaPlaying) {
        stopTablaMachine();
        collapseTablaMachinePanel();
    }
    audioContext ||= new AudioContextClass();
    if (audioContext.state === 'suspended') audioContext.resume();
    drumMachinePlaying = true;
    drumMachineStep = 0;
    tanpuraPluckIndex = 0;
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
    stopTanpuraDrone();
    const button = document.getElementById('drumPlayBtn');
    if (button) button.textContent = '▶ Play beat';
    renderDrumBeatIndicator();
}

function playDrumMachineStep() {
    const beat = DRUM_BEATS[selectedDrumBeat];
    const beatIndex = Math.floor(drumMachineStep / 2);
    renderDrumBeatIndicator(beatIndex);
    const now = audioContext.currentTime;
    if (beat.kind === 'tanpura') {
        // The existing half-beat clock is retained. Tanpura sounds on every
        // fourth tick, i.e. once every two beats (about 1.2s at 100 BPM).
        if (drumMachineStep % 4 === 0) {
            playTanpuraPluck(beat.drone, tanpuraPluckIndex, now);
            tanpuraPluckIndex = (tanpuraPluckIndex + 1) % 4;
        }
        drumMachineStep = (drumMachineStep + 1) % (beat.meter * 2);
        return;
    }
    if (beat.kick.includes(drumMachineStep)) playDrumHit('kick', now);
    if (beat.snare.includes(drumMachineStep)) playDrumHit('snare', now);
    if (beat.hat.includes(drumMachineStep)) playDrumHit('hat', now);
    drumMachineStep = (drumMachineStep + 1) % (beat.meter * 2);
}

function playTanpuraPluck(drone, index, time) {
    const context = audioContext;
    // C# is used as the tonic, matching the sample implementation's intent.
    // Sa-Sa-(Pa/Ma/Ni)-Sa gives the characteristic four-string cycle.
    const tonic = getTanpuraTonic();
    const ratios = { Sa: 1, Pa: 3 / 2, Ma: 4 / 3, Ni: 15 / 8 };
    const patternNote = tanpuraPattern[index] || 'S';
    const patternRatio = patternNote === 'M' ? ratios.Ma : patternNote === 'N' ? ratios.Ni : patternNote === 'P' ? ratios.Pa : ratios.Sa;
    const note = patternRatio || (ratios[drone] || ratios.Pa);
    const fundamental = tonic * note;
    const output = context.createGain();
    const body = context.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.setValueAtTime(4200, time);
    body.Q.value = 0.7;
    output.gain.setValueAtTime(0.0001, time);
    output.gain.exponentialRampToValueAtTime(0.28 * tanpuraVolume, time + 0.025);
    output.gain.exponentialRampToValueAtTime(0.0001, time + 5.5);
    body.connect(output).connect(context.destination);

    // Fundamental plus harmonics approximate the bright, buzzing jawari tone.
    [1, 2, 3, 4, 5].forEach((partial, partialIndex) => {
        const oscillator = context.createOscillator();
        const partialGain = context.createGain();
        oscillator.type = partialIndex === 0 ? 'triangle' : 'sine';
        oscillator.frequency.setValueAtTime(fundamental * partial, time);
        partialGain.gain.value = [1, 0.34, 0.18, 0.09, 0.04][partialIndex];
        oscillator.connect(partialGain).connect(body);
        oscillator.start(time);
        oscillator.stop(time + 5.8);
    });

    // A tiny burst of filtered noise supplies the string attack.
    if (!drumNoiseBuffer) {
        drumNoiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const data = drumNoiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const noise = context.createBufferSource();
    const noiseGain = context.createGain();
    const noiseFilter = context.createBiquadFilter();
    noise.buffer = drumNoiseBuffer;
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1800;
    noiseFilter.Q.value = 0.8;
    noiseGain.gain.setValueAtTime(0.08, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);
    noise.connect(noiseFilter).connect(noiseGain).connect(output);
    noise.start(time);
    noise.stop(time + 0.1);
}

function startTanpuraDrone(drone) {
    stopTanpuraDrone();
    const context = audioContext;
    const tonic = getTanpuraTonic();
    const ratios = { Pa: 3 / 2, Ma: 4 / 3, Ni: 15 / 8 };
    const droneFrequency = tonic * (ratios[drone] || ratios.Pa);

    // Keep a quiet Sa and Pa/Ma/Ni resonance running between the articulated
    // plucks. This is what makes the accompaniment feel sustained.
    [tonic, droneFrequency].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const filter = context.createBiquadFilter();
        oscillator.type = index === 0 ? 'sine' : 'triangle';
        oscillator.frequency.value = frequency;
        filter.type = 'lowpass';
        filter.frequency.value = 1800;
        gain.gain.value = (index === 0 ? 0.035 : 0.022) * tanpuraVolume;
        oscillator.connect(filter).connect(gain).connect(context.destination);
        oscillator.start();
        tanpuraDroneOscillators.push(oscillator);
    });
}

function getTanpuraTonic() {
    const notes = { C: 261.63, 'C#': 277.18, D: 293.66, 'D#': 311.13, E: 329.63, F: 349.23, 'F#': 369.99, G: 392, 'G#': 415.3, A: 440, 'A#': 466.16, B: 493.88 };
    return notes[tanpuraSa] || notes['C#'];
}

function setTanpuraSa(value) {
    tanpuraSa = value;
    if (drumMachinePlaying && DRUM_BEATS[selectedDrumBeat].kind === 'tanpura') {
        startTanpuraDrone(DRUM_BEATS[selectedDrumBeat].drone);
    }
}

function setTanpuraPattern(value) {
    tanpuraPattern = /^[PMN]SSS$/.test(value) ? value : 'PSSS';
}

function setTanpuraVolume(value) {
    tanpuraVolume = Number(value);
    const label = document.getElementById('tanpuraVolumeLabel');
    if (label) label.textContent = `${Math.round(tanpuraVolume * 100)}%`;
}

function stopTanpuraDrone() {
    if (!tanpuraDroneOscillators.length || !audioContext) return;
    tanpuraDroneOscillators.forEach(oscillator => {
        try {
            oscillator.stop(audioContext.currentTime + 0.03);
            oscillator.disconnect();
        } catch (error) {
            // Ignore an oscillator that has already been stopped.
        }
    });
    tanpuraDroneOscillators = [];
}

function playDrumHit(type, time) {
    const context = audioContext;
    const gain = context.createGain();
    gain.connect(context.destination);
    const duration = type === 'kick' ? 0.32 : type === 'snare' ? 0.18 : 0.055;
    gain.gain.setValueAtTime(type === 'hat' ? 0.12 : 0.45, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    if (type === 'kick') {
        const oscillator = context.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(145, time);
        oscillator.frequency.exponentialRampToValueAtTime(42, time + duration);
        oscillator.connect(gain);
        oscillator.start(time);
        oscillator.stop(time + duration);
        return;
    }

    if (!drumNoiseBuffer) {
        drumNoiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const data = drumNoiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const noise = context.createBufferSource();
    noise.buffer = drumNoiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = type === 'hat' ? 7000 : 1500;
    noise.connect(filter).connect(gain);
    noise.start(time);
    noise.stop(time + duration);
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
const tablaBuffers = {};
let tablaSamplesPromise = null;
const TABLA_SAMPLE_FILES = ['ghe', 'na', 'na-open', 'na-sharp', 'tun', 'te', 'te-middlefinger', 'te-ne', 're', 'ke', 'tas'];
const TABLA_BOL_SAMPLES = {
    Dha: ['ghe', 'na'],
    Dhin: ['ghe', 'tun'],
    Dhi: ['ghe', 'te'],
    Ge: ['ghe'],
    Ghe: ['ghe'],
    Na: ['na'],
    NaOpen: ['na-open'],
    NaSharp: ['na-sharp'],
    Tin: ['tun'],
    Tun: ['tun'],
    Ti: ['te'],
    Ta: ['te-middlefinger'],
    Te: ['te'],
    TeNe: ['te-ne'],
    Re: ['re'],
    Ke: ['ke'],
    Ka: ['ke'],
    Tu: ['tun'],
    Tas: ['tas']
};

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
    try {
        const saved = JSON.parse(localStorage.getItem(SAMPLER_SETTINGS_STORAGE_KEY) || '{}');
        if (DRUM_BEATS[saved.drumBeat]) selectedDrumBeat = saved.drumBeat;
        if (Number.isFinite(Number(saved.drumBpm))) drumBpm = Number(saved.drumBpm);
        if (typeof saved.tablaNote === 'string') tablaNote = saved.tablaNote;
        if (TABLA_TAALS[saved.tablaTaal]) tablaTaal = saved.tablaTaal;
        if (Number.isFinite(Number(saved.tablaBpm))) tablaBpm = Number(saved.tablaBpm);
        if (typeof saved.drumSamplerExpanded === 'boolean') drumSamplerExpanded = saved.drumSamplerExpanded;
        if (typeof saved.tablaSamplerExpanded === 'boolean') tablaSamplerExpanded = saved.tablaSamplerExpanded;
    } catch (error) {
        console.warn('Could not load sampler settings:', error);
    }
}

function saveSamplerSettings() {
    try {
        localStorage.setItem(SAMPLER_SETTINGS_STORAGE_KEY, JSON.stringify({
            drumBeat: selectedDrumBeat,
            drumBpm,
            tablaNote,
            tablaTaal,
            tablaBpm,
            drumSamplerExpanded,
            tablaSamplerExpanded
        }));
    } catch (error) {
        console.warn('Could not save sampler settings:', error);
    }
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
    if (tablaSamplesPromise) return tablaSamplesPromise;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext ||= new AudioContextClass();
    tablaSamplesPromise = Promise.all(TABLA_SAMPLE_FILES.map(async name => {
        const response = await fetch(`assets/tabla/${name}.wav`);
        if (!response.ok) throw new Error(`Could not load tabla sample: ${name}.wav`);
        tablaBuffers[name] = await audioContext.decodeAudioData(await response.arrayBuffer());
    }));
    return tablaSamplesPromise;
}

async function startTablaMachine() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (drumMachinePlaying) {
        stopDrumMachine();
        collapseDrumMachinePanel();
    }
    audioContext ||= new AudioContextClass();
    if (audioContext.state === 'suspended') audioContext.resume();
    try {
        await loadTablaSamples();
    } catch (error) {
        console.error('Tabla samples could not be loaded:', error);
        const button = document.getElementById('tablaPlayBtn');
        if (button) button.textContent = '⚠ Tabla samples unavailable';
        return;
    }
    clearInterval(tablaInterval);
    tablaPlaying = true;
    tablaStep = 0;
    const button = document.getElementById('tablaPlayBtn');
    if (button) button.textContent = '⏹ Stop tabla';
    playTablaStep();
    tablaInterval = setInterval(playTablaStep, 60000 / tablaBpm);
}

function stopTablaMachine() {
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
    const context = audioContext;
    const samples = TABLA_BOL_SAMPLES[bol] || TABLA_BOL_SAMPLES.Ta;
    const playbackRate = getTablaNoteFrequency() / 440;
    samples.forEach((sampleName, index) => {
        const buffer = tablaBuffers[sampleName];
        if (!buffer) return;
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        source.playbackRate.value = playbackRate;
        gain.gain.value = index === 0 ? 0.85 : 0.7;
        source.connect(gain).connect(context.destination);
        source.start(time);
    });
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
    if (!strumStr) return [];
    let strokes = [];
    // Clean up special notes in brackets like [Reggee], (slur)
    let cleaned = strumStr.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').toUpperCase();
    
    for (let i = 0; i < cleaned.length; i++) {
        let ch = cleaned[i];
        if (ch === 'D' || ch === 'U' || ch === 'C' || ch === 'M' || ch === 'S' || ch === 'X') {
            strokes.push(ch);
        } else if (ch === ' ') {
            // Optional rest or spacing
        }
    }
    if (strokes.length === 0) {
        // Fallback default
        strokes = ['D', 'D', 'U', 'U', 'D', 'U'];
    }
    return strokes;
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
    strummingPlaying = !strummingPlaying;
    const btn = document.getElementById('strumPlayPauseBtn');
    
    if (strummingPlaying) {
        if (btn) btn.innerText = '⏸️ Pause';
        if (currentStrokesList.length === 0) buildStrokesCards();
        
        currentStrokeIndex = 0;
        highlightStroke(currentStrokeIndex);
        playStrokeTone(currentStrokesList[currentStrokeIndex]);

                // Interval calculation based on BPM (8th note spacing).
                startStrummingLoop(Math.round(60000 / strumBpm / 2));
    } else {
        stopStrummingPlayer();
    }
}

function startStrummingLoop(intervalMs) {
    clearInterval(strummingInterval);
    clearTimeout(strummingLoopTimeout);

    strummingInterval = setInterval(() => {
        if (!strummingPlaying || !currentStrokesList.length) return;

        if (currentStrokeIndex === currentStrokesList.length - 1) {
            clearInterval(strummingInterval);
            strummingInterval = null;
            strummingLoopTimeout = setTimeout(() => {
                if (!strummingPlaying) return;
                currentStrokeIndex = 0;
                highlightStroke(currentStrokeIndex);
                playStrokeTone(currentStrokesList[currentStrokeIndex]);
                startStrummingLoop(intervalMs);
            }, 2000);
            return;
        }

        currentStrokeIndex += 1;
        highlightStroke(currentStrokeIndex);
        playStrokeTone(currentStrokesList[currentStrokeIndex]);
    }, intervalMs);
}

function highlightStroke(index) {
    document.querySelectorAll('.stroke-card').forEach((card, idx) => {
        card.classList.toggle('active', idx === index);
    });
}

function playStrokeTone(stroke) {
    if (!stroke) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext ||= new AudioContextClass();
    if (audioContext.state === 'suspended') audioContext.resume();

    // Use WebAudioFont's sampled steel-string guitar for the G chord,
    // matching the reference strum implementation. Keep the synth
    // fallback below for offline use or failed CDN loading.
    const guitar = window._tone_0250_SoundBlasterOld_sf2;
    if (guitar && window.WebAudioFontPlayer) {
        webAudioFontPlayer ||= new WebAudioFontPlayer();
        if (!webAudioFontReady) {
            webAudioFontPlayer.loader.decodeAfterLoading(audioContext, '_tone_0250_SoundBlasterOld_sf2');
            webAudioFontReady = true;
        }
        const when = audioContext.currentTime + 0.01;
        if (stroke === 'D') webAudioFontPlayer.queueStrumDown(audioContext, audioContext.destination, guitar, when, G_CHORD_MIDI, 1.2, 0.7);
        else if (stroke === 'U') webAudioFontPlayer.queueStrumUp(audioContext, audioContext.destination, guitar, when, G_CHORD_MIDI, 1.2, 0.7);
        else if (stroke === 'S' || stroke === 'C') webAudioFontPlayer.queueSnap(audioContext, audioContext.destination, guitar, when, G_CHORD_MIDI, 0.35, 0.6);
        else if (stroke === 'M' || stroke === 'X') webAudioFontPlayer.queueStrumDown(audioContext, audioContext.destination, guitar, when, G_CHORD_MIDI, 0.12, 0.3);
        return;
    }

    const now = audioContext.currentTime;
    const muted = stroke === 'M' || stroke === 'X' || stroke === 'S' || stroke === 'C';
    const direction = stroke === 'U' ? -1 : 1;
    // Six steel-string guitar fundamentals (open-string voicing).
    const strings = [82.41, 110.00, 146.83, 196.00, 246.94, 329.63];
    strings.forEach((frequency, index) => {
        const delay = ((direction > 0 ? index : 5 - index) * 0.012);
        const start = now + delay;
        const duration = muted ? 0.12 : 1.15 - index * 0.06;
        const filter = audioContext.createBiquadFilter();
        const gain = audioContext.createGain();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(muted ? 900 : 4200, start);
        filter.frequency.exponentialRampToValueAtTime(900, start + duration);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(muted ? 0.018 : 0.045, start + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        filter.connect(gain).connect(audioContext.destination);
        // Partial-rich oscillator stack approximates a plucked steel string.
        [1, 2, 3].forEach((partial, partialIndex) => {
            const oscillator = audioContext.createOscillator();
            oscillator.type = partialIndex === 0 ? 'triangle' : 'sine';
            oscillator.frequency.value = frequency * partial;
            const partialGain = audioContext.createGain();
            partialGain.gain.value = partial === 1 ? 1 : 0.25 / partial;
            oscillator.connect(partialGain).connect(filter);
            oscillator.start(start);
            oscillator.stop(start + duration + 0.02);
        });
    });
}

function stopStrummingPlayer() {
    strummingPlaying = false;
    clearInterval(strummingInterval);
    clearTimeout(strummingLoopTimeout);
    strummingInterval = null;
    strummingLoopTimeout = null;
    const btn = document.getElementById('strumPlayPauseBtn');
    if (btn) btn.innerText = '▶️ Play Rhythm';
    document.querySelectorAll('.stroke-card').forEach(card => card.classList.remove('active'));
}

function adjustStrumBpm(delta) {
    strumBpm = Math.max(40, Math.min(200, strumBpm + delta));
    document.getElementById('strumBpmLabel').innerText = `${strumBpm} BPM`;
    if (strummingPlaying) {
        startStrummingLoop(Math.round(60000 / strumBpm / 2));
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

document.addEventListener('DOMContentLoaded', init);
