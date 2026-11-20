// Import useState (remembers values between redraws)
import { useState } from 'react';
// Import the API functions
import { uploadSong, uploadFromYoutube } from '../api';

// onUploaded is a function from App. Calling it refreshes the song list
export default function UploadSong({ onUploaded }) {
  // mode = which form is open ("file" or "youtube")
  const [mode, setMode] = useState('file'); // 'file' | 'youtube'
  // file = chosen file, url = YouTube link, name = song title, status = message shown to the user
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');

  // Runs when the file form is submitted
  const handleFileSubmit = async (e) => {
    // Stop the browser from reloading the page
    e.preventDefault();
    // Do nothing if the file or name is missing
    if (!file || !name) return;

    setStatus('Uploading...');
    try {
      // Send the file to the server and wait for the answer
      const result = await uploadSong(file, name);
      if (result.status === 'ok') {
        setStatus(`Added "${name}"`);
        setName('');
        setFile(null);
        // Tell App to reload the song list
        onUploaded();
      } else {
        setStatus(`Failed: ${result.error || 'unknown error'}`);
      }
    // The server could not be reached
    } catch (err) {
      setStatus('Could not reach the server.');
    }
  };

  // Same as above, but for the YouTube form
  const handleYoutubeSubmit = async (e) => {
    e.preventDefault();
    if (!url || !name) return;

    setStatus('Downloading from YouTube... this can take a bit.');
    try {
      const result = await uploadFromYoutube(url, name);
      if (result.status === 'ok') {
        setStatus(`Added "${name}"`);
        setName('');
        setUrl('');
        onUploaded();
      } else {
        setStatus(`Failed: ${result.error || 'unknown error'}`);
      }
    } catch (err) {
      setStatus('Could not reach the server.');
    }
  };

  return (
    <div className="panel">
      <h2>Add a Song</h2>

      {/* Buttons to switch between the two forms */}
      <div className="mode-toggle">
        <button
          type="button"
          className={mode === 'file' ? 'active' : ''}
          onClick={() => setMode('file')}
        >
          From file
        </button>
        <button
          type="button"
          className={mode === 'youtube' ? 'active' : ''}
          onClick={() => setMode('youtube')}
        >
          From YouTube
        </button>
      </div>

      {/* Show the file form or the YouTube form */}
      {mode === 'file' ? (
        <form onSubmit={handleFileSubmit}>
          {/* The input shows the value from state; onChange updates the state */}
          <input
            type="text"
            placeholder="Song name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input type="file" accept=".wav" onChange={(e) => setFile(e.target.files[0])} />
          <button type="submit">Upload</button>
        </form>
      ) : (
        <form onSubmit={handleYoutubeSubmit}>
          <input
            type="text"
            placeholder="Song name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="text"
            placeholder="YouTube URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="submit">Add from YouTube</button>
        </form>
      )}

      {/* Show the message only if there is one */}
      {status && <p className="status">{status}</p>}
    </div>
  );
}
