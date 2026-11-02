export const BOOSTS_URL = 'https://api.dexscreener.com/token-boosts/top/v1';
export const pairsUrl = (addresses) => `https://api.dexscreener.com/tokens/v1/solana/${addresses.join(',')}`;
export const ownDexUrl = (ca) => `https://api.dexscreener.com/latest/dex/tokens/${ca}`;
export const ownPumpUrl = (ca) => `https://frontend-api.pump.fun/coins/${ca}`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(+v) ? +v : null);

export async function fetchJson(url, { fetchFn = fetch, retries = 3, base = 600, sleepFn = wait, onRetry } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetchFn(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= retries) throw err;
      const delay = base * 2 ** attempt;
      if (onRetry) onRetry(attempt + 1, delay, err);
      await sleepFn(delay);
      attempt += 1;
    }
  }
}

export function normalizePair(pair, icon) {
  return {
    address: pair.baseToken.address,
    symbol: pair.baseToken.symbol || '',
    name: pair.baseToken.name || '',
    imageUrl: (pair.info && pair.info.imageUrl) || icon || null,
    price: num(pair.priceUsd),
    change: num(pair.priceChange && pair.priceChange.h24),
    volume: num(pair.volume && pair.volume.h24),
    liquidity: num(pair.liquidity && pair.liquidity.usd),
    marketCap: num(pair.marketCap),
    url: pair.url || null
  };
}

export function bestPairs(pairs, icons = {}, wanted) {
  const best = new Map();
  for (const p of pairs || []) {
    if (!p || !p.baseToken || p.chainId !== 'solana') continue;
    const addr = p.baseToken.address;
    if (wanted && !wanted.has(addr)) continue;
    const vol = num(p.volume && p.volume.h24) || 0;
    const cur = best.get(addr);
    if (!cur || vol > cur.vol) best.set(addr, { vol, p });
  }
  return [...best.values()].map(({ p }) => normalizePair(p, icons[p.baseToken.address]));
}

export async function loadTrending(opts = {}) {
  const boosts = await fetchJson(BOOSTS_URL, opts);
  const list = (Array.isArray(boosts) ? boosts : []).filter((b) => b && b.chainId === 'solana' && b.tokenAddress);
  const icons = {};
  const addresses = [];
  for (const b of list) {
    if (icons[b.tokenAddress] !== undefined) continue;
    icons[b.tokenAddress] = b.icon || null;
    addresses.push(b.tokenAddress);
  }
  if (!addresses.length) return [];
  const pairs = await fetchJson(pairsUrl(addresses.slice(0, 30)), opts);
  return bestPairs(pairs, icons, new Set(addresses))
    .sort((a, b) => (b.volume || 0) - (a.volume || 0))
    .slice(0, 10);
}

export async function loadOwn(ca, { fetchFn = fetch, log = console.log, fallbackLogo, ...rest } = {}) {
  const [dex, pump] = await Promise.all([
    fetchJson(ownDexUrl(ca), { fetchFn, retries: 1, ...rest }).catch(() => null),
    fetchJson(ownPumpUrl(ca), { fetchFn, retries: 0, ...rest }).catch(() => null)
  ]);
  log('[capsule] own token raw response', { dex, pump });
  const pairs = ((dex && dex.pairs) || [])
    .filter((p) => p && p.baseToken && p.baseToken.address === ca)
    .sort((a, b) => (num(b.volume && b.volume.h24) || 0) - (num(a.volume && a.volume.h24) || 0));
  const pair = pairs[0];
  const imageUrl = (pump && pump.image_uri) || fallbackLogo;
  const symbol = (pair && pair.baseToken.symbol) || (pump && pump.symbol) || 'CAPSULE';
  const name = (pair && pair.baseToken.name) || (pump && pump.name) || '';
  if (!pair) return { own: true, address: ca, symbol, name, imageUrl, price: null, change: null, volume: null, liquidity: null, liquidityLabel: 'Liquidity', url: null };
  const liq = num(pair.liquidity && pair.liquidity.usd);
  const cap = num(pair.marketCap);
  log('[capsule] own liquidity candidates', { liquidityUsd: liq, marketCap: cap });
  const useLiq = liq !== null && liq > 0;
  return {
    own: true,
    address: ca,
    symbol,
    name,
    imageUrl,
    price: num(pair.priceUsd),
    change: num(pair.priceChange && pair.priceChange.h24),
    volume: num(pair.volume && pair.volume.h24),
    liquidity: useLiq ? liq : cap,
    liquidityLabel: useLiq ? 'Liquidity' : 'Mkt Cap',
    url: pair.url || null
  };
}

export function composeBoard(ownRow, trending) {
  const rest = trending.filter((t) => !ownRow || ownRow.address !== t.address).slice(0, 9);
  return { own: ownRow, rows: rest };
}

export function createPoller({ task, interval = 60000, doc, timers = { set: (f, ms) => setTimeout(f, ms), clear: (h) => clearTimeout(h) } }) {
  let handle = null;
  let running = false;
  let started = false;
  const schedule = () => {
    timers.clear(handle);
    handle = doc.hidden ? null : timers.set(tick, interval);
  };
  async function tick() {
    if (doc.hidden || running) return schedule();
    running = true;
    try { await task(); } finally { running = false; schedule(); }
  }
  const onVis = () => {
    if (doc.hidden) { timers.clear(handle); handle = null; } else tick();
  };
  return {
    start() { if (started) return; started = true; doc.addEventListener('visibilitychange', onVis); tick(); },
    stop() { started = false; timers.clear(handle); doc.removeEventListener('visibilitychange', onVis); }
  };
}

const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
export const DASH = '—';
export function fmtPrice(v) {
  if (v === null || v === undefined) return DASH;
  if (v >= 1) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (v >= 0.0001) return '$' + v.toPrecision(4).replace(/0+$/, '');
  if (v === 0) return '$0.00';
  const exp = Math.floor(Math.log10(v));
  const zeros = -exp - 1;
  const digits = Math.round(v / 10 ** exp * 1000).toString().padStart(4, '0').slice(0, 4).replace(/0+$/, '') || '0';
  return '$0.0' + String(zeros).split('').map((d) => SUB[+d]).join('') + digits;
}
export function fmtCompact(v) {
  if (v === null || v === undefined) return DASH;
  const abs = Math.abs(v);
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [n, s] of units) if (abs >= n) return '$' + (v / n).toFixed(abs / n >= 100 ? 0 : 2).replace(/\.?0+$/, '') + s;
  return '$' + v.toFixed(0);
}
export function fmtPct(v) {
  if (v === null || v === undefined) return DASH;
  const a = Math.abs(v);
  return (v >= 0 ? '▲ ' : '▼ ') + a.toFixed(a >= 1000 ? 0 : a >= 100 ? 1 : 2) + '%';
}
export const letterOf = (row) => ((row.symbol || row.name || '?').trim().charAt(0) || '?').toUpperCase();
export const shortAddr = (a) => (a && a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a || '');

const ADDRESS_SHAPES = [/\b0x[0-9a-fA-F]{40}\b/g, /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g];
export function scanAddresses(text, stated) {
  const allowed = new Set(stated);
  const out = [];
  for (const re of ADDRESS_SHAPES) for (const m of text.matchAll(re)) if (!allowed.has(m[0])) out.push(m[0]);
  return out;
}
