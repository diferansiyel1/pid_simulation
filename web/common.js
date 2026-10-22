/* Ortak yardımcılar: tema, sayı biçimi, PID, birinci derece süreç ve grafik çizimi.
   Üç sayfa da bu dosyayı <head> içinde yükler (tema, sayfa çizilmeden önce uygulanır). */
(function(){
  const root = document.documentElement;

  // ---------- Tema ----------
  const THEME_KEY = 'pid-sim-theme';
  function storedTheme(){ try { return localStorage.getItem(THEME_KEY); } catch(e){ return null; } }
  function storeTheme(t){ try { localStorage.setItem(THEME_KEY, t); } catch(e){ /* depolama kapalı olabilir */ } }
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  function currentTheme(){ return root.dataset.theme || (darkQuery.matches ? 'dark' : 'light'); }
  function setTheme(t, persist){
    root.dataset.theme = t;
    if (persist) storeTheme(t);
    window.dispatchEvent(new Event('themechange'));
  }
  const saved = storedTheme();
  if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
  darkQuery.addEventListener('change', ()=>{ if (!storedTheme()) window.dispatchEvent(new Event('themechange')); });

  function bindThemeToggle(){
    document.querySelectorAll('[data-theme-toggle]').forEach(btn=>{
      const render = ()=>{
        const dark = currentTheme() === 'dark';
        btn.textContent = dark ? '☀ Açık tema' : '☾ Koyu tema';
        btn.setAttribute('aria-pressed', String(dark));
      };
      btn.addEventListener('click', ()=>{ setTheme(currentTheme() === 'dark' ? 'light' : 'dark', true); });
      window.addEventListener('themechange', render);
      render();
    });
  }
  document.addEventListener('DOMContentLoaded', bindThemeToggle);

  // ---------- Sayı biçimi (Türkçe ondalık virgül) ----------
  const fmtCache = {};
  function fmt(x, digits=2){
    const key = digits;
    if (!fmtCache[key]) fmtCache[key] = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return fmtCache[key].format(Math.abs(x) < 0.5 * Math.pow(10, -digits) ? 0 : x);
  }

  function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }

  // ---------- Süreç: birinci derece, y' = (K·(u+d) − y)/τ ----------
  function firstOrder(K, tau){
    let y = 0;
    return {
      reset(){ y = 0; },
      step(u, d, h){ y += (K * (u + d) - y) / tau * h; return y; },
      get y(){ return y; },
      set tau(v){ tau = v; },
      set K(v){ K = v; },
    };
  }

  // ---------- PID ----------
  // Türev varsayılan olarak ölçüm üzerinden alınır (dMode 'measurement'): ayar noktası
  // basamağında "türev tepmesi" oluşmaz. 'error' seçilirse tepme gözlenebilir.
  // tf > 0 ise türev, zaman sabiti tf olan birinci derece filtreden geçer.
  // Anti-windup koşullu integrasyondur: çıkış doymuşken hatayı doyum yönünde biriktirmez.
  class PID {
    constructor({kp=1, ki=0, kd=0, h=0.016, uMin=-5, uMax=5, dMode='measurement', tf=0} = {}){
      Object.assign(this, {kp, ki, kd, h, uMin, uMax, dMode, tf});
      this.reset();
    }
    reset(){ this.i = 0; this.prevY = null; this.prevE = null; this.dF = 0; this.dydt = 0; this.frozen = false; }
    update(e, y, antiWindup=true){
      const P = this.kp * e;
      this.dydt = this.prevY === null ? 0 : (y - this.prevY) / this.h;
      const dedt = this.prevE === null ? 0 : (e - this.prevE) / this.h;
      this.prevY = y; this.prevE = e;
      const dRaw = this.kd * (this.dMode === 'error' ? dedt : -this.dydt);
      this.dF = this.tf > 0 ? this.dF + (dRaw - this.dF) * this.h / (this.tf + this.h) : dRaw;
      const D = this.dF;
      const iNext = this.i + this.ki * e * this.h;
      const uNext = P + iNext + D;
      const windingUp = (uNext > this.uMax && e > 0) || (uNext < this.uMin && e < 0);
      this.frozen = antiWindup && windingUp;
      if (!this.frozen) this.i = iNext;
      const u = clamp(P + this.i + D, this.uMin, this.uMax);
      return { u, P, I: this.i, D, saturated: u !== P + this.i + D };
    }
  }

  // ---------- Tek döngü: ölü zamanlı birinci derece süreç + PID / aç-kapa ----------
  // Süreç: y' = (K·(u(t−θ) + d) − y) / τ, sabit hp adımıyla integre edilir.
  // Kontrolör yalnızca her hc saniyede bir çalışır (sıfır dereceli tutma), böylece
  // örnekleme aralığı ile oynatma hızı birbirinden bağımsızdır.
  // p: parametre nesnesi (her adımda okunur, canlı değişiklikler hemen uygulanır):
  //   mode, kp, ki, kd, dMode, tf, uMin, uMax, antiWindup, hy, uHi, uLo, K, tau, theta, hc, noise
  // r(t), d(t): ayar noktası ve bozucu fonksiyonları
  const STEP_TIME = 1.0; // ayar noktası basamağı t = 1 s'de uygulanır
  class SingleLoop {
    constructor(p, {r, d, hp=0.002} = {}){
      this.p = p; this.hp = hp;
      this.r = r || ((t)=> t >= STEP_TIME ? p.r : 0);
      this.d = d || (()=>0);
      this.pid = new PID();
      this.reset();
    }
    reset(){
      this.t = 0; this.y = 0; this.u = 0; this.onoff = 0; this.nextCtrl = 0;
      this.buf = new Float64Array(4096); this.w = 0; // ölü zaman için halka tampon (θ ≤ 8 s)
      this.pid.reset(); this.pid.h = this.p.hc;
      this.last = { t: 0, r: 0, y: 0, ym: 0, e: 0, u: 0, P: 0, I: 0, D: 0, dydt: 0, frozen: false, saturated: false };
    }
    control(){
      const p = this.p, c = this.pid;
      const r = this.r(this.t);
      const ym = this.y + (p.noise ? (Math.random() - 0.5) * p.noise : 0);
      const e = r - ym;
      let out;
      if (p.mode === 'PID'){
        c.kp = p.kp; c.ki = p.ki; c.kd = p.kd; c.dMode = p.dMode; c.tf = p.tf;
        c.uMin = p.uMin; c.uMax = p.uMax;
        if (c.h !== p.hc){ c.h = p.hc; c.prevY = c.prevE = null; }
        out = c.update(e, ym, p.antiWindup);
      } else {
        if (this.onoff === 1 && e < -p.hy) this.onoff = 0;
        else if (this.onoff === 0 && e > p.hy) this.onoff = 1;
        out = { u: this.onoff ? p.uHi : p.uLo, P: 0, I: 0, D: 0, saturated: false };
      }
      this.u = out.u;
      this.last = { t: this.t, r, y: this.y, ym, e, u: out.u, P: out.P, I: out.I, D: out.D,
        dydt: c.dydt, frozen: p.mode === 'PID' && c.frozen, saturated: out.saturated };
    }
    // Bir süreç adımı; kontrolör güncellendiyse true döner.
    step(){
      const p = this.p;
      let updated = false;
      if (this.t >= this.nextCtrl - 1e-9){
        this.control(); updated = true;
        this.nextCtrl += p.hc;
        if (this.nextCtrl <= this.t) this.nextCtrl = this.t + p.hc;
      }
      const n = Math.min(this.buf.length - 1, Math.round(p.theta / this.hp));
      this.w = (this.w + 1) % this.buf.length;
      this.buf[this.w] = this.u;
      const uDel = this.buf[(this.w - n + this.buf.length) % this.buf.length];
      this.y += (p.K * (uDel + this.d(this.t)) - this.y) / p.tau * this.hp;
      if (!isFinite(this.y) || Math.abs(this.y) > 1e3) this.y = Math.sign(this.y || 1) * 1e3; // kararsızlıkta taşmayı önle
      this.t += this.hp;
      return updated;
    }
  }

  // Bir senaryoyu gürültüsüz ve anında simüle eder; her dt saniyede bir örnek kaydeder.
  function runOffline(params, {horizon=60, dt=0.02, d=null} = {}){
    const p = Object.assign({}, params, { noise: 0 });
    const loop = new SingleLoop(p, { d: d || undefined });
    const out = { t: [], y: [], u: [], r: p.r };
    let nextRec = 0;
    while (loop.t < horizon - 1e-9){
      if (loop.t >= nextRec - 1e-9){ out.t.push(loop.t); out.y.push(loop.y); out.u.push(loop.u); nextRec += dt; }
      loop.step();
    }
    return out;
  }

  // Ayar noktası basamak yanıtı metrikleri (basamak t = STEP_TIME'da).
  // Yükselme süresi (%10→%90), aşım ve yerleşme süresi (±%2) son değere göre,
  // kalıcı hata ve IAE ayar noktasına göre hesaplanır.
  function stepMetrics(run){
    const { t, y, r } = run;
    const m = { rise: null, overshoot: null, settling: null, ess: null, iae: 0, amplitude: 0, unstable: false, oscillating: false };
    if (!t.length || Math.abs(r) < 1e-9) return m;
    const tEnd = t[t.length - 1];
    let lo = Infinity, hi = -Infinity, sum = 0, n = 0, maxAbs = 0;
    for (let k = 0; k < t.length; k++){
      maxAbs = Math.max(maxAbs, Math.abs(y[k]));
      if (k > 0 && t[k] >= STEP_TIME) m.iae += Math.abs(r - y[k]) * (t[k] - t[k - 1]);
      if (t[k] >= tEnd - 10){ lo = Math.min(lo, y[k]); hi = Math.max(hi, y[k]); sum += y[k]; n++; }
    }
    const yf = sum / n;
    m.amplitude = hi - lo;
    m.unstable = maxAbs > 5 * Math.max(1, Math.abs(r)) || m.amplitude > 2 * Math.abs(r);
    if (m.unstable) return m;
    m.oscillating = m.amplitude > 0.04 * Math.abs(r);
    m.ess = r - yf;
    if (m.oscillating || Math.abs(yf) < 0.05 * Math.abs(r)) return m;
    let t10 = null, t90 = null, peak = -Infinity, lastOut = null;
    const band = 0.02 * Math.abs(yf);
    for (let k = 0; k < t.length; k++){
      if (t[k] < STEP_TIME) continue;
      const v = y[k] / yf; // son değere göre normalize (negatif değerler için de çalışır)
      if (t10 === null && v >= 0.1) t10 = t[k];
      if (t90 === null && v >= 0.9) t90 = t[k];
      if (v > peak) peak = v;
      if (Math.abs(y[k] - yf) > band) lastOut = t[k];
    }
    m.rise = (t10 !== null && t90 !== null) ? t90 - t10 : null;
    m.overshoot = Math.max(0, (peak - 1) * 100);
    m.settling = (lastOut === null) ? 0 : (lastOut < tEnd - 1 ? lastOut - STEP_TIME : null);
    return m;
  }

  // Bozucu etkisi: bozuculu ve bozucusuz iki koşunun farkı (doğrusal bölgede saf bozucu yanıtı).
  function disturbanceMetrics(base, dist, tDist, r){
    let maxDev = 0, lastOut = null;
    const band = 0.02 * Math.max(Math.abs(r), 1e-9);
    for (let k = 0; k < base.t.length; k++){
      if (base.t[k] < tDist) continue;
      const dv = Math.abs(dist.y[k] - base.y[k]);
      maxDev = Math.max(maxDev, dv);
      if (dv > band) lastOut = base.t[k];
    }
    const tEnd = base.t[base.t.length - 1];
    return { maxDev, recovery: lastOut === null ? 0 : (lastOut < tEnd - 1 ? lastOut - tDist : null) };
  }

  // ---------- Grafik ----------
  const COLOR_VARS = {
    r:'--c-r', y:'--c-y', y2:'--c-y2', u:'--c-u', P:'--c-p', I:'--c-i', D:'--c-d',
    bg:'--plot-bg', grid:'--plot-grid', axis:'--plot-axis', text:'--plot-text', muted:'--plot-muted', tipBg:'--tip-bg', tipBorder:'--tip-border',
  };
  const colors = {};
  function readColors(){
    const cs = getComputedStyle(root);
    for (const [k, v] of Object.entries(COLOR_VARS)) colors[k] = cs.getPropertyValue(v).trim();
  }
  readColors();
  window.addEventListener('themechange', readColors);

  function niceStep(span, count){
    const raw = span / Math.max(1, count);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }
  function decimalsFor(step){
    let d = 0;
    while (d < 6 && Math.abs(step * Math.pow(10, d) - Math.round(step * Math.pow(10, d))) > 1e-6) d++;
    return d;
  }
  // Veri aralığını "güzel" sınırlara yuvarlar; ekseni her karede titretmemek için kullanılır.
  function niceRange(lo, hi, count=8){
    if (!(hi > lo)) { hi = lo + 1; }
    const step = niceStep(hi - lo, count);
    return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
  }

  const FONT = '13px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const FONT_SMALL = '12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  class Plot {
    constructor(canvas, {xLabel='zaman (s)', yLabel=''} = {}){
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.xLabel = xLabel; this.yLabel = yLabel;
      this.pad = { l: 58, r: 14, t: 14, b: 44 };
      this.x = [0, 1]; this.y = [0, 1];
      this.series = []; this.hoverX = null;
      this.redraw = null; // canlı olmayan grafikler için: boyut, tema veya fare değişince çağrılır
      this.resize();
      new ResizeObserver(()=>{ this.resize(); this.redraw?.(); }).observe(canvas);
      window.addEventListener('themechange', ()=>this.redraw?.());
      canvas.addEventListener('pointermove', (ev)=>{ const r = canvas.getBoundingClientRect(); this.hoverX = ev.clientX - r.left; this.redraw?.(); });
      canvas.addEventListener('pointerleave', ()=>{ this.hoverX = null; this.redraw?.(); });
    }
    resize(){
      const r = this.cv.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.w = Math.max(1, Math.round(r.width)); this.h = Math.max(1, Math.round(r.height));
      const W = Math.round(this.w * dpr), H = Math.round(this.h * dpr);
      if (this.cv.width !== W || this.cv.height !== H){ this.cv.width = W; this.cv.height = H; }
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    get box(){ return { x0: this.pad.l, x1: this.w - this.pad.r, y0: this.pad.t, y1: this.h - this.pad.b }; }
    px(x){ const b = this.box; return b.x0 + (x - this.x[0]) / (this.x[1] - this.x[0]) * (b.x1 - b.x0); }
    py(y){ const b = this.box; return b.y1 - (y - this.y[0]) / (this.y[1] - this.y[0]) * (b.y1 - b.y0); }
    setRanges(x0, x1, y0, y1){ this.x = [x0, x1 > x0 ? x1 : x0 + 1]; this.y = [y0, y1 > y0 ? y1 : y0 + 1]; }

    begin(){
      const {ctx} = this, b = this.box;
      this.series = [];
      ctx.clearRect(0, 0, this.w, this.h);
      ctx.fillStyle = colors.bg; ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      ctx.save();
      ctx.lineWidth = 1; ctx.font = FONT_SMALL; ctx.fillStyle = colors.muted;
      // y ızgarası ve değerleri
      const ys = niceStep(this.y[1] - this.y[0], Math.max(4, Math.floor((b.y1 - b.y0) / 26)));
      const yd = decimalsFor(ys);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let v = Math.ceil(this.y[0] / ys) * ys; v <= this.y[1] + ys * 1e-6; v += ys){
        const Y = Math.round(this.py(v)) + 0.5;
        ctx.strokeStyle = Math.abs(v) < ys * 1e-6 ? colors.axis : colors.grid;
        ctx.beginPath(); ctx.moveTo(b.x0, Y); ctx.lineTo(b.x1, Y); ctx.stroke();
        ctx.fillText(fmt(v, yd), b.x0 - 8, Y);
      }
      // x ızgarası ve değerleri
      const xs = niceStep(this.x[1] - this.x[0], Math.max(2, Math.floor((b.x1 - b.x0) / 80)));
      const xd = decimalsFor(xs);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let v = Math.ceil(this.x[0] / xs) * xs; v <= this.x[1] + xs * 1e-6; v += xs){
        const X = Math.round(this.px(v)) + 0.5;
        ctx.strokeStyle = colors.grid;
        ctx.beginPath(); ctx.moveTo(X, b.y0); ctx.lineTo(X, b.y1); ctx.stroke();
        ctx.fillText(fmt(v, xd), X, b.y1 + 6);
      }
      // eksen çizgileri
      ctx.strokeStyle = colors.axis;
      ctx.beginPath(); ctx.moveTo(b.x0 + 0.5, b.y0); ctx.lineTo(b.x0 + 0.5, b.y1 + 0.5); ctx.lineTo(b.x1, b.y1 + 0.5); ctx.stroke();
      // eksen başlıkları
      ctx.fillStyle = colors.text; ctx.font = FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(this.xLabel, (b.x0 + b.x1) / 2, this.h - 4);
      if (this.yLabel){
        ctx.translate(14, (b.y0 + b.y1) / 2); ctx.rotate(-Math.PI / 2);
        ctx.textBaseline = 'middle'; ctx.fillText(this.yLabel, 0, 0);
      }
      ctx.restore();
    }

    clipped(fn){
      const {ctx} = this, b = this.box;
      ctx.save(); ctx.beginPath(); ctx.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); ctx.clip();
      fn(ctx); ctx.restore();
    }

    // name verilirse seri, fare ile okunabilir ve sağ kenarda doğrudan etiketlenir.
    line(xs, ys, color, {width=2, dash=null, name=null, label=true, digits=2, alpha=1} = {}){
      if (xs.length === 0) return;
      this.clipped(ctx=>{
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.globalAlpha = alpha;
        if (dash) ctx.setLineDash(dash);
        ctx.beginPath();
        for (let i = 0; i < xs.length; i++){
          const X = this.px(xs[i]), Y = this.py(ys[i]);
          if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        }
        ctx.stroke();
      });
      if (name) this.series.push({ xs, ys, color, name, label, digits, dash });
    }

    // Dikey olay çizgisi (ör. bozucu anı)
    vline(x, text){
      if (x < this.x[0] || x > this.x[1]) return;
      const b = this.box, X = Math.round(this.px(x)) + 0.5;
      this.clipped(ctx=>{
        ctx.strokeStyle = colors.muted; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(X, b.y0); ctx.lineTo(X, b.y1); ctx.stroke();
        if (text){
          ctx.setLineDash([]); ctx.font = FONT_SMALL; ctx.textBaseline = 'top';
          const w = ctx.measureText(text).width;
          const left = X + 6 + w > b.x1 - 4;
          ctx.textAlign = left ? 'right' : 'left';
          ctx.fillStyle = colors.bg; ctx.fillRect(left ? X - 8 - w : X + 4, b.y0 + 4, w + 4, 16);
          ctx.fillStyle = colors.text; ctx.fillText(text, left ? X - 6 : X + 6, b.y0 + 6);
        }
      });
    }

    // Yatay referans çizgisi (ör. doyum sınırı); sol üstüne küçük etiket yazar.
    hline(y, text){
      if (y < this.y[0] || y > this.y[1]) return;
      const b = this.box, Y = Math.round(this.py(y)) + 0.5;
      this.clipped(ctx=>{
        ctx.strokeStyle = colors.muted; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(b.x0, Y); ctx.lineTo(b.x1, Y); ctx.stroke();
        if (text){
          ctx.setLineDash([]); ctx.font = FONT_SMALL; ctx.textAlign = 'left';
          const below = Y - b.y0 < 18; ctx.textBaseline = below ? 'top' : 'bottom';
          ctx.fillStyle = colors.muted; ctx.fillText(text, b.x0 + 6, below ? Y + 3 : Y - 3);
        }
      });
    }

    // Seri adlarını çizginin sağ ucunun yanına yazar; üst üste binmeyi önler.
    finish(){
      const {ctx} = this, b = this.box;
      const items = this.series.filter(s => s.label && s.xs.length).map(s => ({
        s, y: clamp(this.py(s.ys[s.ys.length - 1]), b.y0 + 9, b.y1 - 9),
      })).sort((a, c) => a.y - c.y);
      for (let i = 1; i < items.length; i++) if (items[i].y - items[i-1].y < 18) items[i].y = items[i-1].y + 18;
      for (let i = items.length - 2; i >= 0; i--) if (items[i+1].y > b.y1 - 9) { items[i+1].y = b.y1 - 9; if (items[i+1].y - items[i].y < 18) items[i].y = items[i+1].y - 18; }
      ctx.save(); ctx.font = FONT_SMALL; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      for (const it of items){
        const w = ctx.measureText(it.s.name).width;
        const lastX = this.px(it.s.xs[it.s.xs.length - 1]);
        const x = Math.max(b.x0 + 4, Math.min(lastX + 8, b.x1 - 6 - w - 20));
        ctx.fillStyle = colors.bg; ctx.globalAlpha = 0.85; ctx.fillRect(x - 2, it.y - 9, w + 24, 18); ctx.globalAlpha = 1;
        ctx.strokeStyle = it.s.color; ctx.lineWidth = 3; ctx.setLineDash(it.s.dash || []);
        ctx.beginPath(); ctx.moveTo(x, it.y); ctx.lineTo(x + 14, it.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = colors.text; ctx.fillText(it.s.name, x + 20, it.y);
      }
      ctx.restore();
      this.drawHover();
    }

    // Fare imlecinin altındaki andaki değerleri gösterir; her seri kendi zaman ızgarasında aranır.
    drawHover(){
      if (this.hoverX === null || this.series.length === 0) return;
      const {ctx} = this, b = this.box;
      if (this.hoverX < b.x0 || this.hoverX > b.x1) return;
      const tx = this.x[0] + (this.hoverX - b.x0) / (b.x1 - b.x0) * (this.x[1] - this.x[0]);
      const nearest = (xs)=>{
        let lo = 0, hi = xs.length - 1;
        while (hi - lo > 1){ const m = (lo + hi) >> 1; if (xs[m] < tx) lo = m; else hi = m; }
        return Math.abs(xs[lo] - tx) < Math.abs(xs[hi] - tx) ? lo : hi;
      };
      const hits = [];
      for (const s of this.series){
        if (!s.xs.length) continue;
        const i = nearest(s.xs);
        const tol = s.xs.length > 1 ? 2 * Math.abs(s.xs[1] - s.xs[0]) + 1e-9 : Infinity;
        if (Math.abs(s.xs[i] - tx) <= tol) hits.push({ s, t: s.xs[i], v: s.ys[i] });
      }
      if (!hits.length) return;
      const tShow = hits[hits.length - 1].t;
      const X = this.px(tShow);
      ctx.save();
      ctx.strokeStyle = colors.axis; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X + 0.5, b.y0); ctx.lineTo(X + 0.5, b.y1); ctx.stroke();
      const rows = [['t', fmt(tShow, 2) + ' s', null]].concat(hits.map(h => [h.s.name, fmt(h.v, h.s.digits), h.s.color]));
      for (const h of hits){
        const Y = this.py(h.v); if (Y < b.y0 || Y > b.y1) continue;
        ctx.fillStyle = h.s.color; ctx.strokeStyle = colors.bg; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(this.px(h.t), Y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.font = FONT_SMALL;
      const wName = Math.max(...rows.map(r => ctx.measureText(r[0]).width));
      const wVal = Math.max(...rows.map(r => ctx.measureText(r[1]).width));
      const W = wName + wVal + 40, H = rows.length * 18 + 10;
      let bx = X + 12; if (bx + W > b.x1) bx = X - 12 - W;
      const by = b.y0 + 6;
      ctx.fillStyle = colors.tipBg; ctx.strokeStyle = colors.tipBorder; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(bx, by, W, H, 6); ctx.fill(); ctx.stroke();
      ctx.textBaseline = 'middle';
      rows.forEach((r, k)=>{
        const y = by + 14 + k * 18;
        if (r[2]){ ctx.fillStyle = r[2]; ctx.fillRect(bx + 8, y - 4, 8, 8); }
        ctx.fillStyle = colors.text; ctx.textAlign = 'left'; ctx.fillText(r[0], bx + 22, y);
        ctx.textAlign = 'right'; ctx.fillText(r[1], bx + W - 8, y);
      });
      ctx.restore();
    }
  }

  // Kaydırıcı + değer çıktısını bağlar; değişince onChange(sayı) çağrılır.
  function bindRange(id, onChange, digits){
    const input = document.getElementById(id);
    const out = document.querySelector(`output[for="${id}"]`);
    const d = digits ?? decimalsFor(parseFloat(input.step) || 1);
    const show = ()=>{ if (out) out.textContent = fmt(parseFloat(input.value), d); };
    input.addEventListener('input', ()=>{ show(); onChange(parseFloat(input.value)); });
    show(); onChange(parseFloat(input.value)); // tarayıcı form değerini geri yüklemiş olabilir
    return input;
  }

  window.Sim = { PID, firstOrder, SingleLoop, runOffline, stepMetrics, disturbanceMetrics, STEP_TIME,
    Plot, colors, fmt, clamp, niceRange, bindRange, currentTheme };
})();
