// Import React hooks (useState remembers data, useEffect runs code on load)
import { useCallback, useEffect, useState } from 'react';
// Import the three panels
import SongList from './components/SongList';
import UploadSong from './components/UploadSong';
import IdentifyClip from './components/IdentifyClip';
// Import the function that gets the songs from the server
import { fetchSongs } from './api';

// A component is a function that returns what to show on screen
export default function App() {
  // songs = current list, setSongs = function that updates it and redraws the page
  const [songs, setSongs] = useState([]);

  // Loads the song list from the server
  const loadSongs = useCallback(async () => {
    try {
      setSongs(await fetchSongs());
    } catch (err) {
      console.error('Could not load songs', err);
    }
  }, []);

  // Runs once when the page loads
  useEffect(() => {
    loadSongs();
  }, [loadSongs]);

  return (
    <div className="app">
      <h1>Quickmusic</h1>
      <div className="grid">
        {/* loadSongs is passed down so UploadSong can refresh the list after an upload */}
        <UploadSong onUploaded={loadSongs} />
        <IdentifyClip />
        {/* songs is passed down as a prop */}
        <SongList songs={songs} />
      </div>
    </div>
  );
}
