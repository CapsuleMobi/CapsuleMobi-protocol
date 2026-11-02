import { X_ICON, GITHUB_ICON, COPY_ICON } from '../src/icons.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const svg = (icon, cls = '') =>
  `<svg class="${cls}" viewBox="${icon.viewBox}" aria-hidden="true" focusable="false"><path d="${icon.d}"/></svg>`;
const strokeSvg = (icon) =>
  `<svg class="ico-stroke" viewBox="${icon.viewBox}" aria-hidden="true" focusable="false"><path d="${icon.d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;

export const isStated = (rec) => !!rec && rec.state === 'stated';

export function handleOf(url) {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean)[0];
    return seg ? '@' + seg : '';
  } catch { return ''; }
}

export function publicRegister(register) {
  const out = {};
  for (const [k, r] of Object.entries(register.records)) {
    const { checked, ...rest } = r;
    out[k] = rest;
  }
  return out;
}

function social(rec, icon, key) {
  if (isStated(rec)) {
    const h = handleOf(rec.url);
    return `<a class="social" data-record="${key}" href="${esc(rec.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(rec.label + (h ? ' ' + h : ''))}">${svg(icon)}</a>`;
  }
  return `<span class="social is-inert" data-record="${key}" role="img" aria-disabled="true" aria-label="${esc(rec.label)}, pending">${svg(icon)}</span>`;
}

function caSlot(rec) {
  if (isStated(rec)) {
    return `<div class="ca-slot" data-record="ca" data-state="stated">
      <span class="ca-label">${esc(rec.label)}</span>
      <code class="ca-value" id="ca-value">${esc(rec.value)}</code>
      <button class="btn btn-ca" type="button" id="ca-copy" data-copy="${esc(rec.value)}"><span class="btn-text" data-idle="Copy" data-done="Copied">Copy</span>${strokeSvg(COPY_ICON)}</button>
      <span class="sr-only" role="status" aria-live="polite" id="ca-live"></span>
    </div>`;
  }
  return `<div class="ca-slot is-inert" data-record="ca" data-state="${esc(rec.state)}">
      <span class="ca-label">${esc(rec.label)}</span>
      <span class="ca-value is-pending" id="ca-value">pending</span>
      <button class="btn btn-ca" type="button" id="ca-copy" disabled aria-disabled="true"><span class="btn-text">Copy</span>${strokeSvg(COPY_ICON)}</button>
    </div>`;
}

const dots = '· · · · ·';
function skelRow(i, ca) {
  const own = i === 0;
  if (own && !isStated(ca)) {
    return `<li class="row is-own is-placeholder" data-slot="0" data-own="placeholder" aria-disabled="true">
      <span class="tile tile-logo"><img src="assets/capsule-logo.png" alt="" width="40" height="17" decoding="async"></span>
      <span class="cell c-name"><b class="sym">CAPSULE</b><small class="nm">Own token</small></span>
      <span class="cell c-price" data-label="Price">$0.00</span>
      <span class="cell c-change" data-label="24h">${dots}</span>
      <span class="cell c-vol" data-label="Volume">${dots}</span>
      <span class="cell c-liq" data-label="Liquidity">${dots}</span>
      <span class="cell c-act"></span>
    </li>`;
  }
  const attrs = own ? ' is-own" data-own="live' : '';
  const tile = own
    ? `<span class="tile tile-logo"><img src="assets/logo-192.png" alt="" width="40" height="40" decoding="async"></span>`
    : `<span class="tile"></span>`;
  return `<li class="row is-skel${attrs}" data-slot="${i}">
      ${tile}
      <span class="cell c-name"><i class="sk sk-a"></i><i class="sk sk-b"></i></span>
      <span class="cell c-price" data-label="Price"><i class="sk sk-c"></i></span>
      <span class="cell c-change" data-label="24h"><i class="sk sk-c"></i></span>
      <span class="cell c-vol" data-label="Volume"><i class="sk sk-c"></i></span>
      <span class="cell c-liq" data-label="Liquidity"><i class="sk sk-c"></i></span>
      <span class="cell c-act"></span>
    </li>`;
}

function chip(rec) {
  const val = !isStated(rec) ? 'pending' : rec.label === 'Mint address' ? 'published' : rec.value ? esc(rec.value) : esc(handleOf(rec.url) || 'linked');
  return `<li class="chip${isStated(rec) ? '' : ' is-inert'}" data-record="${esc(rec.label)}"><span class="chip-k">${esc(rec.label)}</span><span class="chip-v">${val}</span></li>`;
}

export function renderPage(register, { faviconHref = 'favicon.svg' } = {}) {
  const r = register.records;
  const pub = JSON.stringify(publicRegister(register)).replace(/</g, '\\u003c');
  const rows = Array.from({ length: 10 }, (_, i) => skelRow(i, r.ca)).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>CAPSULE | Live Solana market board</title>
<meta name="description" content="CAPSULE keeps a live board of the busiest Solana tokens, with its own token pinned on top.">
<meta name="color-scheme" content="dark">
<script>document.documentElement.classList.add("js")</script>
<link rel="canonical" href="https://${esc(r.domain.value)}/">
<link rel="icon" type="image/svg+xml" href="${faviconHref}">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Space+Grotesk:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="assets/tokens.css">
<link rel="stylesheet" href="assets/main.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="progress" id="progress" aria-hidden="true"></div>

<header class="site-header">
  <nav class="bar" aria-label="Primary">
    <a class="brand" href="#top" aria-label="CAPSULE home">
      <span class="brand-tile"><img src="assets/logo-192.png" alt="" width="32" height="32" decoding="async"></span>
      <span class="brand-word">CAPSULE</span>
    </a>
    <div class="socials" aria-label="Social links">
      ${social(r.x, X_ICON, 'x')}
      ${social(r.github, GITHUB_ICON, 'github')}
    </div>
  </nav>
  ${caSlot(r.ca)}
</header>

<main id="main">
<section class="hero" id="top" data-reveal-group>
  <div class="hero-visual" aria-hidden="true">
    <div class="layer mesh" data-depth="0.12"></div>
    <div class="layer glow" data-depth="0.3"></div>
    <div class="layer capsule-art" data-depth="0.6"><span class="capsule-mask"></span><span class="capsule-mask is-reflection"></span></div>
    <div class="layer floor" data-depth="0.9"></div>
  </div>
  <div class="wrap hero-copy">
    <p class="mono eyebrow" data-reveal>[ CAPSULE / BOARD ]</p>
    <h1 data-reveal>Capsule.</h1>
    <p class="mono tagline" data-reveal>SEAL → TRACK → DECIDE</p>
    <p class="lead" data-reveal>One pill.<br>Every move across Solana, in view.</p>
    <p class="body" data-reveal>Capsule keeps a running board of the busiest Solana tokens beside its own. Prices breathe in, numbers settle, and nothing waits on a refresh.</p>
    <div class="cta-row" data-reveal>
      <a class="btn btn-primary" href="#board">Open the board</a>
      <span class="pill" id="pill" data-state="sync"><i class="dot"></i><span id="pill-text">Syncing</span></span>
    </div>
    <p class="mono note" data-reveal>Figures stream from public pair feeds. Treat them as signals, never advice.</p>
  </div>
  <p class="mono fig" aria-hidden="true">PLATE 01 / THE UNIT</p>
</section>

<div class="ticker" aria-label="Live ticker" id="ticker"><div class="ticker-track" id="ticker-track"><span class="ticker-empty mono">Listening for the first prints</span></div></div>

<section class="wrap section" id="board" data-reveal-group>
  <div class="head" data-reveal>
    <h2>Market board</h2>
    <p class="sub">Ten rows, ranked by traded volume over the last day. Row one always belongs to Capsule.</p>
  </div>

  <div class="tiles" data-reveal>
    <div class="tile-stat spot"><span class="k mono">Rows tracked</span><b class="v" id="st-count" data-count>—</b></div>
    <div class="tile-stat spot"><span class="k mono">Board volume</span><b class="v" id="st-vol">—</b></div>
    <div class="tile-stat spot"><span class="k mono">Board depth</span><b class="v" id="st-liq">—</b></div>
    <div class="tile-stat spot"><span class="k mono">Strongest mover</span><b class="v" id="st-top">—</b></div>
  </div>

  <div class="panel" data-reveal>
    <div class="panel-head mono">
      <span>Token</span><span class="h-price">Price</span><span class="h-change">24h</span><span class="h-vol">Volume</span><span class="h-liq">Liquidity</span><span class="h-act"></span>
    </div>
    <ol class="board" id="board-list">
${rows}
    </ol>
    <p class="feed-error" id="feed-error" hidden role="status">Feed unreachable. Retrying quietly.</p>
  </div>
</section>

<section class="wrap section" data-reveal-group>
  <div class="head" data-reveal><h2>Three habits</h2></div>
  <div class="cards">
    <article class="card spot" data-reveal><p class="mono k">[ 01 / WATCH ]</p><h3>Watch</h3><p>Rows reorder themselves by volume while the tab stays open, and a flash marks every change.</p></article>
    <article class="card spot" data-reveal><p class="mono k">[ 02 / COMPARE ]</p><h3>Compare</h3><p>Line up price, momentum and depth side by side before reaching for a swap.</p></article>
    <article class="card spot" data-reveal><p class="mono k">[ 03 / VERIFY ]</p><h3>Verify</h3><p>Copy any mint, then check it on the explorer of your choice. Trust the address, not the logo.</p></article>
  </div>
</section>
</main>

<footer class="site-footer">
  <div class="wrap foot">
    <ul class="chips" aria-label="Records">
${[r.chain, r.market, r.ca, r.x, r.github].map(chip).join('\n')}
    </ul>
    <p class="mono">CAPSULE / Market board</p>
    <p class="mono">A community project. Nothing here is financial advice.</p>
  </div>
</footer>

<script type="application/json" id="register">${pub}</script>
<script type="module" src="assets/app.js"></script>
</body>
</html>
`;
}
