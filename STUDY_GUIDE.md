# Quickmusic: Study Guide

## 0. How to use this copy

Same project, now in a `Backend/` and `Frontend/` layout like the task manager. The code is unchanged; I only added short one-line comments where something is new (mostly in the React files). Verified by stripping comments from both versions: every file is identical.

Read the files in the order of the tree in section 3. `package.json` files can't hold comments, so they are explained in section 9.

---

## 1. What the project does

A tiny **Shazam**. You add songs to a database, then play or record a short clip, and the app tells you which song it is.

The trick: it never compares raw audio. It turns audio into **fingerprints** (small numbers describing the loudest pitches and when they occur), then looks for the song whose fingerprints line up with the clip.

---

## 2. The three programs and the data

```
 ┌───────────────────────┐        ┌────────────────────────────┐        ┌────────────────────────┐
 │  CLIENT (React)       │  HTTP  │  SERVER (Node + Express)   │ spawns │  ENGINE (C++)          │
 │  runs in the browser  │ ─────► │  receives files and JSON   │ ─────► │  ./enroll  ./recognize │
 │  localhost:5173       │ ◄───── │  localhost:5001            │ ◄───── │  tiny command-line     │
 └───────────────────────┘  JSON  └──────────────┬─────────────┘ stdout │  programs              │
                                                 │                      └───────────┬────────────┘
                                                 ▼                                  ▼
                                      data/songs.json                      data/fingerprints.db
                                      (id -> song name)                    (hash songId offset)
                                      data/uploads/  (WAV files)
```

| Part | Language | Job |
|---|---|---|
| `Backend/engine/` | C++ | All the audio maths. Two stateless programs. |
| `Backend/server/` | JavaScript (Node) | Glue: uploads, runs the C++ programs, keeps song names. |
| `Frontend/` | JavaScript (React) | The web page the user sees. |
| `Backend/data/` | plain files | The "database". |

---

## 3. Folder tree with study order

```
quickmusic-v2/
├── README.md                       read first (what it is + how to run it)
├── package.json                    root scripts (section 9)
├── Backend/
│   ├── engine/                     ── C++ ──────────────────────────────
│   │   ├── engine.h                STEP 1   the contract: types + 4 functions
│   │   ├── engine.cpp              STEP 2   ALL the algorithm  ◄── the core
│   │   ├── enroll_main.cpp         STEP 3   program: add a song
│   │   ├── recognize_main.cpp      STEP 4   program: identify a clip
│   │   └── Makefile                STEP 5   how it is compiled
│   ├── server/                     ── Node + Express ──────────────────
│   │   ├── package.json            (section 9)
│   │   └── index.js                STEP 6   the whole server
│   └── data/                       songs.json, fingerprints.db, uploads/
└── Frontend/                       ── React ────────────────────────────
    ├── package.json                (section 9)
    ├── index.html                  STEP 7   the only HTML page
    ├── vite.config.js              STEP 8   dev-server settings
    └── src/
        ├── main.jsx                STEP 9   entry point
        ├── App.jsx                 STEP 10  root component, owns the song list
        ├── api.js                  STEP 11  every call to the server
        ├── components/
        │   ├── SongList.jsx        STEP 12  simplest component
        │   ├── UploadSong.jsx      STEP 13  forms + state
        │   └── IdentifyClip.jsx    STEP 14  file or microphone
        ├── utils/wavRecorder.js    STEP 15  records mic -> WAV
        └── index.css               STEP 16  styling (optional)
```

### Why this order (and not server first, like the task manager)

You know C++ and DSA, so start where you are strong. The engine is self-contained, and understanding *what is being computed* makes everything else obvious: the server just launches the engine, and the client just talks to the server.

Prefer to follow a request instead? Use this alternative path: **IdentifyClip.jsx -> api.js -> Backend/server/index.js (the /recognize route) -> recognize_main.cpp -> engine.cpp**.

---

## 4. Library, framework, or our own code?

### Universal tools (they exist outside this project)

| Name | Type | Used for | Where |
|---|---|---|---|
| **libsndfile** | C library (system) | Reading WAV files | `engine.cpp` |
| **FFTW** | C library (system) | Fast Fourier Transform | `engine.cpp` |
| **make / g++** | build tools | Compiling the engine | `Makefile` |
| **Node.js** | runtime | Runs JavaScript outside a browser | server |
| **Express** | framework | Routes and middleware | `Backend/server/index.js` |
| **cors** | library | Allow `:5173` to call `:5001` | `Backend/server/index.js` |
| **multer** | library | Parse file uploads | `Backend/server/index.js` |
| `child_process`, `fs`, `path` | Node built-ins | Run programs, files, paths | `Backend/server/index.js` |
| **React** | library | Build UI from components | `Frontend/src` |
| **Vite** | tool | Dev server and bundler | `Frontend/` |
| **concurrently** | tool | Run server + client in one terminal | root `package.json` |
| **yt-dlp, ffmpeg** | external programs | Download/convert YouTube audio (optional) | `/upload-from-youtube` route |

### What the project author wrote

- The fingerprinting algorithm (`engine.cpp`)
- The two command-line programs
- The 4 server routes and how they call the engine
- The three React components, `api.js`, and `wavRecorder.js` (the hand-made WAV encoder)

**Rule of thumb:** if the name comes from an `import`/`require`/`#include` of a library, it's a tool. If it's defined in the project's own folders, the author wrote it.

---

## 5. Why the files are split

| Split | Benefit |
|---|---|
| `engine.h` vs `engine.cpp` | The header is the *contract*. Other files only need the declarations. |
| `engine.cpp` shared by `enroll` and `recognize` | One copy of the fingerprint code. Enroll and recognize **must** compute identical fingerprints, so sharing guarantees it. |
| Two programs instead of one | Each does one job. Each run starts fresh and exits, so there are no threads, locks or shared state. |
| Engine / server / client | Each can be changed or tested on its own. Swap React for something else and the engine doesn't care. |
| `api.js` apart from components | The server address and all HTTP code live in one place. Components stay about UI. |
| One component per file | Small files, each with a single purpose; reusable. |
| `utils/wavRecorder.js` | Low-level audio code kept out of the UI code. |

---

## 6. The two main flows

### Enroll (add a song)

```
 User picks a WAV + types a name
          │  UploadSong.jsx -> api.js  uploadSong()
          ▼
 POST /upload  (multipart form)
          │  Backend/server/index.js
          ├─ multer saves the file          data/uploads/<random>
          ├─ rename to <songId>.wav         songId = number of songs so far
          ├─ execFile("./enroll", [wav, songId, fingerprints.db])
          │                │
          │                ▼   C++:  load audio -> spectrogram -> peaks -> fingerprints
          │                    append lines to data/fingerprints.db
          │                    exit 0  (or 1 on failure)
          ├─ push {id, name, filename} into songs.json
          ▼
 { status: "ok" }  ->  UploadSong calls onUploaded()  ->  App reloads GET /songs
```

### Recognize (identify a clip)

```
 User picks a WAV  or  records the mic (wavRecorder.js builds a WAV)
          │  IdentifyClip.jsx -> api.js  recognizeClip()
          ▼
 POST /recognize  (multipart form, field "clip")
          │  Backend/server/index.js
          ├─ save clip, rename to .wav
          ├─ execFile("./recognize", [clip, fingerprints.db])
          │                │
          │                ▼   C++:  load the whole DB into a hash map
          │                          fingerprint the clip (same code as enroll)
          │                          vote on (song, time-shift)  -> JSON on stdout
          ├─ delete the temp clip
          ├─ JSON.parse(stdout), then look up the song NAME from songs.json
          ▼
 { match: 3, score: 58, name: "My Song", top: [...] }  ->  IdentifyClip draws it
```

---

## 7. The algorithm in DSA terms

```
 audio samples ──FFT──► spectrogram ──top 5 per frame──► peaks ──pair + hash──► fingerprints
   O(N)          O(T·W log W)            O(T·F) avg          points          O(P · fan)
```

| Stage | Idea | Data structure / algorithm |
|---|---|---|
| Spectrogram | Window of 1024 samples, hop 512, **FFT** each | FFT is O(W log W) instead of O(W²) |
| Peaks | Keep the 5 loudest bins per frame | `nth_element` (quickselect), O(F) average |
| Fingerprints | Pair each peak with up to 5 later peaks (1 to 45 frames ahead) | Bucket by frame for O(1) lookup |
| Hash | Pack (f1, f2, dt) into 32 bits of a `uint64_t` | Bit shifting and masking |
| Database | hash -> list of (song, offset) | **Inverted index** (`unordered_map`) |
| Matching | For each query hash, vote on `dbOffset - queryOffset` | **Histogram** per song |

### Why voting works

If a clip starts 1000 frames into song 3, every shared hash has the *same* difference:

```
 clip offset 12  ↔  song 3 offset 1012   →  delta 1000   ┐
 clip offset 40  ↔  song 3 offset 1040   →  delta 1000   ├─ votes pile up on 1000
 clip offset 95  ↔  song 3 offset 1095   →  delta 1000   ┘
 clip offset 77  ↔  song 8 offset  530   →  delta  453      (noise: a lone vote)
```

The song with the tallest bar wins. Even when noise ruins most fingerprints, enough survive.

### Rough numbers (my estimates, 44.1 kHz)

- 1 frame = 512 samples = about 11.6 ms, so a 3-minute song has about 15,500 frames.
- Up to 25 fingerprints per frame gives up to about 390,000 fingerprints, roughly 5 to 8 MB of text per song in `fingerprints.db`.

---

## 8. Glossary (new words in this project)

| Term | Meaning |
|---|---|
| **WAV / PCM** | Uncompressed audio: a small header plus raw samples. |
| **Sample rate** | Samples per second (44100 or 48000 are common). |
| **FFT** | Converts a short slice of audio into "how much of each frequency". |
| **Spectrogram** | FFT of many consecutive slices: a time-versus-frequency picture. |
| **`execFile`** | Node function that runs another program as a child process, with arguments as an array (no shell). |
| **multer** | Express middleware that saves uploaded files and fills `req.file`. |
| **multipart/form-data** | The request format browsers use for file uploads. |
| **`FormData`** | Browser object that builds a multipart body. |
| **Blob** | A chunk of binary data in the browser. |
| **CORS** | Browser rule: a page may only call another origin if that server allows it. |
| **useState** | React hook: remember a value and redraw when it changes. |
| **useEffect** | React hook: run code after drawing (here: load songs once). |
| **useRef** | React hook: remember something without causing a redraw. |
| **props** | Inputs of a component. Data goes down, events (callbacks) go up. |
| **JSX** | HTML-like syntax inside JavaScript. |

---

## 9. The `package.json` files (they can't hold comments)

**Root `package.json`**
- `npm run build-engine` runs `make` inside `Backend/engine/`.
- `npm run setup` installs the server and client dependencies, then builds the engine.
- `npm run dev` uses **concurrently** to start server and client together.

**`Backend/server/package.json`**: dependencies `express`, `cors`, `multer`. Has no `"type"` field, so it uses `require` (CommonJS).

**`Frontend/package.json`**: dependencies `react`, `react-dom`; dev tools `vite` and `@vitejs/plugin-react`. Has `"type": "module"`, so it uses `import` (ES modules). That's why server and client files look slightly different.

---

## 10. Compared with the Task Manager

| | Task Manager | Quickmusic |
|---|---|---|
| Backend | Express | Express |
| Database | MongoDB (Mongoose) | Two plain files (JSON + text) |
| Login | JWT in HttpOnly cookie | None |
| Background work | node-cron jobs | C++ child processes per request |
| CORS | `credentials: true` (cookies) | plain `cors()` (no cookies) |
| Frontend | React | React (plus the browser microphone) |
| Module style (backend) | `require` | `require` |

---

## 11. The SQL angle

The "database" here is two flat files. In SQL it would be:

```sql
CREATE TABLE songs (
  id   INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL
);

CREATE TABLE fingerprints (
  hash     BIGINT UNSIGNED NOT NULL,
  song_id  INT NOT NULL,
  frame    INT NOT NULL,                      -- the "offset"
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
  INDEX idx_hash (hash)                       -- replaces the in-memory hash map
);
```

And the voting algorithm becomes a single query (the clip's fingerprints go into a temporary table `query_fp(hash, frame)`):

```sql
SELECT f.song_id,
       f.frame - q.frame AS delta,
       COUNT(*)          AS votes
FROM   query_fp q
JOIN   fingerprints f ON f.hash = q.hash
GROUP  BY f.song_id, f.frame - q.frame
ORDER  BY votes DESC
LIMIT  5;
```

**What you gain:** no need to load the whole database on every request (the index does the lookup), proper ids via `AUTO_INCREMENT`, transactions, and `songs.json` merged into a real table.

---

## 12. Things I noticed (great interview material)

These are observations from reading the code, not criticism. Each has a fix you can mention.

1. **No minimum score** (`match_fingerprints`). A single coincidental hash hit already produces a "match". A real system needs a threshold (for example, votes above some number, or well above the runner-up).
2. **Sample rate is never checked** (`load_audio_mono`). Bin `k` means `k * rate / 1024` Hz, so a song at 44.1 kHz and a clip at 48 kHz produce different hashes for the same sound. Fix: resample everything to one rate (for example with ffmpeg) before fingerprinting.
3. **`songId = songs.length` is a race condition** (server). Two uploads at once can read the same length and get the same id. Fix: a database with auto-increment, or a lock/queue.
4. **Concurrent file writes.** Two `enroll` runs can append to `fingerprints.db` at the same time, and `recognize` may read while a write is half done. Fix: file locking, or SQL transactions.
5. **The whole database is loaded on every recognize.** Simple and stateless, but slower as songs grow. Fix: keep the engine running as a service, or use an indexed database.
6. **Engine error messages are lost.** When the clip is too short, `recognize` prints an error JSON but exits with code 1, so Node treats it as a failure and the user only sees `recognize_failed`.
7. **`QUERIES_DIR` is created but never used** (clips go to `UPLOADS_DIR` and are deleted).
8. **No upload limits or type checks** (multer). Any file can be uploaded and any size.
9. **A failed enroll leaves its WAV file in `data/uploads/`** because the file was already renamed.
10. **The README is inconsistent** about YouTube: one section documents it as an optional feature, while a later list describes the yt-dlp path as "replaced by manual WAV uploads", yet the server still has `/upload-from-youtube`.
11. **`api.js` never checks `res.ok`.** A non-JSON error page would make `res.json()` throw, and the UI would say "Could not reach the server" even though the server answered.
12. `UploadSong` has two nearly identical submit handlers (could be one), and `ScriptProcessorNode` in `wavRecorder.js` is deprecated (the author says so; `AudioWorklet` replaces it).

---

## 13. Interview questions

**Algorithm and C++**
1. *Why an FFT?* It converts time-domain samples into frequencies in O(N log N) instead of O(N²).
2. *Why a window function?* Cutting a frame creates sharp edges that leak energy into all frequencies. A Hann window fades the edges.
3. *Why hash pairs of peaks, not single peaks?* One frequency appears everywhere. A pair plus a time gap is much more specific, so far fewer false candidates.
4. *Why does the hash use the time **difference** `dt`?* So it is the same wherever in the song the pair occurs.
5. *Why vote on `dbOffset - queryOffset`?* A real match has the same shift for every shared hash, so votes concentrate on one value. Noise spreads out.
6. *Complexity of recognize?* Loading the DB is O(M) (M = stored fingerprints). Matching is O(Q × average bucket size).
7. *Why `nth_element`?* Quickselect gets the top 5 in O(F) average, without sorting 512 bins.
8. *How would you make it handle noise better?* Local-maximum peak picking, more targets per anchor, a score threshold, resampling.

**Architecture and OS**
9. *Why spawn C++ programs instead of one big server?* Simplicity and no shared state. The cost is process start-up plus DB reload per request. Alternatives: a Node native addon, a C++ HTTP service, or WebAssembly.
10. *Why `execFile` and not `exec`?* `execFile` takes arguments as an array and uses no shell, so shell injection isn't possible. (A URL starting with `-` could still be read as an option by yt-dlp, which is worth knowing.)
11. *What does asynchronous mean for `execFile`?* Node doesn't block. It serves other requests and calls the callback when the child exits.
12. *What races exist here?* See items 3 and 4 above.

**Web and React**
13. *What is CORS and why needed here?* Different ports are different origins. The server must allow the React origin.
14. *State vs props?* State is a component's own memory. Props are inputs from the parent.
15. *Why `e.preventDefault()` in a form handler?* It stops the browser from reloading the page.
16. *What is a controlled input?* Its value comes from state and `onChange` writes back to state.
17. *When would you use `useRef` instead of `useState`?* When the value must persist but shouldn't cause a redraw (the recorder object).
18. *Why not MediaRecorder?* It produces compressed webm/opus, but the engine reads WAV through libsndfile. The author builds WAV by hand instead.

**Databases**
19. *Redesign this with SQL.* See section 11: two tables, an index on `hash`, and the voting query as `GROUP BY`.
20. *Where is the inverted index?* In C++ it is the `unordered_map`; in SQL it is the B-tree index on `hash`.

---

## 14. Run it and experiment

Setup (from the README): install `libfftw3-dev`, `libsndfile1-dev` and `build-essential` (Linux) or `brew install fftw libsndfile` (macOS), then:

```bash
npm install
npm run setup
npm run dev          # open http://localhost:5173
```

Experiments, from easy to challenging:

1. **Talk to the engine directly**, with no web app at all:
   `cd Backend/engine && make && ./enroll song.wav 0 ../data/fingerprints.db`, then `./recognize clip.wav ../data/fingerprints.db`. Read the JSON.
2. **Change a knob** in `engine.cpp` (for example `PEAKS_PER_FRAME`) and watch `numFingerprints` from `enroll` change.
3. **Cut a 5-second clip** from an enrolled song and identify it. Then try one from a different recording of the same song.
4. **Add a score threshold** in `match_fingerprints` so weak matches return `null`.
5. **Fix the id race** by keeping the next id in `songs.json`, or move the "database" to SQLite or MySQL using section 11.
