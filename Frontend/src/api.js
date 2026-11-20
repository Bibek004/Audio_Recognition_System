// Address of the Express server
const API_BASE = 'http://localhost:5001';

// GET /songs
export async function fetchSongs() {
  const res = await fetch(`${API_BASE}/songs`);
  return res.json();
}

// POST /upload: sends the WAV file and the song name
export async function uploadSong(file, name) {
  // FormData builds a file-upload request body
  const form = new FormData();
  // The field name must match upload.single("song") on the server
  form.append('song', file);
  form.append('name', name);
  const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: form });
  return res.json();
}

// POST /upload-from-youtube: sends the URL and name as JSON
export async function uploadFromYoutube(url, name) {
  const res = await fetch(`${API_BASE}/upload-from-youtube`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, name }),
  });
  return res.json();
}

// POST /recognize: sends the clip (a file or recorded audio)
export async function recognizeClip(blob) {
  const form = new FormData();
  // The field name must match upload.single("clip") on the server
  form.append('clip', blob, 'clip.wav');
  const res = await fetch(`${API_BASE}/recognize`, { method: 'POST', body: form });
  return res.json();
}
