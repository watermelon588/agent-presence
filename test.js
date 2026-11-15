// Smallest check that fails if hook parsing or hook installing breaks. Run: node test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { normalize, patchFiles, editHooksFile } = require('./cli');

// Claude Code: main agent edit
let e = normalize('claude', { hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Edit', tool_input: { file_path: 'C:\\repo\\src\\auth.ts' } });
assert.equal(e.state, 'writing'); assert.equal(e.file, 'C:\\repo\\src\\auth.ts'); assert.equal(e.sub, null);

// Claude Code: tool call inside a subagent carries agent_id / agent_type
e = normalize('claude', { hook_event_name: 'PreToolUse', session_id: 's1', agent_id: 'a1', agent_type: 'Explore', tool_name: 'Grep', tool_input: { pattern: 'TODO' } });
assert.equal(e.state, 'reading'); assert.equal(e.sub, 'a1'); assert.equal(e.subType, 'Explore'); assert.equal(e.detail, 'TODO');

// lifecycle
assert.equal(normalize('claude', { hook_event_name: 'SubagentStop', session_id: 's1', agent_id: 'a1' }).state, 'gone');
assert.equal(normalize('claude', { hook_event_name: 'Stop', session_id: 's1' }).state, 'done');
assert.equal(normalize('claude', { hook_event_name: 'Notification', session_id: 's1', message: 'Claude needs permission' }).state, 'waiting');
assert.equal(normalize('claude', { hook_event_name: 'SessionStart', session_id: 's1' }).state, 'idle');
assert.equal(normalize('claude', { hook_event_name: 'SomethingNew' }), null);
assert.equal(normalize('claude', {}), null);

// Codex: apply_patch keeps the path inside the patch text; Bash command may be an array
const patch = '*** Begin Patch\n*** Update File: src/app.py\n@@\n-a\n+b\n*** Add File: src/new.py\n*** End Patch';
assert.deepEqual(patchFiles(patch), ['src/app.py', 'src/new.py']);
e = normalize('codex', { hook_event_name: 'PreToolUse', session_id: 'c1', tool_name: 'apply_patch', tool_input: { command: patch } });
assert.equal(e.state, 'writing'); assert.equal(e.file, 'src/app.py');
e = normalize('codex', { hook_event_name: 'PreToolUse', session_id: 'c1', tool_name: 'Bash', tool_input: { command: ['bash', '-lc', 'npm test'] } });
assert.equal(e.state, 'running'); assert.equal(e.detail, 'bash -lc npm test');

// installer: keeps the user's own hooks, is idempotent, uninstall removes only ours
const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ap-')), 'settings.json');
fs.writeFileSync(f, JSON.stringify({ model: 'x', hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'mine.sh' }] }] } }));
const mk = () => ({ type: 'command', command: 'node', args: ['/x/agent-presence/cli.js', 'emit', 'claude'], async: true });
editHooksFile(f, ['PreToolUse', 'Stop'], mk, false);
editHooksFile(f, ['PreToolUse', 'Stop'], mk, false);
let j = JSON.parse(fs.readFileSync(f, 'utf8'));
assert.equal(j.model, 'x');
assert.equal(j.hooks.PreToolUse.length, 2); assert.equal(j.hooks.Stop.length, 1);
editHooksFile(f, ['PreToolUse', 'Stop'], mk, true);
j = JSON.parse(fs.readFileSync(f, 'utf8'));
assert.deepEqual(j.hooks, { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'mine.sh' }] }] });

console.log('all checks passed');
