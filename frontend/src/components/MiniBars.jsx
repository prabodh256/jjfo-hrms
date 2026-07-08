import React from 'react';

/** Lightweight pure-CSS bar chart (no chart lib). */
export default function MiniBars({ title, items, color = '#4f46e5' }) {
  const max = Math.max(1, ...items.map((i) => Number(i.value) || 0));
  return (
    <div className="mini-bars glass p-6">
      {title && <h3 style={{ marginBottom: 12 }}>{title}</h3>}
      <div className="mini-bars-row">
        {items.map((it) => (
          <div key={it.label} className="mini-bar-col" title={`${it.label}: ${it.value}`}>
            <div className="mini-bar-track">
              <div
                className="mini-bar-fill"
                style={{
                  height: `${Math.round(((Number(it.value) || 0) / max) * 100)}%`,
                  background: it.color || color
                }}
              />
            </div>
            <strong className="mini-bar-val">{it.value}</strong>
            <span className="mini-bar-lbl">{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
