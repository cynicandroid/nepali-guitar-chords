let sharedAudioContext = null;

export function getAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    sharedAudioContext ||= new AudioContextClass();
    return sharedAudioContext;
}

export async function resumeAudioContext() {
    const context = getAudioContext();
    if (context?.state === 'suspended') await context.resume();
    return context;
}
