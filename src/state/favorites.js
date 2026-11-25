import { readJson, writeJson } from './storage.js';

export function createFavoritesStore(storageKey) {
    const indices = new Set();

    function load(songs) {
        const filenames = readJson(storageKey, []);
        if (!Array.isArray(filenames)) return;
        songs.forEach((song, index) => {
            if (filenames.includes(song.filename)) indices.add(index);
        });
    }

    function toggle(index) {
        if (indices.has(index)) indices.delete(index);
        else indices.add(index);
    }

    function save(songs) {
        writeJson(storageKey, Array.from(indices, index => songs[index]?.filename).filter(Boolean));
    }

    return { indices, load, toggle, save };
}
