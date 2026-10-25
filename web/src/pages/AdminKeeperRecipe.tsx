import { useState } from 'react';

// Keeper server recipe (owner 2026-10-25, docs/KEEPERS.md): 5 servers × 2 keepers per chain = 10 keepers per chain.
// Railway (paid, already used) + the 4 best free hosts for an always-on process (checked 2026-10-25; free terms change).
// Ranks are interleaved (server s runs ranks s−1 and s+4), so the first five ranks sit on five different providers.
// Coordination needs no shared server: each rank waits 2 blocks more than the one above it and re-checks the chain
// first; the signed heartbeat to api.backx.trade only reports health (Admin → Validators).

const IMAGE = 'ghcr.io/voicebillz/backx-keeper:latest';
const CHAINS = '4663,56,8453,42161';

interface Server { key: string; name: string; kind: 'vm' | 'service'; free: string; how: string[] }
const SERVERS: Server[] = [
  { key: 'rail', name: 'Railway', kind: 'service', free: 'Betalt (har allerede)', how: ['New → Service → Docker Image', 'Image: ' + IMAGE, 'Variables: KEEPER_SET = linjen fra steg 2', 'Ingen public domain (Settings → Networking)'] },
  { key: 'oci', name: 'Oracle Cloud Always Free', kind: 'vm', free: 'Gratis for alltid · Ampere A1 2 kjerner / 12 GB', how: ['Compute → Instances → Create', 'Image: Ubuntu 24.04 · Shape: VM.Standard.A1.Flex (1 OCPU, 6 GB)', 'Legg inn din SSH-nøkkel, opprett, koble til med SSH'] },
  { key: 'gcp', name: 'Google Cloud e2-micro', kind: 'vm', free: 'Gratis for alltid · 1 VM i us-west1 / us-central1 / us-east1', how: ['Compute Engine → VM instances → Create', 'Region us-central1 · Machine e2-micro · Ubuntu 24.04 · 30 GB standard disk', 'Trykk SSH i konsollen'] },
  { key: 'nf', name: 'Northflank Sandbox', kind: 'service', free: 'Gratis · 2 tjenester som alltid kjører (kortverifisering)', how: ['Create service → Deployment → External image', 'Image: ' + IMAGE, 'Environment: KEEPER_SET = linjen fra steg 2', 'Ingen ports / ingen public'] },
  { key: 'az', name: 'Microsoft Azure', kind: 'vm', free: 'Gratis i 12 måneder · B2pts v2 (Arm) 750 t/mnd', how: ['Virtual machines → Create', 'Image: Ubuntu 24.04 · Size: B2pts v2 · SSH public key', 'Inbound ports: ingen utenom SSH'] },
];

function Code({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="recipe-code">
      <pre><code>{text}</code></pre>
      <button className="btn-mini" onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}>{done ? 'Kopiert' : 'Kopier'}</button>
    </div>
  );
}

export function AdminKeeperRecipe() {
  const [slot, setSlot] = useState(1);
  const s = SERVERS[slot - 1];
  const ranks = `${slot - 1} og ${slot + 4}`;
  const setup = `docker run --rm ${IMAGE} node src/setup.js --server ${s.key} --slot ${slot} --of 5 --keepers 10 --chains ${CHAINS}`;
  return (
    <section className="card recipe">
      <h2>Oppskrift: våre validator-servere</h2>
      <p className="muted">5 servere × 2 av våre egne validatorer per kjede = 10 på hver av Robinhood, BNB, Base og Arbitrum. Hver server kjører rang {`s−1`} og {`s+4`}, så de fem første rangene ligger hos fem ulike leverandører. Ingen server styrer de andre: rang r venter 2 blokker mer enn rangen over og sjekker kjeden først, så bare én sender.</p>

      <ol className="recipe-steps">
        <li><b>Én gang:</b> GitHub → voicebillz → Packages → <span className="num">backx-keeper</span> → Package settings → Change visibility: <b>Public</b> (keeper-koden har ingen hemmeligheter; nøklene lages på hver server).</li>
        <li>
          <b>Velg server</b>
          <div className="seg seg-inline recipe-tabs" role="tablist" aria-label="Server">
            {SERVERS.map((x, i) => <button key={x.key} role="tab" aria-selected={slot === i + 1} className={slot === i + 1 ? 'active' : ''} onClick={() => setSlot(i + 1)}>{i + 1}. {x.name.split(' ')[0]}</button>)}
          </div>
          <p className="muted">{s.name} · {s.free} · rang {ranks} på hver kjede</p>
        </li>
        <li><b>Opprett serveren</b><ul>{s.how.map((h) => <li key={h}>{h}</li>)}</ul></li>
        {s.kind === 'vm' && <li><b>Installer Docker</b> (lim inn i SSH-vinduet):<Code text={'curl -fsSL https://get.docker.com | sudo sh'} /></li>}
        <li>
          <b>Lag nøklene for denne serveren</b> {s.kind === 'vm' ? '(i SSH-vinduet):' : '(på en hvilken som helst maskin med Docker, f.eks. en av VM-ene):'}
          <Code text={(s.kind === 'vm' ? 'sudo ' : '') + setup} />
          Den skriver ut to deler. <b>KEEPER_SET=…</b> er hemmelig og hører bare hjemme på denne serveren. Den <b>offentlige linjen</b> legger du til i Railway → API-tjenesten → <span className="num">KEEPERS</span> (skilt med komma).
        </li>
        {s.kind === 'vm' ? (
          <li><b>Start validatorene</b> (lim inn KEEPER_SET-linjen i filen, lagre med Ctrl+O, Enter, Ctrl+X):
            <Code text={`sudo mkdir -p /opt/backx && sudo nano /opt/backx/keepers.env\nsudo docker run -d --name backx-keepers --restart=always --env-file /opt/backx/keepers.env ${IMAGE}`} />
            Oppdatere til ny versjon senere:
            <Code text={`sudo docker pull ${IMAGE} && sudo docker rm -f backx-keepers && sudo docker run -d --name backx-keepers --restart=always --env-file /opt/backx/keepers.env ${IMAGE}`} />
          </li>
        ) : (
          <li><b>Start validatorene:</b> lim inn KEEPER_SET som variabel på tjenesten og deploy. Ny versjon: Redeploy.</li>
        )}
        <li><b>Kontrakt-adresser:</b> når markedene er deployet, legg til <span className="num">MANAGERS_4663</span> osv. og kjør steg 5 på nytt, eller vent: uten adresser står validatorene i ro.</li>
        <li><b>Gass:</b> Admin → Validators → «Top up low validators» lager en Safe-fil. Etter det fyller validatorene på hverandre selv.</li>
        <li><b>Sjekk:</b> Admin → Validators viser «Up» for validatorene på denne serveren innen ett minutt.</li>
      </ol>
      <p className="hint">Ikke brukt: Koyeb (gratis-instansen sover etter 1 time), Render (sover), Fly.io (ingen gratisplan). Cloudflare/GitHub-cron går bare hvert minutt: for treigt til likvideringer.</p>
    </section>
  );
}
