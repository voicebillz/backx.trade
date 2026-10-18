import json, urllib.request, time, numpy as np
UA={"user-agent":"Mozilla/5.0"}
def get(u):
    for i in range(4):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30))
        except Exception as e: time.sleep(2*(i+1))
    raise SystemExit("fail "+u)
now=int(time.time()*1000)//60000*60000
for sym in ["BTCUSDT","DOGEUSDT","PEPEUSDT","WIFUSDT"]:
    rows=[]; start=now-30*86400*1000
    while start<now:
        d=get(f"https://data-api.binance.vision/api/v3/klines?symbol={sym}&interval=1m&limit=1000&startTime={start}")
        if not d: break
        rows+=d; start=d[-1][0]+60000
    a=np.array([[float(r[1]),float(r[2]),float(r[3]),float(r[4])] for r in rows])
    np.save(f"{sym}.npy",a); print(sym,a.shape)
# GAZZ on Robinhood chain (GeckoTerminal minute OHLCV, newest first, paged)
pool="0xd6eebfa1d601c391fa383a6345392e28134ae14e4400e9538ed0b22bd63db729"
rows=[]; before=None
for _ in range(12):
    u=f"https://api.geckoterminal.com/api/v2/networks/robinhood/pools/{pool}/ohlcv/minute?aggregate=1&limit=1000&currency=usd"+(f"&before_timestamp={before}" if before else "")
    d=get(u)["data"]["attributes"]["ohlcv_list"]
    if not d: break
    rows+=d; before=d[-1][0]; time.sleep(2.2)
rows=sorted({r[0]:r for r in rows}.values())
# fill missing minutes (no trades) with previous close
out=[]; t0=rows[0][0]; i=0; prev=rows[0][4]; byt={r[0]:r for r in rows}
for t in range(rows[0][0], rows[-1][0]+60, 60):
    r=byt.get(t)
    if r: out.append([r[1],r[2],r[3],r[4]]); prev=r[4]
    else: out.append([prev,prev,prev,prev])
a=np.array(out,dtype=float); np.save("GAZZ.npy",a); print("GAZZ",a.shape, "days", a.shape[0]/1440)
