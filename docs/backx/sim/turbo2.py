import numpy as np
ASSETS=["BTCUSDT","DOGEUSDT","PEPEUSDT","WIFUSDT"]
HORIZONS=[5,60,240,1440]; X=100.0; POT=0.02; N=3000
def run(m,K,P_SHARE,tie):
    rng=np.random.default_rng(11); out={}
    for A in ASSETS:
        d=np.load(f"{A}.npy"); h,l,c=d[:,1],d[:,2],d[:,3]; T=len(c)
        up=K/m; dn=1.0/m; iss=[]
        for hz in HORIZONS:
            for i0 in rng.integers(0,T-hz-2,N):
                P0=c[i0]; hi=h[i0+1:i0+1+hz]/P0-1; lo=l[i0+1:i0+1+hz]/P0-1
                kt=np.nonzero(hi>=up)[0]; kl=np.nonzero(lo<=-dn)[0]
                t1=kt[0] if kt.size else 10**9; t2=kl[0] if kl.size else 10**9
                if t1<t2: G=K*X
                elif t2<t1: G=-X
                elif t1==t2 and t1<10**9: G=K*X if (tie=="win" or (tie=="coin" and rng.random()<0.5)) else -X
                else: G=float(np.clip(m*(c[i0+hz]/P0-1),-1,K))*X
                iss.append(((-G*(1-P_SHARE)) if G>0 else -G)/(K*X)+POT/K)
        out[A]=np.mean(iss)*100
    return out
print("issuer return per position, on the reserve (cap x stake) — liquid assets")
print("mult   cap   profit-share  same-minute  BTC      DOGE     PEPE     WIF")
for m,K,p in [(1000,10,.30),(3000,10,.30),(3000,5,.30),(3000,5,.40),(3000,3,.30),(3000,3,.40)]:
    for tie in ("win","coin"):
        o=run(m,K,p,tie)
        print(f"{m:>5}x  {K:>3}x     {int(p*100)}%        {'hedger' if tie=='win' else '50/50 '}    "+"  ".join(f"{o[a]:+6.2f}%" for a in ASSETS))
