const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'index.html');
const cssPath = path.join(__dirname, '..', 'styles.css');
const appPath = path.join(__dirname, 'src', 'App.jsx');
const cssTargetPath = path.join(__dirname, 'src', 'index.css');

// Copy CSS
fs.copyFileSync(cssPath, cssTargetPath);

// Read HTML
let html = fs.readFileSync(htmlPath, 'utf8');

// Extract body content from <aside> to </main>
const bodyMatch = html.match(/<aside[\s\S]*<\/main>/);
if (!bodyMatch) {
    console.error("Could not find main content in index.html");
    process.exit(1);
}

let jsxContent = bodyMatch[0];

// Basic HTML to JSX conversions
jsxContent = jsxContent
    .replace(/class=/g, 'className=')
    .replace(/for=/g, 'htmlFor=')
    // Self-close tags
    .replace(/<img([^>]*?)(?<!\/)>/g, '<img$1 />')
    .replace(/<input([^>]*?)(?<!\/)>/g, '<input$1 />')
    .replace(/<hr([^>]*?)(?<!\/)>/g, '<hr$1 />')
    .replace(/<br([^>]*?)(?<!\/)>/g, '<br$1 />')
    .replace(/<!--([\s\S]*?)-->/g, '{/*$1*/}');

// Convert inline styles to objects
jsxContent = jsxContent.replace(/style="([^"]*)"/g, (match, p1) => {
    const styles = p1.split(';').filter(s => s.trim() !== '').map(s => {
        let [key, value] = s.split(':');
        if (!key || !value) return '';
        key = key.trim().replace(/-([a-z])/g, (g) => g[1].toUpperCase());
        return `${key}: "${value.trim()}"`;
    }).filter(s => s !== '').join(', ');
    return `style={{ ${styles} }}`;
});

// Map onclick event handlers
jsxContent = jsxContent.replace(/onclick="app\.([a-zA-Z0-9]+)\(([^)]*)\)"/g, 'onClick={() => window.app.$1($2)}');

// Map onchange context selector
jsxContent = jsxContent.replace(/onchange="app\.switchContext\(this\.value\)"/g, 'onChange={(e) => window.app.switchContext(e.target.value)}');

// Map onkeyup handlers
jsxContent = jsxContent.replace(/onkeyup="app\.([a-zA-Z0-9]+)\(([^)]*)\)"/g, 'onKeyUp={() => window.app.$1($2)}');

// Map onsubmit event handlers
jsxContent = jsxContent.replace(/onsubmit="event\.preventDefault\(\);\s*app\.([a-zA-Z0-9]+)\(([^)]*)\);?"/g, 'onSubmit={(e) => { e.preventDefault(); window.app.$1($2); }}');

const reactComponent = `
import React, { useState, useEffect } from 'react';

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      const response = await fetch('http://localhost:3000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Login failed');
      
      // Map database user to legacy employee ID in localStorage
      const emailToLegacyId = {
        'rajesh@jjfo.com': 'EMP001',
        'priya@jjfo.com': 'EMP002',
        'amit@jjfo.com': 'EMP003',
        'sneha@jjfo.com': 'EMP004',
        'vikram@jjfo.com': 'EMP005'
      };
      const legacyId = emailToLegacyId[data.user.email] || 'EMP001';

      // Hydrate DB properly using HRMS_Store if loaded, otherwise legacy fallback
      if (window.HRMS_Store) {
        let db = window.HRMS_Store.getDB();
        if (!db.employees || db.employees.length === 0) {
          db = window.HRMS_Store.resetDB();
        }
        db.currentUser = { id: legacyId, role: data.user.role };
        window.HRMS_Store.saveDB(db);
      } else {
        let db = JSON.parse(localStorage.getItem('jjfo_hrms_local_db') || '{}');
        db.currentUser = { id: legacyId, role: data.user.role };
        localStorage.setItem('jjfo_hrms_local_db', JSON.stringify(db));
      }

      setUser(data.user);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLogout = async () => {
    try { await fetch('http://localhost:3000/auth/logout', { method: 'POST' }); } catch(e) {}
    setUser(null);
  };

  useEffect(() => {
    if (user && window.app) {
      setTimeout(() => {
        window.app.init();
      }, 100);
    }
  }, [user]);

  if (!user) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#090d16', color: '#fff', fontFamily: 'system-ui' }}>
        <form onSubmit={handleLogin} style={{ background: '#0f1524', padding: '2.5rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '1.2rem', width: '360px', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#6366f1', textAlign: 'center', marginBottom: '0.5rem', letterSpacing: '1.5px', textTransform: 'uppercase' }}>JJFO Core Enterprise</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: '600' }}>Email Address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="rajesh@jjfo.com" style={{ padding: '10px 14px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#fff', outline: 'none' }} required />
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: '600' }}>Password</label>
              <a href="#" onClick={(e) => { e.preventDefault(); alert("For security compliance, password resets are processed manually. Please contact Rajesh Kumar (Superadmin)."); }} style={{ color: '#6366f1', fontSize: '0.75rem', textDecoration: 'none', fontWeight: '600' }}>Forgot Password?</a>
            </div>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={{ padding: '10px 14px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#fff', outline: 'none' }} required />
          </div>
          
          <button type="submit" style={{ padding: '12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', marginTop: '0.5rem', transition: 'all 0.3s' }}>Sign In</button>
          
          {error && <p style={{ color: '#f43f5e', textAlign: 'center', fontSize: '0.85rem', fontWeight: 'bold', marginTop: '0.5rem' }}>{error}</p>}
        </form>
      </div>
    );
  }

  return (
    <>
      ${jsxContent}
    </>
  );
}

export default App;
`;

fs.writeFileSync(appPath, reactComponent);
console.log("Successfully ported index.html to App.jsx with static legacy routing wrappers");
