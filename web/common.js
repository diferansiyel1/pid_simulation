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
  // Türev ölçüm üzerinden alınır: ayar noktası basamağında "türev tepmesi" oluşmaz.
  // Anti-windup koşullu integrasyondur: çıkış doymuşken hatayı doyum yönünde biriktirmez.
  class PID {
    constructor({kp=1, ki=0, kd=0, h=0.016, uMin=-5, uMax=5} = {}){
      Object.assign(this, {kp, ki, kd, h, uMin, uMax});
      this.reset();
    }
    reset(){ this.i = 0; this.prevY = null; }
    update(e, y, antiWindup=true){
      const P = this.kp * e;
      const D = this.prevY === null ? 0 : -this.kd * (y - this.prevY) / this.h;
      this.prevY = y;
      const iNext = this.i + this.ki * e * this.h;
      const uNext = P + iNext + D;
      const windingUp = (uNext > this.uMax && e > 0) || (uNext < this.uMin && e < 0);
      if (!(antiWindup && windingUp)) this.i = iNext;
      const u = clamp(P + this.i + D, this.uMin, this.uMax);
      return { u, P, I: this.i, D };
    }
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
  function niceRange(lo, hi, count=5){
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
      this.resize();
      new ResizeObserver(()=>this.resize()).observe(canvas);
      canvas.addEventListener('pointermove', (ev)=>{ const r = canvas.getBoundingClientRect(); this.hoverX = ev.clientX - r.left; });
      canvas.addEventListener('pointerleave', ()=>{ this.hoverX = null; });
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
      const ys = niceStep(this.y[1] - this.y[0], Math.max(3, Math.floor((b.y1 - b.y0) / 30)));
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
    line(xs, ys, color, {width=2, dash=null, name=null, label=true, digits=2} = {}){
      if (xs.length === 0) return;
      this.clipped(ctx=>{
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round';
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

    drawHover(){
      if (this.hoverX === null || this.series.length === 0) return;
      const {ctx} = this, b = this.box;
      if (this.hoverX < b.x0 || this.hoverX > b.x1) return;
      const xs = this.series[0].xs; if (!xs.length) return;
      const tx = this.x[0] + (this.hoverX - b.x0) / (b.x1 - b.x0) * (this.x[1] - this.x[0]);
      let lo = 0, hi = xs.length - 1;
      while (hi - lo > 1){ const m = (lo + hi) >> 1; if (xs[m] < tx) lo = m; else hi = m; }
      const i = Math.abs(xs[lo] - tx) < Math.abs(xs[hi] - tx) ? lo : hi;
      const X = this.px(xs[i]);
      ctx.save();
      ctx.strokeStyle = colors.axis; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X + 0.5, b.y0); ctx.lineTo(X + 0.5, b.y1); ctx.stroke();
      const rows = [['t', fmt(xs[i], 2) + ' s', null]].concat(this.series.map(s => [s.name, fmt(s.ys[i], s.digits), s.color]));
      for (const s of this.series){
        const Y = this.py(s.ys[i]); if (Y < b.y0 || Y > b.y1) continue;
        ctx.fillStyle = s.color; ctx.strokeStyle = colors.bg; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(X, Y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
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

  window.Sim = { PID, firstOrder, Plot, colors, fmt, clamp, niceRange, bindRange, currentTheme };
})();
