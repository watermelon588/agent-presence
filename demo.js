// Plays fake Claude Code (with two subagents), Codex, Copilot and Antigravity sessions through the real hook path,
// each in its agent's own payload format.
// Run with the overlay open: npm run overlay  (one terminal)  +  npm run demo  (another)
const { execFileSync } = require('child_process');
const path = require('path');
const cli = path.join(__dirname, 'cli.js');
const cwd = process.cwd();
const hook = (agent, h, ev) => execFileSync(process.execPath, [cli, 'emit', agent, ...(ev ? [ev] : [])], { input: JSON.stringify({ cwd, ...h }) });
const C = h => hook('claude', { session_id: 'demo-claude', ...h });
const X = h => hook('codex', { session_id: 'demo-codex', ...h });
const G = (ev, h) => hook('copilot', { sessionId: 'demo-copilot', ...h }, ev); // camelCase, toolArgs as a JSON string
const A = (ev, h) => hook('antigravity', { conversationId: 'demo-agy', workspacePaths: [cwd], ...h }, ev);
const gTool = (toolName, args) => ({ toolName, toolArgs: JSON.stringify(args) });
const aTool = (name, args) => ({ toolCall: { name, args } });
const pre = (tool, tool_input, extra) => ({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input, ...extra });
const f = p => path.join(cwd, p);

const steps = [
  () => C({ hook_event_name: 'SessionStart', model: 'claude-opus-5-5' }),
  () => C({ hook_event_name: 'UserPromptSubmit', prompt: 'add login' }),
  () => C(pre('Read', { file_path: f('src/auth.ts') })),
  () => X({ hook_event_name: 'SessionStart' }),
  () => G('sessionStart'),
  () => A('SessionStart'),
  () => C(pre('Agent', { description: 'map the auth code', subagent_type: 'Explore' })),
  () => C({ hook_event_name: 'SubagentStart', agent_id: 'sub-1', agent_type: 'Explore' }),
  () => C(pre('Grep', { pattern: 'session' }, { agent_id: 'sub-1', agent_type: 'Explore' })),
  () => X(pre('apply_patch', { command: '*** Begin Patch\n*** Update File: api/routes.py\n*** End Patch' })),
  () => G('ToolUse', gTool('edit', { path: f('web/App.tsx') })),
  () => A('ToolUse', aTool('run_command', { CommandLine: 'npm run build' })),
  () => C({ hook_event_name: 'SubagentStart', agent_id: 'sub-2', agent_type: 'test-writer' }),
  () => C(pre('Write', { file_path: f('tests/auth.test.ts') }, { agent_id: 'sub-2', agent_type: 'test-writer' })),
  () => C(pre('Edit', { file_path: f('src/auth.ts') })),
  () => X(pre('Bash', { command: ['pytest', '-q'] })),
  () => C({ hook_event_name: 'SubagentStop', agent_id: 'sub-1', agent_type: 'Explore' }),
  () => C(pre('Bash', { command: 'npm test' }, { agent_id: 'sub-2', agent_type: 'test-writer' })),
  () => C({ hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash' }),
  () => X({ hook_event_name: 'Stop' }),
  () => G('ToolUse', gTool('view', { path: f('web/styles.css') })),
  () => A('ToolUse', aTool('write_to_file', { TargetFile: f('docs/setup.md') })),
  () => C({ hook_event_name: 'SubagentStop', agent_id: 'sub-2', agent_type: 'test-writer' }),
  () => C(pre('Edit', { file_path: f('src/session.ts') })),
  () => G('agentStop'),
  () => A('Stop'),
  () => C({ hook_event_name: 'Stop' }),
];

let i = 0;
const fast = process.argv.includes('--fast');
const until = Number((process.argv.find(a => a.startsWith('--until=')) || '').split('=')[1]) || steps.length;
const tick = () => { steps[i++](); if (i < until) setTimeout(tick, fast ? 60 : 1800); };
tick();
