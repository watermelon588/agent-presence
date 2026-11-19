// Site visit counter. POST counts a visit, GET reads the total.
// Needs Upstash Redis connected to the Vercel project (sets KV_REST_API_URL / KV_REST_API_TOKEN).
export default async function handler(req, res) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return res.status(503).json({ error: 'counter not configured' });
  const cmd = req.method === 'POST' ? 'incr' : 'get';
  try {
    const r = await fetch(`${url}/${cmd}/site:visits`, { headers: { Authorization: `Bearer ${token}` } });
    const { result } = await r.json();
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ visits: Number(result) || 0 });
  } catch {
    res.status(502).json({ error: 'counter unavailable' });
  }
}
