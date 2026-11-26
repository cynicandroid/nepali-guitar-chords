let sharedAudioContext = null;

export function getAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    sharedAudioContext ||= new AudioContextClass();
    return sharedAudioContext;
}
