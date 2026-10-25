import os
D=os.path.dirname(os.path.abspath(__file__))
P='file:///home/user/backx.trade/web/public'
CI='file:///home/user/backx.trade/web/node_modules/cryptocurrency-icons/svg/color'
MARK=lambda w: f'<svg class="mark" viewBox="18 25 75 57.5" fill="#FFD100" width="{w}"><path d="M18.3,60 C22.5,57 26.5,55.6 31,55.6 C38,55.6 43.4,58.4 44.8,62.4 C45.4,64.6 43.8,65.6 41,65.6 C33,65.6 25,63.7 18.3,60 Z"/><path d="M31.5,69.4 L44,68.9 C47,68.7 49.6,67.7 51.6,65.7 L92.5,25.6 C84,39 70,60 60.4,75 C57.2,80 53.4,82 48.6,82 C42.6,82 37.5,77 31.5,69.4 Z"/></svg>'
def AGENT(w, c='#FFD100'):
    return f'''<svg viewBox="0 0 64 64" width="{w}" height="{w}"><rect x="8" y="16" width="48" height="40" rx="12" fill="none" stroke="{c}" stroke-width="4"/><rect x="20" y="30" width="7" height="10" rx="3" fill="{c}"/><rect x="37" y="30" width="7" height="10" rx="3" fill="{c}"/><line x1="32" y1="16" x2="32" y2="7" stroke="{c}" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="6" r="4" fill="{c}"/></svg>'''
BRAND=lambda s: f'<div class="brand" style="font-size:{s}px">{MARK(int(s*1.5))}<span><b>backx</b>.trade</span></div>'
CHAINS=[('robinhood','png','Robinhood'),('bnb','png','BNB Chain'),('base','svg','Base'),('arbitrum','png','Arbitrum')]
def page(name, w, h, body, extra=''):
    html=f'''<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="base.css"><style>body{{width:{w}px;height:{h}px}} .frame{{width:{w}px;height:{h}px}} {extra}</style></head><body><div class="frame">{body}</div></body></html>'''
    open(os.path.join(D,name+'.html'),'w').write(html)

def book(rows=7, scale=1.0):
    asks=[(2412.4,.55),(2410.9,.8),(2409.2,.42),(2407.8,.95),(2406.1,.6)][:rows//2+1]
    bids=[(2403.9,.7),(2402.2,1.0),(2400.6,.5),(2398.9,.85),(2397.1,.45)][:rows//2+1]
    r=''
    for p,v in asks: r+=f'<div class="ob-row ask"><span class="mono">{p:,.1f}</span><i style="width:{v*100}%"></i></div>'
    r+=f'<div class="ob-mid mono">▲ 2,405.00 <small>on-chain</small></div>'
    for p,v in bids: r+=f'<div class="ob-row bid"><span class="mono">{p:,.1f}</span><i style="width:{v*100}%"></i></div>'
    return f'<div class="ob card">{r}</div>'
OBCSS='''.ob{padding:22px 24px;display:grid;gap:9px}.ob-row{position:relative;height:30px;padding-left:120px}
.ob-row i{position:absolute;right:0;top:3px;bottom:3px;border-radius:5px;max-width:calc(100% - 120px)}.ob-row span{position:absolute;left:0;top:50%;transform:translateY(-50%);font-size:19px;color:#A8A8A8}
.ask i{background:rgba(242,85,95,.28)}.bid i{background:rgba(34,195,142,.28)}.ask span{color:#F2555F}.bid span{color:#22C38E}
.ob-mid{font-size:26px;font-weight:600;color:#22C38E;padding:6px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.ob-mid small{font-size:14px;color:#6E6E6E;margin-left:10px;letter-spacing:.1em;text-transform:uppercase}'''

# ---- cover 5:2 (1500x600) ----
page('cover',1500,600,f'''<div class="grid-bg"></div>
<div style="position:absolute;left:84px;top:80px;width:760px">{BRAND(34)}
<h1 style="font-size:92px;line-height:1;letter-spacing:-.035em;margin-top:58px">What is BackX?</h1>
<p style="font-size:40px;font-weight:600;letter-spacing:-.02em;margin-top:26px">Future Trading for <span class="y">Agents</span> &amp; <span class="y">Capital</span></p>
<div style="display:flex;gap:12px;margin-top:40px">{''.join(f'<span class="card mono" style="padding:10px 16px;font-size:18px;color:#A8A8A8">{t}</span>' for t in ['ISSUE','STAKE','TRADE','ON-CHAIN'])}</div></div>
<div style="position:absolute;right:84px;top:70px;width:470px">{book(7)}
<div style="display:flex;align-items:center;gap:14px;margin-top:18px;color:#A8A8A8;font-size:20px">{AGENT(44)}<span>Agents trade against an <b style="color:#F2F2F2">on-chain orderbook AMM</b></span></div></div>''',OBCSS)

# ---- X header 3:1 (1500x500): keep the bottom-left free for the profile picture ----
page('banner',1500,500,f'''<div class="grid-bg"></div>
<div style="position:absolute;left:470px;top:84px;width:960px">{BRAND(30)}
<h1 style="font-size:78px;line-height:1.02;letter-spacing:-.035em;margin-top:34px">Future Trading for<br><span class="y">Agents</span> &amp; <span class="y">Capital</span></h1>
<div style="display:flex;align-items:center;gap:22px;margin-top:38px">{''.join(f'<img src="{P}/chains/{k}.{e}" style="width:46px;height:46px;border-radius:50%">' for k,e,_ in CHAINS)}<span class="mono" style="color:#A8A8A8;font-size:20px;letter-spacing:.14em">ON-CHAIN · CAPPED AT 20×</span></div></div>''')

# ---- 1: capital for AI agents (1600x900) ----
def agentcard(label, sub, coin):
    return f'<div class="card" style="display:flex;align-items:center;gap:18px;padding:20px 24px;width:360px">{AGENT(54)}<div style="flex:1"><b style="font-size:24px">{label}</b><div style="color:#A8A8A8;font-size:18px;margin-top:2px">{sub}</div></div><img src="{coin}" width="40" height="40"></div>'
page('1-agents-capital',1600,900,f'''<div class="grid-bg"></div>
<div style="position:absolute;left:84px;top:72px"><p class="kicker" style="font-size:22px">Issue · Stake · Trade</p><h2 style="font-size:66px;letter-spacing:-.03em;margin-top:14px">Capital for <span class="y">AI agents</span></h2></div>
<div style="position:absolute;left:84px;top:300px;display:grid;gap:22px">{agentcard('Agent issuer','Puts USDC to work',CI+'/usdc.svg')}{agentcard('Agent issuer','Stakes capital',CI+'/usdc.svg')}{agentcard('Human issuer','Backs traders',CI+'/usdc.svg')}</div>
<svg style="position:absolute;left:470px;top:300px" width="190" height="380"><g stroke="#FFD100" stroke-width="3" stroke-dasharray="8 8" fill="none"><path d="M0 52 C100 52 90 190 190 190"/><path d="M0 190 L190 190"/><path d="M0 328 C100 328 90 190 190 190"/></g></svg>
<div class="card" style="position:absolute;left:660px;top:290px;width:340px;padding:30px;text-align:center;border-color:#FFD100">
<div style="display:flex;justify-content:center">{MARK(92)}</div><b style="display:block;font-size:30px;margin-top:16px">Orderbook AMM</b><div class="mono" style="color:#A8A8A8;font-size:18px;margin-top:8px;letter-spacing:.12em">ON-CHAIN · OPEN CODE</div>
<div style="display:grid;gap:8px;margin-top:22px;text-align:left;font-size:19px;color:#A8A8A8"><span>▲ Every price on-chain</span><span>▲ Every position readable</span><span>▲ Every liquidation public</span></div></div>
<svg style="position:absolute;left:1000px;top:300px" width="150" height="380"><g stroke="#22C38E" stroke-width="3" stroke-dasharray="8 8" fill="none"><path d="M0 190 C70 190 80 100 150 100"/><path d="M0 190 C70 190 80 280 150 280"/></g></svg>
<div style="position:absolute;left:1150px;top:342px;display:grid;gap:62px">{agentcard('Agent trader','Hedges BTC',CI+'/btc.svg').replace('width:360px','width:370px')}{agentcard('Agent trader','Hedges ETH',CI+'/eth.svg').replace('width:360px','width:370px')}</div>
<div class="footer"><span>{MARK(30)} backx.trade</span><span>Future Trading for Agents &amp; Capital</span></div>''')

# ---- 2: capped at 20x (numbers from web/src/lib/hedge.ts, major coin, fees + issuer margin) ----
rows=[('2×',28.3,False),('5×',12.1,False),('10×',6.1,False),('20×',2.1,False),('50×',0,True),('100×',0,True)]
bars=''
for m,v,out in rows:
    if m=='50×':
        bars+='<div class="cap"><span class="mono">BACKX CAP · 20×</span></div>'
    if out:
        bars+=f'<div class="lr out"><b class="mono">{m}</b><div class="lt"><span class="gone">Liquidated the moment it opens</span></div><span class="mono lv down">▼ 0 %</span></div>'
    else:
        bars+=f'<div class="lr"><b class="mono">{m}</b><div class="lt"><i style="width:{v/30*100}%"></i></div><span class="mono lv">▼ −{v:.1f} %</span></div>'
page('2-capped-20x',1600,900,f'''<div style="position:absolute;left:84px;top:72px"><p class="kicker" style="font-size:22px">The math</p><h2 style="font-size:66px;letter-spacing:-.03em;margin-top:14px">Why BackX caps multiplication at <span class="y">20×</span></h2>
<p style="font-size:26px;color:#A8A8A8;margin-top:16px">How far the price can fall before a position is liquidated</p></div>
<div style="position:absolute;left:84px;right:84px;top:320px;display:grid;gap:20px">{bars}</div>
<div class="footer"><span>{MARK(30)} backx.trade</span><span>Major coin · fees and issuer safety margin included · BackX model</span></div>''',
'''.lr{display:grid;grid-template-columns:110px 1fr 230px;align-items:center;gap:24px;height:52px}.lr b{font-size:34px}.lt{height:36px;border-radius:8px;background:#151515;overflow:hidden;position:relative}
.lt i{display:block;height:100%;background:#FFD100;border-radius:8px}.lv{font-size:30px;text-align:right;color:#F2555F}.out b{color:#6E6E6E}.out .lt{background:repeating-linear-gradient(135deg,#1a0d0e 0 12px,#140a0b 12px 24px);border:1px solid rgba(242,85,95,.35)}
.cap{position:relative;border-top:2px dashed #FFD100;height:2px;margin:6px 0}.cap span{position:absolute;right:0;top:-34px;color:#FFD100;font-size:20px;letter-spacing:.12em;background:#070707;padding-left:12px}
.gone{position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#F2555F;font-size:20px;font-family:'IBM Plex Mono',monospace}.out{}''')

# ---- 3: old-school short ----
step=lambda n,t,s,ico: f'<div class="card st"><span class="mono n">{n}</span>{ico}<b>{t}</b><span class="s">{s}</span></div>'
coin=lambda c: f'<img src="{CI}/{c}.svg" width="58" height="58">'
page('3-short-borrow',1600,900,f'''<div style="position:absolute;left:84px;top:72px"><p class="kicker" style="font-size:22px">Coming to BackX</p><h2 style="font-size:66px;letter-spacing:-.03em;margin-top:14px">Old-school shorting, <span class="y">on-chain</span></h2></div>
<div style="position:absolute;left:84px;right:84px;top:290px;display:flex;align-items:center;justify-content:space-between">
{step(1,'Borrow','from an agent or issuer pool',coin('doge'))}<span class="arr">→</span>{step(2,'Sell',"at today&#39;s price",f'<span class="big down">▼</span>')}<span class="arr">→</span>{step(3,'Buy back','lower, if you are right',f'<span class="big up">▲</span>')}<span class="arr">→</span>{step(4,'Return','the asset to the lender',coin('doge'))}</div>
<div class="card" style="position:absolute;left:84px;right:84px;top:640px;padding:28px 34px;display:flex;align-items:center;gap:26px;border-color:#FFD100">
<img src="{CI}/usdc.svg" width="64" height="64"><div><b style="font-size:30px">Lenders are always paid in USDC</b><div style="color:#A8A8A8;font-size:22px;margin-top:6px">Their risk is always price down. Lending it out earns borrow fees whether price goes up or down.</div></div></div>
<div class="footer"><span>{MARK(30)} backx.trade</span><span>Stocks · memes · any listed asset</span></div>''',
'''.st{width:284px;height:270px;padding:26px;display:grid;justify-items:start;align-content:start;gap:14px}.st .n{color:#FFD100;font-size:20px}.st b{font-size:34px}.st .s{color:#A8A8A8;font-size:21px;line-height:1.35}
.arr{font-size:44px;color:#6E6E6E}.big{font-size:52px;line-height:58px}.down{color:#F2555F}.up{color:#22C38E}''')

# ---- 4: validators ----
import math
cx,cy,R=1110,470,250
nodes=''; lines=''
items=[('chain',k,e,n) for k,e,n in CHAINS]+[('val','agent',None,'AI agent'),('val','node',None,'Validator'),('val','agent',None,'AI agent'),('val','node',None,'Validator')]
for i,it in enumerate(items):
    a=-math.pi/2+i*2*math.pi/len(items); x=cx+R*math.cos(a); y=cy+R*math.sin(a)
    lines+=f'<line x1="{cx}" y1="{cy}" x2="{x:.0f}" y2="{y:.0f}" stroke="{"#FFD100" if it[0]=="val" else "rgba(255,255,255,.18)"}" stroke-width="3" stroke-dasharray="{"8 8" if it[0]=="val" else "0"}"/>'
    if it[0]=='chain': inner=f'<img src="{P}/chains/{it[1]}.{it[2]}" width="70" height="70" style="border-radius:50%">'
    elif it[1]=='agent': inner=AGENT(62)
    else: inner='<svg viewBox="0 0 64 64" width="58" height="58"><rect x="10" y="10" width="44" height="14" rx="4" fill="none" stroke="#FFD100" stroke-width="4"/><rect x="10" y="30" width="44" height="14" rx="4" fill="none" stroke="#FFD100" stroke-width="4"/><circle cx="20" cy="17" r="3" fill="#FFD100"/><circle cx="20" cy="37" r="3" fill="#FFD100"/><line x1="32" y1="44" x2="32" y2="56" stroke="#FFD100" stroke-width="4"/></svg>'
    nodes+=f'<div class="nd" style="left:{x-60:.0f}px;top:{y-60:.0f}px">{inner}<span>{it[3]}</span></div>'
page('4-validators',1600,900,f'''<svg style="position:absolute;inset:0" width="1600" height="900">{lines}</svg>
<div style="position:absolute;left:84px;top:72px;width:620px"><p class="kicker" style="font-size:22px">No server can stop it</p><h2 style="font-size:62px;letter-spacing:-.03em;margin-top:14px;line-height:1.05">On-chain <span class="y">validators</span> on every BackX chain</h2>
<div style="display:grid;gap:22px;margin-top:46px;font-size:27px;color:#A8A8A8">
<span><b style="color:#F2F2F2">▲ Anyone</b> can be a validator</span><span><b style="color:#F2F2F2">▲ AI agents</b> can validate too</span><span><b style="color:#F2F2F2">▲ Reward share</b> for every settlement</span><span><b style="color:#F2F2F2">▲ Liquidations</b> never depend on us</span></div></div>
<div class="hub card" style="left:{cx-80}px;top:{cy-80}px">{MARK(96)}</div>{nodes}
<div class="footer"><span>{MARK(30)} backx.trade</span><span>Robinhood Chain · BNB Chain · Base · Arbitrum</span></div>''',
'''.hub{position:absolute;width:160px;height:160px;border-radius:50%;display:grid;place-items:center;border:2px solid #FFD100;background:#0E0E0E}
.nd{position:absolute;width:120px;height:120px;border-radius:50%;background:#0E0E0E;border:1px solid rgba(255,255,255,.12);display:grid;place-items:center;align-content:center;gap:4px}
.nd span{font-family:'IBM Plex Mono',monospace;font-size:13px;color:#A8A8A8;letter-spacing:.06em;text-transform:uppercase;position:absolute;bottom:-30px;white-space:nowrap}''')
print('ok')
