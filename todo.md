# Todo

## Practice and Performance Features

- [x] Add a metronome
  - Support adjustable BPM.
  - Add start/stop controls and an audible beat accent.
  - Keep it synchronized with the drum and tabla samplers when appropriate.

- [x] Add full-screen mode
  - Provide a full-screen control for song-reading and performance mode.
  - Support browser/PWA full-screen behavior where available.
  - Provide a graceful fallback when full-screen is unavailable or denied.

- [x] Add screen-awake mode
  - Use the Screen Wake Lock API while a song, sampler, or performance mode is active.
  - Release the wake lock when playback stops or the page is hidden.
  - Reacquire it when the user returns to the app, where supported.
  - Show a clear fallback message for browsers that do not support wake lock.
