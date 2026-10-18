X=100.0; HOLD=0.02; b=0.002; buf=0.003
T=[(2,.40,.5,.15,.20),(3,.35,.6,.20,.12),(5,.30,.7,.25,.08),(7,.25,.8,.28,.06),(10,.20,.85,.30,.04)]
for c in [.003,.0005]:
  print(f"\nswap {c*100}%")
  for m,e,s,p,up in T:
    L=(m-1)*X; fee=HOLD*X+b*L; E=X-fee; V0=(E+L)*(1-c)
    vnet=lambda r: V0*(1+r)*(1-c)
    be=(L+X)/(V0*(1-c))-1
    trig=L*(1+buf)+e*E; rl=trig/(V0*(1-c))-1; rem=trig-L
    keep=(1-s)*rem; iss_l=b*L+s*rem
    pr=vnet(up)-L-E; iss_w=b*L+max(pr,0)*p; hed_w=vnet(up)-L-max(pr,0)*p-X
    def gap(g):
      vg=V0*(1+rl-g)*(1-c); r=vg-L
      return b*L+(r if r<0 else s*r), (0 if r<0 else (1-s)*r)
    g3=gap(.03); g10=gap(.10)
    print(f"{m:>3}x lån {L:4.0f} åpn {X-E+(E+L)*c:4.1f} BE {be*100:+.2f}% likv {rl*100:6.2f}% | vinn(+{up*100:.0f}%): iss {iss_w:5.2f} hed {hed_w:+5.1f} | likv: iss {iss_l:5.2f} ({iss_l/L*100:4.1f}% av lån) hed beholder {keep:5.2f} | gap-3%: iss {g3[0]:+6.2f} hed {g3[1]:5.2f} | gap-10%: iss {g10[0]:+6.2f}")
