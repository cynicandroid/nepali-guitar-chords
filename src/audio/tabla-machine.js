export function createTablaSamplePlayer({ sampleFiles, bolSamples, assetPath = 'assets/tabla' }) {
    const buffers = {};
    let loadingPromise = null;

    async function load(context) {
        if (loadingPromise) return loadingPromise;
        loadingPromise = Promise.all(sampleFiles.map(async name => {
            const response = await fetch(`${assetPath}/${name}.wav`);
            if (!response.ok) throw new Error(`Could not load tabla sample: ${name}.wav`);
            buffers[name] = await context.decodeAudioData(await response.arrayBuffer());
        })).catch(error => {
            loadingPromise = null;
            throw error;
        });
        return loadingPromise;
    }

    function playBol(bol, context, time, playbackRate = 1) {
        const samples = bolSamples[bol] || bolSamples.Ta;
        samples.forEach((sampleName, index) => {
            const buffer = buffers[sampleName];
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

    return { load, playBol };
}
