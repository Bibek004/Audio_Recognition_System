// useRef keeps a value between redraws without causing a redraw
import { useRef, useState } from 'react';
// Import the API function and the microphone recorder
import { recognizeClip } from '../api';
import { WavRecorder } from '../utils/wavRecorder';

export default function IdentifyClip() {
  // State: chosen file, recording on or off, status message, and the result from the server
  const [file, setFile] = useState(null);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);
  // Holds the recorder object while recording
  const recorderRef = useRef(null);

  // Sends audio (a file or a recording) to the server and stores the result
  const identify = async (blobOrFile) => {
    setStatus('Identifying...');
    setResult(null);
    try {
      const data = await recognizeClip(blobOrFile);
      setResult(data);
    } catch (err) {
      // Show an error if the server can't be reached
      setResult({ error: 'could_not_reach_server' });
    }
    setStatus('');
  };

  // Identify the chosen file when the form is submitted
  const handleFileSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    await identify(file);
  };

  // Start recording from the microphone
  const startRecording = async () => {
    try {
      recorderRef.current = new WavRecorder();
      await recorderRef.current.start();
      setRecording(true);
    } catch (err) {
      setStatus('Microphone access denied.');
    }
  };

  // Stop recording and identify what was recorded
  const stopRecording = async () => {
    // stop() returns the recording as a WAV file
    const blob = recorderRef.current.stop();
    setRecording(false);
    await identify(blob);
  };

  return (
    <div className="panel">
      <h2>Identify a Clip</h2>

      {/* Identify from a file */}
      <form onSubmit={handleFileSubmit}>
        <input type="file" accept=".wav" onChange={(e) => setFile(e.target.files[0])} />
        <button type="submit">Identify from file</button>
      </form>

      {/* Identify from the microphone */}
      <div className="record-controls">
        {!recording ? (
          <button onClick={startRecording}>Record from mic</button>
        ) : (
          <button className="recording" onClick={stopRecording}>
            Stop &amp; Identify
          </button>
        )}
      </div>

      {status && <p className="status">{status}</p>}

      {/* Show the result after the server answers */}
      {result && (
        <div className="result">
          {result.error && <p>Error: {result.error}</p>}
          {result.match !== undefined && result.match !== null && (
            <>
              <h3>Match: {result.name}</h3>
              <p>Score: {result.score}</p>
            </>
          )}
          {result.match === null && <p>No match found.</p>}
        </div>
      )}
    </div>
  );
}
