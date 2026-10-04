let songs = [];
let currentSongIndex = -1;
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
        alert(getInstallInstructions());
        return;
    }

    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === 'accepted') dom.installBtn.hidden = true;
    deferredInstallPrompt = null;
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
        return 'On iPhone or iPad: open Safari’s Share menu, choose “Add to Home Screen,” then tap Add.';
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
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
}

function showHome() {
    currentSongIndex = -1;
    stopStrummingPlayer();
    document.getElementById('viewerHeader').style.display = 'none';
    
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
                    <div class="directory-song-card" onclick="selectSong(${origIdx})">
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
                <h1>Nepali Guitar Chords & Tabs Collection</h1>
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
    document.getElementById('viewerHeader').style.display = 'none';
    document.querySelectorAll('.song-item').forEach(item => item.classList.remove('active'));
    if (autoScrolling) toggleAutoScroll();

    document.getElementById('contentContainer').innerHTML = `
        <div class="content-card help-content-card">
            <div class="help-header">
                <div>
                    <h1>Guitar Chord Help</h1>
                    <p>Use these reference charts to look up guitar chord shapes, chord relationships, and the circle of fifths.</p>
                </div>
                <button class="btn btn-primary" onclick="showHome()" title="Return to the song list">🏠 Home</button>
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
            </div>
        </div>
    `;
    document.getElementById('contentContainer').scrollTop = 0;
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

function selectSong(index) {
    currentSongIndex = index;
    transposeOffset = 0;
    stopStrummingPlayer();
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
    if (autoScrolling) toggleAutoScroll();
}

function renderCurrentSong() {
    if (currentSongIndex < 0 || currentSongIndex >= songs.length) return;
    const song = songs[currentSongIndex];

    document.getElementById('songTitleDisplay').innerText = song.title;
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

    document.getElementById('contentContainer').innerHTML = `
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
        </div>
    `;
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
