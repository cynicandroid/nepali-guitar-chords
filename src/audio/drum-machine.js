export function createDrumVoicePlayer() {
    let noiseBuffer = null;

    function getNoiseBuffer(context) {
        if (noiseBuffer) return noiseBuffer;
        noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
        return noiseBuffer;
    }

    function play(type, context, time) {
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

        const noise = context.createBufferSource();
        noise.buffer = getNoiseBuffer(context);
        const filter = context.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = type === 'hat' ? 7000 : 1500;
        noise.connect(filter).connect(gain);
        noise.start(time);
        noise.stop(time + duration);
    }

    return { play };
}
