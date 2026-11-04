# Uniswap v4 Hooks Can Do Anything. That's the Problem.

Uniswap v4 gave every pool a programmable brain.

A hook is a small contract that runs before and after every swap. It can take a fee. Route it. Change how a trade settles. Decide who is allowed to open a pool.

That power is the whole point of v4.

It's also why so many launches quietly ship hooks that work against the people trading through them.

Before we wrote ours, we studied what was already live. A handful of mistakes come up again and again.

Here are seven of them. What each one costs you, and how we built around it.

## 1. Taking the fee in the coin

A lot of hooks take their cut in the token being traded.

Sounds harmless. It isn't.

The hook ends up sitting on a pile of the coin. Sooner or later that pile gets sold. Into your chart.

Every buy quietly creates future sell pressure.

**The fix:** take the fee on the pairing side. ETH in, ETH out. The coin never piles up anywhere.

## 2. "Locked" liquidity you can't verify

"LP locked" usually means the position NFT sits in a locker contract. Often the team's own.

You're trusting a contract you didn't read, guarded by a key you can't see.

**The fix:** mint the LP position NFT straight to the dead address at launch. No locker. No removal function. Nobody can pull it. Including us.

## 3. Hooks someone can change later

An upgradeable hook with an owner is a promise that lasts until the owner changes their mind.

Fees can be raised. Sells can be blocked. That's the honeypot pattern, and scanners flag it for a reason.

**The fix:** an immutable hook with a hard fee cap written into the code. A naked, ownerless token with a fixed supply.

## 4. Anyone can open a pool with your hook

In v4, anyone can try to create a pool that points at your hook.

If the hook doesn't check who's asking, strangers can spin up look-alike pools that carry your fee logic and confuse everyone.

**The fix:** the hook only accepts pools created by its own factory. Everything else is refused at creation.

## 5. Taxes that break selling

v4 settles every trade by balance changes inside the PoolManager.

Put a transfer tax on a token, and the tax can hit the PoolManager itself. The numbers stop adding up. The sell reverts.

Buyers get in. Sellers can't get out.

That's a honeypot, even if nobody meant to build one.

**The fix:** if a coin has a tax, the pool manager is exempt from day one. The tax lands on wallet transfers, never on the swap that lets you exit.

## 6. Fees that go nowhere

A burned LP position can't collect fees. If the pool still charges an LP fee, that money is stuck. Forever.

Other hooks send fees to a rewards contract that holders have to claim. Many never do.

**The fix:** set the LP fee to zero. Every fee lives in the hook, and the hook sends it somewhere real. Automatically.

## 7. Testing in a sandbox, shipping to mainnet

A hook has to get four swap types right. Buy or sell. Exact input or exact output.

Get the accounting wrong on just one, and the pool pays out the wrong amount.

Plenty of hooks are only ever tested against mocks.

**The fix:** run every swap type through the real PoolManager, on a fork of the live chain, before a single coin launches.

## How gazz.fun solved it

GazzPad launches coins on Uniswap v4 on Robinhood Chain. Every launch gets this, by default:

- The fee is taken on the pairing side (ETH, or the quote token). Never in the coin.
- The LP position NFT is minted to 0x…dEaD at launch. The launch liquidity is burned.
- No removal path. The factory is immutable.
- Only our factory can open a pool with our hook.
- LP fee is zero. The hook fee is hard-capped at 5% in the code: 2% platform, 0 to 2% creator.
- A naked, ownerless token with a fixed 1B supply.
- Tax coins exempt the pool manager, so selling always works.
- All four swap types tested through the real PoolManager on a mainnet fork.

And the part we care about most: where the fee goes.

Of the 2% platform fee, 20% is airdropped to $GAZZ holders and 20% to GAZZ TANKS holders. In ETH. No claim button.

Another 20% builds a weekly jackpot, paid out to 10 random holders.

The rest goes to the treasury, and half of that buys back and burns.

The fee doesn't sit in a contract waiting for you.

It shows up in your wallet.

## What we're building next

We're not done, and we'd rather say so:

- An external security review of our hooks. Today they're internally reviewed and fork-tested, not audited.
- Fail-safe fee routing, so a broken payout can never pause trading.
- A deadline check on our swap router, on top of the minimum-output protection it has today.
- A plain-English page for every hook we run. What it charges, where the fee goes, and what it can never do.

v4 hooks can do anything.

The real question is what yours is allowed to do to you.

Ours can't touch your liquidity. Can't raise its fee. Can't stop you from selling.

That's the point.
