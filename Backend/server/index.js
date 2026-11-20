// Quickmusic Express server.
//
// This server owns all the "database" bookkeeping (songs.json) in plain
// JavaScript -- Node handles JSON natively, so there's no reason to make
// the C++ side deal with it. The C++ tools only ever see WAV paths and
// numeric song IDs.
// Import Express framework
const express = require('express');
// Import CORS (lets the React app on port 5173 call this server)
const cors = require('cors');
// Import multer (handles file uploads)
const multer = require('multer');
// Import execFile (runs the C++ programs as separate processes)
const { execFile } = require('child_process');
// Import Node's file system module
const fs = require('fs');
// Import Node's path module (builds file paths)
const path = require('path');

// Create an Express application
const app = express();
// Allow requests from the React app
app.use(cors());
app.use(express.json()); // for the JSON-body /upload-from-youtube route

// __dirname = the folder this file is in; ROOT = the folder above it
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const QUERIES_DIR = path.join(DATA_DIR, 'queries');
const SONGS_JSON = path.join(DATA_DIR, 'songs.json');
const FINGERPRINTS_DB = path.join(DATA_DIR, 'fingerprints.db');

// Paths of the compiled C++ programs
const ENROLL_BIN = path.join(ROOT, 'engine', 'enroll');
const RECOGNIZE_BIN = path.join(ROOT, 'engine', 'recognize');

// Make sure the data folder and its files exist before we start.
for (const dir of [DATA_DIR, UPLOADS_DIR, QUERIES_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}
if (!fs.existsSync(SONGS_JSON)) fs.writeFileSync(SONGS_JSON, '[]');
if (!fs.existsSync(FINGERPRINTS_DB)) fs.writeFileSync(FINGERPRINTS_DB, '');

// Helpers to read and write songs.json
function readSongs() {
  return JSON.parse(fs.readFileSync(SONGS_JSON, 'utf8'));
}
function writeSongs(songs) {
  fs.writeFileSync(SONGS_JSON, JSON.stringify(songs, null, 2));
}

// multer saves uploaded files into the uploads folder
const upload = multer({ dest: UPLOADS_DIR });

// GET /songs -- list every song that's been enrolled.
app.get('/songs', (req, res) => {
  res.json(readSongs());
});

// POST /upload -- add a new song to the database.
// Expects multipart/form-data with a "song" file field and a "name" field.
// upload.single("song") saves the uploaded file and exposes it as req.file
app.post('/upload', upload.single('song'), (req, res) => {
  const name = req.body.name;
  if (!req.file || !name) {
    return res.status(400).json({ error: 'missing file or name' });
  }

  const songs = readSongs();
  // New song id = number of songs so far
  const songId = songs.length;
  const finalPath = path.join(UPLOADS_DIR, `${songId}.wav`);
  // Rename the temporary file to <songId>.wav
  fs.renameSync(req.file.path, finalPath);

  // Run the C++ enroll program. The callback runs when it finishes
  execFile(ENROLL_BIN, [finalPath, String(songId), FINGERPRINTS_DB], (err, stdout, stderr) => {
    // err is set if the program failed or exited with an error code
    if (err) {
      console.error('enroll failed:', stderr || err.message);
      return res.status(500).json({ error: 'enroll_failed' });
    }
    // Enroll worked, so save the song name
    songs.push({ id: songId, name, filename: `${songId}.wav` });
    writeSongs(songs);
    res.json({ status: 'ok', song: { id: songId, name } });
  });
});

// POST /upload-from-youtube -- add a song by downloading its audio with
// yt-dlp instead of uploading a file. Expects JSON: { "url": "...", "name": "..." }
//
// This runs in two steps, both via child_process: first yt-dlp downloads
// and converts the audio to WAV, then the same `enroll` binary used by
// /upload fingerprints it. Downloads can take a while (5-30s+), so the
// frontend should show a "downloading..." state while it waits.
app.post('/upload-from-youtube', (req, res) => {
  const { url, name } = req.body || {};
  if (!url || !name) {
    return res.status(400).json({ error: 'missing url or name' });
  }

  const songs = readSongs();
  const songId = songs.length;
  // yt-dlp needs %(ext)s in the template; since we force --audio-format wav
  // the extracted file will end up at exactly `${songId}.wav`.
  const outputTemplate = path.join(UPLOADS_DIR, `${songId}.%(ext)s`);
  const finalPath = path.join(UPLOADS_DIR, `${songId}.wav`);

  const ytdlpArgs = [
    '--no-playlist',
    '-x', '--audio-format', 'wav',
    '-o', outputTemplate,
    url,
  ];

  execFile('yt-dlp', ytdlpArgs, { timeout: 120000 }, (dlErr, dlStdout, dlStderr) => {
    if (dlErr) {
      console.error('yt-dlp failed:', dlStderr || dlErr.message);
      return res.status(500).json({ error: 'download_failed' });
    }

    execFile(ENROLL_BIN, [finalPath, String(songId), FINGERPRINTS_DB], (enrollErr, out, errOut) => {
      if (enrollErr) {
        console.error('enroll failed:', errOut || enrollErr.message);
        return res.status(500).json({ error: 'enroll_failed' });
      }
      songs.push({ id: songId, name, filename: `${songId}.wav`, source: 'youtube', sourceUrl: url });
      writeSongs(songs);
      res.json({ status: 'ok', song: { id: songId, name } });
    });
  });
});

// POST /recognize -- identify a clip against the enrolled songs.
// Expects multipart/form-data with a "clip" file field (a WAV file).
app.post('/recognize', upload.single('clip'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'missing clip' });

  // multer saves the upload without an extension -- the engine only cares
  // about the WAV content, but we add ".wav" for clarity when browsing the folder.
  const clipPath = req.file.path + '.wav';
  fs.renameSync(req.file.path, clipPath);

  execFile(RECOGNIZE_BIN, [clipPath, FINGERPRINTS_DB], (err, stdout, stderr) => {
    // Delete the temporary clip
    fs.unlink(clipPath, () => {}); // clean up the temp clip either way

    if (err) {
      console.error('recognize failed:', stderr || err.message);
      return res.status(500).json({ error: 'recognize_failed' });
    }

    // Read the JSON that the C++ program printed
    let result;
    try {
      result = JSON.parse(stdout);
    } catch (e) {
      console.error('bad engine output:', stdout);
      return res.status(500).json({ error: 'bad_engine_output' });
    }

    // Attach human-readable song names -- the engine only knows numeric IDs.
    const songs = readSongs();
    if (result.match !== undefined && result.match !== null) {
      const song = songs.find((s) => s.id === result.match);
      result.name = song ? song.name : 'Unknown';
    }
    if (Array.isArray(result.top)) {
      result.top.forEach((t) => {
        const song = songs.find((s) => s.id === t.songId);
        t.name = song ? song.name : 'Unknown';
      });
    }

    res.json(result);
  });
});

// Start the server
const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Quickmusic server running on http://localhost:${PORT}`);
});
