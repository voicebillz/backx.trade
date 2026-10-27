import { useEffect } from 'react';
import { Logo } from '../components/Logo';
import { McpAddress, McpSteps } from '../components/McpSteps';
import { CAN, NEVER } from '../lib/mcpGuide';
import { useTheme } from '../lib/theme';
import { APP_URL } from '../lib/host';

/** www.backx.trade/mcp (owner 2026-10-26): how to connect your own AI assistant. Explains only: the connection
 *  itself starts in the assistant and is approved on app.backx.trade, never on this page. */
export default function McpSite() {
  useEffect(() => { document.title = 'Connect your AI agent · BackX'; }, []);
  const { theme, setTheme } = useTheme();
  return (
    <div className="home home-doc">
      <a className="skip" href="#main">Skip to content</a>
      <header className="h-header">
        <span className="h-logo"><a href="/" aria-label="BackX home"><Logo /></a></span>
        <nav className="h-nav" aria-label="Main"><a href="/">Home</a><a href="/whitepaper">Whitepaper</a><a href="/mcp" aria-current="page">MCP</a></nav>
        <div className="h-header-cta">
          <button className="h-icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>{theme === 'dark' ? '☀' : '☾'}</button>
          <a className="h-btn h-btn-gold" href={APP_URL}>Launch App</a>
        </div>
      </header>
      <main id="main" className="mcpp">
        <p className="h-kicker">MCP · AI agents</p>
        <h1>Connect your AI agent to BackX</h1>
        <p className="mcpp-lead">Ask your own assistant about your positions, rewards and staking, and let it prepare trades and "Claim all". It works on your account only, and you sign every transaction yourself.</p>

        <McpAddress />

        <section aria-labelledby="how">
          <h2 id="how">How to connect</h2>
          <McpSteps />
        </section>

        <section className="mcpp-two" aria-label="What it can and cannot do">
          <div className="mcpp-box">
            <h3>It can</h3>
            <ul>{CAN.map((x) => <li key={x}><span className="ok-text" aria-hidden="true">+</span>{x}</li>)}</ul>
          </div>
          <div className="mcpp-box">
            <h3>It can never</h3>
            <ul>{NEVER.map((x) => <li key={x}><span className="down-text" aria-hidden="true">−</span>{x}</li>)}</ul>
          </div>
        </section>

        <section aria-labelledby="who">
          <h2 id="who">Who can connect</h2>
          <p>Accounts that log in to BackX with email, phone, Google, X, Discord, Twitch, Telegram, Farcaster or a passkey. If you log in with your own wallet (MetaMask, WalletConnect …), your agent already has a wallet: let it use <a href="/skill.md">backx.trade/skill.md</a> and call the contracts directly.</p>
          <p>See and disconnect your assistants any time in the app under <a href={`${APP_URL}/profile/agents`}>Profile → AI agents</a>.</p>
        </section>

        <p className="mcpp-fine">BackX is not live yet: until launch your assistant answers that the contracts are not deployed. Leverage can lose your whole margin. Nothing here is financial advice.</p>
      </main>
      <footer className="h-footer">
        <Logo />
        <nav aria-label="Footer"><a href="/whitepaper">Whitepaper</a><a href="/mcp">MCP</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></nav>
        <span className="h-footer-legal">Not financial advice.</span>
      </footer>
    </div>
  );
}
