/**
 * Last-resort error boundary. A render crash anywhere in the tree used to
 * leave a blank black page; now it shows what happened and how to recover
 * without losing the saved reports (they live in localStorage).
 */
import React from 'react';

export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error, info) {
    console.error('DBFLOW crashed:', error, info?.componentStack);
  }

  reset = () => {
    try { localStorage.removeItem('dbflow_draft'); } catch { /* ignore */ }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    const msg = String(this.state.error?.message || this.state.error || 'Unbekannter Fehler');
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#050505', color: '#f4f4f5', fontFamily: 'inherit' }}>
        <div role="alert" style={{ maxWidth: 520, width: '100%', padding: 28, borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(244,63,94,0.35)' }}>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Da ist etwas schiefgelaufen</h1>
          <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.6)', margin: '0 0 14px', lineHeight: 1.5 }}>
            Die Oberfläche ist auf einen Fehler gestoßen. Ihre gespeicherten Berichte bleiben erhalten.
          </p>
          <pre style={{ fontSize: 12, padding: 12, borderRadius: 10, background: 'rgba(0,0,0,0.35)', color: '#fb7185', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '0 0 18px', maxHeight: 160, overflow: 'auto' }}>{msg}</pre>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => window.location.reload()} style={btn(false)}>Neu laden</button>
            <button onClick={this.reset} style={btn(true)}>Entwurf verwerfen &amp; neu laden</button>
          </div>
        </div>
      </div>
    );
  }
}

const btn = (primary) => ({
  padding: '9px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 550,
  background: primary ? '#3b82f6' : 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)',
});
