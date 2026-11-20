// Import React
import React from 'react';
// Import ReactDOM (puts React on the page)
import ReactDOM from 'react-dom/client';
// Import the main App component
import App from './App.jsx';
// Import global styles
import './index.css';

// Render App inside the <div id="root"> from index.html
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
