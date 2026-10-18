import numpy as np, json, sys
rng=np.random.default_rng(42)
ASSETS=["BTCUSDT","DOGEUSDT","PEPEUSDT","WIFUSDT","GAZZ"]
MULTS=[2,3,5,10,20,50,100,500,1000,3000]
HORIZONS=[5,60,240,1440]           # how long a hedger keeps the position (minutes)
X=100.0                            # hedger stake
def e_of(m):   # hedger equity left at liquidation (fraction of stake)
    return {2:.40,3:.34,5:.30,10:.20,20:.10}.get(m,0.0)
def s_of(m):   # share of the remainder to the issuer
    return {2:.5,3:.6,5:.7,10:.85}.get(m,1.0)
def p_of(m):   # issuer share of the hedger's profit
    return {2:.15,3:.2,5:.25}.get(m,.30)
FEE_HOLD=0.02; FEE_POT=0.02        # of the hedger stake, at open
N=int(sys.argv[1]) if len(sys.argv)>1 else 4000
res={}
for A in ASSETS:
    d=np.load(f"{A}.npy"); o,h,l,c=d[:,0],d[:,1],d[:,2],d[:,3]; T=len(c)
    for m in MULTS:
        e=e_of(m); dL=(1-e)/m             # price drop that triggers liquidation
        I=(m-1)*X
        agg={k:0.0 for k in ["iss_pnl_fast","iss_pnl_slow","cap_min","hed_pnl_fast","hed_pnl_slow","liq","gaploss_slow","n","pot"]}
        rets_fast=[]; rets_slow=[]
        for hz in HORIZONS:
            starts=rng.integers(0,T-hz-2,N)
            for i0 in starts:
                P0=c[i0]; liqP=P0*(1-dL)
                lows=l[i0+1:i0+1+hz]
                hit=np.nonzero(lows<=liqP)[0]
                if hit.size:
                    k=hit[0]; dur=k+1
                    for mode,fill in (("fast",liqP),("slow",min(liqP,c[i0+1+k]))):   # fast keeper fills at the trigger; slow fills at that minute's close
                        V=m*X*fill/P0; R=V-I
                        if R>=0: iss=s_of(m)*R; hed=(1-s_of(m))*R-X
                        else:    iss=R; hed=-X
                        agg[f"iss_pnl_{mode}"]+=iss; agg[f"hed_pnl_{mode}"]+=hed
                        (rets_fast if mode=="fast" else rets_slow).append(iss/I)
                        if mode=="slow" and R<0: agg["gaploss_slow"]+=1
                    agg["liq"]+=1
                else:
                    dur=hz; r=c[i0+hz]/P0-1; E=X+m*X*r
                    if r>=0: prof=m*X*r; iss=p_of(m)*prof; hed=(1-p_of(m))*prof
                    else: iss=0.0; hed=E-X
                    for mode in ("fast","slow"):
                        agg[f"iss_pnl_{mode}"]+=iss; agg[f"hed_pnl_{mode}"]+=hed
                    rets_fast.append(iss/I); rets_slow.append(iss/I)
                agg["hed_pnl_fast"]-=X*(FEE_HOLD+FEE_POT); agg["hed_pnl_slow"]-=X*(FEE_HOLD+FEE_POT)
                agg["pot"]+=X*FEE_POT
                agg["cap_min"]+=I*dur; agg["n"]+=1
        n=agg["n"]
        out={"liq_rate":agg["liq"]/n,"gap_loss_rate":agg["gaploss_slow"]/n,
             "iss_per_pos_fast":(agg["iss_pnl_fast"])/n/I*100,"iss_per_pos_slow":agg["iss_pnl_slow"]/n/I*100,
             "iss_per_pos_slow_pot":(agg["iss_pnl_slow"]+agg["pot"])/n/I*100,
             "pot_per_pos":agg["pot"]/n/I*100,
             "hed_ev_fast":agg["hed_pnl_fast"]/n/X*100,"hed_ev_slow":agg["hed_pnl_slow"]/n/X*100,
             "iss_apy_slow_pot":(agg["iss_pnl_slow"]+agg["pot"])/agg["cap_min"]*525600*100,
             "iss_apy_fast_pot":(agg["iss_pnl_fast"]+agg["pot"])/agg["cap_min"]*525600*100,
             "worst_iss_slow":min(rets_slow)*100,"liqdrop":dL*100}
        res[f"{A}|{m}"]=out
        print(f"{A:9} {m:>5}x liq@-{dL*100:6.3f}%  liqRate {out['liq_rate']*100:5.1f}%  gapLoss {out['gap_loss_rate']*100:5.1f}%  "
              f"issuer/pos fast {out['iss_per_pos_fast']:+7.3f}% slow {out['iss_per_pos_slow']:+7.3f}% +pot {out['iss_per_pos_slow_pot']:+7.3f}%  "
              f"hedger EV {out['hed_ev_slow']:+6.1f}%  worst issuer {out['worst_iss_slow']:+7.2f}%", flush=True)
json.dump(res,open("res.json","w"))
