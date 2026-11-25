const G_CHORD_MIDI = [43, 47, 50, 55, 59, 67];

export function createStrummingPlayer({ getContext, getSampledGuitar, onStroke }) {
    let playing = false;
    let strokeIndex = 0;
    let strokes = [];
    let intervalId = null;
    let loopTimeoutId = null;
    let webAudioFontPlayer = null;
    let webAudioFontReady = false;

    function playStrokeTone(stroke) {
        if (!stroke) return;
        const context = getContext();
        if (!context) return;
        if (context.state === 'suspended') context.resume();

        const guitar = getSampledGuitar();
        if (guitar?.instrument && guitar?.Player) {
            webAudioFontPlayer ||= new guitar.Player();
            if (!webAudioFontReady) {
                webAudioFontPlayer.loader.decodeAfterLoading(context, guitar.instrumentName);
                webAudioFontReady = true;
            }
            const when = context.currentTime + 0.01;
            if (stroke === 'D') webAudioFontPlayer.queueStrumDown(context, context.destination, guitar.instrument, when, G_CHORD_MIDI, 1.2, 0.7);
            else if (stroke === 'U') webAudioFontPlayer.queueStrumUp(context, context.destination, guitar.instrument, when, G_CHORD_MIDI, 1.2, 0.7);
            else if (stroke === 'S' || stroke === 'C') webAudioFontPlayer.queueSnap(context, context.destination, guitar.instrument, when, G_CHORD_MIDI, 0.35, 0.6);
            else if (stroke === 'M' || stroke === 'X') webAudioFontPlayer.queueStrumDown(context, context.destination, guitar.instrument, when, G_CHORD_MIDI, 0.12, 0.3);
            return;
        }

        const now = context.currentTime;
        const muted = 'MXSC'.includes(stroke);
        const direction = stroke === 'U' ? -1 : 1;
        [82.41, 110, 146.83, 196, 246.94, 329.63].forEach((frequency, index) => {
            const start = now + (direction > 0 ? index : 5 - index) * 0.012;
            const duration = muted ? 0.12 : 1.15 - index * 0.06;
            const filter = context.createBiquadFilter();
            const gain = context.createGain();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(muted ? 900 : 4200, start);
            filter.frequency.exponentialRampToValueAtTime(900, start + duration);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(muted ? 0.018 : 0.045, start + 0.006);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
            filter.connect(gain).connect(context.destination);
            [1, 2, 3].forEach((partial, partialIndex) => {
                const oscillator = context.createOscillator();
                const partialGain = context.createGain();
                oscillator.type = partialIndex === 0 ? 'triangle' : 'sine';
                oscillator.frequency.value = frequency * partial;
                partialGain.gain.value = partial === 1 ? 1 : 0.25 / partial;
                oscillator.connect(partialGain).connect(filter);
                oscillator.start(start);
                oscillator.stop(start + duration + 0.02);
            });
        });
    }

    function playCurrentStroke() {
        onStroke(strokeIndex);
        playStrokeTone(strokes[strokeIndex]);
    }

    function startLoop(intervalMs) {
        clearInterval(intervalId);
        clearTimeout(loopTimeoutId);
        intervalId = setInterval(() => {
            if (!playing || !strokes.length) return;
            if (strokeIndex === strokes.length - 1) {
                clearInterval(intervalId);
                intervalId = null;
                loopTimeoutId = setTimeout(() => {
                    if (!playing) return;
                    strokeIndex = 0;
                    playCurrentStroke();
                    startLoop(intervalMs);
                }, 2000);
                return;
            }
            strokeIndex += 1;
            playCurrentStroke();
        }, intervalMs);
    }

    function start(pattern, bpm) {
        strokes = pattern;
        if (!strokes.length) return false;
        playing = true;
        strokeIndex = 0;
        playCurrentStroke();
        startLoop(Math.round(60000 / bpm / 2));
        return true;
    }

    function restart(bpm) {
        if (playing) startLoop(Math.round(60000 / bpm / 2));
    }

    function stop() {
        playing = false;
        clearInterval(intervalId);
        clearTimeout(loopTimeoutId);
        intervalId = null;
        loopTimeoutId = null;
    }

    return { start, restart, stop, get isPlaying() { return playing; } };
}
