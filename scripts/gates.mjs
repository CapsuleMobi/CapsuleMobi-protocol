import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { build, root, tokenMap } from './build.mjs';
import { renderPage, handleOf, isStated } from './render.mjs';
import { X_ICON, GITHUB_ICON } from '../src/icons.js';
import * as core from '../src/js/core.js';

const P = (...a) => join(root, ...a);
const read = (...a) => readFileSync(P(...a), 'utf8');
const register = JSON.parse(read('register.json'));
const results = [];
async function gate(name, fn) {
  try { await fn(); results.push([name, true]); console.log('PASS', name); }
  catch (e) { results.push([name, false, e.message]); console.log('FAIL', name, '::', e.message); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => ok(a === b, `${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

function walk(dir, skip = []) {
  const out = [];
  for (const n of readdirSync(dir)) {
    if (skip.includes(n)) continue;
    const f = join(dir, n);
    statSync(f).isDirectory() ? out.push(...walk(f, skip)) : out.push(f);
  }
  return out;
}

/* variants: every expectation is derived from the record state read at runtime, never hardcoded */
const TEST_CA = 'z3kQ9TnVx7WmB2YcLhRu8DpJe4AsGt6NoPq5HbKvpump';
const withRecords = (extra) => structuredClone({ records: { ...register.records, ...extra } });
const variants = {
  current: register,
  allStated: withRecords({
    ca: { label: 'Mint address', state: 'stated', value: TEST_CA, source: 'harness' },
    x: { label: 'X', state: 'stated', url: 'https://x.com/capsule_test', source: 'harness' },
    github: { label: 'GitHub', state: 'stated', url: 'https://github.com/capsule-test/capsule', source: 'harness' }
  }),
  allAbsent: withRecords({
    ca: { label: 'Mint address', state: 'absent' },
    x: { label: 'X', state: 'absent' },
    github: { label: 'GitHub', state: 'absent' }
  }),
  unconfirmed: withRecords({
    ca: { label: 'Mint address', state: 'unconfirmed' },
    x: { label: 'X', state: 'unconfirmed' },
    github: { label: 'GitHub', state: 'unconfirmed' }
  })
};
const pages = Object.fromEntries(Object.entries(variants).map(([k, v]) => [k, renderPage(v)]));
const section = (html, re) => (html.match(re) || [''])[0];
const statedValues = (reg) => Object.values(reg.records).filter(isStated).map((r) => r.value).filter(Boolean);

const distDir = build();
const distFiles = walk(distDir).map((f) => relative(distDir, f).replace(/\\/g, '/'));
const distText = (f) => readFileSync(join(distDir, f), 'utf8');
const distHtml = distText('index.html');

await gate('dist: index, favicon, assets all emitted', () => {
  for (const f of ['index.html', 'favicon.svg', 'assets/tokens.css', 'assets/main.css', 'assets/app.js', 'assets/core.js', 'assets/motion.js', 'assets/capsule-logo.png', 'assets/logo-192.png', 'assets/apple-touch-icon.png'])
    ok(distFiles.includes(f), 'missing dist/' + f);
});

await gate('register: states valid, inert records carry no value and no url, stated carry source', () => {
  for (const [k, r] of Object.entries(register.records)) {
    ok(['stated', 'absent', 'unconfirmed'].includes(r.state), `${k} state`);
    if (r.state !== 'stated') ok(!('value' in r) && !('url' in r), `${k} inert but carries value or url`);
    else ok(r.source, `${k} stated without source`);
  }
});

await gate('register: chain record is Solana, publicnode rpc, client statement, batch-level', () => {
  const c = register.records.chain;
  eq(c.value, 'Solana', 'chain'); eq(c.rpc, 'https://solana-rpc.publicnode.com', 'rpc');
  eq(c.source, 'client statement', 'source'); eq(c.scope, 'batch-level', 'scope');
});

await gate('register: market-source record drives the feed host', () => {
  const m = register.records.market;
  ok(m.state === 'stated' && m.url === 'https://api.dexscreener.com', 'market record');
  ok(core.BOOSTS_URL.startsWith(m.url) && core.pairsUrl(['a']).startsWith(m.url), 'core urls match market record');
});

for (const [name, reg] of Object.entries(variants)) {
  const html = pages[name];
  await gate(`link rule [${name}]: href only for stated records, derived from stored url`, () => {
    for (const key of ['x', 'github']) {
      const rec = reg.records[key];
      const tag = section(html, new RegExp(`<(a|span) class="social[^>]*data-record="${key}"[^>]*>`));
      ok(tag, `${key} icon missing`);
      if (isStated(rec)) {
        ok(tag.startsWith('<a') && tag.includes(`href="${rec.url}"`), `${key} should link`);
        ok(tag.includes(handleOf(rec.url)), `${key} handle derived from url`);
      } else {
        ok(tag.startsWith('<span') && !/href=/.test(tag), `${key} must be inert without href`);
        ok(/pending/.test(tag), `${key} inert label must say pending`);
      }
    }
  });
  await gate(`CA slot [${name}]: value present only when stated; inert copy disabled`, () => {
    const rec = reg.records.ca;
    const slot = section(html, /<div class="ca-slot[\s\S]*?<\/div>\s*(?=<\/header>)/);
    ok(slot, 'ca slot missing');
    if (isStated(rec)) {
      ok(slot.includes(`>${rec.value}</code>`), 'full address rendered');
      ok(!/disabled/.test(slot), 'copy enabled');
      ok(slot.includes(`data-copy="${rec.value}"`), 'copy payload');
    } else {
      ok(!slot.includes('data-copy') && /disabled/.test(slot) && /pending/.test(slot), 'inert slot');
      eq(core.scanAddresses(slot, []).length, 0, 'no address-shaped value in inert slot');
    }
  });
  await gate(`own row [${name}]: slot 0 follows CA record state`, () => {
    const rec = reg.records.ca;
    const row0 = section(html, /<li class="row[^>]*data-slot="0"[\s\S]*?<\/li>/);
    if (isStated(rec)) ok(/data-own="live"/.test(row0) && /logo-192\.png/.test(row0), 'live own row seeded with fallback logo');
    else {
      ok(/data-own="placeholder"/.test(row0) && /aria-disabled="true"/.test(row0), 'placeholder row');
      ok(/assets\/capsule-logo\.png/.test(row0), 'brand logo in placeholder');
      ok(!/<span class="tile"><\/span>/.test(row0), 'placeholder is not a letter or dot tile');
      ok(row0.includes('· · · · ·') && row0.includes('$0.00'), 'placeholder data');
      ok(!/<a |<button/.test(row0), 'placeholder non-clickable');
    }
  });
}

await gate('social: both icons always rendered, icon only, official marks, never hidden at any breakpoint', () => {
  const css = read('src/main.css');
  for (const [k, html] of Object.entries(pages)) {
    const hdr = section(html, /<div class="socials"[\s\S]*?<\/div>/);
    eq((hdr.match(/class="social[ "]/g) || []).length, 2, `icons in ${k}`);
    ok(hdr.indexOf('data-record="x"') < hdr.indexOf('data-record="github"'), 'x before github');
    eq(hdr.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim(), '', 'no visible text labels');
    ok(hdr.includes(X_ICON.d) && hdr.includes(GITHUB_ICON.d), 'official paths');
  }
  ok(!/\.socials?[^{]*\{[^}]*display:\s*none/.test(css), 'social never display:none');
  eq(X_ICON.viewBox, '0 0 24 24', 'x viewBox'); eq(GITHUB_ICON.viewBox, '0 0 16 16', 'octicon viewBox');
});

await gate('palette: hex literals only in tokens.css (plus generated favicon), tokens match real pixels', () => {
  for (const f of distFiles) {
    if (f === 'assets/tokens.css' || f === 'favicon.svg' || extname(f) === '.png') continue;
    ok(!/#[0-9a-fA-F]{3,8}(?![\w-])/.test(distText(f).replace(/href="#[\w-]+"/g, '')), `hex literal in dist/${f}`);
  }
  for (const f of ['src/main.css', 'src/js/core.js', 'src/js/motion.js', 'src/js/app.js', 'scripts/render.mjs'])
    ok(!/#[0-9a-fA-F]{6}(?![\w-])/.test(read(f)), `hex literal in ${f}`);
  const proof = JSON.parse(read('brand/palette-proof.json'));
  for (const [k, v] of Object.entries(tokenMap())) {
    ok(proof[k], `${k} lacks pixel proof`);
    eq(proof[k].hex.toLowerCase(), v.toLowerCase(), `${k} vs sampled pixel`);
  }
  ok(/k-means/.test(read('src/tokens.css')) && /snapped/.test(read('src/tokens.css')), 'provenance comment');
});

await gate('favicon: 32x32 svg, no comments, no double hyphen, linked, traced path', () => {
  const s = distText('favicon.svg');
  ok(/width="32"/.test(s) && /height="32"/.test(s) && /viewBox="0 0 32 32"/.test(s), 'size');
  ok(!s.includes('<!--') && !s.includes('--'), 'comment or double hyphen');
  ok(/ d="M[\d. ]+h/.test(s) && s.length > 1500, 'traced path');
  ok(/rel="icon" type="image\/svg\+xml" href="favicon.svg"/.test(distHtml), 'linked');
});

await gate('no dates, times or clock strings anywhere in dist', () => {
  const dateRe = [/\b\d{4}-\d{2}-\d{2}\b/, /\b\d{1,2}[:.]\d{2}(:\d{2})?\s?(am|pm|utc|gmt)\b/i, /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,4}\b/i, /\bas of\b|\bchecked\b|\bupdated\b|\blast sync/i, /\b(19|20)\d{2}\b/];
  const html = distHtml.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, '');
  for (const re of dateRe) ok(!re.test(html), `date-like text ${re}`);
  const reg = distHtml.match(/<script type="application\/json" id="register">([\s\S]*?)<\/script>/)[1];
  ok(!/checked|\d{4}-\d{2}-\d{2}/.test(reg), 'register projection carries dates');
  for (const f of distFiles.filter((x) => /\.(js|css)$/.test(x))) {
    const t = distText(f);
    ok(!/\d{4}-\d{2}-\d{2}/.test(t), `iso date in ${f}`);
    ok(!/new Date|Date\.now|toLocale(Date|Time)String|toISOString|getFullYear|Intl\.DateTimeFormat/.test(t), `date api in ${f}`);
  }
  ok(!existsSync(join(distDir, 'register.json')), 'register.json must not ship');
});

await gate('copy: zero shared 2-grams with the reference corpus', () => {
  const words = (t) => t.toLowerCase().replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').match(/[a-z0-9']+/g) || [];
  const grams = (w) => new Set(w.slice(1).map((x, i) => w[i] + ' ' + x));
  const ref = grams(words(read('scripts/reference-corpus.txt')));
  const shared = [...grams(words(distHtml))].filter((g) => ref.has(g));
  ok(shared.length === 0, 'shared: ' + shared.join(' | '));
});

await gate('motion: reduced-motion CSS kills animation, transitions and reveal; JS honours it', () => {
  const css = read('src/main.css');
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion:reduce)'));
  ok(/animation:none!important/.test(block) && /transition:none!important/.test(block), 'global kill');
  ok(/\.row\.is-own\{animation:none\}/.test(block), 'own pulse off');
  ok(/data-reveal\]\{opacity:1\}/.test(block), 'reveal visible');
  ok(/prefers-reduced-motion: reduce/.test(read('src/js/motion.js')), 'js matchMedia');
  ok(/animation:ownPulse 2s ease-in-out infinite/.test(css) && /border-left:2px solid var\(--color-mint\)/.test(css), 'own row style');
});

await gate('visual layer: progress, pill+dot, skeleton, spotlight, parallax, spring, count-up, stagger', () => {
  ok(/id="progress"/.test(distHtml) && /class="pill"/.test(distHtml) && /class="dot"/.test(distHtml), 'markup');
  ok(/class="sk /.test(distHtml), 'skeleton');
  const css = read('src/main.css'), js = read('src/js/motion.js');
  ok(/\.row::after/.test(css) && /--mx/.test(css), 'spotlight');
  ok(/data-depth/.test(distHtml) && /initParallax/.test(js) && /pointermove/.test(js), 'parallax');
  ok(/stiffness/.test(js) && /damping/.test(js), 'spring solver');
  ok(/countTo/.test(js) && /flash-up/.test(css), 'count-up and flash');
  ok(/@keyframes fadeIn/.test(css) && /--i/.test(css), 'stagger fade');
});

await gate('mobile rules: no ch units, 44px tap targets declared', () => {
  const css = read('src/main.css');
  ok(!/\d\s?ch\b/.test(css), 'ch unit');
  for (const sel of ['.social', '.copy-btn']) ok(new RegExp(`\\${sel}\\{[^}]*width:44px;height:44px`).test(css), `${sel} 44x44`);
  ok(/\.btn\{[^}]*min-height:44px;min-width:44px/.test(css), '.btn 44');
  ok(/\.brand\{[^}]*min-height:44px/.test(css), '.brand 44');
});

await gate('repo: required files, outside dist, MIT 2026, no attribution text, no agent config', () => {
  for (const f of ['README.md', 'docs/whitepaper.md', 'LICENSE']) ok(existsSync(P(f)), 'missing ' + f);
  ok(!distFiles.some((f) => /README|whitepaper|LICENSE/i.test(f)), 'repo docs leaked into dist');
  ok(/MIT License/.test(read('LICENSE')) && /Copyright \(c\) 2026 CAPSULE/.test(read('LICENSE')), 'license');
  const agent = 'cl' + 'aude';
  ok(!existsSync(P(agent.toUpperCase() + '.md')) && !existsSync(P('.' + agent)), 'forbidden agent files');
  const bad = new RegExp(['cl' + 'aude', 'anthr' + 'opic', 'co-' + 'authored', 'generated ' + 'with', '\\bA' + 'I\\b'].join('|'), 'i');
  for (const f of walk(root, ['node_modules', 'brand', 'reference', '.git'])) {
    if (/\.(png|jpe?g|ico)$/i.test(f)) continue;
    ok(!bad.test(readFileSync(f, 'utf8')), 'attribution text in ' + relative(root, f));
  }
});

await gate('address scanner: no blanket 0x reject, matches stated registry, CA exempt', () => {
  const caVal = variants.allStated.records.ca.value;
  eq(core.scanAddresses('colour 0xff and 0x1234 are fine', []).length, 0, '0x hex must not be blanket-rejected');
  const evm = '0x' + 'a1'.repeat(20);
  eq(core.scanAddresses(`see ${evm}`, []).length, 1, 'unstated evm address flagged');
  eq(core.scanAddresses(`see ${evm}`, [evm]).length, 0, 'stated evm address passes');
  eq(core.scanAddresses(`mint ${caVal}`, [caVal]).length, 0, 'CA exempt when stated');
  eq(core.scanAddresses(`mint ${caVal}`, []).length, 1, 'unstated base58 flagged');
  for (const [k, html] of Object.entries(pages)) {
    const hit = core.scanAddresses(html, statedValues(variants[k]));
    eq(hit.length, 0, `[${k}] stray address-shaped strings: ${hit}`);
  }
  for (const f of distFiles.filter((x) => /\.(js|css|html)$/.test(x))) {
    const hit = core.scanAddresses(distText(f), statedValues(register));
    eq(hit.length, 0, `${f} stray address-shaped: ${hit}`);
  }
});

/* runtime logic with injected fetch */
const jsonRes = (body, good = true) => ({ ok: good, status: good ? 200 : 500, json: async () => body });
const OTHER = (n) => `So${String(n).padStart(2, '0')}x7Qm2LwKfRt9YbZp4HcVnDa6JgEu3XsN8Wk`;
const noSleep = async () => {};
function mockFeed({ ca = TEST_CA, own = true, pump = true, noLogos = false, liq0 = false } = {}) {
  const calls = [];
  const boosts = [{ chainId: 'solana', tokenAddress: ca, icon: 'i' }, { chainId: 'ethereum', tokenAddress: 'zzz' }]
    .concat(Array.from({ length: 12 }, (_, i) => ({ chainId: 'solana', tokenAddress: OTHER(i), icon: noLogos ? null : `https://img/${i}.png` })));
  const mkPair = (addr, vol, extra = {}) => ({ chainId: 'solana', url: 'https://dexscreener.com/solana/' + addr.slice(0, 6), baseToken: { address: addr, symbol: 'S' + addr.slice(2, 4), name: 'Name' + addr.slice(2, 4) }, priceUsd: '0.00001234', priceChange: { h24: 5.5 }, volume: { h24: vol }, liquidity: { usd: 1000 }, marketCap: 9999, ...extra });
  const fetchFn = async (url) => {
    calls.push(url);
    if (url === core.BOOSTS_URL) return jsonRes(boosts);
    if (url.startsWith('https://api.dexscreener.com/tokens/v1/solana/')) {
      const addrs = url.split('/').pop().split(',');
      const pairs = addrs.filter((a) => a !== ca).flatMap((a, i) => [mkPair(a, 1000 * (i + 1)), mkPair(a, 5 * (i + 1))]);
      if (addrs.includes(ca)) pairs.push(mkPair(ca, 777777));
      return jsonRes(pairs);
    }
    if (url.startsWith('https://api.dexscreener.com/latest/dex/tokens/')) {
      if (!own) return jsonRes({ pairs: [] });
      return jsonRes({ pairs: [mkPair(ca, 10, { liquidity: liq0 ? { usd: 0 } : { usd: 500 } }), mkPair(ca, 4000, { liquidity: liq0 ? { usd: 0 } : { usd: 2500 } }), mkPair(OTHER(99), 99999999)] });
    }
    if (url.startsWith('https://frontend-api.pump.fun/coins/')) return pump ? jsonRes({ image_uri: 'https://pump/img.png', symbol: 'CAP' }) : jsonRes({}, false);
    throw new Error('unexpected ' + url);
  };
  return { fetchFn, calls };
}

await gate('market: solana-only, top 10 by 24h volume, best pair per token, identical with or without CA', async () => {
  const a = mockFeed({ ca: TEST_CA }), b = mockFeed({ ca: TEST_CA });
  const t1 = await core.loadTrending({ fetchFn: a.fetchFn, sleepFn: noSleep });
  const t2 = await core.loadTrending({ fetchFn: b.fetchFn, sleepFn: noSleep });
  eq(t1.length, 10, 'ten rows');
  ok(t1.every((r, i) => i === 0 || t1[i - 1].volume >= r.volume), 'sorted desc');
  ok(!t1.some((r) => r.address === 'zzz'), 'non-solana dropped');
  ok(t1.every((r) => r.volume >= 1000), 'best pair chosen');
  eq(JSON.stringify(a.calls), JSON.stringify(b.calls), 'identical requests regardless of CA');
  eq(JSON.stringify(t1), JSON.stringify(t2), 'identical data');
  ok(a.calls.length === 2 && !a.calls.some((u) => /latest\/dex|pump\.fun/.test(u)), 'trending never touches own-token endpoints');
  ok(!/caStated|caRec/.test(read('src/js/core.js').split('export async function loadOwn')[0]), 'trending code does not read CA state');
});

await gate('own row: parallel fetch, pair by baseToken.address, pump logo, brand fallback, liquidity then mkt cap, logs', async () => {
  const logs = [];
  const m = mockFeed();
  const row = await core.loadOwn(TEST_CA, { fetchFn: m.fetchFn, log: (...a) => logs.push(a[0]), fallbackLogo: 'assets/logo-192.png', sleepFn: noSleep });
  eq(row.volume, 4000, 'highest volume pair'); eq(row.liquidity, 2500, 'liquidity usd'); eq(row.liquidityLabel, 'Liquidity', 'label');
  eq(row.imageUrl, 'https://pump/img.png', 'pump logo'); eq(row.address, TEST_CA, 'ca');
  ok(!/dd\.dexscreener/.test(read('src/js/core.js') + read('src/js/app.js')), 'no dexscreener cdn logo');
  ok(logs.includes('[capsule] own token raw response') && logs.includes('[capsule] own liquidity candidates'), 'console logs');
  const m2 = mockFeed({ pump: false, liq0: true });
  const r2 = await core.loadOwn(TEST_CA, { fetchFn: m2.fetchFn, log: () => {}, fallbackLogo: 'assets/logo-192.png', sleepFn: noSleep });
  eq(r2.imageUrl, 'assets/logo-192.png', 'fallback logo'); eq(r2.liquidity, 9999, 'mkt cap fallback'); eq(r2.liquidityLabel, 'Mkt Cap', 'mkt cap label');
  ok(m.calls.some((u) => /latest\/dex/.test(u)) && m.calls.some((u) => /pump\.fun/.test(u)), 'both endpoints called');
  ok(/Promise\.all\(\[\s*fetchJson\(ownDexUrl/.test(read('src/js/core.js')), 'Promise.all in source');
  ok(/liq\.title/.test(read('src/js/app.js')), 'mkt cap label via title attribute');
});

await gate('own row: pinned first and deduped from trending rows 2-10', async () => {
  const m = mockFeed();
  const trend = await core.loadTrending({ fetchFn: m.fetchFn, sleepFn: noSleep });
  ok(trend.some((r) => r.address === TEST_CA), 'own appears in trending for the test');
  const own = await core.loadOwn(TEST_CA, { fetchFn: m.fetchFn, log: () => {}, fallbackLogo: 'x', sleepFn: noSleep });
  const b = core.composeBoard(own, trend);
  ok(b.rows.length === 9 && !b.rows.some((r) => r.address === TEST_CA), 'deduped, nine rows below');
  eq(core.composeBoard(null, trend).rows.length, 9, 'absent branch: nine trending rows under placeholder');
});

await gate('letter tile: fallback path, two or more rows without imageUrl handled, own row never a letter tile', async () => {
  const m = mockFeed({ noLogos: true });
  const trend = await core.loadTrending({ fetchFn: m.fetchFn, sleepFn: noSleep });
  const missing = trend.filter((r) => !r.imageUrl);
  ok(missing.length >= 2, 'at least two rows lack imageUrl in the scenario');
  ok(missing.every((r) => /^[A-Z0-9]$/.test(core.letterOf(r))), 'letter derived');
  const app = read('src/js/app.js');
  ok(/const letter = \(\) =>/.test(app) && /addEventListener\('error'/.test(app), 'error fallback to letter');
  ok(/row\.own && img\.getAttribute\('src'\) !== FALLBACK_LOGO/.test(app), 'own row falls back to brand logo, not a letter');
});

await gate('backoff: exponential delays, rejects after retries; last good data kept on refresh failure', async () => {
  const delays = []; let n = 0;
  await core.fetchJson('u', { fetchFn: async () => { n += 1; if (n < 4) throw new Error('x'); return jsonRes({ ok: 1 }); }, sleepFn: async (d) => delays.push(d), base: 100, retries: 3 });
  eq(JSON.stringify(delays), '[100,200,400]', 'delays');
  let threw = false;
  try { await core.fetchJson('u', { fetchFn: async () => jsonRes({}, false), sleepFn: noSleep, retries: 2 }); } catch { threw = true; }
  ok(threw, 'rejects after retries');
  const app = read('src/js/app.js');
  ok(/if \(hasData\) \{ setStatus\('off', 'Retrying'\); return; \}/.test(app), 'last good data kept');
  ok(/DASH/.test(app) && /feed-error/.test(app), 'dash and error');
});

await gate('poller: 60s cadence, immediate fetch when visible, paused while hidden', async () => {
  const listeners = {};
  const doc = { hidden: false, addEventListener: (e, f) => { listeners[e] = f; }, removeEventListener() {} };
  const timers = []; let runs = 0;
  const fake = { set: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clear() {} };
  const poller = core.createPoller({ task: async () => { runs += 1; }, interval: 60000, doc, timers: fake });
  poller.start();
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  eq(runs, 1, 'immediate first run'); eq(timers.at(-1).ms, 60000, 'interval');
  doc.hidden = true; listeners.visibilitychange(); const before = runs;
  await timers.at(-1).f(); eq(runs, before, 'no run while hidden');
  doc.hidden = false; listeners.visibilitychange();
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  eq(runs, before + 1, 'immediate fetch on visible');
  ok(/interval: 60000/.test(read('src/js/app.js')), 'app uses 60000');
});

await gate('formatting: dash on null, subscript tiny prices, compact units', () => {
  eq(core.fmtPrice(null), '—', 'dash'); ok(/^\$0\.0[₀-₉]+\d+$/.test(core.fmtPrice(0.0000123)), 'subscript form');
  eq(core.fmtCompact(1234567), '$1.23M', 'compact'); eq(core.fmtPct(-3), '▼ 3.00%', 'pct');
});

await gate('board markup: ten rows, ticker, hidden error slot, marquee keyframes', () => {
  eq((distHtml.match(/<li class="row/g) || []).length, 10, 'ten rows');
  ok(/id="ticker-track"/.test(distHtml) && /id="feed-error" hidden/.test(distHtml), 'ticker and error slot');
  ok(/@keyframes marquee/.test(read('src/main.css')), 'marquee');
});

const failed = results.filter((r) => !r[1]);
console.log(`\ngates: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
