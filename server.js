import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import {
  saveSession,
  getSession,
  setAccountStatus,
  resetSessionActions,
  generateSyncCode
} from './src/server/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Trust reverse proxies (e.g. Nginx, Cloudflare, Traefik, Caddy)
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// Helper to generate QR code data URL for a sync link
async function makeQrCode(syncCode, req) {
  let baseUrl = process.env.BASE_URL || process.env.PUBLIC_URL;
  if (!baseUrl) {
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    const host = req.get('x-forwarded-host') || req.get('host') || `localhost:${PORT}`;
    baseUrl = `${protocol}://${host}`;
  }
  // Ensure no trailing slash
  baseUrl = baseUrl.replace(/\/+$/, '');
  const syncUrl = `${baseUrl}/?sync=${syncCode}`;
  try {
    return await QRCode.toDataURL(syncUrl, {
      margin: 2,
      scale: 8,
      color: {
        dark: '#111827',
        light: '#FFFFFF'
      }
    });
  } catch (err) {
    console.error('Error generating QR code:', err);
    return null;
  }
}

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 2. Load Sample Data
app.get('/api/sample-data', (req, res) => {
  try {
    const followingPath = path.join(__dirname, 'sample-data', 'following.json');
    const followersPath = path.join(__dirname, 'sample-data', 'followers_1.json');

    const followingRaw = fs.readFileSync(followingPath, 'utf-8');
    const followersRaw = fs.readFileSync(followersPath, 'utf-8');

    res.json({
      following: JSON.parse(followingRaw),
      followers: JSON.parse(followersRaw)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read sample data', message: err.message });
  }
});

// 2b. Serve Sample Zip Archive
app.get('/api/sample-zip', (req, res) => {
  const zipPath = path.join(__dirname, 'sample-data', 'instagram-export-sample.zip');
  if (fs.existsSync(zipPath)) {
    res.sendFile(zipPath);
  } else {
    res.status(404).json({ error: 'Sample zip not found' });
  }
});

// 3. Create or Update Session
app.post('/api/sessions', async (req, res) => {
  try {
    const { code, name, totalFollowing, totalFollowers, items } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Missing or invalid "items" array' });
    }

    const session = saveSession({
      code: code ? code.toUpperCase().trim() : generateSyncCode(),
      name: name || 'Instagram Session',
      totalFollowing: Number(totalFollowing) || 0,
      totalFollowers: Number(totalFollowers) || 0,
      items
    });

    const qrCode = await makeQrCode(session.code, req);

    res.json({
      success: true,
      session,
      qrCode
    });
  } catch (err) {
    console.error('Error in POST /api/sessions:', err);
    res.status(500).json({ error: 'Failed to create session', message: err.message });
  }
});

// 4. Get Session by Sync Code
app.get('/api/sessions/:code', async (req, res) => {
  try {
    const code = req.params.code.toUpperCase().trim();
    const session = getSession(code);

    if (!session) {
      return res.status(404).json({ error: 'Session not found for code: ' + code });
    }

    const qrCode = await makeQrCode(session.code, req);

    res.json({
      success: true,
      session,
      qrCode
    });
  } catch (err) {
    console.error('Error in GET /api/sessions/:code:', err);
    res.status(500).json({ error: 'Failed to get session', message: err.message });
  }
});

// 5. Toggle or Update an Account Status
app.post('/api/sessions/:code/action', (req, res) => {
  try {
    const code = req.params.code.toUpperCase().trim();
    const { username, isCompleted } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Missing "username" parameter' });
    }

    const session = getSession(code);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const updated = setAccountStatus(code, username, Boolean(isCompleted));

    res.json({
      success: true,
      session: updated
    });
  } catch (err) {
    console.error('Error in POST /api/sessions/:code/action:', err);
    res.status(500).json({ error: 'Failed to update action', message: err.message });
  }
});

// 6. Reset all completed statuses for a session
app.post('/api/sessions/:code/reset', (req, res) => {
  try {
    const code = req.params.code.toUpperCase().trim();
    const session = getSession(code);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const updated = resetSessionActions(code);
    res.json({
      success: true,
      session: updated
    });
  } catch (err) {
    console.error('Error in POST /api/sessions/:code/reset:', err);
    res.status(500).json({ error: 'Failed to reset session', message: err.message });
  }
});

// Fallback for direct index.html routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Instaboard server running at http://localhost:${PORT}`);
});
