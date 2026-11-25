function songLetter(song) {
    const first = song.title?.[0]?.toUpperCase() || '#';
    return /^[A-Z]$/.test(first) ? first : '#';
}

function lettersFor(songs) {
    return Array.from(new Set(songs.map(songLetter))).sort((a, b) => a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b));
}

function songCard(song, index, letter, escapeHtml, timesPlayed = null, compact = false, sequence = null, showGenre = false) {
    const capo = String(song.capo || '').trim();
    const capoText = capo && !['none', 'no capo', 'n/a'].includes(capo.toLowerCase()) ? `Capo: ${capo}` : '';
    const capoIcon = capo.toLowerCase().includes('barre') ? '☝️' : '🎸';
    const genre = String(song.genre || '').trim();
    const genreText = genre && !['none', 'n/a'].includes(genre.toLowerCase()) ? genre : '';
    const singer = String(song.singer || '').trim();
    const singerText = singer && !['unknown', 'none', 'n/a'].includes(singer.toLowerCase()) ? singer : '';
    const songMeta = [
        capoText ? `${capoIcon} ${escapeHtml(capoText)}` : '',
        genreText ? `🎵 ${escapeHtml(genreText)}` : '',
        singerText ? `🎤 ${escapeHtml(singerText)}` : ''
    ]
        .filter(Boolean).map(item => `<span>${item}</span>`).join('<span class="directory-song-meta-divider">·</span>');
    return `<div class="directory-song-card${compact ? ' recent-song-card' : ''}${showGenre ? ' song-directory-card' : ''}" onclick="selectSong(${index}, '${letter}')">
        ${sequence !== null ? `<div class="recent-song-sequence">${sequence}.</div>` : ''}
        <div class="directory-song-title">${escapeHtml(song.title)}</div>
        ${!compact && showGenre ? `<div class="directory-song-meta">${songMeta}</div>` : ''}
        ${!compact && !showGenre && capoText ? `<div class="directory-song-capo">${capoIcon} ${escapeHtml(capoText)}</div>` : ''}
        ${timesPlayed !== null ? `<div class="directory-song-play-count">▶ Times played: ${timesPlayed}</div>` : ''}
    </div>`;
}

export function renderDirectory({ songs, listedSongs = songs, escapeHtml, title, description, searchable = false }) {
    const letters = lettersFor(listedSongs);
    const sections = letters.map(letter => {
        const cards = listedSongs.filter(song => songLetter(song) === letter)
            .map(song => songCard(song, songs.indexOf(song), letter, escapeHtml, null, false, null, true)).join('');
        return `<div class="directory-section" id="${searchable ? 'mobile-search-' : ''}letter-${letter}">
            <div class="directory-letter">${letter}</div><div class="directory-songs-grid">${cards}</div></div>`;
    }).join('');
    const navigation = searchable ? '' : `<div class="alphabet-nav">${letters.map(letter => `<a href="#letter-${letter}" class="alphabet-btn">${letter}</a>`).join('')}</div>`;
    return `<div class="content-card" style="max-width: 1000px;">
        <div class="home-hero"><h2>${title}</h2><p>${description}</p></div>
        ${navigation}<div class="directory-container">${sections || '<p class="favorites-empty">No matching songs found.</p>'}</div>
        ${searchable ? '' : '<footer class="collection-credit">Collection from Saroj Poudyal.</footer>'}
    </div>`;
}

export function renderFavorites({ songs, favoriteSongs, escapeHtml, songHistory }) {
    const favorites = songs.filter((_, index) => favoriteSongs.has(index));
    const recent = songHistory.getRecent(songs);
    const cards = favorites.map(song => songCard(song, songs.indexOf(song), songLetter(song), escapeHtml, songHistory.getCount(song))).join('');
    const recentCards = recent.map((song, index) => songCard(song, songs.indexOf(song), songLetter(song), escapeHtml, songHistory.getCount(song), true, index + 1)).join('');
    return { favorites, html: `<div class="content-card favorites-card"><div class="help-header"><div><h1>☆ Favorite Songs</h1><p>${favorites.length} song${favorites.length === 1 ? '' : 's'} selected for this session.</p></div><button class="btn btn-primary" onclick="showHome()" title="Return to the song list">🏠 Home</button></div>${cards ? `<div class="directory-songs-grid">${cards}</div>` : '<p class="favorites-empty">No favorite songs yet. Open a song and tap ☆ to add it here.</p>'}<section class="recent-songs-section"><h2>Recently Opened</h2>${recentCards ? `<div class="directory-songs-grid">${recentCards}</div>` : '<p class="favorites-empty">Open songs to build your recent list.</p>'}</section></div>` };
}
