import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth, type Me, type PrivyActions } from '../lib/auth';
import { go, href, type Route } from '../lib/router';
import { Avatar } from '../components/Avatar';
import { CoinIcon } from '../components/CoinIcon';
import { Dropdown } from '../components/Dropdown';
import { CHAIN_LOGO, EVM_CHAINS, USDC, type EvmChain } from '../lib/assets';
import { usd } from '../lib/format';
import type { Balances } from '../lib/useBalances';

const METHOD: Record<string, string> = {
  email: 'Email', phone: 'Phone (SMS)', google: 'Google', twitter: 'X', discord: 'Discord', twitch: 'Twitch',
  telegram: 'Telegram', farcaster: 'Farcaster', passkey: 'Passkey', apple: 'Apple',
};

const TABS: { id: Route; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'wallet', label: 'Wallet' },
];

function Copy({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn-mini" onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}>
      {done ? 'Copied' : label}
    </button>
  );
}

export function ProfilePage({ route, balances }: { route: Route; balances: { data: Balances | null; error: boolean; refresh: () => void } }) {
  const { me, actions, signOut, signOutEverywhere } = useAuth();
  if (!me) return null;
  return (
    <main id="main" className="page profile-page">
      <header className="profile-hero">
        <Avatar seed={me.avatarSeed} size={64} />
        <div>
          <h1>Your account {me.isAdmin && <span className="chip chip-admin">Admin</span>}</h1>
          <p className="page-sub num">{me.address.slice(0, 6)}…{me.address.slice(-4)} · member since {new Date(me.memberSince).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </div>
        <button className="btn btn-ghost hero-out" onClick={signOut}>Sign out</button>
      </header>
      <div className="profile-grid">
        <nav className="profile-tabs" aria-label="Account sections">
          {TABS.map((t) => (
            <a key={t.id} href={href(t.id)} onClick={go(t.id)} className={route === t.id ? 'active' : ''} aria-current={route === t.id ? 'page' : undefined}>{t.label}</a>
          ))}
        </nav>
        <div className="profile-body">
          {route === 'profile' && <ProfileTab me={me} />}
          {route === 'security' && <SecurityTab me={me} actions={actions} signOutEverywhere={signOutEverywhere} />}
          {route === 'wallet' && <WalletTab me={me} actions={actions} balances={balances} />}
        </div>
      </div>
    </main>
  );
}

function ProfileTab({ me }: { me: Me }) {
  return (
    <section className="card">
      <h2>Profile</h2>
      <dl className="kv big">
        <div><dt>Picture</dt><dd><Avatar seed={me.avatarSeed} size={40} /><span className="muted small"> Assigned at sign-up</span></dd></div>
        <div><dt>EVM wallet</dt><dd className="num addr-line">{me.address} <Copy text={me.address} /></dd></div>
        <div><dt>Solana wallet</dt><dd className="num addr-line">{me.solanaAddress ? <>{me.solanaAddress} <Copy text={me.solanaAddress} /></> : <span className="muted">Being created. Sign in again if it does not show.</span>}</dd></div>
        <div><dt>Signed up with</dt><dd>{me.signupMethod ? METHOD[me.signupMethod] ?? me.signupMethod : '—'}</dd></div>
        <div><dt>Member since</dt><dd>{new Date(me.memberSince).toLocaleString('en-GB')}</dd></div>
        <div><dt>Access</dt><dd>{me.isAdmin ? 'Admin (beta preview)' : 'Beta list'}</dd></div>
      </dl>
    </section>
  );
}

function SecurityTab({ me, actions, signOutEverywhere }: { me: Me; actions: PrivyActions | null; signOutEverywhere: () => Promise<void> }) {
  const [exporting, setExporting] = useState(false);
  const ready = !!actions;
  return (
    <>
      {!ready && <p className="note">Privy is loading, or your login there expired. Sign in again to change security settings.</p>}
      <section className="card">
        <h2>Passkeys</h2>
        <p className="muted">Sign in with Face ID, Touch ID or a security key instead of a code.</p>
        <div className="row-between">
          <span>{actions ? (actions.passkeys ? `${actions.passkeys} passkey${actions.passkeys > 1 ? 's' : ''} added` : 'No passkey yet') : '—'}</span>
          <button className="btn btn-primary btn-sm" disabled={!ready} onClick={() => actions?.linkPasskey()}>Add passkey</button>
        </div>
      </section>
      <section className="card">
        <h2>Two-factor authentication</h2>
        <p className="muted">Asks for a second check (authenticator app, SMS or passkey) before your wallet signs.</p>
        <div className="row-between">
          <span>{actions ? (actions.mfaMethods.length ? <span className="ok">On · {actions.mfaMethods.join(', ')}</span> : <span className="warn">Off</span>) : '—'}</span>
          <button className="btn btn-primary btn-sm" disabled={!ready} onClick={() => actions?.showMfa()}>{actions?.mfaMethods.length ? 'Manage 2FA' : 'Set up 2FA'}</button>
        </div>
      </section>
      <section className="card">
        <h2>Linked logins</h2>
        <ul className="linked">
          {actions?.linked.map((l, i) => <li key={i}><span className="dot-ok" aria-hidden="true" />{l.label}</li>)}
          {actions && actions.linked.length === 0 && <li className="muted">None</li>}
        </ul>
        <div className="link-buttons">
          {(['email', 'phone', 'google', 'twitter', 'discord', 'twitch', 'telegram', 'farcaster'] as const).map((t) => (
            <button key={t} className="btn-mini" disabled={!ready} onClick={() => actions?.link(t)}>+ {t === 'twitter' ? 'X' : t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>Your keys</h2>
        <p className="muted">Your wallets are self-custodial. Export a private key to use it in another wallet. Anyone with it controls your funds.</p>
        <div className="row-between">
          <span className="num small">{me.address.slice(0, 10)}…</span>
          <button className="btn btn-ghost btn-sm" disabled={!ready || exporting} onClick={async () => { setExporting(true); try { await actions?.exportWallet(me.address); } finally { setExporting(false); } }}>Export EVM key</button>
        </div>
      </section>
      <section className="card">
        <h2>Sessions</h2>
        <div className="row-between">
          <span className="muted">Signs you out on every device and browser.</span>
          <button className="btn btn-danger btn-sm" onClick={signOutEverywhere}>Log out everywhere</button>
        </div>
      </section>
    </>
  );
}

// ---- Wallet ---------------------------------------------------------------

type Net = EvmChain['key'] | 'solana';
const NETS: { value: Net; label: string; icon: JSX.Element }[] = [
  ...EVM_CHAINS.map((c) => ({ value: c.key as Net, label: c.name, icon: <img src={CHAIN_LOGO[c.key]} alt="" width={16} height={16} /> })),
  { value: 'solana', label: 'Solana', icon: <img src={CHAIN_LOGO.solana} alt="" width={16} height={16} /> },
];

function WalletTab({ me, actions, balances }: { me: Me; actions: PrivyActions | null; balances: { data: Balances | null; error: boolean; refresh: () => void } }) {
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const assets = balances.data?.assets ?? [];
  return (
    <>
      <section className="card wallet-total">
        <div>
          <span className="label">Total balance</span>
          <div className="num wallet-usd">{balances.data ? usd(balances.data.totalUsd) : <span className="sk sk-bal" />}</div>
          <p className="muted small">Self-custody. Your money stays in the coin you deposited, so its value moves with that coin.</p>
        </div>
        <div className="seg seg-inline" role="tablist" aria-label="Wallet action">
          <button role="tab" aria-selected={mode === 'deposit'} className={mode === 'deposit' ? 'active' : ''} onClick={() => setMode('deposit')}>Deposit</button>
          <button role="tab" aria-selected={mode === 'withdraw'} className={mode === 'withdraw' ? 'active' : ''} onClick={() => setMode('withdraw')}>Withdraw</button>
        </div>
      </section>
      {mode === 'deposit' ? <Deposit me={me} /> : <Withdraw me={me} actions={actions} balances={balances} />}
      <section className="card">
        <h2>Assets</h2>
        <table>
          <thead><tr><th>Asset</th><th>Network</th><th className="r">Amount</th><th className="r">Value</th></tr></thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.chain + a.symbol} className={Number(a.amount) === 0 ? 'zero' : ''}>
                <td><span className="cell-market"><CoinIcon symbol={a.symbol} size={20} /><b>{a.symbol}</b><small className="muted">{a.name}</small></span></td>
                <td><span className="cell-market"><img src={CHAIN_LOGO[a.chain]} alt="" width={14} height={14} />{a.chainName}</span></td>
                <td className="r num">{a.amount}</td>
                <td className="r num">{a.usd != null ? usd(a.usd) : '—'}</td>
              </tr>
            ))}
            {!balances.data && <tr><td colSpan={4}><span className="sk sk-w60" /></td></tr>}
          </tbody>
        </table>
        {balances.data?.partial && <p className="hint">Some networks did not answer. Showing what we could read.</p>}
      </section>
    </>
  );
}

function Deposit({ me }: { me: Me }) {
  const [net, setNet] = useState<Net>('ethereum');
  const address = net === 'solana' ? me.solanaAddress : me.address;
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (!address) { setQr(null); return; }
    QRCode.toDataURL(address, { margin: 1, width: 360, color: { dark: '#0A0A0A', light: '#FFFFFF' } }).then(setQr).catch(() => setQr(null));
  }, [address]);
  const name = NETS.find((n) => n.value === net)!.label;
  return (
    <section className="card deposit">
      <h2>Deposit</h2>
      <div className="field"><span className="label">Network</span><Dropdown label="Network" value={net} options={NETS} onChange={setNet} /></div>
      {address ? (
        <div className="deposit-body">
          {qr ? <img className="qr" src={qr} alt={`QR code for your ${name} address`} width={180} height={180} /> : <span className="qr sk" />}
          <div>
            <span className="label">Your {name} address</span>
            <p className="num deposit-addr">{address}</p>
            <Copy text={address} label="Copy address" />
            <p className="warn small">Only send {net === 'solana' ? 'SOL or Solana USDC' : net === 'bsc' ? 'BNB or BNB Chain tokens' : 'ETH or tokens'} on {name}. Other networks can lose the funds.</p>
            <p className="muted small">This is your own wallet. No bank or bridge in between: it arrives straight to you.</p>
          </div>
        </div>
      ) : <p className="muted">Your Solana wallet is being created. Sign in again in a moment.</p>}
    </section>
  );
}

/** Decimal string → base units, rounded DOWN (extra decimals are cut, never rounded up). */
function toUnits(v: string, decimals: number): bigint | null {
  if (!/^\d*\.?\d*$/.test(v) || v === '' || v === '.') return null;
  const [i, f = ''] = v.split('.');
  return BigInt(i || '0') * 10n ** BigInt(decimals) + BigInt((f + '0'.repeat(decimals)).slice(0, decimals) || '0');
}
function fromUnits(u: bigint, decimals: number): string {
  const s = u.toString().padStart(decimals + 1, '0');
  const frac = s.slice(-decimals).replace(/0+$/, '');
  return s.slice(0, -decimals) + (frac ? '.' + frac : '');
}

function Withdraw({ me, actions, balances }: { me: Me; actions: PrivyActions | null; balances: { data: Balances | null; refresh: () => void } }) {
  const options = useMemo(() => EVM_CHAINS.flatMap((c) => [
    { value: `${c.key}:native`, label: `${c.native} · ${c.name}`, icon: <CoinIcon symbol={c.native} size={16} /> },
    { value: `${c.key}:usdc`, label: `USDC · ${c.name}`, icon: <CoinIcon symbol="USDC" size={16} /> },
  ]), []);
  const [pick, setPick] = useState(options[0].value);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'sent' | 'error'; msg?: string }>({ kind: 'idle' });

  const [chainKey, kind] = pick.split(':') as [EvmChain['key'], 'native' | 'usdc'];
  const chain = EVM_CHAINS.find((c) => c.key === chainKey)!;
  const decimals = kind === 'usdc' ? USDC[chainKey].decimals : 18;
  const symbol = kind === 'usdc' ? 'USDC' : chain.native;
  const bal = balances.data?.assets.find((a) => a.chain === chainKey && a.symbol === symbol);
  const balUnits = bal ? toUnits(bal.amount, decimals) ?? 0n : 0n;
  const reserve = kind === 'native' ? toUnits(chain.feeReserve, 18)! : 0n;
  const maxUnits = balUnits > reserve ? balUnits - reserve : 0n;
  const units = toUnits(amount, decimals);
  const validTo = /^0x[0-9a-fA-F]{40}$/.test(to);
  const tooMuch = units != null && units > balUnits;
  const canSend = !!actions && validTo && units != null && units > 0n && !tooMuch && state.kind !== 'sending';

  const send = async () => {
    if (!actions || !canSend || units == null) return;
    setState({ kind: 'sending' });
    try {
      const tx = kind === 'native'
        ? { chainId: chain.id, to: to as `0x${string}`, value: units, description: `Send ${amount} ${symbol} on ${chain.name}` }
        : {
            chainId: chain.id, to: USDC[chainKey].address,
            // transfer(address,uint256)
            data: ('0xa9059cbb' + to.slice(2).toLowerCase().padStart(64, '0') + units.toString(16).padStart(64, '0')) as `0x${string}`,
            description: `Send ${amount} USDC on ${chain.name}`,
          };
      const hash = await actions.sendEvm(tx);
      setState({ kind: 'sent', msg: hash });
      setAmount('');
      setTimeout(balances.refresh, 4000);
    } catch (e) {
      setState({ kind: 'error', msg: e instanceof Error ? e.message.slice(0, 140) : 'Not sent' });
    }
  };

  const explorer = { ethereum: 'https://etherscan.io/tx/', base: 'https://basescan.org/tx/', bsc: 'https://bscscan.com/tx/' }[chainKey];

  return (
    <section className="card withdraw">
      <h2>Withdraw</h2>
      <div className="field"><span className="label">Asset</span><Dropdown label="Asset" value={pick} options={options} onChange={(v) => { setPick(v); setAmount(''); setState({ kind: 'idle' }); }} /></div>
      <div className="field">
        <label className="label" htmlFor="wd-to">Recipient address</label>
        <div className="input-wrap"><input id="wd-to" className="num" placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value.trim())} autoComplete="off" spellCheck={false} /></div>
        {to && !validTo && <span className="field-err">Not a valid address.</span>}
        {validTo && to.toLowerCase() === me.address && <span className="field-warn">This is your own address.</span>}
      </div>
      <div className="field">
        <div className="field-head">
          <label className="label" htmlFor="wd-amt">Amount</label>
          <span className="label">Available <span className="num">{fromUnits(balUnits, decimals)} {symbol}</span></span>
        </div>
        <div className="input-wrap">
          <input id="wd-amt" className="num" inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
          <span className="prefix">{symbol}</span>
          <button className="max-btn" onClick={() => setAmount(fromUnits(maxUnits, decimals))} disabled={maxUnits === 0n}>Max</button>
        </div>
        {tooMuch && <span className="field-err">More than you have.</span>}
        {kind === 'native' && <span className="hint">Max keeps {chain.feeReserve} {chain.native} back for the network fee.</span>}
        {kind === 'usdc' && <span className="hint">You need a little {chain.native} on {chain.name} to pay the network fee.</span>}
      </div>
      <button className="btn btn-primary btn-block" disabled={!canSend} onClick={send}>
        {state.kind === 'sending' ? 'Confirm in the wallet window…' : `Withdraw ${symbol}`}
      </button>
      {state.kind === 'sent' && <p className="ok small">Sent. <a href={explorer + state.msg} target="_blank" rel="noopener">View transaction</a></p>}
      {state.kind === 'error' && <p className="field-err">Not sent: {state.msg}</p>}
      {!actions && <p className="hint">Sign in again to sign withdrawals with your wallet.</p>}
      <p className="hint">Solana withdrawals come next. Until then you can export your keys under Security.</p>
    </section>
  );
}
