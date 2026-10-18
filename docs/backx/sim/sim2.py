# Hedge v2 sim: real 1-minute price paths, real holdings both sides.
# Every position: hedger stake X, issuer lends L=(m-1)X, coins bought on a pool
# (swap fee c + price impact = notional/TVL each way). Liquidation is checked
# on NET exit value (after fees+impact): trigger = L*(1+buf) + e*E.
# Both price directions (path and its mirror 1/P) so a trending month can't bias.
import numpy as np, json, sys
X=100.0; HOLD=0.02; BORROW=0.002; SAFE=0.005; BUF=0.003
HZ=[5,60,240,1440,4320]
N=int(sys.argv[1]) if len(sys.argv)>1 else 1500
MULTS=[2,3,5,7,10,15,20,25,30,40,50]
E_=dict(zip(MULTS,[.40,.35,.30,.25,.20,.15,.12,.10,.08,.06,.05]))
S_=dict(zip(MULTS,[.50,.60,.70,.80,.85,.90,.90,.90,.90,.90,.90]))
P_=dict(zip(MULTS,[.15,.20,.25,.30,.30,.30,.30,.30,.30,.30,.30]))
COINS={ # name: (data, swap fee, pool TVL $)
 "BTC-type (deep 0.05%, $10M)":("BTCUSDT",.0005,10e6),
 "DOGE (meme 0.3%, $1M)":("DOGEUSDT",.003,1e6),
 "PEPE (meme 0.3%, $1M)":("PEPEUSDT",.003,1e6),
 "WIF (meme 0.3%, $1M)":("WIFUSDT",.003,1e6),
 "GAZZ (real pool 0.3%, $56k)":("GAZZ",.003,56e3),
}
res={}
for name,(f,c,tvl) in COINS.items():
  d0=np.load(f"./{f}.npy")
  mir=np.stack([1/d0[:,0],1/d0[:,2],1/d0[:,1],1/d0[:,3]],1)   # mirrored path: up<->down
  for m in MULTS:
    L=(m-1)*X; e,s,p=E_[m],S_[m],P_[m]
    fee0=HOLD*X+BORROW*L+SAFE*X; E=X-fee0; N0=E+L
    imp=N0/tvl; cost=c+imp
    Q=N0*(1-cost)                       # coin value bought, in units of P0
    trig=L*(1+BUF)+e*E
    pL=trig/(Q*(1-cost))                # liquidation price ratio
    A={k:0.0 for k in "n liq gap win iss hed hedliq isslq issw hedw issgap swp liqdays capdays".split()}
    if pL>=1:
      res[(name,m)]=None; print(f"{name:30} {m:>3}x  NOT POSSIBLE (born liquidated, costs {cost*100:.2f}%/way)"); continue
    rng=np.random.default_rng(7)
    for d in (d0,mir):
      o,h,l,cl=d[:,0],d[:,1],d[:,2],d[:,3]; T=len(cl)
      for hz in HZ:
        for i0 in rng.integers(0,T-hz-2,N):
          P0=cl[i0]; lows=l[i0+1:i0+1+hz]/P0
          k=np.nonzero(lows<=pL)[0]
          A["n"]+=1; iss=BORROW*L; hed=-fee0
          A["swp"]+=N0*cost
          if k.size:
            k=k[0]; A["liq"]+=1; A["capdays"]+=L*(k+1)/1440
            fill=min(pL,cl[i0+1+k]/P0)          # slow keeper: sells at that minute's close
            V=Q*fill*(1-cost); A["swp"]+=Q*fill*cost; rem=V-L
            if rem<0: A["gap"]+=1; iss+=rem; A["issgap"]+=rem; hk=0.0
            else: iss+=s*rem; hk=(1-s)*rem
            hed=hk-X; A["hedliq"]+=hk; A["isslq"]+=iss
          else:
            A["capdays"]+=L*hz/1440
            fill=cl[i0+hz]/P0; V=Q*fill*(1-cost); A["swp"]+=Q*fill*cost
            back=V-L; prof=back-X
            if prof>0: A["win"]+=1; iss+=p*prof; A["issw"]+=p*prof; hed=prof*(1-p); A["hedw"]+=prof*(1-p)
            else: hed=prof
          A["iss"]+=iss; A["hed"]+=hed
    n=A["n"]; nl=max(A["liq"],1); nw=max(A["win"],1)
    r=dict(liqP=(pL-1)*100, cost=cost*100, open_fees=fee0, liq_rate=A["liq"]/n*100, gap_rate=A["gap"]/n*100,
      gap_loss_avg=A["issgap"]/max(A["gap"],1), hed_keep_liq=A["hedliq"]/nl, iss_liq=A["isslq"]/nl,
      win_rate=A["win"]/n*100, hed_win=A["hedw"]/nw, iss_win=A["issw"]/nw+BORROW*L,
      iss_pos=A["iss"]/n, iss_pos_pct=A["iss"]/n/L*100, iss_day_pct=A["iss"]/A["capdays"]*100,
      safe_vs_gap=(SAFE*X*n+A["issgap"])/n, hed_ev=A["hed"]/n, holders=HOLD*X, borrow=BORROW*L, safety=SAFE*X, lp=A["swp"]/n)
    res[(name,m)]=r
    print(f"{name:30} {m:>3}x likv {r['liqP']:6.2f}% liqRate {r['liq_rate']:5.1f}% gap {r['gap_rate']:5.2f}% (snitt {r['gap_loss_avg']:7.1f}) | "
          f"hed beholder {r['hed_keep_liq']:5.1f} | vinn {r['win_rate']:5.1f}% hed+{r['hed_win']:6.1f} iss {r['iss_win']:5.1f} | "
          f"iss/pos {r['iss_pos']:+6.2f} ({r['iss_pos_pct']:+.2f}% lån, {r['iss_day_pct']:+.2f}%/dag) fond-netto {r['safe_vs_gap']:+.2f} | hedEV {r['hed_ev']:+6.1f} | "
          f"fees: hold {r['holders']:.1f} lån {r['borrow']:.1f} fond {r['safety']:.1f} LP {r['lp']:.1f}", flush=True)
json.dump({f"{k[0]}|{k[1]}":v for k,v in res.items()},open("./res2.json","w"),indent=1)
