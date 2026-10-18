import numpy as np
rng=np.random.default_rng(7)
ASSETS=["BTCUSDT","DOGEUSDT","PEPEUSDT","WIFUSDT","GAZZ"]
MULTS=[100,500,1000,3000]
HORIZONS=[5,60,240,1440]
X=100.0; K=10.0                 # max hedger win = 10x stake (the issuer pool reserves exactly this)
P_SHARE=0.30; POT=0.02; N=3000
print(f"TURBO (synthetic, oracle-priced): hedger loses at most his stake, wins at most {K:.0f}x stake; issuers reserve {K:.0f}x stake per position")
print("asset      mult   liquidated  hit max-win  issuer per position (on reserve)   issuer worst position   hedger EV")
for A in ASSETS:
    d=np.load(f"{A}.npy"); h,l,c=d[:,1],d[:,2],d[:,3]; T=len(c)
    for m in MULTS:
        up=K/m; dn=1.0/m
        iss=[]; hed=[]; liq=0; tp=0
        for hz in HORIZONS:
            for i0 in rng.integers(0,T-hz-2,N):
                P0=c[i0]; hi=h[i0+1:i0+1+hz]/P0-1; lo=l[i0+1:i0+1+hz]/P0-1
                kt=np.nonzero(hi>=up)[0]; kl=np.nonzero(lo<=-dn)[0]
                t_tp=kt[0] if kt.size else 10**9; t_l=kl[0] if kl.size else 10**9
                if t_tp<=t_l and kt.size: G=K*X; tp+=1           # same minute → counted as a WIN (worst case for issuers)
                elif kl.size: G=-X; liq+=1
                else: G=float(np.clip(m*(c[i0+hz]/P0-1),-1,K))*X
                ip = -G*(1-P_SHARE) if G>0 else -G
                iss.append((ip+POT*X)/(K*X)); hed.append((G*(1-P_SHARE) if G>0 else G)-0.04*X)
        n=len(iss); iss=np.array(iss)
        print(f"{A:9} {m:>5}x   {liq/n*100:6.1f}%     {tp/n*100:6.1f}%        {iss.mean()*100:+7.2f}%                    {iss.min()*100:+7.1f}%           {np.mean(hed)/X*100:+6.1f}%")
