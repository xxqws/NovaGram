// Vercel Serverless Function: отправляет Web Push всем подпискам темы t (хранятся в Firebase)
const webpush = require('web-push');

const FB = String(process.env.FB_URL || '').replace(/\/+$/, '');
let ready = false;
function init() {
  if (ready) return true;
  const { VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !VAPID_SUBJECT || !FB) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  ready = true;
  return true;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!init()) return res.status(500).json({ error: 'env vars missing' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const t = body && body.t;
  if (typeof t !== 'string' || !/^m[0-9a-f]{36}$/.test(t)) return res.status(400).json({ error: 'bad topic' });

  try {
    const r = await fetch(`${FB}/push/${t}.json`);
    const subs = (await r.json()) || {};
    const keys = Object.keys(subs);
    let sent = 0, removed = 0;
    await Promise.all(keys.map(async (k) => {
      const sub = subs[k] && subs[k].s;
      if (!sub || !sub.endpoint) return;
      try {
        await webpush.sendNotification(sub, null, { TTL: 3600, urgency: 'high' });
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          removed++;
          try { await fetch(`${FB}/push/${t}/${k}.json`, { method: 'DELETE' }); } catch (x) {}
        }
      }
    }));
    return res.status(200).json({ ok: true, sent, removed });
  } catch (e) {
    return res.status(500).json({ error: 'failed' });
  }
};
