import { spawn } from "node:child_process";
import { createServer } from "node:http";

export const DEFAULT_DASHBOARD_PORT = 1418;

export function developmentDashboardModel({
  credentials = [],
  profiles = {},
  providerModels = [],
  services = [],
} = {}) {
  credentials = [...credentials];
  services = [...services];
  const runtimes = Object.values(profiles).map((profile) => ({
    api: `http://${profile.apiHost}:${profile.apiPort}`,
    app: `http://${profile.appHost}:${profile.appPort}`,
    config: [
      ["Database", profile.database],
      ["Cell", profile.cellId],
      ...(profile.bucket ? [["Bucket", profile.bucket]] : []),
      ["API port", profile.apiPort],
      ["Inspector", `127.0.0.1:${profile.inspectorPort}`],
    ],
    description: "Community self-hosted Node runtime",
    health: `http://127.0.0.1:${profile.apiPort}/ready`,
    id: profile.name,
    name: "Community self-hosted",
    setup: `http://${profile.appHost}:${profile.appPort}/setup`,
  }));

  for (const model of providerModels) {
    runtimes.push(...(model.runtimes ?? []));
    services.push(...(model.services ?? []));
    credentials.push(...(model.credentials ?? []));
  }

  return { credentials, runtimes, services };
}

export function renderDevelopmentDashboard(model) {
  const cards = model.runtimes.map((runtime) => `<article class="card" data-health="${html(runtime.health)}">
    <div class="title"><div><span class="status" aria-label="Checking status"></span><h2>${html(runtime.name)}</h2></div><span class="pill">${html(runtime.id)}</span></div>
    <p>${html(runtime.description)}</p><nav><a class="primary" href="${html(runtime.app)}">Open app</a>${runtime.setup ? `<a href="${html(runtime.setup)}">Setup</a>` : ""}${runtime.api ? `<a href="${html(runtime.api)}">API</a>` : ""}</nav>
    <dl>${(runtime.config ?? []).map(([key, value]) => `<div><dt>${html(key)}</dt><dd>${html(value)}</dd></div>`).join("")}</dl></article>`).join("");
  const serviceLinks = model.services.map((service) => `<a class="service" href="${html(service.url)}"><span><strong>${html(service.name)}</strong><small>${html(service.detail)}</small></span><code>${html(service.url)}</code></a>`).join("");
  const credentialCards = model.credentials.map((group) => `<article class="credential-card"><div class="credential-heading"><h2>${html(group.name)}</h2><p>${html(group.description)}</p></div><dl class="credential-list">${group.fields.filter(([, value]) => value).map(([label, value, kind]) => `<div><dt>${html(label)}</dt><dd>${kind === "link" ? `<a href="${html(value)}">${html(value)}</a>` : `<code>${html(value)}</code><button class="copy" data-copy="${html(value)}" type="button">Copy</button>`}</dd></div>`).join("")}</dl></article>`).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zilobase development hub</title><style>
:root{color-scheme:light;--canvas:#fff;--card:#fff;--muted:#f4f4f5;--subtle:#fafafa;--text:#18181b;--secondary:#5f5f68;--stroke:#e4e4e7;--primary:#2563eb;--primary-hover:#1d4ed8;--on-primary:#fff;--neutral-hover:#f0f0f2;--focus:#2563eb;--success:#15803d;--danger:#dc2626;font:14px/1.45 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}@media(prefers-color-scheme:dark){:root{color-scheme:dark;--canvas:#111113;--card:#18181b;--muted:#1f1f23;--subtle:#151517;--text:#f4f4f5;--secondary:#a1a1aa;--stroke:#2c2c31;--neutral-hover:#25252a;--focus:#60a5fa;--success:#22c55e;--danger:#ef4444}}*{box-sizing:border-box}body{background:var(--canvas);color:var(--text);margin:0}main{width:min(1040px,calc(100% - 32px));margin:auto;padding:40px 0 72px}header{display:flex;align-items:center;gap:12px;margin-bottom:24px}.mark{align-items:center;background:var(--text);border-radius:7px;color:var(--canvas);display:flex;font-size:16px;font-weight:750;height:30px;justify-content:center;width:30px}h1{font-size:20px;letter-spacing:-.025em;margin:0}header p,.card p,.credential-card p{color:var(--secondary);margin:2px 0 0}.tabs{border-bottom:1px solid var(--stroke);display:flex;gap:4px;margin-bottom:24px}.tab{background:transparent;border:0;border-bottom:2px solid transparent;color:var(--secondary);cursor:pointer;font:500 13px/1 system-ui;margin-bottom:-1px;padding:10px 12px}.tab[aria-selected="true"]{border-bottom-color:var(--primary);color:var(--text)}.panel[hidden]{display:none}.section-heading{align-items:end;display:flex;justify-content:space-between;margin:0 0 10px}.section-heading h2{font-size:13px;letter-spacing:.08em;margin:0;text-transform:uppercase}.section-heading p{color:var(--secondary);font-size:12px;margin:0}.grid,.credential-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.card,.credential-card,.services{background:var(--card);border:1px solid var(--stroke);border-radius:8px;padding:16px;min-width:0}.title,.title>div{display:flex;align-items:center;justify-content:space-between;gap:9px;min-width:0}.title>div{justify-content:flex-start}.card h2,.credential-card h2{font-size:14px;font-weight:600;margin:0}.status{background:var(--secondary);border-radius:50%;flex:none;height:7px;width:7px}.status.ready{background:var(--success)}.status.down{background:var(--danger)}.pill{background:var(--muted);border-radius:5px;color:var(--secondary);font:10px ui-monospace,SFMono-Regular,monospace;padding:2px 6px}.card p{min-height:40px;margin-top:8px}nav{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0}nav a,.copy{align-items:center;background:transparent;border:1px solid var(--stroke);border-radius:6px;color:var(--text);cursor:pointer;display:inline-flex;font:500 12px/1 system-ui;height:28px;justify-content:center;padding:0 8px;text-decoration:none}nav a:hover,.copy:hover{background:var(--neutral-hover)}nav .primary{background:var(--primary);border-color:transparent;color:var(--on-primary)}nav .primary:hover{background:var(--primary-hover)}dl{border-top:1px solid var(--stroke);margin:0;padding-top:8px;min-width:0}dl div{display:grid;grid-template-columns:minmax(90px,.7fr) minmax(0,1.3fr);gap:12px;padding:5px 0}dt{color:var(--secondary)}dd{font-family:ui-monospace,SFMono-Regular,monospace;margin:0;overflow-wrap:anywhere;text-align:right}.services{display:grid;padding:5px}.service{align-items:center;border-radius:6px;color:inherit;display:flex;justify-content:space-between;gap:20px;padding:10px;text-decoration:none}.service:hover{background:var(--neutral-hover)}.service span{display:grid}.service small{color:var(--secondary)}.service code,.credential-list a{color:var(--primary);overflow-wrap:anywhere}.credential-heading{min-height:44px}.credential-list{margin-top:12px}.credential-list div{display:flex;flex-direction:column;gap:4px}.credential-list dt,.credential-list dd{width:100%;text-align:left}.credential-list dd{align-items:center;display:flex;gap:6px}.credential-list code{background:var(--subtle);border:1px solid var(--stroke);border-radius:6px;display:block;overflow-wrap:anywhere;padding:7px 8px;width:100%}.credential-list .copy{flex:none}.privacy{background:var(--subtle);border:1px solid var(--stroke);border-radius:7px;color:var(--secondary);font-size:12px;margin-top:16px;padding:9px 11px}@media(max-width:720px){main{width:min(100% - 24px,1040px);padding-top:24px}.grid,.credential-grid{grid-template-columns:1fr}.service{align-items:flex-start;flex-direction:column;gap:4px}}
</style></head><body><main><header><div class="mark">Z</div><div><h1>Development hub</h1><p>Zilobase local runtimes, services, setup credentials, and test identities.</p></div></header><div class="tabs" role="tablist" aria-label="Development hub sections"><button class="tab" role="tab" aria-selected="true" data-tab="runtimes">Runtimes</button><button class="tab" role="tab" aria-selected="false" data-tab="services">Services</button><button class="tab" role="tab" aria-selected="false" data-tab="credentials">Credentials</button></div><section class="panel" role="tabpanel" data-panel="runtimes"><div class="section-heading"><h2>Runtimes</h2><p>Live status refreshes every five seconds</p></div><div class="grid">${cards}</div></section><section class="panel" role="tabpanel" data-panel="services" hidden><div class="section-heading"><h2>Supporting services</h2><p>Mail, storage, licensing, and identity</p></div><div class="services">${serviceLinks}</div></section><section class="panel" role="tabpanel" data-panel="credentials" hidden><div class="section-heading"><h2>Credentials</h2><p>Generated for this local environment</p></div><div class="credential-grid">${credentialCards}</div><p class="privacy">This hub is bound to 127.0.0.1 for local development only. Do not expose it beyond loopback.</p></section></main><script>
function selectTab(name){document.querySelectorAll('[data-tab]').forEach(tab=>tab.ariaSelected=String(tab.dataset.tab===name));document.querySelectorAll('[data-panel]').forEach(panel=>panel.hidden=panel.dataset.panel!==name);history.replaceState(null,'','#'+name)}async function refresh(){await Promise.all([...document.querySelectorAll('[data-health]')].map(async card=>{const dot=card.querySelector('.status');try{const response=await fetch('/api/probe?url='+encodeURIComponent(card.dataset.health));dot.className='status '+(response.ok?'ready':'down');dot.ariaLabel=response.ok?'Ready':'Unavailable'}catch{dot.className='status down'}}))}document.addEventListener('click',async event=>{const tab=event.target.closest('[data-tab]');if(tab){selectTab(tab.dataset.tab);return}const button=event.target.closest('[data-copy]');if(!button)return;await navigator.clipboard.writeText(button.dataset.copy);const label=button.textContent;button.textContent='Copied';setTimeout(()=>button.textContent=label,1200)});const initial=location.hash.slice(1);if(['runtimes','services','credentials'].includes(initial))selectTab(initial);refresh();setInterval(refresh,5000);
</script></body></html>`;
}

export async function startDevelopmentDashboard({ model, open = true, port = DEFAULT_DASHBOARD_PORT }) {
  const healthUrls = model.runtimes.map(({ health }) => health);
  if (healthUrls.some((url) => !isLoopbackHttpUrl(url))) {
    throw new Error("Development hub health probes must use loopback HTTP URLs.");
  }
  const allowed = new Set(healthUrls);
  const page = renderDevelopmentDashboard(model);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    if (url.pathname === "/api/probe") {
      const target = url.searchParams.get("url");
      if (!target || !allowed.has(target)) return send(response, 400, "application/json", '{"ready":false}');
      const ready = await probe(target);
      return send(response, ready ? 200 : 503, "application/json", JSON.stringify({ ready }));
    }
    if (url.pathname !== "/") return send(response, 404, "text/plain", "Not found");
    send(response, 200, "text/html; charset=utf-8", page);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  const resolvedPort = typeof address === "object" && address ? address.port : port;
  const url = `http://127.0.0.1:${resolvedPort}`;
  if (open) openBrowser(url);
  return {
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    url,
  };
}

function send(response, status, contentType, body) {
  response.writeHead(status, { "cache-control": "no-store", "content-type": contentType });
  response.end(body);
}

async function probe(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1_500) })).ok;
  } catch {
    return false;
  }
}

function openBrowser(url) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

function html(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isLoopbackHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}
