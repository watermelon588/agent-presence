// Smallest check that fails if hook parsing or hook installing breaks. Run: node test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { normalize, patchFiles, editHooksFile, copilotHooks, antigravityHooks, isEphemeral } = require('./cli');

// Claude Code: main agent edit
let e = normalize('claude', { hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Edit', tool_input: { file_path: 'C:\\repo\\src\\auth.ts' } });
assert.equal(e.state, 'writing'); assert.equal(e.file, 'C:\\repo\\src\\auth.ts'); assert.equal(e.sub, null);

// Claude Code: tool call inside a subagent carries agent_id / agent_type
e = normalize('claude', { hook_event_name: 'PreToolUse', session_id: 's1', agent_id: 'a1', agent_type: 'Explore', tool_name: 'Grep', tool_input: { pattern: 'TODO' } });
assert.equal(e.state, 'reading'); assert.equal(e.sub, 'a1'); assert.equal(e.subType, 'Explore'); assert.equal(e.detail, 'TODO');

// model, as a string (Claude SessionStart), an object, or Antigravity's modelName
assert.equal(normalize('claude', { hook_event_name: 'SessionStart', session_id: 's1', model: 'claude-opus-5-5' }).model, 'claude-opus-5-5');
assert.equal(normalize('claude', { hook_event_name: 'SessionStart', session_id: 's1', model: { id: 'claude-fable-5-2' } }).model, 'claude-fable-5-2');
assert.equal(normalize('antigravity', { conversationId: 'v', modelName: 'gemini-3-pro' }, 'SessionStart').model, 'gemini-3-pro');

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

// Copilot: camelCase payload, event passed as an argument, toolArgs is a JSON string
e = normalize('copilot', { sessionId: 'g1', cwd: '/repo', toolName: 'edit', toolArgs: '{"path":"/repo/a.ts","old_str":"x"}' }, 'preToolUse');
assert.equal(e.state, 'writing'); assert.equal(e.file, '/repo/a.ts'); assert.equal(e.session, 'g1'); assert.equal(e.event, 'PreToolUse');
e = normalize('copilot', { sessionId: 'g1', toolName: 'bash', toolArgs: { command: 'npm test' }, agentId: 'x9', agentName: 'reviewer' }, 'preToolUse');
assert.equal(e.state, 'running'); assert.equal(e.detail, 'npm test'); assert.equal(e.sub, 'x9'); assert.equal(e.subType, 'reviewer');
assert.equal(normalize('copilot', { sessionId: 'g1' }, 'userPromptSubmitted').state, 'thinking');
assert.equal(normalize('copilot', { sessionId: 'g1' }, 'agentStop').state, 'done');
assert.equal(normalize('copilot', { sessionId: 'g1', agentId: 'x9' }, 'subagentStop').state, 'gone');
// Copilot PascalCase aliases send Claude-style snake_case with the event name inside
assert.equal(normalize('copilot', { hook_event_name: 'PreToolUse', session_id: 'g1', tool_name: 'view', tool_input: { path: 'b.ts' } }).state, 'reading');

// Antigravity: conversationId + toolCall; PostToolUse is installed as "ToolUse"
e = normalize('antigravity', { conversationId: 'v1', workspacePaths: ['C:\\w'], toolCall: { name: 'replace_file_content', args: { TargetFile: 'C:\\w\\x.py' } } }, 'ToolUse');
assert.equal(e.state, 'writing'); assert.equal(e.file, 'C:\\w\\x.py'); assert.equal(e.session, 'v1'); assert.equal(e.cwd, 'C:\\w');
e = normalize('antigravity', { conversationId: 'v1', toolCall: { name: 'run_command', args: { CommandLine: 'pytest -q' } } }, 'ToolUse');
assert.equal(e.state, 'running'); assert.equal(e.detail, 'pytest -q');
assert.equal(normalize('antigravity', { conversationId: 'v1', toolCall: { name: 'view_file', args: { AbsolutePath: 'C:\\w\\y.py' } } }, 'ToolUse').state, 'reading');
assert.equal(normalize('antigravity', { conversationId: 'v1', toolCall: { name: 'read_url_content', args: { Url: 'https://x.dev' } } }, 'ToolUse').detail, 'https://x.dev');
assert.equal(normalize('antigravity', { conversationId: 'v1', toolCall: { name: 'invoke_subagent', args: {} } }, 'ToolUse').state, 'delegating');
assert.equal(normalize('antigravity', { conversationId: 'v1' }, 'Stop').state, 'done');

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

// Copilot: our own file, removed whole on uninstall
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-'));
const cf = path.join(tmp, 'hooks', 'agent-presence.json');
copilotHooks(cf, '/x/agent-presence/cli.js', false);
j = JSON.parse(fs.readFileSync(cf, 'utf8'));
assert.equal(j.version, 1); assert.ok(!j.hooks.preToolUse, 'never a blocking pre-tool hook');
assert.match(j.hooks.postToolUse[0].command, /emit copilot ToolUse$/);
copilotHooks(cf, null, true); assert.ok(!fs.existsSync(cf));

// Antigravity: keeps other hook groups, replaces only ours
const af = path.join(tmp, 'config', 'hooks.json');
fs.mkdirSync(path.dirname(af)); fs.writeFileSync(af, JSON.stringify({ mine: { Stop: [{ type: 'command', command: 'x' }] } }));
antigravityHooks(af, '/x/agent-presence/cli.js', false); antigravityHooks(af, '/x/agent-presence/cli.js', false);
j = JSON.parse(fs.readFileSync(af, 'utf8'));
assert.ok(j.mine); assert.ok(!j['agent-presence'].PreToolUse, 'PreToolUse needs a permission decision: never hook it');
assert.match(j['agent-presence'].PostToolUse[0].hooks[0].command, /emit antigravity ToolUse$/);
antigravityHooks(af, null, true);
assert.deepEqual(JSON.parse(fs.readFileSync(af, 'utf8')), { mine: { Stop: [{ type: 'command', command: 'x' }] } });

// npx / pnpm dlx / bunx caches are throwaway; a global or local install is not
assert.ok(isEphemeral('C:\\Users\\me\\AppData\\Local\\npm-cache\\_npx\\ab12\\node_modules\\agent-presence'));
assert.ok(isEphemeral('/home/me/.npm/_npx/ab12/node_modules/agent-presence'));
assert.ok(isEphemeral('/home/me/.local/share/pnpm/store/v3/dlx-1234/node_modules/agent-presence'));
assert.ok(isEphemeral('/tmp/bunx-1000-agent-presence@latest/node_modules/agent-presence'));
assert.ok(!isEphemeral('/usr/lib/node_modules/agent-presence'));
assert.ok(!isEphemeral('C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\agent-presence'));

// Terminal stickers: 50+ clean ones baked, busy ones left out, agents fall back to their logo, every row is w cells, working ones hop
const { termArt, stickerLines, stickerFor } = require('./cli');
assert.ok(Object.keys(require('./avatars/terminal.json').art).length >= 50);
assert.ok(termArt(path.join(__dirname, 'avatars', 'free', 'pixel-food', 'pixel-astronaut.webp')));
assert.equal(termArt(path.join(__dirname, 'avatars', 'free', 'cats', 'cat-grumpy.webp')), null);
for (const agent of ['claude', 'codex', 'copilot', 'antigravity']) assert.ok(stickerFor({ agent, session: 's1' }, {}, new Map()), agent + ' logo');
const logo = stickerFor({ agent: 'claude', session: 's1' }, { avatars: { claude: 'pack:cats' } }, new Map()); // cats aren't in the set -> logo
const a = stickerLines(logo, 0), b = stickerLines(logo, 330);
const visible = l => l.replace(/\x1b\[[0-9;]*m/g, '').length;
assert.equal(a.length, 11); assert.ok(a.every(l => visible(l) === 20)); assert.notDeepEqual(a, b, 'working stickers hop');
assert.deepEqual(stickerLines(logo, 0, 'still'), stickerLines(logo, 170, 'still'));

// A short window drops whole sticker rows, never half of one
const { fit } = require('./cli');
const rows = ['a', 'a', '', 'b', 'b', ''];
assert.deepEqual(fit(rows, 6), rows);
assert.deepEqual(fit(rows, 5).slice(0, 2), ['a', 'a']); assert.equal(fit(rows, 5).length, 3);

// Asking for a website-only fan pack explains why it's missing and where to get it
const { fanHint } = require('./cli');
assert.ok(fanHint('minion').includes('stickers.html#minions'));
assert.equal(fanHint('model-logos'), undefined);

// An unknown command says so before the help and exits 1; no arguments, -h and --help still print the help and exit 0; emit stays silent and exits 0
const { spawnSync } = require('child_process');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'agentpeeps-cli-'));
const runCli = (args, input = '') => spawnSync(process.execPath, [path.join(__dirname, 'cli.js'), ...args], { encoding: 'utf8', input, env: { ...process.env, AGENT_PRESENCE_HOME: scratch } });
const unknown = runCli(['stikers']);
assert.equal(unknown.status, 1);
assert.ok(unknown.stderr.startsWith('Unknown command "stikers".\n\nAgent Peeps'));
assert.equal(unknown.stdout, '');
for (const args of [[], ['-h'], ['--help'], ['help']]) {
  const help = runCli(args);
  assert.equal(help.status, 0, args.join(' ') + ' exits 0');
  assert.ok(help.stdout.includes('agentpeeps init') && !help.stdout.includes('Unknown command'));
}
const emitted = runCli(['emit', 'claude'], '{}');
assert.equal(emitted.status, 0); assert.equal(emitted.stdout, ''); assert.equal(emitted.stderr, '');
fs.rmSync(scratch, { recursive: true, force: true });

console.log('all checks passed');
