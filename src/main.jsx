import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';

// Safety: reveal entrance content if CSS animations get throttled (moved out
// of index.html so the page can ship a strict `script-src 'self'` CSP).
setTimeout(() => document.documentElement.classList.add('anim-settled'), 1400);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
