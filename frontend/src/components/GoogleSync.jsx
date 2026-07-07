import React, { useEffect, useState } from 'react';
import useStore from '../store';

const TABS = ['drive', 'sheets', 'gmail'];

function GoogleSync() {
  const { gsync, fetchGsync } = useStore();
  const [tab, setTab] = useState('drive');

  useEffect(() => { fetchGsync(tab); }, [tab, fetchGsync]);

  const rows = gsync[tab] || [];
  const cols = rows.length ? Object.keys(rows[0]).filter(k => k !== 'id') : [];

  return (
    <div className="view-panel active-view">
      <div className="view-header"><div><h2>Google Workspace Sync</h2><p>Simulated Drive, Sheets and Gmail integration logs.</p></div></div>
      <div className="tab-navigation">
        {TABS.map(k => (
          <button key={k} className={`tab-btn ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)} style={{ textTransform: 'capitalize' }}>{k}</button>
        ))}
      </div>
      <div className="glass p-6" style={{ marginTop: '1rem' }}>
        {rows.length === 0 ? <p>No {tab} records synced.</p> : (
          <div className="table-responsive">
            <table className="table">
              <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>{cols.map(c => <td key={c}>{String(r[c])}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default GoogleSync;
