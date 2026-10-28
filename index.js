const Fastify = require('fastify');
const cors = require('@fastify/cors');

const app = Fastify({ logger: true });

app.register(cors, { origin: true });

const servers = new Map();
const keys = new Set([process.env.ADMIN_KEY || 'void-demo-2026']);

app.get('/', async () => {
  return {
    status: 'online',
    service: 'Voidside API',
    version: '1.0.0',
    time: new Date().toISOString()
  };
});

app.post('/heartbeat', async (req, reply) => {
  const { jobId, placeId, players } = req.body || {};
  if (!jobId) return reply.code(400).send({ error: 'jobId required' });

  const existing = servers.get(jobId) || { scripts: [] };
  servers.set(jobId, {
    placeId: placeId || existing.placeId || 0,
    players: players || 0,
    lastSeen: Date.now(),
    scripts: existing.scripts
  });
  return { ok: true };
});

app.get('/poll', async (req, reply) => {
  const jobId = req.query.jobId;
  if (!jobId) return reply.code(400).send({ error: 'jobId required' });

  const server = servers.get(jobId);
  if (!server || server.scripts.length === 0) return { script: null };

  const script = server.scripts.shift();
  servers.set(jobId, server);
  return { script };
});

app.post('/execute', async (req, reply) => {
  const { jobId, script, key } = req.body || {};
  if (!key || !keys.has(key)) return reply.code(401).send({ error: 'invalid key' });
  if (!jobId || !script) return reply.code(400).send({ error: 'jobId and script required' });

  const server = servers.get(jobId) || { placeId: 0, players: 0, lastSeen: Date.now(), scripts: [] };
  server.scripts.push(script);
  servers.set(jobId, server);
  return { ok: true, queued: true };
});

app.get('/servers', async (req, reply) => {
  const key = req.headers['x-api-key'] || req.query.key;
  if (!key || !keys.has(key)) return reply.code(401).send({ error: 'invalid key' });

  const now = Date.now();
  const live = [];
  for (const [jobId, data] of servers.entries()) {
    if (now - data.lastSeen < 60000) {
      live.push({
        jobId,
        placeId: data.placeId,
        players: data.players,
        lastSeen: data.lastSeen,
        pendingScripts: data.scripts.length
      });
    }
  }
  return { servers: live };
});

app.post('/auth', async (req, reply) => {
  const { key } = req.body || {};
  if (key && keys.has(key)) return { valid: true };
  return reply.code(401).send({ valid: false });
});

const port = process.env.PORT || 10000;
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Voidside API running on port ${port}`);
});
