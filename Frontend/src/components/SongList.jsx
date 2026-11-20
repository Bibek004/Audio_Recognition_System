// Receives the list of songs as a prop and shows it
export default function SongList({ songs }) {
  return (
    <div className="panel">
      <h2>Song Database</h2>
      {/* No songs yet? Show a message, otherwise show the list */}
      {songs.length === 0 ? (
        <p className="muted">No songs enrolled yet.</p>
      ) : (
        <ul className="song-list">
          {/* One <li> per song. key helps React track list items */}
          {songs.map((s) => (
            <li key={s.id}>{s.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
