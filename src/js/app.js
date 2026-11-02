import {
  loadTrending, loadOwn, composeBoard, createPoller,
  fmtPrice, fmtCompact, fmtPct, letterOf, DASH
} from './core.js';
import { initReveal, initProgress, initParallax, initSpotlight, countTo, flash, reduced } from './motion.js';

const register = JSON.parse(document.getElementById('register').textContent);
const caRec = register.ca;
const caStated = caRec && caRec.state === 'stated';
const FALLBACK_LOGO = 'assets/logo-192.png';
const COPY_PATH = 'M9 9h10v10H9zM5 15V5h10';

const $ = (s, r = document) => r.querySelector(s);
const board = $('#board-list');
const pill = $('#pill');
const pillText = $('#pill-text');
const errorBox = $('#feed-error');
let hasData = false;

/* copy with feedback */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn || btn.disabled) return;
  const ok = await copyText(btn.dataset.copy);
  btn.classList.toggle('is-done', ok);
  const label = btn.querySelector('.btn-text');
  if (label) label.textContent = ok ? label.dataset.done : 'Press Ctrl+C';
  const live = $('#ca-live');
  if (live && btn.id === 'ca-copy') live.textContent = ok ? 'Address copied' : 'Copy failed';
  setTimeout(() => {
    btn.classList.remove('is-done');
    if (label) label.textContent = label.dataset.idle || 'Copy';
    if (live) live.textContent = '';
  }, 1600);
});

/* helpers */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const copyBtn = (row) => `<button class="copy-btn" type="button" data-copy="${esc(row.address)}" aria-label="Copy address for ${esc(row.symbol || row.name || 'token')}"><svg class="ico-stroke" viewBox="0 0 24 24" aria-hidden="true"><path d="${COPY_PATH}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg></button>`;

function setTile(tileEl, row) {
  tileEl.textContent = '';
  tileEl.classList.remove('tile-logo');
  const letter = () => { tileEl.textContent = letterOf(row); tileEl.classList.remove('tile-logo'); };
  if (!row.imageUrl) return letter();
  const img = new Image();
  img.alt = ''; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => {
    if (row.own && img.getAttribute('src') !== FALLBACK_LOGO) { img.src = FALLBACK_LOGO; tileEl.classList.add('tile-logo'); }
    else letter();
  });
  if (row.imageUrl === FALLBACK_LOGO) tileEl.classList.add('tile-logo');
  img.src = row.imageUrl;
  tileEl.appendChild(img);
}

function setCell(el, value, fmt, kind) {
  const prev = el.dataset.v === undefined ? null : parseFloat(el.dataset.v);
  const next = value === null || value === undefined ? null : value;
  el.dataset.v = next === null ? '' : String(next);
  if (next === null) { el.textContent = DASH; return; }
  if (kind === 'change') { el.classList.toggle('up', next >= 0); el.classList.toggle('dn', next < 0); }
  if (prev !== null && !Number.isNaN(prev) && prev !== next) {
    countTo(el, prev, next, fmt);
    flash(el, next - prev);
  } else el.textContent = fmt(next);
}

function fillRow(li, row, index) {
  const sameToken = li.dataset.addr === row.address;
  li.dataset.addr = row.address;
  if (!sameToken || li.classList.contains('is-skel')) {
    li.classList.remove('is-skel', 'is-in');
    setTile(li.querySelector('.tile'), row);
    const link = row.url ? `<a href="${esc(row.url)}" target="_blank" rel="noopener noreferrer">${esc(row.symbol || row.name)}</a>` : esc(row.symbol || row.name);
    li.querySelector('.c-name').innerHTML = `<b class="sym">${link}</b><small class="nm">${esc(row.name)}</small>`;
    for (const k of ['price', 'change', 'vol', 'liq']) { const c = li.querySelector('.c-' + k); c.textContent = ''; delete c.dataset.v; }
    li.querySelector('.c-act').innerHTML = copyBtn(row);
    li.style.setProperty('--i', String(index));
    void li.offsetWidth;
    li.classList.add('is-in');
  }
  setCell(li.querySelector('.c-price'), row.price, fmtPrice);
  setCell(li.querySelector('.c-change'), row.change, fmtPct, 'change');
  setCell(li.querySelector('.c-vol'), row.volume, fmtCompact);
  const liq = li.querySelector('.c-liq');
  liq.title = row.liquidityLabel === 'Mkt Cap' ? 'Mkt Cap' : 'Liquidity';
  liq.dataset.label = row.liquidityLabel === 'Mkt Cap' ? 'Mkt Cap' : 'Liquidity';
  setCell(liq, row.liquidity, fmtCompact);
}

function dashRow(li) {
  li.classList.remove('is-skel');
  li.querySelectorAll('.cell:not(.c-name)').forEach((c) => { c.textContent = DASH; });
  const n = li.querySelector('.c-name'); if (n) n.innerHTML = `<b class="sym">${DASH}</b>`;
  const t = li.querySelector('.tile'); if (t && !t.classList.contains('tile-logo')) t.textContent = DASH;
}

/* stats and ticker */
const stat = { count: null, vol: null, liq: null };
function renderStats(all, ownRow) {
  const count = all.length;
  const vol = all.reduce((s, r) => s + (r.volume || 0), 0);
  const liq = all.reduce((s, r) => s + (r.liquidityLabel === 'Mkt Cap' ? 0 : (r.liquidity || 0)), 0);
  countTo($('#st-count'), stat.count, count, (v) => String(Math.round(v)));
  countTo($('#st-vol'), stat.vol, vol, fmtCompact);
  countTo($('#st-liq'), stat.liq, liq, fmtCompact);
  stat.count = count; stat.vol = vol; stat.liq = liq;
  const movers = all.filter((r) => r.change !== null && r.change !== undefined).sort((a, b) => b.change - a.change);
  $('#st-top').textContent = movers.length ? `${movers[0].symbol || movers[0].name} ${fmtPct(movers[0].change)}` : DASH;
}
function renderTicker(all) {
  const track = $('#ticker-track');
  const item = (r) => `<span class="t-item"><b>${esc(r.symbol || r.name)}</b><span>${fmtPrice(r.price)}</span><span class="${(r.change || 0) >= 0 ? 'up' : 'dn'}">${fmtPct(r.change)}</span></span>`;
  const html = all.map(item).join('');
  track.innerHTML = reduced() ? html : html + html.replace(/class="t-item"/g, 'class="t-item" aria-hidden="true"');
}

function setStatus(state, text) {
  pill.dataset.state = state;
  pillText.textContent = text;
}

/* one refresh cycle */
async function refresh() {
  const [trend, own] = await Promise.allSettled([
    loadTrending(),
    caStated ? loadOwn(caRec.value, { fallbackLogo: FALLBACK_LOGO }) : Promise.resolve(null)
  ]);
  if (trend.status === 'rejected') {
    if (hasData) { setStatus('off', 'Retrying'); return; }
    setStatus('off', 'Offline');
    errorBox.hidden = false;
    board.querySelectorAll('.row.is-skel').forEach(dashRow);
    return;
  }
  errorBox.hidden = true;
  const ownRow = own.status === 'fulfilled' ? own.value : null;
  const { rows } = composeBoard(ownRow, trend.value);
  const items = [...board.children];
  if (caStated && ownRow) fillRow(items[0], ownRow, 0);
  rows.forEach((r, i) => fillRow(items[i + 1], r, i + 1));
  for (let i = rows.length + 1; i < items.length; i += 1) dashRow(items[i]);
  const all = (ownRow && ownRow.price !== null ? [ownRow] : []).concat(rows);
  renderStats(all, ownRow);
  renderTicker(all.length ? all : trend.value);
  hasData = true;
  setStatus('live', 'Live');
}

initReveal();
initProgress();
initParallax();
initSpotlight();
createPoller({ task: refresh, interval: 60000, doc: document }).start();
