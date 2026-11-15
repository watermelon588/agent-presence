// Run: node test.js
const assert = require('assert');
const path = require('path');
const { createPresence } = require('./presence');

const p = createPresence();
const cwd = path.resolve('/repo');
const auth = path.join(cwd, 'src', 'auth.ts');
let now = 1_000_000;
const ev = (o) => p.apply({ agent: 'claude', session: 's1', sub: null, t: now, cwd, ...o });

ev({ state: 'writing', file: auth });
let hit = p.fileInfo(auth, now, 90e3);
assert.equal(hit.agent, 'claude'); assert.equal(hit.active, true); assert.equal(hit.state, 'writing');
assert.equal(p.fileInfo(path.join(cwd, 'other.ts'), now, 90e3), null);

// case-insensitive match on Windows paths
if (process.platform === 'win32') assert.ok(p.fileInfo(auth.toUpperCase(), now, 90e3));

// after the agent stops, the file stays "recent" for the window, then clears
ev({ state: 'done' });
now += 30e3; hit = p.fileInfo(auth, now, 90e3);
assert.equal(hit.active, false);
now += 120e3; assert.equal(p.fileInfo(auth, now, 90e3), null);

// subagent + Codex relative path resolved against cwd; the active one wins
ev({ state: 'running', sub: 'a1', subType: 'test-writer', file: auth });
p.apply({ agent: 'codex', session: 'c1', t: now - 5e3, cwd, state: 'done', file: 'src/auth.ts' });
hit = p.fileInfo(auth, now, 90e3);
assert.equal(hit.sub, 'a1'); assert.equal(hit.subType, 'test-writer');

// SessionEnd removes the agent and its subagents
ev({ state: 'gone' });
assert.deepEqual(p.list().map(a => a.agent), ['codex']);
assert.equal(p.fileInfo(auth, now, 90e3).agent, 'codex');

console.log('all checks passed');
