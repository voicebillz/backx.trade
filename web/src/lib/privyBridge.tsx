import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PrivyProvider, addRpcUrlOverrideToChain, useExportWallet, useLinkAccount, useMfaEnrollment, usePrivy, useSendTransaction,
} from '@privy-io/react-auth';
import { arbitrum, base, bsc, mainnet } from 'viem/chains';
import { api, ApiError } from './api';
import type { LinkedLogin, Me, PrivyActions, PrivyState } from './auth';

const LABEL: Record<string, string> = {
  email: 'Email', phone: 'Phone', google_oauth: 'Google', twitter_oauth: 'X', discord_oauth: 'Discord',
  twitch_oauth: 'Twitch', telegram: 'Telegram', farcaster: 'Farcaster', passkey: 'Passkey', apple_oauth: 'Apple',
};

interface Props {
  appId: string;
  checked: boolean;          // backx session check finished
  me: Me | null;
  onSession: (m: Me) => void;
  onState: (s: PrivyState) => void;
}

// Loaded lazily (Privy is ~2 MB), so the page paints without it. PrivyProvider
// only wraps this bridge: its modal renders in a portal of its own.
export default function PrivyBridge(props: Props) {
  return (
    <PrivyProvider
      appId={props.appId}
      config={{
        // External wallets (owner 2026-10-25): agents and traders can log in with their own wallet (MetaMask,
        // Coinbase, Rainbow, any WalletConnect wallet). The external wallet is only the login: every account still
        // gets its own embedded wallet (createOnLogin 'all-users'), which the backx session, deposits and admin
        // checks use. Each method must also be switched on in the Privy dashboard. Apple returns once our own
        // Apple OAuth credentials are set up there.
        loginMethods: ['email', 'sms', 'google', 'twitter', 'discord', 'twitch', 'telegram', 'farcaster', 'passkey', 'wallet'],
        externalWallets: { walletConnect: { enabled: true } },
        embeddedWallets: {
          ethereum: { createOnLogin: 'all-users' },
          solana: { createOnLogin: 'all-users' },
        },
        // Chains the wallet can send on. MEV protection: Ethereum and BNB Chain transactions go to private
        // RPCs (MEV Blocker, PancakeSwap MEV Guard), never the public mempool where bots sandwich swaps.
        // Base has no public mempool (the sequencer orders transactions first come, first served).
        supportedChains: [
          addRpcUrlOverrideToChain(mainnet, 'https://rpc.mevblocker.io'),
          base,
          addRpcUrlOverrideToChain(bsc, 'https://bscrpc.pancakeswap.finance'),
          arbitrum, // launch chain; sequencer ordering, no public mempool
        ],
        defaultChain: mainnet,
        appearance: { theme: '#0A0A0A', accentColor: '#FFD100', logo: '/backx-logo.png', walletChainType: 'ethereum-only',
          walletList: ['detected_ethereum_wallets', 'metamask', 'robinhood_wallet', 'rainbow', 'wallet_connect'] },
      }}
    >
      <Session {...props} />
    </PrivyProvider>
  );
}

function Session({ checked, me, onSession, onState }: Props) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const linkers = useLinkAccount();
  const { showMfaEnrollmentModal } = useMfaEnrollment();
  const { exportWallet } = useExportWallet();
  const { sendTransaction } = useSendTransaction();
  const refreshed = useRef(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(false);
  const attempted = useRef<string | null>(null);

  // Privy confirmed + embedded wallet exists → exchange the Privy token for a backx session.
  // Once per Privy user per page load: never loops on 401/409 (that got gazz.fun rate limited).
  useEffect(() => {
    if (!ready || !authenticated || !user || !checked || me) return;
    // The embedded wallet, also when the user logged in with an external one (user.wallet is then the external).
    const embedded = user.linkedAccounts.find((a) => a.type === 'wallet' && 'walletClientType' in a && a.walletClientType === 'privy' && (!('chainType' in a) || a.chainType === 'ethereum'));
    const wallet = embedded && 'address' in embedded ? embedded.address : null;
    if (!wallet) { setConnecting(true); return; } // Privy is still creating it
    if (attempted.current === user.id) return;
    attempted.current = user.id;
    setConnecting(true);
    setError(false);
    (async () => {
      for (let i = 0; i < 2; i++) {
        try {
          const token = await getAccessToken();
          if (!token) throw new ApiError(401, 'no_token');
          onSession(await api<Me>('/api/auth/session', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }));
          setConnecting(false);
          return;
        } catch (e) {
          // Privy can need a moment before the new wallet shows on its API: one retry, then stop.
          if (e instanceof ApiError && e.status === 409 && i === 0) { await new Promise((r) => setTimeout(r, 2500)); continue; }
          // This Privy session was signed out (here or "Log out everywhere" on another device): end it quietly.
          if (e instanceof ApiError && e.code === 'session_revoked') { setConnecting(false); await logout().catch(() => {}); return; }
          setConnecting(false);
          setError(true);
          return;
        }
      }
    })();
  }, [ready, authenticated, user, checked, me, getAccessToken, onSession, logout]);

  // A Solana wallet created after the backx session started: re-run the exchange once so the
  // server learns its address (it only trusts Privy's API, never the client).
  useEffect(() => {
    if (!ready || !authenticated || !user || !me || me.solanaAddress || refreshed.current) return;
    const hasSol = user.linkedAccounts.some((a) => a.type === 'wallet' && 'chainType' in a && a.chainType === 'solana' && 'walletClientType' in a && a.walletClientType === 'privy');
    if (!hasSol) return;
    refreshed.current = true;
    (async () => {
      try {
        const token = await getAccessToken();
        if (token) onSession(await api<Me>('/api/auth/session', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }));
      } catch { /* keep the current session */ }
    })();
  }, [ready, authenticated, user, me, getAccessToken, onSession]);

  const signIn = useCallback(() => {
    if (!ready) return;
    if (authenticated) { attempted.current = null; setError(false); setConnecting(false); return; } // retry the exchange
    login();
  }, [ready, authenticated, login]);

  const signOut = useCallback(async () => {
    attempted.current = null;
    setError(false);
    setConnecting(false);
    if (authenticated) await logout();
  }, [authenticated, logout]);

  const linked: LinkedLogin[] = (user?.linkedAccounts ?? [])
    // Logins, plus external wallets used to log in (the embedded wallet is not a login).
    .filter((a) => a.type !== 'smart_wallet' && !(a.type === 'wallet' && 'walletClientType' in a && a.walletClientType === 'privy'))
    .map((a) => {
      const detail = 'address' in a && typeof a.address === 'string' ? a.address
        : 'number' in a && typeof a.number === 'string' ? a.number
        : 'username' in a && typeof a.username === 'string' ? '@' + a.username
        : 'email' in a && typeof a.email === 'string' ? a.email : '';
      return { type: a.type, label: (LABEL[a.type] ?? a.type) + (detail ? ` · ${detail}` : '') };
    });
  const linkedKey = linked.map((l) => l.label).join('|');
  const mfaKey = (user?.mfaMethods ?? []).join('|');

  const actions: PrivyActions | null = authenticated ? {
    linked,
    passkeys: linked.filter((l) => l.type === 'passkey').length,
    mfaMethods: user?.mfaMethods ?? [],
    linkPasskey: linkers.linkPasskey,
    link: (t) => ({
      email: linkers.linkEmail, phone: linkers.linkPhone, google: linkers.linkGoogle, twitter: linkers.linkTwitter,
      discord: linkers.linkDiscord, twitch: linkers.linkTwitch, telegram: linkers.linkTelegram, farcaster: linkers.linkFarcaster,
    })[t](),
    showMfa: showMfaEnrollmentModal,
    exportWallet: (address) => exportWallet({ address }),
    sendEvm: async (tx) => (await sendTransaction(
      { chainId: tx.chainId, to: tx.to, value: tx.value ?? 0n, data: tx.data },
      { uiOptions: { description: tx.description, buttonText: 'Send' } },
    )).hash,
  } : null;

  useEffect(() => {
    onState({ ready, connecting, error, login: signIn, logout: signOut, actions });
    // actions is rebuilt every render; publish when what it shows changes.
  }, [ready, connecting, error, signIn, signOut, onState, authenticated, linkedKey, mfaKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
