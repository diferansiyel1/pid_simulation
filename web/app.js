/* PID simülatörü: birinci derece süreç, PID veya aç-kapa (ON-OFF) kontrolör */
(function(){
  const { PID, firstOrder, Plot, colors, fmt, niceRange, bindRange } = Sim;

  const U_MIN = -5, U_MAX = 5; // kontrol çıkışı doyum sınırları

  const state = {
    mode: 'PID', // 'PID' | 'ONOFF'
    kp: 1.2, ki: 0.4, kd: 0.2,
    r: 1.0,
    dz: 0.3,
    dt_s: 8.0,
    total_s: 40.0,
    h_ms: 16,
    hy: 0.05, // histerezis bandı (hata = 0 çevresinde ±)
    u_hi: 2.0,
    u_lo: 0.0,
    showP: true, showI: true, showD: true, showU: true,
    antiWindup: true,
    noise: false,
    running: true,
  };

  const plant = firstOrder(1.0, 1.8); // K = 1, τ = 1,8 s
  const pid = new PID({ kp: state.kp, ki: state.ki, kd: state.kd, h: state.h_ms / 1000, uMin: U_MIN, uMax: U_MAX });
  let onoffState = 0; // 0 = kapalı, 1 = açık
  let t = 0; // s
  let xs = [], rs = [], ys = [], Ps = [], Is = [], Ds = [], Us = [];

  const $ = (id)=>document.getElementById(id);
  const plotY = new Plot($('plotY'), { yLabel: 'y, r' });
  const plotTerms = new Plot($('plotTerms'), { yLabel: 'u, P, I, D' });

  function restart(){
    plant.reset(); pid.reset();
    onoffState = 0;
    t = 0; xs = []; rs = []; ys = []; Ps = []; Is = []; Ds = []; Us = [];
    updateReadout(0);
  }

  function disturbance(tt){ return tt >= state.dt_s ? state.dz : 0; }
  function noise(){ return state.noise ? (Math.random() - 0.5) * 0.04 : 0; }

  function step(){
    const h = state.h_ms / 1000;
    if (state.running){
      const r = state.r;
      const yMeas = plant.y + noise();
      const e = r - yMeas;
      let terms;
      if (state.mode === 'PID'){
        terms = pid.update(e, yMeas, state.antiWindup);
      } else {
        if (onoffState === 1 && e < -state.hy) onoffState = 0;
        else if (onoffState === 0 && e > state.hy) onoffState = 1;
        const u = onoffState ? state.u_hi : state.u_lo;
        terms = { u, P: 0, I: 0, D: 0 };
      }
      const y = plant.step(terms.u, disturbance(t), h);
      t += h;
      xs.push(t); rs.push(r); ys.push(y);
      Ps.push(terms.P); Is.push(terms.I); Ds.push(terms.D); Us.push(terms.u);
      while (xs.length > 0 && xs[xs.length - 1] - xs[0] > state.total_s){
        xs.shift(); rs.shift(); ys.shift(); Ps.shift(); Is.shift(); Ds.shift(); Us.shift();
      }
      updateReadout(terms.u);
    }
    draw();
    requestAnimationFrame(step);
  }

  function extent(arrays, lo, hi){
    for (const a of arrays) for (let i = 0; i < a.length; i++){ if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
    return [lo, hi];
  }

  function draw(){
    const xMax = xs.length ? xs[xs.length - 1] : 0;
    const x0 = Math.max(0, xMax - state.total_s), x1 = Math.max(state.total_s, xMax);

    const [yLo, yHi] = extent([ys, rs], 0, 1.2);
    const yr = niceRange(yLo - 0.05, yHi + 0.05);
    plotY.setRanges(x0, x1, yr[0], yr[1]);
    plotY.begin();
    plotY.line(xs, rs, colors.r, { dash: [7, 5], name: 'r' });
    plotY.line(xs, ys, colors.y, { width: 2.5, name: 'y' });
    plotY.vline(state.dt_s, 'bozucu');
    plotY.finish();

    const pidMode = state.mode === 'PID';
    const shown = [];
    if (state.showU) shown.push(Us);
    if (pidMode){ if (state.showP) shown.push(Ps); if (state.showI) shown.push(Is); if (state.showD) shown.push(Ds); }
    const [tLo, tHi] = extent(shown, -0.2, 1.2);
    const tr = niceRange(tLo - 0.1, tHi + 0.1);
    plotTerms.setRanges(x0, x1, tr[0], tr[1]);
    plotTerms.begin();
    if (pidMode){
      if (state.showP) plotTerms.line(xs, Ps, colors.P, { name: 'P' });
      if (state.showI) plotTerms.line(xs, Is, colors.I, { name: 'I' });
      if (state.showD) plotTerms.line(xs, Ds, colors.D, { name: 'D' });
    }
    if (state.showU) plotTerms.line(xs, Us, colors.u, { width: 2.5, name: 'u' });
    plotTerms.vline(state.dt_s, 'bozucu');
    plotTerms.finish();
  }

  function outputRange(){
    if (state.mode === 'PID') return [U_MIN, U_MAX];
    const lo = Math.min(state.u_lo, state.u_hi, 0), hi = Math.max(state.u_lo, state.u_hi, 0);
    return [lo, hi > lo ? hi : lo + 1];
  }

  // Gösterge: sıfırdan u'ya kadar dolar; sınırlar doyum aralığıdır.
  function updateReadout(u){
    const [lo, hi] = outputRange();
    const pos = (v)=>100 * (Sim.clamp(v, lo, hi) - lo) / (hi - lo);
    const z = pos(0), p = pos(u);
    $('uVal').textContent = 'u = ' + fmt(u, 2);
    $('uZero').style.left = `calc(${z}% - 1px)`;
    $('uFill').style.left = Math.min(z, p) + '%';
    $('uFill').style.width = Math.abs(p - z) + '%';
    $('uBar').setAttribute('aria-valuenow', u.toFixed(2));
    $('uMinLbl').textContent = fmt(lo, 1);
    $('uMaxLbl').textContent = fmt(hi, 1);
  }

  function bindControls(){
    bindRange('kp', v=>{ state.kp = v; pid.kp = v; });
    bindRange('ki', v=>{ state.ki = v; pid.ki = v; });
    bindRange('kd', v=>{ state.kd = v; pid.kd = v; });
    bindRange('sp', v=>{ state.r = v; });
    bindRange('dz', v=>{ state.dz = v; });
    bindRange('dt', v=>{ state.dt_s = v; });
    bindRange('simT', v=>{ state.total_s = v; });
    bindRange('dtms', v=>{ state.h_ms = v; pid.h = v / 1000; pid.prevY = null; });
    bindRange('hy', v=>{ state.hy = v; });
    bindRange('uhi', v=>{ state.u_hi = v; });
    bindRange('ulo', v=>{ state.u_lo = v; });

    const mode = $('mode');
    const applyMode = ()=>{
      state.mode = mode.value;
      document.querySelectorAll('[data-mode]').forEach(el=>{ el.hidden = el.dataset.mode !== state.mode; });
      const pidMode = state.mode === 'PID';
      document.querySelectorAll('[data-series="showP"],[data-series="showI"],[data-series="showD"]').forEach(el=>{ el.hidden = !pidMode; });
      $('uChipText').textContent = pidMode ? 'u = P + I + D' : 'u — aç-kapa çıkışı';
      $('termsTitle').textContent = pidMode ? 'Kontrol sinyali u(t) ve P, I, D katkıları' : 'Kontrol sinyali u(t)';
      plotTerms.yLabel = pidMode ? 'u, P, I, D' : 'u';
    };
    mode.addEventListener('change', applyMode);
    applyMode();

    $('antiWindup').addEventListener('change', e=>{ state.antiWindup = e.target.checked; });
    $('noise').addEventListener('change', e=>{ state.noise = e.target.checked; });
    state.antiWindup = $('antiWindup').checked; state.noise = $('noise').checked;

    document.querySelectorAll('[data-series]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const key = btn.dataset.series;
        state[key] = !state[key];
        btn.setAttribute('aria-pressed', String(state[key]));
      });
    });

    $('btnRestart').addEventListener('click', restart);
    const pause = $('btnPause');
    pause.addEventListener('click', ()=>{
      state.running = !state.running;
      pause.textContent = state.running ? 'Duraklat' : 'Devam et';
      pause.setAttribute('aria-pressed', String(!state.running));
    });
  }

  bindControls();
  restart();
  requestAnimationFrame(step);
})();
