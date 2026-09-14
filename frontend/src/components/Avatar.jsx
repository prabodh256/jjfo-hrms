import React, { useEffect, useMemo, useState } from 'react';

function fallbackAvatar(name = '') {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase() || '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" rx="80" fill="#f97316"/><text x="80" y="91" text-anchor="middle" font-family="Arial,sans-serif" font-size="58" font-weight="700" fill="#ffffff">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export default function Avatar({ src, name, ...props }) {
  const [failed, setFailed] = useState(false);
  const fallback = useMemo(() => fallbackAvatar(name), [name]);

  useEffect(() => setFailed(false), [src]);

  return (
    <img
      {...props}
      src={!failed && src ? src : fallback}
      alt=""
      aria-label={`${name || 'User'} avatar`}
      onError={() => setFailed(true)}
    />
  );
}
