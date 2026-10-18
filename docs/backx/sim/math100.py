X=100.0; HOLD=0.02
T=[(2,.40,.5,.15,.20),(5,.30,.7,.25,.08),(10,.20,.85,.30,.04),(25,.10,1,.30,.02),(50,0,1,.30,.02),(100,0,1,.30,.02)]
def run(c,b,buf,gap):
  print(f"\nswap {c*100:.2f}%/vei, borrow-fee {b*100:.2f}% av lånt, buffer {buf*100:.1f}% av lånt, gap {gap*100:.1f}%")
  for m,e,s,p,up in T:
    L=(m-1)*X; fee=HOLD*X+b*L; E=X-fee; V0=(E+L)*(1-c)
    vnet=lambda r: V0*(1+r)*(1-c)
    be=(L+X)/(V0*(1-c))-1               # pris-move for at hedger får X tilbake (før profit share)
    trig=L*(1+buf)+e*E                  # likvider når netto exit <= trig
    rl=trig/(V0*(1-c))-1
    if rl>=0: print(f"{m:>4}x  IKKE MULIG: født likvidert (start {V0*(1-c)-L:+.1f} over lånet)"); continue
    # win
    pr=vnet(up)-L-E; iss_w=b*L+max(pr,0)*p; hed_w=vnet(up)-L-max(pr,0)*p-X
    # liq at trigger
    rem=trig-L; iss_l=b*L+s*rem- (0); hed_l=(1-s)*rem-X
    # gap: sale happens gap below trigger
    vg=V0*(1+rl-gap)*(1-c); iss_g=b*L+min(vg-L,0)+ s*max(vg-L,0)
    print(f"{m:>4}x lån ${L:>5.0f} | hedger åpning ${X-E+ (E+L)*c:5.1f} | break-even {be*100:+5.2f}% | likv ved {rl*100:+6.2f}% | "
          f"issuer: vinn(+{up*100:.0f}%) ${iss_w:6.2f} ({iss_w/L*100:5.2f}%)  likv ${iss_l:6.2f} ({iss_l/L*100:5.2f}%)  gap ${iss_g:7.2f} ({iss_g/L*100:5.2f}%) | hedger vinn {hed_w:+6.1f} likv {hed_l:+6.1f}")
run(.003,.001,0,.01)
run(.003,.002,.003,.01)
run(.0005,.002,.003,.005)
