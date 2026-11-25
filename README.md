# Nepali Guitar Chords & Tabs

[License: GNU GPL v3 or later](LICENSE.md) · [Full license text](LICENSE)

Welcome to the **Nepali Guitar Chords & Tabs Collection**! This is a growing songbook of 213 Nepali, Hindi, and English songs, with chords and tabs for playing along. You can browse the charts here in the repository or use the web app to search songs and practice.

## What’s in the app

- Search and browse songs by title, genre, or capo.
- Transpose chords, adjust auto-scroll, and use the metronome, drum patterns, tabla, or strumming player.
- Keep favorites, track play counts, and find the last 10 songs you opened.
- See a song’s key on the Circle of Fifths and consult the chord reference charts.
- Adjust the display for practice, including text size and theme. Fullscreen and screen-awake support depend on the browser.
- Install the app on supported browsers. Once loaded, the app and practice audio are available offline; song-list updates need a connection.

## Run the app locally

The app is a static site and can be hosted on GitHub Pages or another static web host. To run it on your computer, start the small included server from the project directory:

```bash
python3 server.py
```

Then visit <http://localhost:8000>. If you have [Just](https://github.com/casey/just) installed, `just serve` does the same thing. Opening `index.html` directly won’t work because the app loads JavaScript modules and song data over HTTP.

For a public deployment, use HTTPS. Service workers and offline support require a secure connection, and fullscreen or screen-awake features vary by browser.

### Dependencies and installation

You’ll need Python 3.9 or newer and a modern browser (Safari, Chrome, Firefox, or Edge). There are no Python or Node packages to install; the practice audio files are included in the repository. [Just](https://github.com/casey/just) is optional and provides the `just serve` shortcut.

On macOS with Homebrew:

```bash
brew install python just
```

On Debian or Ubuntu:

```bash
sudo apt update
sudo apt install python3 just
```

On Fedora, install Python with `sudo dnf install python3`. Just is optional and can be installed using its [installation instructions](https://github.com/casey/just#installation).

On Windows, install Python 3 from [python.org](https://www.python.org/downloads/windows/) and select **Add Python to PATH** during setup. To install Just, use Scoop (`scoop install just`) or Chocolatey (`choco install just`); Just is optional.

Once Python is installed, start the app from the project directory with `python3 server.py` (or `py server.py` in Windows PowerShell), then open <http://localhost:8000>. If you installed Just, run `just serve` instead.

## App updates

When a new version is available, the app lets you know. Choose **Update now** to load it, or dismiss the message and keep using the current version. The song list refreshes when you’re online and uses its saved copy when you’re offline.

For maintainers: when changing files in the precached app shell, increment `CACHE_NAME` in `sw.js`. The new version is staged before it’s offered, so it won’t replace the app in the middle of someone’s session. Deploy over HTTPS for the update and offline features to work.

## Reference charts

These charts are also available in the app’s help section:

- [🎸 Chord Reference Chart](Guitar%20Tabs/_Guitar-chord-chart.png)
- [🎼 Standard Chords Diagram](Guitar%20Tabs/_Guitar%20Chords.jpg)
- [🔄 Circle of Fifths Diagram](Guitar%20Tabs/circle-of-fifths.webp)

---

## 🛠️ Regenerating the Database

If you add or update `.docx` files in the `Guitar Tabs/` directory, you can easily rebuild the markdown directory and JSON database by running:

```bash
python3 convert.py
```
