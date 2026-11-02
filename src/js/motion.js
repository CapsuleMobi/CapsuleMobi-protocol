export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// damped spring, semi-implicit Euler in fixed sub-steps
export function spring({ from = 0, to = 1, stiffness = 170, damping = 20, mass = 1, onUpdate, onDone }) {
  if (reduced()) { onUpdate(to); if (onDone) onDone(); return; }
  let x = from, v = 0, last = performance.now();
  const step = (now) => {
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    while (dt > 0) {
      const h = Math.min(dt, 1 / 240);
      const a = (-stiffness * (x - to) - damping * v) / mass;
      v += a * h;
      x += v * h;
      dt -= h;
    }
    onUpdate(x);
    if (Math.abs(x - to) < 0.0005 && Math.abs(v) < 0.001) { onUpdate(to); if (onDone) onDone(); return; }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function initReveal() {
  const groups = document.querySelectorAll('[data-reveal-group]');
  if (reduced() || !('IntersectionObserver' in window)) {
    document.querySelectorAll('[data-reveal]').forEach((el) => { el.style.opacity = '1'; });
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const items = [...e.target.querySelectorAll('[data-reveal]')];
      items.forEach((el, i) => setTimeout(() => spring({
        onUpdate: (p) => {
          el.style.opacity = String(clamp(p, 0, 1));
          el.style.transform = `translate3d(0,${(1 - p) * 28}px,0)`;
        },
        onDone: () => { el.style.transform = ''; el.style.opacity = '1'; }
      }), i * 80));
    }
  }, { threshold: 0.08 });
  groups.forEach((g) => io.observe(g));
}

export function initProgress() {
  const bar = document.getElementById('progress');
  if (!bar || reduced()) return;
  let ticking = false;
  const upd = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? clamp(window.scrollY / max, 0, 1) : 0})`;
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(upd); } }, { passive: true });
  window.addEventListener('resize', upd);
  upd();
}

export function initParallax() {
  if (reduced()) return;
  const layers = [...document.querySelectorAll('.layer[data-depth]')];
  if (!layers.length) return;
  let px = 0, py = 0, tx = 0, ty = 0, sy = 0, raf = 0;
  const hero = document.querySelector('.hero');
  const loop = () => {
    px += (tx - px) * 0.08;
    py += (ty - py) * 0.08;
    for (const l of layers) {
      const d = parseFloat(l.dataset.depth);
      l.style.transform = `translate3d(${(-px * d * 28).toFixed(2)}px,${(-py * d * 18 + sy * d * 0.14).toFixed(2)}px,0)`;
    }
    raf = Math.abs(tx - px) + Math.abs(ty - py) > 0.001 ? requestAnimationFrame(loop) : 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  window.addEventListener('pointermove', (e) => {
    tx = e.clientX / window.innerWidth - 0.5;
    ty = e.clientY / window.innerHeight - 0.5;
    kick();
  }, { passive: true });
  window.addEventListener('scroll', () => {
    sy = clamp(window.scrollY, 0, hero ? hero.offsetHeight : 800);
    kick();
  }, { passive: true });
}

export function initSpotlight() {
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest && e.target.closest('.row,.card,.tile-stat');
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', `${e.clientX - r.left}px`);
    t.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });
}

const ease = (t) => 1 - Math.pow(1 - t, 3);
export function countTo(el, from, to, fmt, duration = 700) {
  if (reduced() || from === null || from === undefined || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (now) => {
    const t = clamp((now - t0) / duration, 0, 1);
    el.textContent = fmt(from + (to - from) * ease(t));
    if (t < 1) requestAnimationFrame(step); else el.textContent = fmt(to);
  };
  requestAnimationFrame(step);
}

export function flash(el, dir) {
  if (reduced()) return;
  const cls = dir >= 0 ? 'flash-up' : 'flash-down';
  el.classList.remove('flash-up', 'flash-down');
  void el.offsetWidth;
  el.classList.add(cls);
}
