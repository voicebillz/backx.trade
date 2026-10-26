// How to connect an AI assistant to BackX over MCP (owner 2026-10-26). One source for the public page
// (www.backx.trade/mcp) and Profile → AI agents. Menu names in the assistants change now and then: keep it short.

export const MCP_URL = 'https://mcp.backx.trade/mcp';

export interface ClientGuide { id: string; name: string; steps: string[]; code?: string }

export const CLIENTS: ClientGuide[] = [
  {
    id: 'claude', name: 'Claude',
    steps: [
      'Open Claude (claude.ai or the desktop app) → Settings → Connectors.',
      'Choose "Add custom connector". Name it BackX and paste the server address.',
      'Click Connect. A BackX window opens: log in and approve what the assistant may do.',
      'Back in Claude, ask: "What is my BackX status?" It works on your account only; you sign every transaction yourself.',
    ],
  },
  {
    id: 'chatgpt', name: 'ChatGPT',
    steps: [
      'Open ChatGPT → Settings → Apps & Connectors (turn on developer mode under Advanced if asked).',
      'Create a new connector, name it BackX, paste the server address and choose OAuth.',
      'Connect, log in on the BackX window and approve.',
      'Start a chat with the BackX connector turned on.',
    ],
  },
  {
    id: 'claude-code', name: 'Claude Code',
    steps: ['Run this in your terminal, then type /mcp and pick backx to log in.'],
    code: `claude mcp add --transport http backx ${MCP_URL}`,
  },
  {
    id: 'cursor', name: 'Cursor / VS Code',
    steps: ['Add BackX to your MCP settings (Cursor: Settings → MCP → Add new server; VS Code: mcp.json), then press Connect / Start and log in.'],
    code: JSON.stringify({ mcpServers: { backx: { url: MCP_URL } } }, null, 2),
  },
  {
    id: 'other', name: 'Other agents',
    steps: [
      'Any MCP client that supports remote servers (Streamable HTTP) with OAuth works.',
      'Point it at the server address. It discovers the login by itself and opens the BackX approval page.',
    ],
  },
];

export const CAN = [
  'See your balances, positions, rewards and staking',
  'Prepare trades, issuing, withdrawals, staking and "Claim all"',
  'Send you a link where you check and sign each step yourself',
];
export const NEVER = [
  'Move money on its own: you sign every transaction in your wallet',
  'See anyone else\'s account',
  'Touch your private key or send funds to another address',
];

export const SCOPE_TEXT: Record<string, string> = {
  'account:read': 'Read account', 'trade:prepare': 'Prepare trades', 'issue:prepare': 'Prepare issuing',
  'stake:prepare': 'Prepare staking', 'claim:prepare': 'Prepare Claim all',
};
