X=100.0; HOLD=0.02
T=[(2,.40,.5),(5,.30,.7),(10,.20,.85),(25,.10,1),(50,0,1),(100,0,1)]
for c,b,buf in [(.003,.002,.003),(.0005,.002,.003)]:
  print(f"\nswap {c*100}%")
  for m,e,s in T:
    L=(m-1)*X; fee=HOLD*X+b*L; E=X-fee; V0=(E+L)*(1-c)
    trig=L*(1+buf)+e*E; rl=trig/(V0*(1-c))-1
    if rl>=0: print(m,"umulig"); continue
    rem=trig-L; keep=(1-s)*rem; iss=s*rem
    swap=(E+L)*c + V0*(1+rl)*c
    pricel=V0-V0*(1+rl)
    print(f"{m:>4}x likv {rl*100:6.2f}% | holders {HOLD*X:.1f} | lånegebyr {b*L:5.1f} | swap {swap:5.1f} | kursfall {pricel:5.1f} | issuer-andel {iss:5.1f} | hedger beholder {keep:5.1f} | sum {HOLD*X+b*L+swap+pricel+iss+keep:6.1f}")
