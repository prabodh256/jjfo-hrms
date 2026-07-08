# JJFO HRMS — Frontend

React 19 + Vite SPA for the JJFO Core Enterprise Suite.

## Scripts

```bash
npm install
npm run dev      # http://localhost:5173 (proxies /api + /auth → :4000)
npm run build
npm run preview
```

Set `VITE_API_TARGET` if the API is not on `http://localhost:4000`.

## Stack

- React Router for navigation and route guards
- Zustand store (`src/store.js`)
- Shared fetch client (`src/api.js`) with CSRF header on mutations
- Theme / preferences (`src/theme.js`)
