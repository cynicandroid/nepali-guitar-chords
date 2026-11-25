import { readJson, writeJson } from './storage.js';

export function createSongHistoryStore(storageKey) {
    let recent = [];
    let counts = {};

    function load() {
        const saved = readJson(storageKey, {});
        recent = Array.isArray(saved.recent) ? saved.recent : [];
        counts = saved.counts && typeof saved.counts === 'object' ? saved.counts : {};
    }

    function record(song) {
        if (!song?.filename) return;
        counts[song.filename] = Number(counts[song.filename] || 0) + 1;
        recent = [song.filename, ...recent.filter(filename => filename !== song.filename)].slice(0, 10);
        writeJson(storageKey, { recent, counts });
    }

    function getCount(song) {
        return Number(counts[song?.filename] || 0);
    }

    function getRecent(songs) {
        return recent.map(filename => songs.find(song => song.filename === filename)).filter(Boolean);
    }

    return { load, record, getCount, getRecent };
}
