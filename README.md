# Audio_recognition(v2 — beginner-friendly rebuild)

A Shazam-style audio recognition app, rebuilt with a much simpler stack:

- **Backend/engine/** — C++ fingerprinting core, compiled into two small **stateless CLI tools**
  (`enroll`, `recognize`). No sockets, no threads, no server.
- **Backend/server/** — Express (Node) REST API. Handles file uploads and JSON, and calls
  the C++ tools with `child_process`.
- **Frontend/** — React (Vite) frontend. Upload songs, browse the database, and
  identify a clip by file upload or live mic recording.
- **Backend/data/** — where everything lives: `songs.json` (metadata), `fingerprints.db`
  (flat text file of hashes), and the WAV files themselves.

## Quick start (recommended)

You still need the system-level C++ libraries first (there's no way around
that one — they're not npm packages), but everything else is now two commands.

**1. Install system dependencies, once:**

macOS:
```bash
brew install fftw libsndfile
```

Ubuntu/Debian:
```bash
sudo apt-get update
sudo apt-get install -y libfftw3-dev libsndfile1-dev build-essential
```

**2. From the project root, set up everything:**
```bash
npm install          # installs `concurrently`, used to run both apps together
npm run setup        # installs server + client deps AND builds the C++ engine
```

**3. Run it:**
```bash
npm run dev
```

This starts the Express server (`http://localhost:5001`) and the React app
(`http://localhost:5173`) together in one terminal, with color-coded output
so you can tell them apart. Press `Ctrl+C` once to stop both.

Open `http://localhost:5173` in your browser and you're good to go.

### (Optional) YouTube uploads

The "Add a Song → From YouTube" option needs `yt-dlp` and `ffmpeg` installed
as system commands (not npm packages):

```bash
pip install yt-dlp        # or: brew install yt-dlp
brew install ffmpeg       # macOS
sudo apt-get install -y ffmpeg   # Ubuntu/Debian
```

Verify with `yt-dlp --version`. Skip this and manual file upload still works
fine. Only use this on content you have the right to download — YouTube's
terms restrict downloading in most other cases.

### If `npm run setup` fails on the engine

That step is just running `make` in `Backend/engine/` — if it fails, it's almost
always because the system libraries from step 1 aren't fully installed.
You can retry just that piece with `npm run build-engine`.

## Manual / step-by-step (if you'd rather run each piece yourself)

<details>
<summary>Expand</summary>

```bash
# Build the C++ engine
cd Backend/engine
make
# produces ./enroll and ./recognize — you can test them directly:
./enroll /path/to/song.wav 0 ../data/fingerprints.db
./recognize /path/to/clip.wav ../data/fingerprints.db
```

```bash
# Terminal 1 — server
cd Backend/server
npm install
npm start        # http://localhost:5001
```

```bash
# Terminal 2 — client
cd Frontend
npm install
npm run dev       # http://localhost:5173
```

</details>

## How it works

1. **Add a Song** either uploads a WAV + name, or (via the "From YouTube"
   tab) downloads audio straight from a URL with `yt-dlp` and converts it to
   WAV. Either way, the server ends up with a WAV file and calls
   `enroll <wav> <songId> <fingerprints.db>`, recording the song's name in
   `songs.json`.
2. **Identify a Clip** either uploads a WAV or records a few seconds from your
   mic (encoded to WAV in the browser). The server saves the clip and calls
   `recognize <clip> <fingerprints.db>`, which loads the whole database,
   matches by hash + time-offset voting, and returns the best match.
3. Everything is stateless on the C++ side — no server process to keep
   running, no mutexes, no concurrency bugs to worry about. Node/Express
   owns all the "app state" (song list) since it's much better suited to it.

## Notes for a fresh CV writeup

Compared to the original version, this rebuild removes:
- the hand-rolled raw-socket HTTP server (replaced by Express)
- the `yt-dlp`/YouTube ingestion path (replaced by manual WAV uploads)
- in-memory shared state + mutexes (replaced by simple file-based storage,
  since each CLI run is independent)

The core fingerprinting math (FFT → spectrogram → peak-picking →
combinatorial hashing → offset-voting match) is unchanged.
