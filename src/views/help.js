const FIFTHS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'];
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_TO_SHARP = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };

function polarPoint(radius, angle) {
    const radians = (angle - 90) * Math.PI / 180;
    return [373 + radius * Math.cos(radians), 373 + radius * Math.sin(radians)];
}

function ringSector(innerRadius, outerRadius, index) {
    const start = index * 30 - 15;
    const end = index * 30 + 15;
    const [x1, y1] = polarPoint(outerRadius, start);
    const [x2, y2] = polarPoint(outerRadius, end);
    const [x3, y3] = polarPoint(innerRadius, end);
    const [x4, y4] = polarPoint(innerRadius, start);
    return `M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 0 0 ${x4} ${y4} Z`;
}

function normalizeKey(key) {
    const match = String(key || '').match(/^([A-G](?:#|b)?)(m)?$/);
    if (!match) return null;
    const root = FLAT_TO_SHARP[match[1]] || match[1];
    const minor = Boolean(match[2]);
    const chromaticIndex = CHROMATIC.indexOf(root);
    const relativeMajor = minor && chromaticIndex >= 0
        ? CHROMATIC[(chromaticIndex + 3) % 12]
        : root;
    return { root, minor, relativeMajor };
}

function circleOverlay(circleKey) {
    const normalized = normalizeKey(circleKey);
    const keyIndex = normalized ? FIFTHS.indexOf(normalized.relativeMajor) : -1;
    if (keyIndex < 0) return '';
    const highlighted = new Set([keyIndex, ...[-1, 1].map(offset => (keyIndex + offset + 12) % 12)]);
    const sectors = FIFTHS.map((_, index) => {
        const selected = index === keyIndex;
        const nearby = highlighted.has(index);
        const className = `circle-overlay-sector${selected ? ' selected' : nearby ? ' nearby' : ''}`;
        return `<path class="${className}" d="${ringSector(242, 342, index)}"/><path class="${className}" d="${ringSector(130, 242, index)}"/>`;
    }).join('');
    return `<svg class="circle-overlay" viewBox="0 0 746 746" aria-hidden="true">${sectors}</svg>`;
}

export function renderCircleOfFifthsModal(circleKey) {
    return `<div class="circle-fifths-modal-backdrop" onclick="if (event.target === this) closeCircleOfFifths()"><section class="circle-fifths-modal-card" role="dialog" aria-modal="true" aria-labelledby="circleFifthsModalTitle"><header class="circle-fifths-modal-header"><h2 id="circleFifthsModalTitle">Circle of Fifths · ${circleKey}</h2><button class="circle-fifths-modal-close" onclick="closeCircleOfFifths()" aria-label="Close circle of fifths">×</button></header><div class="circle-of-fifths-wrap"><img src="Guitar%20Tabs/circle-of-fifths.webp" alt="Circle of fifths with ${circleKey} and neighboring fifths highlighted">${circleOverlay(circleKey)}</div></section></div>`;
}

export function renderHelpView({ circleKey = null, canReturnToSong = false } = {}) {
    const focusText = circleKey ? ` Showing ${circleKey} and its neighboring fifths.` : '';
    const returnButton = canReturnToSong
        ? '<div class="song-footer-back-wrap help-return-song-top"><button class="btn song-footer-back" onclick="returnToSong()"><span aria-hidden="true">←</span><span>Back to song</span></button></div>'
        : '';
    const returnButtonBottom = canReturnToSong
        ? '<div class="song-footer-back-wrap"><button class="btn song-footer-back" onclick="returnToSong()"><span aria-hidden="true">←</span><span>Back to song</span></button></div>'
        : '';
    return `<div class="content-card help-content-card"><div class="help-header"><div><h1>Guitar Chord Help</h1><p>Use these reference charts to look up guitar chord shapes, chord relationships, and the circle of fifths.${focusText}</p>${returnButton}</div><a class="btn btn-primary request-songs-btn" href="mailto:cynicandroid@gmail.com?subject=Please%20add%20chords%20for%20this%20song" title="Request more songs"><span aria-hidden="true">✉️</span><span>Request More Songs</span></a></div><div class="help-images"><section class="help-image-card"><h2>Guitar Chords</h2><img src="Guitar%20Tabs/guitar-chords.jpg" alt="Guitar chord reference chart" loading="lazy"></section><section class="help-image-card"><h2>Guitar Chord Chart</h2><img src="Guitar%20Tabs/guitar-chord-chart.png" alt="Guitar chord chart" loading="lazy"></section><section class="help-image-card circle-of-fifths-card" id="circleOfFifths"><h2>Circle of Fifths${circleKey ? ` · ${circleKey} highlighted` : ''}</h2><div class="circle-of-fifths-wrap"><img src="Guitar%20Tabs/circle-of-fifths.webp" alt="Circle of fifths reference diagram" loading="lazy">${circleOverlay(circleKey)}</div></section>${returnButtonBottom}<div><footer class="collection-credit">Happy Playing Sathi - From Saroj Poudyal</footer></div></div></div>`;
}
