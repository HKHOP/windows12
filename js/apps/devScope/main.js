import { createApp } from '../../sdk/index.js';

const APP_ID = 'devScope';
const APP_NAME = 'DevScope';

const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  scan: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3"/><circle cx="12" cy="12" r="4"/><path d="m15 15 3 3"/>',
  terminal: '<path d="m4 5 6 6-6 6M12 17h8"/>',
  file: '<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Z"/><path d="M13 3v7h7M8 14h8M8 17h6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  alert: '<path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 17 5l3 2M4 17l3 2a7 7 0 0 0 11.5-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v5M15 1v5M9 18v5M15 18v5M1 9h5M1 15h5M18 9h5M18 15h5"/>',
  network: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M7 9h.01M11 9h.01M15 9h.01"/>',
  shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
  close: '<path d="m18 6-12 12M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6"/>'
};

function icon(name, size = 18) {
  const body = ICONS[name] || ICONS.info;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function formatDate(value) {
  try { return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return String(value || 'Unknown time'); }
}

function runtimeInfo() {
  const nav = navigator;
  return {
    platform: nav.userAgentData?.platform || nav.platform || 'Browser runtime',
    browser: nav.userAgent || 'Unavailable',
    cores: Number.isFinite(nav.hardwareConcurrency) ? nav.hardwareConcurrency : null,
    memory: Number.isFinite(nav.deviceMemory) ? nav.deviceMemory : null,
    online: nav.onLine,
    language: nav.language || 'Unknown',
    screen: `${window.screen?.width || '?'} × ${window.screen?.height || '?'}`
  };
}

function renderShell() {
  return `
    <style>
      .ds{--bg:#0b1119;--panel:#111b27;--panel2:#152231;--line:#263546;--muted:#8fa0b4;--text:#eaf1f8;--mint:#62e1ce;--blue:#62a8ff;--red:#ff7885;--amber:#f4c16f;height:100%;width:100%;min-height:0;display:flex;background:var(--bg);color:var(--text);font:13px/1.45 'Segoe UI',system-ui,sans-serif;overflow:hidden;color-scheme:dark}
      .ds *{box-sizing:border-box}.ds button,.ds textarea,.ds input{font:inherit}.ds button{cursor:pointer}.ds button:focus-visible,.ds textarea:focus-visible,.ds input:focus-visible{outline:2px solid var(--mint);outline-offset:2px}.ds svg{flex:none}
      .ds-side{width:216px;flex:none;background:#0d1520;border-right:1px solid #1c2a38;padding:22px 13px 14px;display:flex;flex-direction:column;gap:20px;min-height:0}
      .ds-brand{display:flex;align-items:center;gap:10px;padding:0 8px}.ds-logo{width:36px;height:36px;display:grid;place-items:center;border-radius:11px;background:linear-gradient(145deg,#1a3340,#17263b);border:1px solid #365263;color:var(--mint)}.ds-brandname{font-size:17px;font-weight:750;letter-spacing:-.5px}.ds-brandname small{display:block;color:var(--muted);font-size:10px;font-weight:500;letter-spacing:1.3px;text-transform:uppercase;margin-top:1px}
      .ds-nav-label{color:#62758a;font-size:10px;font-weight:750;text-transform:uppercase;letter-spacing:1.2px;padding:0 10px 7px}.ds-nav{display:flex;flex-direction:column;gap:5px}.ds-navbtn{display:flex;align-items:center;gap:11px;width:100%;padding:11px 12px;border:1px solid transparent;border-radius:9px;color:#a6b5c6;background:transparent;text-align:left;transition:background .15s,color .15s}.ds-navbtn:hover{background:#142231;color:#e9f2fa}.ds-navbtn.active{background:#183039;border-color:#2a4e55;color:var(--mint)}.ds-navbtn span{white-space:nowrap}.ds-navbtn .ds-count{margin-left:auto;font-size:10px;color:#8295a9;background:#1a2938;border-radius:20px;padding:2px 6px}
      .ds-sidefoot{margin-top:auto;border:1px solid #253747;border-radius:11px;padding:12px;background:linear-gradient(145deg,#121f2c,#0e1823)}.ds-sidefoot-title{font-size:11px;font-weight:700;margin:0 0 4px}.ds-sidefoot-copy{font-size:11px;color:var(--muted);line-height:1.5}.ds-local{display:flex;align-items:center;gap:6px;color:#90dfc8;font-size:10px;margin-top:10px}.ds-dot{width:6px;height:6px;border-radius:50%;background:var(--mint);box-shadow:0 0 9px #62e1ce66}
      .ds-main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden}.ds-topbar{min-height:78px;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid #1c2b38;background:#0c141e}.ds-heading{min-width:0}.ds-eyebrow{font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:var(--mint);font-weight:800}.ds-title{margin:2px 0 0;font-size:23px;line-height:1.2;letter-spacing:-.6px;font-weight:720}.ds-subtitle{color:var(--muted);font-size:11px;margin-top:4px}.ds-actions{display:flex;align-items:center;gap:8px;flex:none}.ds-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:35px;padding:8px 11px;border-radius:8px;border:1px solid #314454;background:#172331;color:#dbe7f2;font-weight:650;white-space:nowrap}.ds-btn:hover{background:#203244;border-color:#476175}.ds-btn.primary{background:#57d6c5;color:#071820;border-color:#57d6c5}.ds-btn.primary:hover{background:#75e8d9}.ds-btn:disabled{opacity:.55;cursor:wait}.ds-btn.quiet{border-color:transparent;background:transparent;color:#a6b5c6}.ds-view{flex:1;overflow:auto;min-height:0;padding:23px 24px 30px;scrollbar-color:#334455 transparent;scrollbar-width:thin}.ds-pagehead{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:15px}.ds-pagehead h2{margin:0;font-size:15px;font-weight:720;letter-spacing:-.15px}.ds-pagehead p{margin:4px 0 0;color:var(--muted);font-size:11px}.ds-grid{display:grid;gap:13px}.ds-stats{grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:20px}.ds-card{min-width:0;background:linear-gradient(145deg,#121e2b,#101924);border:1px solid #243444;border-radius:12px;padding:15px}.ds-stat-top{display:flex;align-items:center;justify-content:space-between;gap:8px;color:#99acc0;font-size:11px}.ds-stat-icon{width:29px;height:29px;display:grid;place-items:center;border:1px solid #2b4352;border-radius:8px;background:#142532;color:var(--mint)}.ds-stat-value{font-size:25px;letter-spacing:-.7px;font-weight:760;margin-top:12px;line-height:1.1}.ds-stat-foot{font-size:10px;color:var(--muted);margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ds-grid-two{grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr)}.ds-cardhead{display:flex;align-items:center;justify-content:space-between;gap:9px;margin-bottom:13px}.ds-cardtitle{font-size:12px;font-weight:750}.ds-cardhint{font-size:10px;color:var(--muted);margin-top:3px}.ds-pill{display:inline-flex;align-items:center;gap:5px;border-radius:50px;border:1px solid #304455;background:#142231;color:#b8c8d7;font-size:10px;padding:4px 7px;white-space:nowrap}.ds-pill.good{color:#88e7d2;border-color:#2d6159;background:#12302e}.ds-pill.warn{color:#f4c16f;border-color:#6b5233;background:#352a1b}.ds-pill.bad{color:#ff9da7;border-color:#653640;background:#351f27}.ds-list{display:flex;flex-direction:column;gap:8px}.ds-listrow{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #243443;background:#101a25;border-radius:9px;min-width:0}.ds-rowicon{width:32px;height:32px;display:grid;place-items:center;border-radius:8px;background:#192a38;color:#9ecbc7;flex:none}.ds-rowmain{min-width:0;flex:1}.ds-rowtitle{font-weight:650;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ds-rowdetail{font-size:10px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ds-empty{border:1px dashed #334657;padding:21px 18px;border-radius:10px;text-align:center;color:var(--muted);font-size:11px}.ds-empty strong{display:block;color:#dce7f0;font-size:12px;margin-bottom:5px}.ds-empty-icon{display:grid;place-items:center;margin:0 auto 8px;width:33px;height:33px;border-radius:10px;background:#172631;color:var(--mint)}.ds-kv{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ds-kvitem{padding:10px 11px;border:1px solid #263746;border-radius:9px;background:#111c27;min-width:0}.ds-k{font-size:10px;color:var(--muted)}.ds-v{font-size:12px;font-weight:650;margin-top:4px;overflow-wrap:anywhere}.ds-note{display:flex;gap:9px;padding:12px 13px;border:1px solid #2d4b56;border-radius:9px;background:#13262e;color:#b7d7dd;font-size:11px;line-height:1.5}.ds-note svg{color:var(--mint);margin-top:1px}.ds-section{margin-bottom:20px}.ds-toolgrid{grid-template-columns:repeat(3,minmax(0,1fr))}.ds-tool{display:flex;gap:11px;align-items:flex-start;min-width:0}.ds-tool-logo{width:34px;height:34px;border:1px solid #304454;border-radius:9px;background:#172634;display:grid;place-items:center;color:#a6c9d4;flex:none}.ds-tool .ds-rowtitle{font-size:12px}.ds-tool .ds-rowdetail{white-space:normal;overflow-wrap:anywhere}.ds-toolright{margin-left:auto;flex:none}.ds-table{width:100%;border-collapse:collapse;font-size:11px}.ds-table th{text-align:left;color:#8397ab;font-weight:650;font-size:10px;text-transform:uppercase;letter-spacing:.6px;padding:10px 9px;border-bottom:1px solid #2a3b4a}.ds-table td{padding:11px 9px;border-bottom:1px solid #202f3d;vertical-align:top;overflow-wrap:anywhere}.ds-table tr:last-child td{border-bottom:0}.ds-tablewrap{overflow:auto}.ds-mono{font-family:Consolas,'Cascadia Code',monospace;font-size:10px;color:#b9d2e3;overflow-wrap:anywhere}.ds-textarea{display:block;width:100%;min-height:210px;resize:vertical;background:#0a131d;color:#dfeaf4;border:1px solid #304354;border-radius:10px;padding:13px;line-height:1.55;font:12px/1.55 Consolas,'Cascadia Code',monospace}.ds-textarea::placeholder{color:#62778c}.ds-findings{display:flex;flex-direction:column;gap:10px}.ds-finding{border:1px solid #293b4b;border-radius:10px;padding:14px;background:#111d29}.ds-findingtop{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}.ds-finding h3{font-size:12px;margin:0;font-weight:750}.ds-finding p{color:#b1c0ce;margin:6px 0 0;font-size:11px;line-height:1.6}.ds-finding .ds-mono{display:block;background:#0a131c;border:1px solid #213140;border-radius:6px;padding:8px;margin-top:9px;white-space:pre-wrap}.ds-finding ol{color:#b8c7d4;padding-left:18px;margin:8px 0 0;font-size:11px}.ds-finding li{margin:4px 0}.ds-snapshot{border:1px solid #263847;background:#111c27;border-radius:11px;padding:13px;display:flex;align-items:flex-start;gap:11px}.ds-snapshot-icon{width:34px;height:34px;border:1px solid #2d4a57;background:#142832;color:var(--mint);display:grid;place-items:center;border-radius:9px;flex:none}.ds-snapshot-body{flex:1;min-width:0}.ds-snapshot-title{font-size:12px;font-weight:700}.ds-snapshot-meta{font-size:10px;color:var(--muted);margin-top:4px}.ds-snapshot-tools{display:flex;gap:5px;flex-wrap:wrap;margin-top:9px}.ds-tag{background:#1a2a37;border:1px solid #293e4e;color:#b7c7d6;border-radius:5px;padding:3px 6px;font-size:9px}.ds-delta{display:flex;align-items:center;gap:8px;color:#b5c5d4;font-size:11px;padding:8px 0;border-bottom:1px solid #233341}.ds-delta:last-child{border-bottom:0}.ds-delta .ds-pill{margin-left:auto}.ds-flash{position:sticky;bottom:0;margin-top:11px;padding:0;color:#91dfcf;font-size:11px;min-height:16px}.ds-flash.error{color:#ff9da7}.ds-global-flash{min-height:22px;padding:2px 24px 8px;color:#8ddfcf;font-size:10px;overflow-wrap:anywhere}.ds-global-flash:empty{padding-bottom:3px}.ds-global-flash.error{color:#ff9da7}.ds-footnote{font-size:10px;color:#768ba0;line-height:1.5;margin-top:12px}.ds-segment{display:flex;gap:5px;flex-wrap:wrap}.ds-segment button{border:1px solid #2a3c4b;background:#111c27;border-radius:7px;padding:7px 9px;color:#9eb0c2;font-size:10px}.ds-segment button.active{color:var(--mint);border-color:#3d766e;background:#142c2c}.ds-codebox{padding:12px;background:#0b141e;border:1px solid #263a49;border-radius:8px;color:#c1d7e8;font:10px/1.6 Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}.ds-footerline{height:1px;background:#233341;margin:14px 0}.ds-spinner{width:13px;height:13px;border-radius:50%;border:2px solid #3d6465;border-top-color:#6ce8d3;animation:dsSpin .75s linear infinite}@keyframes dsSpin{to{transform:rotate(360deg)}}
      @media(max-width:920px){.ds-side{width:184px;padding-left:10px;padding-right:10px}.ds-view{padding:18px}.ds-topbar{padding:14px 18px}.ds-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.ds-toolgrid{grid-template-columns:repeat(2,minmax(0,1fr))}.ds-grid-two{grid-template-columns:1fr}}
      @media(max-width:650px){.ds{flex-direction:column}.ds-side{width:100%;height:auto;min-height:0;border-right:0;border-bottom:1px solid #263647;padding:10px;gap:9px}.ds-brand{padding:0 6px}.ds-logo{width:30px;height:30px}.ds-brandname{font-size:15px}.ds-brandname small{display:none}.ds-side .ds-nav-label,.ds-sidefoot{display:none}.ds-nav{flex-direction:row;overflow-x:auto;gap:5px}.ds-navbtn{width:auto;flex:none;padding:8px 10px;gap:7px;font-size:10px}.ds-navbtn svg{width:15px;height:15px}.ds-navbtn .ds-count{display:none}.ds-topbar{min-height:67px;padding:12px 14px}.ds-title{font-size:19px}.ds-subtitle{max-width:55vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ds-topbar .ds-btn span{display:none}.ds-view{padding:14px}.ds-global-flash{padding:2px 14px 6px}.ds-toolgrid{grid-template-columns:1fr}.ds-kv{grid-template-columns:1fr 1fr}.ds-stats{gap:8px}.ds-card{padding:12px}.ds-stat-value{font-size:22px}.ds-pagehead{align-items:flex-start}.ds-table th,.ds-table td{padding-left:6px;padding-right:6px}}
      @media(prefers-reduced-motion:reduce){.ds *{animation:none!important;transition:none!important}}
    </style>
    <div class="ds">
      <aside class="ds-side">
        <div class="ds-brand"><div class="ds-logo">${icon('scan',21)}</div><div class="ds-brandname">DevScope<small>Developer diagnostics</small></div></div>
        <div><div class="ds-nav-label">Workbench</div><nav class="ds-nav" aria-label="DevScope pages">
          <button class="ds-navbtn active" data-view="overview">${icon('grid',17)}<span>Overview</span></button>
          <button class="ds-navbtn" data-view="environment">${icon('terminal',17)}<span>Environment</span></button>
          <button class="ds-navbtn" data-view="errorlab">${icon('alert',17)}<span>Error Autopsy</span></button>
          <button class="ds-navbtn" data-view="snapshots">${icon('layers',17)}<span>Snapshots</span><span class="ds-count" id="ds-snapshot-count">0</span></button>
        </nav></div>
        <div class="ds-sidefoot"><div class="ds-sidefoot-title">Local-first by design</div><div class="ds-sidefoot-copy">Log analysis works offline. No account or AI key is required.</div><div class="ds-local"><span class="ds-dot"></span> Diagnostics stay on-device</div></div>
      </aside>
      <main class="ds-main">
        <header class="ds-topbar"><div class="ds-heading"><div class="ds-eyebrow">Developer workstation / diagnostics</div><h1 class="ds-title" id="ds-title">Overview</h1><div class="ds-subtitle" id="ds-subtitle">A clear picture of your development environment.</div></div><div class="ds-actions"><button class="ds-btn" id="ds-header-snapshot">${icon('plus',15)}<span>Snapshot</span></button><button class="ds-btn primary" id="ds-header-scan">${icon('scan',15)}<span>Scan tools</span></button></div></header>
        <section class="ds-view" id="ds-view" aria-live="polite"></section><div class="ds-global-flash" id="ds-global-flash" role="status"></div>
      </main>
    </div>`;
}

const PAGE_META = {
  overview: ['Overview', 'A clear picture of your development environment.'],
  environment: ['Environment', 'Find installed toolchains and inspect their versions and paths.'],
  errorlab: ['Error Autopsy', 'Turn noisy logs into actionable, prioritized debugging steps.'],
  snapshots: ['Snapshots', 'Record known-good environment states and compare what changed.']
};

const TOOL_SCAN_SCRIPT = String.raw`
$ErrorActionPreference = 'Continue'
$tools = @(
  @{ name='Git'; command='git' },
  @{ name='Node.js'; command='node' },
  @{ name='npm'; command='npm' },
  @{ name='Python'; command='python' },
  @{ name='Python Launcher'; command='py' },
  @{ name='Java'; command='java' },
  @{ name='.NET SDK'; command='dotnet' },
  @{ name='Rust Compiler'; command='rustc' },
  @{ name='Cargo'; command='cargo' },
  @{ name='Docker'; command='docker' },
  @{ name='VS Code'; command='code' },
  @{ name='PowerShell 7'; command='pwsh' }
)
$results = foreach ($tool in $tools) {
  $found = Get-Command $tool.command -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) {
    $version = (& $tool.command --version 2>&1 | Select-Object -First 1)
    [pscustomobject]@{ name=$tool.name; command=$tool.command; found=$true; path=[string]$found.Source; version=([string]$version).Trim() }
  } else {
    [pscustomobject]@{ name=$tool.name; command=$tool.command; found=$false; path=''; version='' }
  }
}
ConvertTo-Json -InputObject @($results) -Compress -Depth 4
`;

const ERROR_RULES = [
  { id:'node-module', severity:'high', title:'Node.js cannot resolve a module', re:/Cannot find module|ERR_MODULE_NOT_FOUND|ERR_PACKAGE_PATH_NOT_EXPORTED/i, why:'Node.js cannot resolve an import or package entry from the current project context.', steps:['Confirm the terminal is in the intended project directory.','Run npm install (or the package manager used by this project).','Check the package name, import path, exports map, and file-name capitalization.','If this began after an install, inspect package.json and the lockfile before deleting dependencies.'] },
  { id:'npm-peer', severity:'medium', title:'npm dependency tree conflict', re:/ERESOLVE|unable to resolve dependency tree|peer dependen(?:cy|cies)/i, why:'Two packages declare peer dependency ranges that npm cannot satisfy together.', steps:['Read the conflicting package names and version ranges in the first ERESOLVE block.','Update or align the related package versions in package.json.','Re-run npm install. Avoid --force or --legacy-peer-deps until you understand the compatibility trade-off.'] },
  { id:'python-module', severity:'high', title:'Python module is missing from the active environment', re:/ModuleNotFoundError|No module named/i, why:'The active Python interpreter cannot find a requested module; it may be uninstalled or installed into a different environment.', steps:['Check which interpreter runs the project: python -c "import sys; print(sys.executable)".','Activate the intended virtual environment.','Install the missing package through that interpreter, for example python -m pip install PACKAGE.','In editors, verify the selected interpreter matches the terminal.'] },
  { id:'port-busy', severity:'medium', title:'A network port is already in use', re:/EADDRINUSE|address already in use|Only one usage of each socket address/i, why:'Another process is already listening on the requested local address and port, or a previous run did not shut down cleanly.', steps:['Identify the process listening on the port before stopping anything.','Stop the old development server gracefully, or configure the project to use another port.','Check whether a second terminal, service, or container started the same app.'] },
  { id:'connection', severity:'medium', title:'Connection to a service failed', re:/ECONNREFUSED|connection refused|Failed to connect|actively refused/i, why:'The destination host was reachable enough to reject the connection, but no service accepted it at that address and port.', steps:['Verify the service is running and listening on the expected port.','Check host name, port, bind address, container port mapping, and firewall rules.','For a local API, confirm the frontend points at the correct development URL.'] },
  { id:'dns', severity:'medium', title:'Hostname could not be resolved', re:/ENOTFOUND|getaddrinfo failed|Name or service not known|DNS_PROBE_FINISHED/i, why:'The hostname did not resolve to an IP address from the current network context.', steps:['Check spelling and DNS settings.','Test the hostname with a separate DNS lookup.','For internal services, connect to the expected VPN or network and check the hosts entry if one is intentionally required.'] },
  { id:'permission', severity:'high', title:'Access was denied', re:/EACCES|EPERM|Permission denied|Access is denied|UnauthorizedAccessException/i, why:'The process lacks permission to access a file, folder, socket, or system resource.', steps:['Inspect the exact path and the user account running the command.','Check file ownership and permissions; avoid running everything as administrator as a first fix.','Close processes that may be locking the file and retry.','For scripts, inspect execution policy or security controls before changing them.'] },
  { id:'disk-full', severity:'high', title:'Storage or temporary space may be exhausted', re:/ENOSPC|no space left on device|disk full|There is not enough space on the disk/i, why:'The operation cannot allocate more disk space, or a temporary/build directory has reached its limit.', steps:['Check free space on the affected volume, not just the system drive.','Inspect build outputs, package caches, temporary files, and container images before removing anything.','Do not delete unfamiliar system files; use the relevant tool’s supported cache-clean command.'] },
  { id:'java-version', severity:'high', title:'Java runtime version mismatch', re:/UnsupportedClassVersionError|has been compiled by a more recent version of the Java Runtime|class file version/i, why:'The code was compiled for a newer Java class-file version than the runtime supports.', steps:['Check java -version and javac -version separately.','Install or select the JDK version required by the project.','In IDEs and build tools, align the project SDK, compiler target, and runtime version.'] },
  { id:'memory', severity:'high', title:'The process ran out of memory', re:/OutOfMemoryError|Java heap space|heap out of memory|allocation failed|out of memory/i, why:'The process or runtime reached its memory limit; that limit may be lower than the physical RAM available.', steps:['Check the memory limit for the process, container, runtime, or hosting plan.','Inspect the largest objects, asset bundles, build tasks, or data batches.','Increase limits only when appropriate; first check for runaway allocation or a memory leak.'] },
  { id:'wasm-corrupt', severity:'high', title:'WebAssembly module may be incomplete or corrupted', re:/WebAssembly\.instantiate|CompileError|section \(code \d+.*extends past end of the module|unexpected end of section/i, why:'The browser could not parse the WebAssembly binary. A truncated download, stale cache, or mismatched build artifact can cause this.', steps:['Reload the page and retry the asset request.','Clear only the affected site’s cached files if the issue persists.','Verify the served .wasm file size and checksum match the build artifact; inspect proxy or deployment limits.'] },
  { id:'minecraft-pack', severity:'medium', title:'Minecraft Bedrock pack or manifest issue', re:/manifest\.json|behavior pack|resource pack|unknown function|function file not found|pack.*uuid|module.*uuid/i, why:'The log appears to reference a Bedrock pack manifest, pack identity, module path, or function-loading problem.', steps:['Validate manifest.json as strict JSON and check that header and module UUIDs are distinct.','Confirm the function or asset path, namespace, file extension, and capitalization match the pack.','Verify pack/module versions are compatible with the target Bedrock release.','Check the first loading error; later function-not-found messages may be follow-on symptoms.'] },
  { id:'cors', severity:'medium', title:'Browser cross-origin request was blocked', re:/CORS policy|Access-Control-Allow-Origin|cross-origin request/i, why:'The browser blocked a request because the server response did not permit the page’s origin.', steps:['Configure the API server to allow the exact required origin.','For local development, use the development proxy or a same-origin backend route.','Do not treat disabling browser security as a production fix.'] },
  { id:'build-enoent', severity:'medium', title:'A build or script references a missing file', re:/ENOENT|no such file or directory|cannot find the path specified/i, why:'A referenced path does not exist from the process’s current working directory, or a required generated file was not created.', steps:['Check the current working directory and exact referenced path.','Confirm prerequisite generation/install steps ran successfully.','Check quoting around paths containing spaces and whether the file is ignored or absent from the checkout.'] },
  { id:'pack-json', severity:'medium', title:'JSON configuration may be malformed', re:/Unexpected token .* in JSON|JSON\.parse|JSONDecodeError|Expecting value: line|invalid character .* looking for beginning/i, why:'A JSON parser rejected the input; common causes are trailing commas, comments, missing quotes, or a file that was only partially written.', steps:['Use a JSON validator and inspect the line and column from the first error.','Remove comments and trailing commas if the format requires strict JSON.','Check that the file contains the expected config, not an HTML error page or empty response.'] },
  { id:'git-conflict', severity:'medium', title:'Git merge conflict or unfinished operation', re:/CONFLICT \(|Automatic merge failed|you have unmerged paths|needs merge/i, why:'Git found conflicting edits or an operation that still needs resolution.', steps:['Run git status to see the exact files and operation state.','Resolve conflict markers carefully and run the relevant tests.','Stage resolved files and complete or abort the operation intentionally; avoid resetting changes you have not backed up.'] },
  { id:'generic-exception', severity:'low', title:'An exception or stack trace was detected', re:/Unhandled exception|Traceback \(most recent call last\)|TypeError:|ReferenceError:|NullReferenceException|Fatal error:/i, why:'The log includes an exception marker. The first actionable frame or message is often more useful than the final cascade of errors.', steps:['Start with the first exception and the first stack frame in your own code.','Check recently changed code and the input values at the failure point.','Reduce the issue to a small reproducible example and capture the full exception context.'] }
];

function analyzeLog(raw) {
  const log = String(raw || '').trim();
  if (!log) return { empty: true, findings: [], summary: 'Paste a log to begin.' };
  const findings = [];
  for (const rule of ERROR_RULES) {
    const match = rule.re.exec(log);
    if (!match) continue;
    const start = Math.max(0, match.index - 90);
    const end = Math.min(log.length, match.index + match[0].length + 180);
    findings.push({
      id: rule.id, severity: rule.severity, title: rule.title, why: rule.why,
      steps: rule.steps, evidence: log.slice(start, end).replace(/\n{3,}/g, '\n\n').trim()
    });
  }
  findings.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - ({ high: 0, medium: 1, low: 2 }[b.severity])));
  if (!findings.length) {
    findings.push({
      id: 'general', severity: 'low', title: 'No known signature matched',
      why: 'DevScope uses local pattern matching, not a remote model. It did not find a known error signature in this log, so it will not invent a root cause.',
      steps: ['Search for the earliest error, not only the last line.','Include the command you ran, the working directory, relevant version output, and the complete first stack trace.','Remove tokens, passwords, IPs, or other secrets before sharing the log elsewhere.'],
      evidence: log.slice(0, 520) + (log.length > 520 ? '…' : '')
    });
  }
  const highCount = findings.filter(item => item.severity === 'high').length;
  const summary = `${findings.length} finding${findings.length === 1 ? '' : 's'} · ${highCount} high priority`;
  return { empty: false, findings, summary, inputLength: log.length, createdAt: new Date().toISOString() };
}

function parseScanOutput(result) {
  let output = result?.output ?? result?.stdout ?? result ?? '';
  if (Array.isArray(output)) output = output.map(item => typeof item === 'string' ? item : (item?.text ?? JSON.stringify(item))).join('\n');
  output = String(output ?? '').trim();
  const first = output.indexOf('[');
  const last = output.lastIndexOf(']');
  if (first >= 0 && last > first) {
    try {
      const parsed = JSON.parse(output.slice(first, last + 1));
      if (Array.isArray(parsed)) return parsed.map(item => ({
        name: String(item.name || item.command || 'Tool'), command: String(item.command || ''),
        found: item.found === true || item.found === 'True', path: String(item.path || ''), version: String(item.version || '').trim()
      }));
    } catch { /* show the raw diagnostic below */ }
  }
  const errors = Array.isArray(result?.errors) ? result.errors.join('\n') : String(result?.errors || '');
  const detail = [output, errors].filter(Boolean).join('\n').trim();
  throw new Error(detail || `The script runner returned no structured results (exit code: ${result?.exitCode ?? 'unknown'}).`);
}

function iconTool(name) {
  if (/python/i.test(name)) return 'Py';
  if (/node|npm/i.test(name)) return 'JS';
  if (/git/i.test(name)) return 'Git';
  if (/java/i.test(name)) return 'J';
  if (/docker/i.test(name)) return 'D';
  if (/rust|cargo/i.test(name)) return 'Rs';
  if (/\.net/i.test(name)) return '.N';
  if (/code/i.test(name)) return '</>';
  return '›_';
}

function statusPill(label, type = '') {
  return `<span class="ds-pill ${type}">${escapeHTML(label)}</span>`;
}

function pageOverview(state) {
  const info = state.runtime;
  const toolsCount = state.tools ? state.tools.filter(tool => tool.found).length : null;
  const scanTime = state.lastScanAt ? formatDate(state.lastScanAt) : 'Not scanned yet';
  const issueCount = state.analysis?.findings?.length || 0;
  const stats = [
    { name: 'Detected tools', value: toolsCount === null ? '—' : String(toolsCount), foot: state.tools ? `${state.tools.length} tool checks completed` : 'Run the environment scan', icon: 'terminal' },
    { name: 'Saved snapshots', value: String(state.snapshots.length), foot: state.snapshots.length ? 'Stored in your app profile' : 'No baseline recorded', icon: 'layers' },
    { name: 'Log findings', value: String(issueCount), foot: state.analysis ? state.analysis.summary : 'Paste a log to inspect it', icon: 'alert' },
    { name: 'Network', value: info.online ? 'Online' : 'Offline', foot: `Browser reports ${info.online ? 'connectivity' : 'no connection'}`, icon: 'network' }
  ];
  const statHTML = stats.map(item => `<article class="ds-card"><div class="ds-stat-top"><span>${escapeHTML(item.name)}</span><span class="ds-stat-icon">${icon(item.icon, 16)}</span></div><div class="ds-stat-value">${escapeHTML(item.value)}</div><div class="ds-stat-foot">${escapeHTML(item.foot)}</div></article>`).join('');
  let toolsHTML;
  if (!state.tools) {
    toolsHTML = `<div class="ds-empty"><div class="ds-empty-icon">${icon('scan',17)}</div><strong>No environment scan yet</strong>Scan the available developer tools to see versions and command paths.<div style="margin-top:12px"><button class="ds-btn primary" data-action="scan">${icon('scan',14)} Scan toolchain</button></div></div>`;
  } else {
    const tools = state.tools.filter(tool => tool.found).slice(0, 6);
    toolsHTML = tools.length ? `<div class="ds-list">${tools.map(tool => `<div class="ds-listrow"><div class="ds-rowicon">${escapeHTML(iconTool(tool.name))}</div><div class="ds-rowmain"><div class="ds-rowtitle">${escapeHTML(tool.name)}</div><div class="ds-rowdetail">${escapeHTML(tool.version || tool.command || 'Detected')}</div></div>${statusPill('Found', 'good')}</div>`).join('')}</div>` : `<div class="ds-empty"><strong>No tools detected from the scan</strong>Check Environment for the full results and any script-runner errors.</div>`;
  }
  const quickInfo = [
    ['Reported platform', info.platform],
    ['Logical CPU cores', info.cores ?? 'Not exposed by browser'],
    ['Memory hint', info.memory ? `At least ${info.memory} GB (browser estimate)` : 'Not exposed by browser'],
    ['Display', info.screen],
    ['Language', info.language],
    ['Last scan', scanTime]
  ].map(([key, value]) => `<div class="ds-kvitem"><div class="ds-k">${escapeHTML(key)}</div><div class="ds-v">${escapeHTML(value)}</div></div>`).join('');
  const recent = state.snapshots.slice(0, 2);
  const recentHTML = recent.length ? `<div class="ds-list">${recent.map(item => `<div class="ds-listrow"><div class="ds-rowicon">${icon('clock',16)}</div><div class="ds-rowmain"><div class="ds-rowtitle">${escapeHTML(item.label)}</div><div class="ds-rowdetail">${escapeHTML(formatDate(item.createdAt))}</div></div>${statusPill(item.tools?.length ? `${item.tools.filter(t => t.found).length} tools` : 'Baseline')}</div>`).join('')}</div>` : `<div class="ds-empty"><strong>Your first baseline goes here</strong>Save a snapshot before changing runtimes or build tools.</div>`;
  return `
    <div class="ds-grid ds-stats">${statHTML}</div>
    <div class="ds-grid ds-grid-two ds-section">
      <div class="ds-card"><div class="ds-cardhead"><div><div class="ds-cardtitle">Environment at a glance</div><div class="ds-cardhint">Best-effort information exposed to this app</div></div>${statusPill(state.tools ? 'Scanned' : 'Pending', state.tools ? 'good' : 'warn')}</div>${toolsHTML}<div class="ds-footnote">Tool scans use the Windows 12 script runner when available. A browser-only view cannot inspect the host operating system directly.</div></div>
      <div class="ds-card"><div class="ds-cardhead"><div><div class="ds-cardtitle">Runtime facts</div><div class="ds-cardhint">Not all host hardware details are available in a web OS</div></div>${icon('cpu',17)}</div><div class="ds-kv">${quickInfo}</div></div>
    </div>
    <div class="ds-grid ds-grid-two">
      <div class="ds-card"><div class="ds-cardhead"><div><div class="ds-cardtitle">Recent snapshots</div><div class="ds-cardhint">Keep a trail of known-good states</div></div><button class="ds-btn quiet" data-nav="snapshots">View all ${icon('arrow',13)}</button></div>${recentHTML}</div>
      <div class="ds-card"><div class="ds-cardhead"><div><div class="ds-cardtitle">Recommended workflow</div><div class="ds-cardhint">A quick way to get useful signal</div></div>${icon('shield',17)}</div><div class="ds-list">
        <div class="ds-listrow"><div class="ds-rowicon">1</div><div class="ds-rowmain"><div class="ds-rowtitle">Scan your toolchain</div><div class="ds-rowdetail">Record versions and executable paths.</div></div><button class="ds-btn quiet" data-nav="environment">Open</button></div>
        <div class="ds-listrow"><div class="ds-rowicon">2</div><div class="ds-rowmain"><div class="ds-rowtitle">Analyze the earliest error</div><div class="ds-rowdetail">Paste the full failing command output.</div></div><button class="ds-btn quiet" data-nav="errorlab">Open</button></div>
        <div class="ds-listrow"><div class="ds-rowicon">3</div><div class="ds-rowmain"><div class="ds-rowtitle">Save a before-state</div><div class="ds-rowdetail">Compare it after a change breaks things.</div></div><button class="ds-btn quiet" data-action="snapshot">Save</button></div>
      </div></div>
    </div>`;
}

function pageEnvironment(state) {
  const resultCount = state.tools ? state.tools.filter(tool => tool.found).length : 0;
  const toolCards = state.tools ? state.tools.map(tool => `<article class="ds-card ds-tool"><div class="ds-tool-logo">${escapeHTML(iconTool(tool.name))}</div><div class="ds-rowmain"><div class="ds-rowtitle">${escapeHTML(tool.name)}</div><div class="ds-rowdetail">${tool.found ? escapeHTML(tool.version || 'Command detected; version output unavailable') : 'Not found on the current command path'}</div>${tool.found && tool.path ? `<div class="ds-rowdetail ds-mono" style="margin-top:5px">${escapeHTML(tool.path)}</div>` : ''}</div><div class="ds-toolright">${statusPill(tool.found ? 'Found' : 'Missing', tool.found ? 'good' : '')}</div></article>`).join('') : '';
  const errorsHTML = state.scanError ? `<div class="ds-note" style="border-color:#6b4539;background:#2b211d;color:#f0c3b2">${icon('alert',16)}<div><strong>Scan could not complete.</strong><br>${escapeHTML(state.scanError)}<div style="margin-top:5px">The script runner may not be available in this Windows 12 build or may have blocked the command. Error-log analysis still works offline.</div></div></div>` : '';
  return `
    <div class="ds-pagehead"><div><h2>Installed toolchains</h2><p>Discovery runs only when you click scan. Nothing is installed or changed.</p></div><button class="ds-btn primary" data-action="scan" ${state.scanBusy ? 'disabled' : ''}>${state.scanBusy ? '<span class="ds-spinner"></span> Scanning…' : icon('refresh',14)+' Scan again'}</button></div>
    ${errorsHTML}
    <div class="ds-grid ds-stats" style="margin-top:14px">
      <article class="ds-card"><div class="ds-stat-top">Detected</div><div class="ds-stat-value">${state.tools ? resultCount : '—'}</div><div class="ds-stat-foot">Tools available on PATH</div></article>
      <article class="ds-card"><div class="ds-stat-top">Not found</div><div class="ds-stat-value">${state.tools ? state.tools.length - resultCount : '—'}</div><div class="ds-stat-foot">Does not imply a broken setup</div></article>
      <article class="ds-card"><div class="ds-stat-top">Last scan</div><div class="ds-stat-value" style="font-size:15px;margin-top:17px">${escapeHTML(state.lastScanAt ? formatDate(state.lastScanAt) : 'Never')}</div><div class="ds-stat-foot">Local tool discovery</div></article>
      <article class="ds-card"><div class="ds-stat-top">Safety model</div><div class="ds-stat-value" style="font-size:16px;margin-top:16px;color:var(--mint)">Read-only</div><div class="ds-stat-foot">No package install / system edits</div></article>
    </div>
    ${state.tools ? `<div class="ds-grid ds-toolgrid">${toolCards}</div>` : `<div class="ds-empty"><div class="ds-empty-icon">${icon('terminal',17)}</div><strong>Ready to inspect this environment</strong>DevScope checks Git, Node.js, npm, Python, Java, .NET, Rust, Docker, VS Code, and other common tools.<div style="margin-top:12px"><button class="ds-btn primary" data-action="scan">${icon('scan',14)} Run environment scan</button></div></div>`}
    <div class="ds-note" style="margin-top:15px">${icon('info',16)}<div><strong>Interpretation note</strong><br>A missing command usually means it is not installed or not on PATH for the script environment. It is not proof that the application is absent from your computer.</div></div>
    <div class="ds-footnote">${state.tools ? `Scan returned ${state.tools.length} command checks. Results are stored in this window until you save a snapshot.` : 'No scan data is available yet.'}</div>`;
}

function renderFinding(finding) {
  const severityType = finding.severity === 'high' ? 'bad' : finding.severity === 'medium' ? 'warn' : '';
  return `<article class="ds-finding"><div class="ds-findingtop">${statusPill(finding.severity.toUpperCase()+' PRIORITY', severityType)}<h3>${escapeHTML(finding.title)}</h3></div><p>${escapeHTML(finding.why)}</p><ol>${finding.steps.map(step => `<li>${escapeHTML(step)}</li>`).join('')}</ol><span class="ds-mono">${escapeHTML(finding.evidence || '')}</span></article>`;
}

function pageErrorLab(state) {
  const analysis = state.analysis;
  const results = analysis ? `<div class="ds-section"><div class="ds-pagehead"><div><h2>Analysis results</h2><p>${escapeHTML(analysis.summary)} · Local signature matching</p></div><button class="ds-btn" data-action="copy-report">${icon('copy',14)} Copy report</button></div><div class="ds-findings">${analysis.findings.map(renderFinding).join('')}</div><div class="ds-footnote">These are likely causes and safe next steps, not a guarantee of root cause. Review commands before running them. Logs may contain tokens or personal data.</div></div>` : `<div class="ds-empty"><div class="ds-empty-icon">${icon('search',17)}</div><strong>Waiting for a log</strong>Paste the relevant error output. Analysis is local and does not send log contents to an AI service.</div>`;
  return `
    <div class="ds-pagehead"><div><h2>Paste a crash, build, or runtime log</h2><p>Recognizes common Node.js, Python, Java, networking, WebAssembly, JSON, and Minecraft Bedrock errors.</p></div><button class="ds-btn" data-action="sample-log">${icon('file',14)} Load sample</button></div>
    <div class="ds-card ds-section"><textarea class="ds-textarea" id="ds-log-input" spellcheck="false" placeholder="Paste the full error output here…\n\nTip: include the first error and the command that produced it."></textarea><div style="display:flex;gap:9px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:11px"><div class="ds-cardhint">${icon('shield',12)} Nothing is uploaded. Pattern matching runs inside this app.</div><div class="ds-actions"><button class="ds-btn" data-action="clear-log">${icon('close',14)} Clear</button><button class="ds-btn primary" data-action="analyze">${icon('scan',14)} Analyze log</button></div></div><div class="ds-flash" id="ds-log-flash" role="status"></div></div>
    ${results}`;
}

function diffSnapshots(previous, current) {
  const before = new Map((previous?.tools || []).map(tool => [tool.name, tool]));
  const after = new Map((current?.tools || []).map(tool => [tool.name, tool]));
  const changes = [];
  for (const [name, item] of after) {
    if (!before.has(name)) changes.push({ name, label: 'New observation', type: '' });
    else {
      const old = before.get(name);
      if (old.found !== item.found) changes.push({ name, label: item.found ? 'Now found' : 'No longer found', type: item.found ? 'good' : 'warn' });
      else if (old.version !== item.version) changes.push({ name, label: 'Version/output changed', type: 'warn', before: old.version, after: item.version });
      else if (old.path !== item.path) changes.push({ name, label: 'Path changed', type: 'warn', before: old.path, after: item.path });
    }
  }
  for (const name of before.keys()) if (!after.has(name)) changes.push({ name, label: 'Not checked in newer snapshot', type: '' });
  return changes;
}

function pageSnapshots(state) {
  const snapshots = state.snapshots;
  const diff = snapshots.length >= 2 ? diffSnapshots(snapshots[1], snapshots[0]) : [];
  const diffHTML = snapshots.length >= 2 ? `<div class="ds-card ds-section"><div class="ds-cardhead"><div><div class="ds-cardtitle">Latest comparison</div><div class="ds-cardhint">${escapeHTML(snapshots[1].label)} → ${escapeHTML(snapshots[0].label)}</div></div>${statusPill(`${diff.length} change${diff.length === 1 ? '' : 's'}`, diff.length ? 'warn' : 'good')}</div>${diff.length ? diff.map(item => `<div class="ds-delta"><strong>${escapeHTML(item.name)}</strong><span>${escapeHTML(item.label)}</span>${statusPill(item.type === 'warn' ? 'Review' : item.type === 'good' ? 'Changed' : 'Info', item.type)}${item.before || item.after ? `<div style="flex-basis:100%;padding:4px 0 4px 2px;color:var(--muted);font-size:10px">Before: ${escapeHTML(item.before || '(empty)')}<br>After: ${escapeHTML(item.after || '(empty)')}</div>` : ''}</div>`).join('') : `<div class="ds-empty"><strong>No differences detected in the recorded fields</strong>Only tool detection, versions, and paths are compared. This is not a full machine restore point.</div>`}</div>` : '';
  const snapshotsHTML = snapshots.length ? `<div class="ds-list">${snapshots.map((item, index) => `<article class="ds-snapshot"><div class="ds-snapshot-icon">${icon('layers',16)}</div><div class="ds-snapshot-body"><div class="ds-snapshot-title">${escapeHTML(item.label)} ${index === 0 ? statusPill('Latest', 'good') : ''}</div><div class="ds-snapshot-meta">${escapeHTML(formatDate(item.createdAt))} · ${item.tools?.length || 0} tool checks · ${item.tools?.filter(tool => tool.found).length || 0} detected</div><div class="ds-snapshot-tools">${(item.tools || []).filter(tool => tool.found).slice(0, 8).map(tool => `<span class="ds-tag">${escapeHTML(tool.name)} ${escapeHTML(tool.version || '')}</span>`).join('') || '<span class="ds-tag">No scan data</span>'}</div></div><button class="ds-btn quiet" title="${state.pendingDelete === item.id ? 'Click again to confirm deletion' : 'Delete this snapshot'}" aria-label="${state.pendingDelete === item.id ? 'Confirm delete snapshot' : 'Delete snapshot'}" data-delete-snapshot="${escapeHTML(item.id)}">${state.pendingDelete === item.id ? 'Confirm?' : icon('trash',14)}</button></article>`).join('')}</div>` : `<div class="ds-empty"><div class="ds-empty-icon">${icon('layers',17)}</div><strong>No snapshots yet</strong>Scan the toolchain, then save a baseline before installing or upgrading developer tools.</div>`;
  return `
    <div class="ds-pagehead"><div><h2>Environment history</h2><p>Snapshots save only tool discovery results and browser-exposed runtime facts.</p></div><button class="ds-btn primary" data-action="snapshot">${icon('plus',14)} Save snapshot</button></div>
    <div class="ds-note ds-section">${icon('shield',16)}<div><strong>Not a system restore point</strong><br>DevScope never stores executables, secrets, or full system images. Comparison highlights differences in tool presence, reported version output, and command paths.</div></div>
    ${diffHTML}
    <div class="ds-section"><div class="ds-cardhead"><div><div class="ds-cardtitle">Saved baselines</div><div class="ds-cardhint">Saved in this user's DevScope app data</div></div><span class="ds-pill">${snapshots.length} total</span></div>${snapshotsHTML}</div>`;
}

function renderPage(view, state) {
  if (view === 'environment') return pageEnvironment(state);
  if (view === 'errorlab') return pageErrorLab(state);
  if (view === 'snapshots') return pageSnapshots(state);
  return pageOverview(state);
}

async function mountWindow(app, win) {
  const root = win.element.querySelector('.ds');
  const viewRoot = win.element.querySelector('#ds-view');
  const title = win.element.querySelector('#ds-title');
  const subtitle = win.element.querySelector('#ds-subtitle');
  const snapshotCount = win.element.querySelector('#ds-snapshot-count');
  const state = {
    runtime: runtimeInfo(),
    view: 'overview',
    tools: null,
    lastScanAt: null,
    scanBusy: false,
    scanError: '',
    snapshots: [],
    analysis: null,
    pendingDelete: null,
    lastLog: ''
  };

  function flash(message, isError = false) {
    const area = win.element.querySelector('#ds-global-flash');
    if (area) { area.textContent = message; area.classList.toggle('error', isError); }
  }

  function notify(type, heading, message) {
    try {
      // The bound app facade exposes info/action/form; warnings use the same
      // toast with a higher-priority flag instead of a separate method.
      app.notify?.info?.(heading, message, type === 'error' ? { critical: true } : undefined);
    } catch { /* visible in-app status remains the fallback */ }
  }

  async function loadSnapshots() {
    try {
      const loaded = await app.files.settings.get('snapshots');
      if (Array.isArray(loaded)) state.snapshots = loaded.filter(item => item && typeof item === 'object').slice(0, 50);
    } catch {
      // Some early SDK builds do not expose settings on the bound file facade. The app remains usable in-memory.
    }
  }

  async function persistSnapshots() {
    try {
      await app.files.settings.set('snapshots', state.snapshots.slice(0, 50));
      return true;
    } catch {
      return false;
    }
  }

  function render() {
    if (!viewRoot?.isConnected) return;
    const meta = PAGE_META[state.view] || PAGE_META.overview;
    title.textContent = meta[0];
    subtitle.textContent = meta[1];
    snapshotCount.textContent = String(state.snapshots.length);
    for (const button of win.element.querySelectorAll('.ds-navbtn')) {
      button.classList.toggle('active', button.dataset.view === state.view);
    }
    viewRoot.innerHTML = renderPage(state.view, state);
    if (state.view === 'errorlab') {
      const input = win.element.querySelector('#ds-log-input');
      if (input) input.value = state.lastLog;
    }
  }

  function navigate(view) {
    if (!PAGE_META[view]) return;
    if (state.view === 'errorlab') {
      const input = win.element.querySelector('#ds-log-input');
      if (input) state.lastLog = input.value;
    }
    state.view = view;
    render();
  }

  async function runScan() {
    if (state.scanBusy) return;
    state.scanBusy = true;
    state.scanError = '';
    render();
    try {
      if (typeof app.scripts?.runPowerShell !== 'function') {
        throw new Error('This Windows 12 SDK build does not expose the PowerShell script runner. Install or update the host OS build with SDK 1.4.0 or later to enable native tool discovery.');
      }
      const result = await app.scripts.runPowerShell(TOOL_SCAN_SCRIPT, { noProfile: true, allowNetwork: false });
      state.tools = parseScanOutput(result);
      state.lastScanAt = new Date().toISOString();
      state.scanError = '';
      notify('info', 'Environment scan complete', `${state.tools.filter(tool => tool.found).length} of ${state.tools.length} developer tools were detected.`);
    } catch (error) {
      state.scanError = error?.message || String(error);
      notify('warn', 'Environment scan unavailable', state.scanError.slice(0, 180));
    } finally {
      state.scanBusy = false;
      render();
    }
  }

  async function saveSnapshot() {
    let label = `Baseline ${state.snapshots.length + 1}`;
    try {
      const entered = await app.dialogs?.text?.('Save snapshot', 'Give this environment baseline a name.', { value: label, placeholder: 'e.g. Before Node upgrade' });
      if (typeof entered === 'string' && entered.trim()) label = entered.trim().slice(0, 80);
      else if (entered === null || entered === false) return;
    } catch {
      // Dialog support can vary in early OS builds; a timestamped default still gives the user a usable snapshot.
    }
    const item = {
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label,
      createdAt: new Date().toISOString(),
      runtime: { ...state.runtime },
      tools: state.tools ? state.tools.map(tool => ({ ...tool })) : []
    };
    state.snapshots.unshift(item);
    state.snapshots = state.snapshots.slice(0, 50);
    const stored = await persistSnapshots();
    render();
    flash(stored ? 'Snapshot saved to your DevScope profile.' : 'Snapshot saved for this session. Persistent settings were unavailable in this host build.');
    notify('info', 'Snapshot saved', label);
  }

  async function deleteSnapshot(id) {
    const item = state.snapshots.find(snapshot => snapshot.id === id);
    if (!item) return;
    if (typeof app.dialogs?.confirm === 'function') {
      let approved = false;
      try {
        approved = await app.dialogs.confirm('Delete snapshot', `Delete “${item.label}”? This removes only the saved DevScope comparison record.`);
      } catch {
        flash('Could not open the confirmation dialog. Snapshot was not deleted.', true);
        return;
      }
      if (approved !== true) return;
    } else if (state.pendingDelete !== id) {
      state.pendingDelete = id;
      render();
      flash('Click Confirm? beside the snapshot once more to delete it.');
      return;
    }
    state.pendingDelete = null;
    state.snapshots = state.snapshots.filter(snapshot => snapshot.id !== id);
    const stored = await persistSnapshots();
    render();
    flash(stored ? 'Snapshot deleted.' : 'Snapshot removed from this session.');
  }

  function runAnalysis() {
    const input = win.element.querySelector('#ds-log-input');
    state.lastLog = input?.value || '';
    state.analysis = analyzeLog(state.lastLog);
    render();
    const flashArea = win.element.querySelector('#ds-log-flash');
    if (flashArea) flashArea.textContent = state.analysis.empty ? 'Paste a log before analyzing.' : `Analysis complete: ${state.analysis.summary}.`;
  }

  async function copyReport() {
    const analysis = state.analysis;
    if (!analysis) return;
    const content = [
      'DevScope — Error Autopsy',
      `Created: ${formatDate(analysis.createdAt || new Date().toISOString())}`,
      `Summary: ${analysis.summary}`,
      '',
      ...analysis.findings.flatMap((finding, index) => [
        `${index + 1}. [${finding.severity.toUpperCase()}] ${finding.title}`,
        finding.why,
        'Recommended steps:', ...finding.steps.map((step, stepIndex) => `  ${stepIndex + 1}. ${step}`),
        `Evidence: ${finding.evidence || '(none)'}`, ''
      ])
    ].join('\n');
    try {
      await app.clipboard.writeText(content);
      const flashArea = win.element.querySelector('#ds-global-flash');
      if (flashArea) flashArea.textContent = 'Report copied to clipboard.';
      notify('info', 'Report copied', 'The diagnostic summary is on your clipboard.');
    } catch {
      // A clipboard grant may be denied; show the report for manual selection instead of claiming success.
      const box = document.createElement('textarea');
      box.className = 'ds-textarea';
      box.readOnly = true;
      box.value = content;
      box.style.minHeight = '160px';
      const results = win.element.querySelector('.ds-findings');
      if (results) results.before(box);
      box.focus(); box.select();
      const flashArea = win.element.querySelector('#ds-global-flash');
      if (flashArea) { flashArea.textContent = 'Clipboard access was unavailable. The report is selected above; copy it manually.'; flashArea.classList.add('error'); }
    }
  }

  function loadSample() {
    state.lastLog = `> npm install\nnpm error code ERESOLVE\nnpm error ERESOLVE unable to resolve dependency tree\nnpm error While resolving: demo-app@1.0.0\nnpm error Found: react@19.0.0\nnpm error Could not resolve dependency:\nnpm error peer react@"^18.0.0" from example-widget@2.4.0\nnpm error Fix the upstream dependency conflict, or retry this command with --force or --legacy-peer-deps.`;
    state.analysis = null;
    render();
    const flashArea = win.element.querySelector('#ds-log-flash');
    if (flashArea) flashArea.textContent = 'Sample loaded. Select Analyze log to inspect it.';
  }

  root.addEventListener('click', async event => {
    const navButton = event.target.closest('[data-view]');
    if (navButton) { navigate(navButton.dataset.view); return; }
    const pageButton = event.target.closest('[data-nav]');
    if (pageButton) { navigate(pageButton.dataset.nav); return; }
    const button = event.target.closest('[data-action]');
    if (button) {
      const action = button.dataset.action;
      if (action === 'scan') await runScan();
      else if (action === 'snapshot') await saveSnapshot();
      else if (action === 'analyze') runAnalysis();
      else if (action === 'sample-log') loadSample();
      else if (action === 'clear-log') { state.lastLog = ''; state.analysis = null; render(); }
      else if (action === 'copy-report') await copyReport();
      return;
    }
    const deleteButton = event.target.closest('[data-delete-snapshot]');
    if (deleteButton) await deleteSnapshot(deleteButton.dataset.deleteSnapshot);
  });

  win.element.querySelector('#ds-header-scan').addEventListener('click', () => { state.view = 'environment'; render(); runScan(); });
  win.element.querySelector('#ds-header-snapshot').addEventListener('click', () => saveSnapshot());
  await loadSnapshots();
  render();
}

function launch() {
  const app = createApp({ id: APP_ID, name: APP_NAME });
  const win = app.window.create({
    title: APP_NAME,
    icon: app.icon(),
    content: renderShell(),
    width: 1120,
    height: 760,
    resizable: true
  });
  mountWindow(app, win);
}

export default { launch };
