/* PID simülatörü: ölü zamanlı birinci derece süreç, PID veya aç-kapa (ON-OFF) kontrolör.
   Canlı simülasyon, anında hesaplanan metrikler, senaryolar ve kazanç etkisi laboratuvarı. */
(function(){
  const { SingleLoop, runOffline, stepMetrics, disturbanceMetrics, STEP_TIME, Plot, colors, fmt, niceRange, bindRange } = Sim;
  const $ = (id)=>document.getElementById(id);

  // ---------- Parametreler ----------
  // p: SingleLoop'un her adımda okuduğu parametreler; view: yalnızca görüntü/bozucu ayarları
  const p = { mode: 'PID', kp: 1.2, ki: 0.4, kd: 0.2, dMode: 'measurement', tf: 0, uMin: -5, uMax: 5, antiWindup: true,
    hy: 0.05, uHi: 2, uLo: 0, K: 1, tau: 1.8, theta: 0, hc: 0.02, r: 1, noise: 0 };
  const view = { dz: 0.3, dt: 20, T: 40, speed: 1, running: true, showP: true, showI: true, showD: true, showU: true };
  const NOISE_AMPLITUDE = 0.04;
  const REC_DT = 0.02; // grafik kayıt aralığı (s)

  // ---------- Canlı simülasyon ----------
  let manualOn = false;
  const manualEvents = []; // elle uygulanan bozucu anları {t, on}
  const loop = new SingleLoop(p, { d: (t)=> (t >= view.dt ? view.dz : 0) + (manualOn ? view.dz : 0) });
  let nextRec = 0, lastFrame = null;
  let xs = [], rs = [], ys = [], Ps = [], Is = [], Ds = [], Us = [];

  function record(){
    const L = loop.last;
    xs.push(loop.t); rs.push(loop.r(loop.t)); ys.push(loop.y);
    Ps.push(L.P); Is.push(L.I); Ds.push(L.D); Us.push(loop.u);
    while (xs.length > 0 && xs[xs.length - 1] - xs[0] > view.T){
      xs.shift(); rs.shift(); ys.shift(); Ps.shift(); Is.shift(); Ds.shift(); Us.shift();
    }
  }

  function advance(dtSim){
    const tEnd = loop.t + dtSim;
    while (loop.t < tEnd - 1e-9){
      loop.step();
      if (loop.t >= nextRec - 1e-9){ record(); nextRec += REC_DT; }
    }
  }

  function restart(){
    loop.reset();
    manualOn = false; manualEvents.length = 0;
    nextRec = 0;
    xs = []; rs = []; ys = []; Ps = []; Is = []; Ds = []; Us = [];
    renderDistButton();
    renderDecomp(true);
  }

  // ---------- Grafikler ----------
  const plotY = new Plot($('plotY'), { yLabel: 'y, r' });
  const plotTerms = new Plot($('plotTerms'), { yLabel: 'u, P, I, D' });
  let ref = null; // { run, metrics, label }

  function extent(arrays, lo, hi, x0){
    for (const [a, tx] of arrays) for (let i = 0; i < a.length; i++){
      if (tx && tx[i] < x0) continue;
      if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i];
    }
    return [lo, hi];
  }

  function drawEvents(plot){
    plot.vline(view.dt, 'bozucu');
    for (const ev of manualEvents) plot.vline(ev.t, ev.on ? 'bozucu açık' : 'bozucu kapalı');
  }

  function draw(){
    const xMax = xs.length ? xs[xs.length - 1] : 0;
    const x0 = Math.max(0, xMax - view.T), x1 = Math.max(view.T, xMax);

    const ySeries = [[ys], [rs]];
    if (ref) ySeries.push([ref.run.y, ref.run.t]);
    const [yLo, yHi] = extent(ySeries, 0, Math.max(1.2, p.r * 1.2), x0);
    const yr = niceRange(Math.max(yLo, -3) - 0.05, Math.min(yHi, 4) + 0.05);
    plotY.setRanges(x0, x1, yr[0], yr[1]);
    plotY.begin();
    if (ref) plotY.line(ref.run.t, ref.run.y, colors.y, { width: 2, alpha: 0.35, name: 'referans' });
    plotY.line(xs, rs, colors.r, { dash: [7, 5], name: 'r' });
    plotY.line(xs, ys, colors.y, { width: 2.5, name: 'y' });
    drawEvents(plotY);
    plotY.finish();

    const pidMode = p.mode === 'PID';
    const shown = [];
    if (view.showU) shown.push([Us]);
    if (pidMode){ if (view.showP) shown.push([Ps]); if (view.showI) shown.push([Is]); if (view.showD) shown.push([Ds]); }
    const [tLo, tHi] = extent(shown, -0.2, 1.2);
    const tr = niceRange(Math.max(tLo, -12) - 0.1, Math.min(tHi, 12) + 0.1);
    plotTerms.setRanges(x0, x1, tr[0], tr[1]);
    plotTerms.begin();
    if (pidMode){
      plotTerms.hline(p.uMax, 'doyum üst sınırı u_max');
      plotTerms.hline(p.uMin, 'doyum alt sınırı u_min');
      if (view.showP) plotTerms.line(xs, Ps, colors.P, { name: 'P' });
      if (view.showI) plotTerms.line(xs, Is, colors.I, { name: 'I' });
      if (view.showD) plotTerms.line(xs, Ds, colors.D, { name: 'D' });
    }
    if (view.showU) plotTerms.line(xs, Us, colors.u, { width: 2.5, name: 'u' });
    drawEvents(plotTerms);
    plotTerms.finish();
  }

  // ---------- Metrikler (2.2) ve referans (2.3) ----------
  let metricsDirty = true, current = null;

  function computeMetrics(){
    const base = runOffline(p, { horizon: 60 });
    const m = stepMetrics(base);
    let dm = null;
    if (view.dz !== 0 && view.dt < 55){
      const dist = runOffline(p, { horizon: 60, d: (t)=> t >= view.dt ? view.dz : 0 });
      dm = disturbanceMetrics(base, dist, view.dt, p.r);
    }
    return { m, dm };
  }

  const sec = (v)=> v === null || v === undefined ? '—' : fmt(v, v < 10 ? 2 : 1) + ' s';
  function metricCells(res){
    const { m, dm } = res;
    const notSettled = !m.unstable && !m.oscillating && m.settling === null;
    return [
      ['Yükselme süresi', 'çıkışın son değerin %10’undan %90’ına çıkma süresi', sec(m.rise)],
      ['Aşım', 'son değerin ne kadar üstüne çıktığı', m.overshoot === null ? '—' : '%' + fmt(m.overshoot, 1)],
      ['Yerleşme süresi', 'son değerin ±%2 bandına kalıcı olarak girme süresi', notSettled ? 'yerleşmedi' : sec(m.settling)],
      ['Kalıcı hata e∞', 'ayar noktası ile son değer arasındaki fark', m.ess === null ? '—' : fmt(m.ess, 3)],
      ['IAE', 'mutlak hatanın integrali ∫|e|dt (küçük = iyi)', m.unstable ? '—' : fmt(m.iae, 2)],
      ['Bozucu sapması', 'bozucunun çıkışta yarattığı en büyük sapma', dm ? fmt(dm.maxDev, 3) : '—'],
      ['Toparlanma süresi', 'bozucu sonrası sapmanın ±%2 bandına dönme süresi', dm ? (dm.recovery === null ? 'toparlanmadı' : sec(dm.recovery)) : '—'],
    ];
  }

  function renderMetrics(){
    current = computeMetrics();
    const cells = metricCells(current);
    const refCells = ref ? metricCells(ref.metrics) : null;
    const grid = $('metricGrid');
    grid.innerHTML = '';
    cells.forEach(([name, hint, val], i)=>{
      const div = document.createElement('div'); div.className = 'metric'; div.title = hint;
      const dt = document.createElement('dt'); dt.textContent = name;
      const dd = document.createElement('dd'); dd.textContent = val;
      div.append(dt, dd);
      if (refCells){ const s = document.createElement('span'); s.className = 'ref'; s.textContent = 'referans: ' + refCells[i][2]; div.append(s); }
      grid.append(div);
    });
    const st = $('metricStatus'), m = current.m;
    st.hidden = !(m.unstable || m.oscillating);
    if (m.unstable){ st.className = 'status critical'; st.textContent = '⚠ Kararsız: çıkış sınırsız büyüyor'; }
    else if (m.oscillating){ st.className = 'status warn'; st.textContent = '⚠ Sürekli salınım, genlik ' + fmt(m.amplitude, 2); }
    $('metricsNote').textContent = p.mode === 'PID'
      ? `t = ${fmt(STEP_TIME, 0)} s'deki basamak yanıtından, gürültüsüz ve anında hesaplanır`
      : 'aç-kapa kontrolde çıkış sürekli salındığı için yükselme ve yerleşme tanımsızdır';
    metricsDirty = false;
  }

  function paramSummary(q){
    return q.mode === 'PID'
      ? `Kp ${fmt(q.kp)}, Ki ${fmt(q.ki)}, Kd ${fmt(q.kd)}, θ ${fmt(q.theta)} s`
      : `aç-kapa, histerezis ${fmt(q.hy)}, θ ${fmt(q.theta)} s`;
  }
  function setReference(){
    const run = runOffline(p, { horizon: 125, d: (t)=> t >= view.dt ? view.dz : 0 });
    ref = { run, metrics: current || computeMetrics(), label: paramSummary(p) };
    $('refChip').hidden = false; $('refChipText').textContent = 'referans (' + ref.label + ')';
    $('btnRefClear').hidden = false;
    renderMetrics();
  }
  function clearReference(){
    ref = null; $('refChip').hidden = true; $('btnRefClear').hidden = true; renderMetrics();
  }

  // ---------- Terim ayrıştırması (2.5 + 2.13) ----------
  let lastDecomp = 0;
  function bar(value, scale, color){
    const pct = Math.min(50, Math.abs(value) / scale * 50);
    const left = value >= 0 ? 50 : 50 - pct;
    return `<div class="term-bar"><span class="zero"></span><span class="fill" style="left:${left}%;width:${pct}%;background:${color}"></span></div>`;
  }
  function row(name, color, value, formula, sentence, scale){
    return `<div class="term"><div class="term-top"><span class="term-name"><span class="swatch" style="--c:${color}"></span>${name}</span>` +
      `<span class="term-val">${fmt(value, 3)}</span></div>${bar(value, scale, color)}` +
      `<div class="term-formula">${formula}</div><p class="term-say">${sentence}</p></div>`;
  }
  function renderDecomp(force){
    const now = performance.now();
    if (!force && now - lastDecomp < 120) return;
    lastDecomp = now;
    const L = loop.last, e = L.e, small = 0.01;
    $('decompTime').textContent = `t = ${fmt(loop.t, 2)} s · e = r − y = ${fmt(e, 3)}`;
    const scale = Math.max(Math.abs(p.uMin), Math.abs(p.uMax), 1);
    let html = '';
    if (p.mode === 'PID'){
      const sayP = Math.abs(e) < small ? 'Hata neredeyse sıfır; P katkısı yok denecek kadar küçük.'
        : e > 0 ? 'Çıkış hedefin altında (e > 0); P kontrol sinyalini artırıyor.'
        : 'Çıkış hedefi aştı (e < 0); P kontrol sinyalini azaltıyor.';
      const sayI = p.ki === 0 ? 'Ki = 0: integral kapalı; kalıcı hata giderilemez.'
        : L.frozen ? 'Çıkış doyumda; anti-windup integrali donduruyor.'
        : L.saturated ? 'Çıkış doyumda ama integral birikmeye devam ediyor (windup).'
        : Math.abs(e) < small ? 'Hata sıfıra yakın; I biriktirdiği değeri koruyarak çıkışı hedefte tutuyor.'
        : e > 0 ? 'Hata pozitif kaldıkça I büyüyor; kalıcı hatayı kapatmak için sinyali yavaşça artırıyor.'
        : 'Hata negatif; I biriktirdiği katkıyı azaltıyor.';
      let sayD;
      if (p.kd === 0) sayD = 'Kd = 0: türev terimi kapalı.';
      else if (p.dMode === 'error' && Math.abs(L.D) > 2) sayD = 'Hata ani değişti: hata üzerinden türev büyük bir sıçrama (tepme) üretiyor.';
      else if (Math.abs(L.dydt) < small) sayD = 'Çıkış neredeyse sabit; D katkısı yok.';
      else if (L.dydt > 0) sayD = 'Çıkış yükseliyor; D fren yapıyor, sinyali azaltarak aşımı önlüyor.';
      else sayD = 'Çıkış düşüyor; D sinyali artırarak düşüşü yavaşlatıyor.';
      const dFormula = p.dMode === 'error'
        ? `Kd · de/dt${p.tf > 0 ? ' (filtreli)' : ''}`
        : `−Kd · dy/dt = −${fmt(p.kd)} × ${fmt(L.dydt, 3)}${p.tf > 0 ? ' (filtreli)' : ''}`;
      const sum = L.P + L.I + L.D;
      const sayU = L.saturated
        ? `İstenen ${fmt(sum, 2)}, ancak doyum sınırı ${fmt(sum > 0 ? p.uMax : p.uMin, 2)}; sürece giden sinyal kırpılıyor.`
        : 'Üç katkının toplamı sürece giden kontrol sinyalidir.';
      html += row('P · oransal', colors.P, L.P, `Kp · e = ${fmt(p.kp)} × ${fmt(e, 3)}`, sayP, scale);
      html += row('I · integral', colors.I, L.I, 'Ki · ∫e dt (birikmiş hata)', sayI, scale);
      html += row('D · türev', colors.D, L.D, dFormula, sayD, scale);
      html += row('u · kontrol sinyali', colors.u, loop.u, `P + I + D = ${fmt(sum, 3)}${L.saturated ? ' → ' + fmt(loop.u, 3) : ''}`, sayU, scale);
    } else {
      const on = loop.onoff === 1;
      const say = on ? `Kontrolör AÇIK: hata +${fmt(p.hy)} bandını aştığı için u = u_açık. Hata −${fmt(p.hy)} altına inince kapanacak.`
        : `Kontrolör KAPALI: u = u_kapalı. Hata +${fmt(p.hy)} üstüne çıkınca açılacak.`;
      html += row('u · aç-kapa çıkışı', colors.u, loop.u, on ? 'u = u_açık' : 'u = u_kapalı', say, scale);
    }
    $('decompGrid').innerHTML = html;
  }

  // ---------- Süreç formülü (2.1) ----------
  function renderFormula(){
    const num = `${fmt(p.K)}${p.theta > 0 ? ` · e<sup>−${fmt(p.theta)}·s</sup>` : ''}`;
    $('processFormula').innerHTML = `G(s) = <span class="frac"><span>${num}</span><span>${fmt(p.tau, 1)}·s + 1</span></span>`;
  }

  // ---------- Kontroller ----------
  function invalidate(){ metricsDirty = true; labDirty = labDirty || $('labBase').value === 'current'; }

  function bindControls(){
    const bind = (id, fn)=> bindRange(id, (v)=>{ fn(v); invalidate(); });
    bind('kp', v=> p.kp = v);
    bind('ki', v=> p.ki = v);
    bind('kd', v=> p.kd = v);
    bind('hy', v=> p.hy = v);
    bind('uhi', v=> p.uHi = v);
    bind('ulo', v=> p.uLo = v);
    bind('pK', v=>{ p.K = v; renderFormula(); });
    bind('pTau', v=>{ p.tau = v; renderFormula(); });
    bind('pTheta', v=>{ p.theta = v; renderFormula(); });
    bind('sp', v=> p.r = v);
    bind('dz', v=> view.dz = v);
    bind('dt', v=> view.dt = v);
    bind('tf', v=> p.tf = v);
    bind('uMin', v=> p.uMin = v);
    bind('uMax', v=> p.uMax = v);
    bind('dtms', v=> p.hc = v / 1000);
    bindRange('simT', v=> view.T = v);

    const mode = $('mode');
    const applyMode = ()=>{
      p.mode = mode.value;
      const pidMode = p.mode === 'PID';
      document.querySelectorAll('[data-mode]').forEach(el=>{ el.hidden = el.dataset.mode !== p.mode; });
      document.querySelectorAll('[data-series="showP"],[data-series="showI"],[data-series="showD"]').forEach(el=>{ el.hidden = !pidMode; });
      $('uChipText').textContent = pidMode ? 'u = P + I + D' : 'u — aç-kapa çıkışı';
      $('termsTitle').textContent = pidMode ? 'Kontrol sinyali u(t) ve P, I, D katkıları' : 'Kontrol sinyali u(t)';
      plotTerms.yLabel = pidMode ? 'u, P, I, D' : 'u';
      invalidate(); renderDecomp(true);
    };
    mode.addEventListener('change', applyMode);
    applyMode();

    const dMode = $('dMode');
    dMode.addEventListener('change', ()=>{ p.dMode = dMode.value; invalidate(); });
    p.dMode = dMode.value;

    const aw = $('antiWindup');
    aw.addEventListener('change', ()=>{ p.antiWindup = aw.checked; invalidate(); });
    p.antiWindup = aw.checked;
    const noise = $('noise');
    noise.addEventListener('change', ()=>{ p.noise = noise.checked ? NOISE_AMPLITUDE : 0; });
    p.noise = noise.checked ? NOISE_AMPLITUDE : 0;

    document.querySelectorAll('[data-series]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const key = btn.dataset.series;
        view[key] = !view[key];
        btn.setAttribute('aria-pressed', String(view[key]));
      });
    });

    // Oynatma (2.6)
    $('btnRestart').addEventListener('click', restart);
    const pause = $('btnPause'), stepBtn = $('btnStep');
    pause.addEventListener('click', ()=>{
      view.running = !view.running;
      pause.textContent = view.running ? 'Duraklat' : 'Devam et';
      pause.setAttribute('aria-pressed', String(!view.running));
      stepBtn.disabled = view.running;
    });
    stepBtn.addEventListener('click', ()=>{ advance(p.hc); renderDecomp(true); });
    const speed = $('speed');
    speed.addEventListener('change', ()=>{ view.speed = parseFloat(speed.value); });
    view.speed = parseFloat(speed.value);

    // Elle bozucu (2.7)
    $('btnDist').addEventListener('click', ()=>{
      manualOn = !manualOn;
      manualEvents.push({ t: loop.t, on: manualOn });
      renderDistButton();
    });

    // Referans (2.3)
    $('btnRef').addEventListener('click', setReference);
    $('btnRefClear').addEventListener('click', clearReference);

    // Dışa aktarma (2.10)
    $('btnPng').addEventListener('click', exportPng);
    $('btnCsv').addEventListener('click', exportCsv);
  }

  function renderDistButton(){
    const b = $('btnDist');
    b.textContent = manualOn ? 'Bozucuyu kaldır' : 'Bozucu uygula';
    b.setAttribute('aria-pressed', String(manualOn));
  }

  // ---------- Dışa aktarma (2.10) ----------
  function download(blob, name){
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  }
  function exportPng(){
    const c1 = plotY.cv, c2 = plotTerms.cv, dpr = window.devicePixelRatio || 1;
    const head = Math.round(36 * dpr);
    const out = document.createElement('canvas');
    out.width = Math.max(c1.width, c2.width); out.height = head + c1.height + c2.height;
    const ctx = out.getContext('2d');
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--plot-bg').trim() || '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.fillStyle = colors.text; ctx.font = `${Math.round(14 * dpr)}px system-ui, sans-serif`; ctx.textBaseline = 'middle';
    ctx.fillText(`PID Kontrol Simülasyonu · ${paramSummary(p)} · K ${fmt(p.K)}, τ ${fmt(p.tau, 1)} s · t = ${fmt(loop.t, 1)} s`, 12 * dpr, head / 2);
    ctx.drawImage(c1, 0, head); ctx.drawImage(c2, 0, head + c1.height);
    out.toBlob(b=> download(b, 'pid-simulasyon.png'), 'image/png');
  }
  function exportCsv(){
    const n = (v)=> v.toFixed(4).replace('.', ',');
    const lines = ['t (s);r;y;u;P;I;D'];
    for (let i = 0; i < xs.length; i++) lines.push([xs[i], rs[i], ys[i], Us[i], Ps[i], Is[i], Ds[i]].map(n).join(';'));
    download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'pid-simulasyon.csv');
  }

  // ---------- Senaryolar (2.4) ----------
  const DEFAULTS = { mode: 'PID', kp: 1.2, ki: 0.4, kd: 0.2, antiWindup: true, hy: 0.05, uhi: 2, ulo: 0,
    pK: 1, pTau: 1.8, pTheta: 0, sp: 1, dz: 0.3, dt: 20, dMode: 'measurement', tf: 0, uMin: -5, uMax: 5, simT: 40, dtms: 20, noise: false };
  const SCENARIOS = [
    { title: '1. Yalnız P: kalıcı hata', set: { kp: 2, ki: 0, kd: 0 },
      aim: 'Yalnız oransal kontrolün neden ayar noktasına tam ulaşamadığını görmek.',
      see: 'Çıkış 1 yerine yaklaşık 0,67’de durur. Kalıcı hata e∞ = 1 / (1 + Kp) ≈ 0,33. Bozucu da kalıcı bir sapma bırakır; metriklerde “toparlanmadı” görünür.',
      try: 'Kp’yi 4’e çıkarın: hata küçülür (≈ 0,20) ama sıfır olmaz.',
      ask: 'Kalıcı hatayı sıfırlamak için hangi terime ihtiyaç var?' },
    { title: '2. P + I: integral kalıcı hatayı siler', set: { kp: 1, ki: 1.5, kd: 0 },
      aim: 'İntegral teriminin kalıcı hatayı nasıl yok ettiğini görmek.',
      see: 'Kalıcı hata sıfırlanır; buna karşılık yaklaşık %12 aşım oluşur. Alttaki grafikte I’nın yavaşça büyüyüp yerini aldığını izleyin.',
      try: 'Ki’yi 2’ye çıkarın ve aşımın nasıl arttığını izleyin; sonra 0,5’e indirin.',
      ask: 'Ki büyüdükçe neden aşım artıyor?' },
    { title: '3. Ölü zaman ve yüksek Kp: salınım', set: { kp: 4, ki: 0.5, kd: 0, pTheta: 0.6 }, open: ['groupProcess'],
      aim: 'Ölü zamanın kararlılığı nasıl bozduğunu görmek.',
      see: 'θ = 0,6 s ölü zamanla Kp = 4 yaklaşık %49 aşım ve uzun süren salınım üretir.',
      try: 'Kp’yi 5’e çıkarın: salınım sönmez (kararlılık sınırı). Sonra Kp’yi 2’ye indirin.',
      ask: 'Ölü zaman kontrolörün işini neden zorlaştırır?' },
    { title: '4. D eklemek: aşımı sönümleme', set: { kp: 3, ki: 1, kd: 0, pTheta: 0.6 }, open: ['groupProcess', 'groupAdvanced'],
      aim: 'Türev teriminin aşımı ve salınımı nasıl azalttığını görmek.',
      see: 'Kd = 0 iken aşım yaklaşık %34.',
      try: 'Kd’yi 0,5 ve 1’e çıkarın: aşım yaklaşık %16 ve %5’e iner. Ardından ölçüm gürültüsünü açın ve u’nun titremesine bakın; D filtresini 0,1 s yapınca titreme azalır.',
      ask: 'D terimi gürültüyü neden büyütür?' },
    { title: '5. Integral windup', set: { kp: 1, ki: 2, kd: 0, uMin: 0, uMax: 1.1, antiWindup: false }, open: ['groupAdvanced'],
      aim: 'Doyum sırasında integralin birikmesinin (windup) zararını görmek.',
      see: 'u, 1,1 sınırına dayanır; integral birikmeye devam eder. Sonuç: yaklaşık %10 aşım ve 16 s yerleşme.',
      try: 'Anti-windup’ı açın ve yeniden başlatın: aşım yaklaşık %2’ye, yerleşme 6 s’ye iner.',
      ask: 'Doyum sırasında integral neden büyümemeli?' },
    { title: '6. Aç-kapa kontrol', set: { mode: 'ONOFF', hy: 0.05, uhi: 2, ulo: 0, pTheta: 0.3 }, open: ['groupProcess'],
      aim: 'Aç-kapa kontrolün davranışını PID ile karşılaştırmak.',
      see: 'Çıkış ayar noktası çevresinde sürekli salınır (genlik ≈ 0,4); kontrol sinyali yalnızca iki değer alır.',
      try: 'Histerezis bandını 0,2’ye çıkarın: anahtarlama seyrekleşir, salınım büyür. Sonra θ’yı 0’a indirin.',
      ask: 'Gerçek bir vanada çok sık anahtarlama neden istenmez?' },
    { title: '7. Örnekleme aralığı', set: { kp: 3, ki: 1, kd: 0, dtms: 900 },
      aim: 'Kontrolörün seyrek ölçüm almasının kararlılığa etkisini görmek.',
      see: 'Kontrolör yalnızca 0,9 s’de bir ölçüm alır; u basamak basamak değişir ve yaklaşık %54 aşım oluşur.',
      try: 'Simülasyon bölümünde örnekleme aralığını 20 ms’ye indirin: aşım kaybolur.',
      ask: 'Örnekleme aralığı sürecin zaman sabitine göre nasıl seçilmeli?' },
    { title: '8. Türev tepmesi', set: { kp: 1.2, ki: 0.4, kd: 0.5, dMode: 'error' }, open: ['groupAdvanced'],
      aim: 'Türevin hata üzerinden alınmasının yarattığı sorunu görmek.',
      see: 't = 1 s’de ayar noktası sıçrarken hata üzerinden türev çok büyük bir D sıçraması (tepme) üretir; u doyuma dayanır.',
      try: 'Türev kaynağını “Ölçüm” yapın ve yeniden başlatın: sıçrama kaybolur, y’nin yanıtı neredeyse aynı kalır.',
      ask: 'Ölçüm üzerinden alınan türev neden tepme üretmez?' },
  ];

  function setValue(id, v){
    const el = $(id);
    if (el.type === 'checkbox'){ el.checked = v; el.dispatchEvent(new Event('change')); }
    else if (el.tagName === 'SELECT'){ el.value = v; el.dispatchEvent(new Event('change')); }
    else { el.value = v; el.dispatchEvent(new Event('input')); }
  }
  function applyScenario(idx){
    const card = $('scenarioCard');
    if (idx === ''){ card.hidden = true; return; }
    const s = SCENARIOS[+idx];
    for (const [id, v] of Object.entries(Object.assign({}, DEFAULTS, s.set))) setValue(id, v);
    (s.open || []).forEach(id=> $(id).open = true);
    card.hidden = false;
    card.innerHTML = `<p><strong>Amaç:</strong> ${s.aim}</p><p><strong>Gözlem:</strong> ${s.see}</p>` +
      `<p><strong>Deneyin:</strong> ${s.try}</p><p class="ask"><strong>Soru:</strong> ${s.ask}</p>`;
    restart();
  }
  function bindScenarios(){
    const sel = $('scenario');
    SCENARIOS.forEach((s, i)=>{ const o = document.createElement('option'); o.value = i; o.textContent = s.title; sel.append(o); });
    sel.addEventListener('change', ()=> applyScenario(sel.value));
  }

  // ---------- Kazanç etkisi laboratuvarı (2.11 + 2.12) ----------
  const LAB_COMMON = { mode: 'PID', kp: 1.2, ki: 0.4, kd: 0.2, dMode: 'measurement', tf: 0, uMin: -5, uMax: 5, antiWindup: true,
    hy: 0.05, uHi: 2, uLo: 0, K: 1, tau: 1.8, theta: 0, hc: 0.02, r: 1, noise: 0 };
  const LAB = {
    kp: { label: 'Kp', values: [0.5, 1, 2, 4], base: { ki: 0, kd: 0, theta: 0.5 } },
    ki: { label: 'Ki', values: [0, 0.5, 1, 2], base: { kp: 1, kd: 0, theta: 0.3 } },
    kd: { label: 'Kd', values: [0, 0.3, 0.6, 1], base: { kp: 3, ki: 1, theta: 0.6 } },
  };
  // Ders kitaplarında verilen tipik eğilimler (kazanç artınca)
  const TEXTBOOK = {
    kp: { rise: 'down', overshoot: 'up', settling: 'small', ess: 'down' },
    ki: { rise: 'down', overshoot: 'up', settling: 'up', ess: 'zero' },
    kd: { rise: 'small', overshoot: 'down', settling: 'down', ess: 'none' },
  };
  const WORDS = { up: '↑ artar', down: '↓ azalır', small: '≈ az değişir', none: '≈ etkilemez', zero: '↓ sıfırlanır', mixedDU: '↕ önce azalır, sonra artar', mixedUD: '↕ önce artar, sonra azalır', na: '—' };
  const METRIC_ROWS = [
    ['rise', 'Yükselme süresi', 0.1, (v)=> sec(v)],
    ['overshoot', 'Aşım', 2, (v)=> v === null ? '—' : '%' + fmt(v, 1)],
    ['settling', 'Yerleşme süresi', 0.5, (v)=> sec(v)],
    ['ess', 'Kalıcı hata', 0.01, (v)=> v === null ? '—' : fmt(v, 3)],
  ];
  let labGain = 'kp', labDirty = true, lab = null;
  const plotLab = new Plot($('plotLab'), { yLabel: 'y' });
  plotLab.redraw = ()=> drawLab();

  function seqColors(){
    const cs = getComputedStyle(document.documentElement);
    return [1, 2, 3, 4].map(i=> cs.getPropertyValue('--seq-' + i).trim());
  }

  function classify(key, vals, metrics, thr){
    if (key === 'overshoot' && metrics.some(m=> m.unstable || m.oscillating)) return 'up';
    const xs = key === 'ess' ? vals.map(v=> v === null ? null : Math.abs(v)) : vals;
    const def = xs.filter(v=> v !== null);
    if (def.length < 2) return 'na';
    const first = def[0], last = def[def.length - 1];
    if (key === 'ess'){
      if (first > 2 * thr && last < thr) return 'zero';
      if (Math.max(...def) < thr) return 'none';
    }
    const diffs = [];
    for (let i = 1; i < def.length; i++) diffs.push(def[i] - def[i - 1]);
    const sig = diffs.filter(d=> Math.abs(d) > thr / 2);
    const mixed = sig.length && sig[0] > 0 ? 'mixedUD' : 'mixedDU';
    if (Math.abs(last - first) < thr) return (Math.max(...def) - Math.min(...def) > 2 * thr) ? mixed : (key === 'ess' ? 'none' : 'small');
    if (sig.some(d=> d > 0) && sig.some(d=> d < 0)) return mixed;
    return last > first ? 'up' : 'down';
  }
  const same = (a, b)=> a === b || (a === 'small' && b === 'none') || (a === 'none' && b === 'small') || (a === 'zero' && b === 'down') || (a === 'down' && b === 'zero');

  function computeLab(){
    const cfg = LAB[labGain];
    const base = $('labBase').value === 'example' ? Object.assign({}, LAB_COMMON, cfg.base) : Object.assign({}, p, { mode: 'PID', noise: 0 });
    const runs = cfg.values.map(v=> runOffline(Object.assign({}, base, { [labGain]: v }), { horizon: 45 }));
    const metrics = runs.map(stepMetrics);
    lab = { cfg, base, runs, metrics };
    labDirty = false;
    renderLab();
  }

  function drawLab(){
    if (!lab) return;
    const cols = seqColors();
    let tMax = 10;
    for (const m of lab.metrics) if (m.settling !== null) tMax = Math.max(tMax, m.settling + STEP_TIME + 4);
    if (lab.metrics.some(m=> m.unstable || m.oscillating || m.settling === null)) tMax = 30;
    tMax = Math.min(tMax, 45);
    let lo = 0, hi = 1.2;
    lab.runs.forEach(r=> r.y.forEach((v, i)=>{ if (r.t[i] <= tMax){ lo = Math.min(lo, v); hi = Math.max(hi, v); } }));
    const yr = niceRange(Math.max(lo, -2) - 0.05, Math.min(hi, 3) + 0.05);
    plotLab.setRanges(0, tMax, yr[0], yr[1]);
    plotLab.begin();
    const r0 = lab.runs[0];
    plotLab.line(r0.t, r0.t.map(t=> t >= STEP_TIME ? lab.base.r : 0), colors.r, { dash: [7, 5], name: 'r', label: false });
    lab.runs.forEach((run, i)=>{
      plotLab.line(run.t, run.y, cols[i], { width: 2.5, name: `${lab.cfg.label} = ${fmt(lab.cfg.values[i], 1)}` });
    });
    plotLab.finish();
  }

  function renderLab(){
    const { cfg, base, metrics } = lab;
    const others = ['kp', 'ki', 'kd'].filter(k=> k !== labGain).map(k=> `${LAB[k].label} = ${fmt(base[k])}`);
    $('labBaseText').textContent = `Sabit tutulanlar: ${others.join(', ')}, θ = ${fmt(base.theta)} s, K = ${fmt(base.K)}, τ = ${fmt(base.tau, 1)} s` +
      ($('labBase').value === 'example' ? ' (bu kazancın etkisini net gösteren örnek süreç)' : ' (sizin ayarlarınız)');
    // Gösterge
    $('labLegend').innerHTML = cfg.values.map((v, i)=> `<span class="chip"><span class="swatch" style="--c:var(--seq-${i + 1})"></span>${cfg.label} = ${fmt(v, 1)}</span>`).join('');
    // Metrik tablosu
    const head = `<thead><tr><th>${cfg.label}</th>${METRIC_ROWS.map(r=> `<th>${r[1]}</th>`).join('')}</tr></thead>`;
    const body = cfg.values.map((v, i)=>{
      const m = metrics[i];
      const cells = METRIC_ROWS.map(([key, , , f])=>{
        if (m.unstable) return '<td>kararsız</td>';
        if (m.oscillating && key !== 'ess') return '<td>salınımlı</td>';
        return `<td>${key === 'settling' && m.settling === null ? 'yerleşmedi' : f(m[key])}</td>`;
      }).join('');
      return `<tr><td><span class="swatch" style="--c:var(--seq-${i + 1})"></span> ${fmt(v, 1)}</td>${cells}</tr>`;
    }).join('');
    $('labTable').innerHTML = head + `<tbody>${body}</tbody>`;

    // Eğilim tablosu (2.12)
    $('trendTitle').textContent = `${cfg.label} artınca ne olur? (${fmt(cfg.values[0], 1)} → ${fmt(cfg.values[cfg.values.length - 1], 1)})`;
    const notes = new Set();
    // Ki = 0 (integralsiz) deneme farklı bir son değere oturur; yükselme, aşım ve yerleşme
    // son değere göre ölçüldüğü için bu denemeyi eğilim hesabına katmıyoruz.
    const skipZeroKi = labGain === 'ki' && cfg.values[0] === 0;
    if (skipZeroKi) notes.add('Ki = 0 olan deneme yükselme, aşım ve yerleşme eğiliminde hesaba katılmadı: integral olmadan çıkış ayar noktasına değil daha düşük bir son değere oturur, bu yüzden bu ölçütler diğerleriyle karşılaştırılamaz.');
    const rows = METRIC_ROWS.map(([key, name, thr, f])=>{
      const skip = skipZeroKi && key !== 'ess';
      const vals = metrics.map(m=> m[key]).slice(skip ? 1 : 0);
      const sim = classify(key, vals, skip ? metrics.slice(1) : metrics, thr);
      const book = TEXTBOOK[labGain][key];
      const ok = same(sim, book) || sim === 'na';
      if (!ok) notes.add(explain(labGain, key, sim, base, metrics));
      const range = sim === 'na' ? '' : ` <span class="hint">(${f(vals[0])} → ${f(vals[vals.length - 1])})</span>`;
      return `<tr><td>${name}</td><td>${WORDS[book]}</td><td>${WORDS[sim]}${range}</td>` +
        `<td class="${ok ? 'match' : 'mismatch'}">${ok ? '✓ uyumlu' : '⚠ farklı'}</td></tr>`;
    }).join('');
    $('trendTable').innerHTML = `<thead><tr><th>Ölçüt</th><th>Ders kitabı kuralı</th><th>Bu simülasyonda</th><th>Karşılaştırma</th></tr></thead><tbody>${rows}</tbody>`;
    const list = $('trendNotes');
    list.innerHTML = '';
    if (![...notes].some(n=> !n.startsWith('Ki = 0'))){
      const li = document.createElement('li');
      li.textContent = 'Bu örnekte simülasyon, ders kitabındaki genel kuralla aynı eğilimi gösteriyor.';
      list.append(li);
    }
    notes.forEach(t=>{ const li = document.createElement('li'); li.textContent = t; list.append(li); });
    drawLab();
  }

  function explain(gain, key, sim, base, metrics){
    const maxOs = Math.max(...metrics.map(m=> m.overshoot || 0));
    if (gain === 'kp' && key === 'overshoot' && base.theta === 0)
      return 'Ölü zamanı olmayan birinci derece bir süreç, oransal kontrolde aşım üretmez. Süreç modelinde θ’yı artırıp tekrar deneyin.';
    if (gain === 'kp' && key === 'rise' && sim === 'up' && base.ki > 0)
      return 'Ki, Kp’ye göre küçük kaldığında yanıtın son kısmını yavaş integral tamamlar; yükselme süresi bu yavaş kuyruk yüzünden uzar.';
    if (gain === 'kd' && key === 'overshoot' && maxOs < 2)
      return 'Aşım zaten yok denecek kadar küçük; D’nin sönümleyici etkisini görmek için önce aşım oluşturun (θ veya Ki’yi artırın).';
    if (key === 'settling' && sim.startsWith('mixed'))
      return 'Yerleşme süresi önce kısalıp sonra uzuyor: küçük kazançta yanıt yavaş, büyük kazançta salınımlı olduğu için yerleşme gecikiyor.';
    return 'Ders kitabındaki kurallar tipik süreçler için yaklaşık eğilimlerdir; sonuç süreç modeline ve diğer kazançlara bağlıdır.';
  }

  function bindLab(){
    document.querySelectorAll('[data-gain]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        labGain = btn.dataset.gain;
        document.querySelectorAll('[data-gain]').forEach(b=> b.setAttribute('aria-checked', String(b === btn)));
        computeLab();
      });
    });
    $('labBase').addEventListener('change', computeLab);
  }

  // ---------- Ana döngü ----------
  let lastLab = 0;
  function frame(now){
    if (lastFrame === null) lastFrame = now;
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    if (view.running){ advance(dt * view.speed); renderDecomp(false); }
    if (metricsDirty) renderMetrics();
    if (labDirty && now - lastLab > 150){ lastLab = now; computeLab(); }
    draw();
    requestAnimationFrame(frame);
  }

  bindControls();
  bindScenarios();
  bindLab();
  renderFormula();
  restart();
  requestAnimationFrame(frame);
})();
