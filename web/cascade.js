/* Kaskad DO kontrolü: dış PID (C1) DO'yu, iç PID (C2) karıştırma/hava debisini kontrol eder */
(function(){
  const { PID, firstOrder, Plot, colors, niceRange, bindRange } = Sim;

  const state = { r1: 0.6, dz: 0.2, dt: 10, T: 60, hms: 20, noise: false, running: true };

  const fast = firstOrder(1, 0.5); // iç süreç: karıştırma/hava (y2)
  const slow = firstOrder(1, 3.0); // dış süreç: çözünmüş oksijen (y1)
  const outer = new PID({ kp: 0.9, ki: 0.22, kd: 0.12, h: state.hms / 1000 });
  const inner = new PID({ kp: 1.5, ki: 0.5, kd: 0.12, h: state.hms / 1000 });
  let t, xs, y1s, y2s, rs, us;

  const $ = (id)=>document.getElementById(id);
  const plotDO = new Plot($('c_do'), { yLabel: 'normalize değer' });
  const plotIN = new Plot($('c_inner'), { yLabel: 'u' });

  function noise(){ return state.noise ? (Math.random() - 0.5) * 0.02 : 0; }
  function disturb(tt){ return tt >= state.dt ? state.dz : 0; }

  function restart(){
    fast.reset(); slow.reset(); outer.reset(); inner.reset();
    t = 0; xs = []; y1s = []; y2s = []; rs = []; us = [];
  }

  function step(){
    const h = state.hms / 1000;
    if (state.running){
      const r = state.r1;
      const y1m = slow.y + noise();
      const r2 = outer.update(r - y1m, y1m).u;
      const y2m = fast.y;
      const u = inner.update(r2 - y2m, y2m).u;
      const y2 = fast.step(u, disturb(t), h);
      const y1 = slow.step(y2, 0, h);
      t += h;
      xs.push(t); rs.push(r); y1s.push(y1); y2s.push(y2); us.push(u);
      while (xs.length > 0 && xs[xs.length - 1] - xs[0] > state.T){ xs.shift(); rs.shift(); y1s.shift(); y2s.shift(); us.shift(); }
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
    const x0 = Math.max(0, xMax - state.T), x1 = Math.max(state.T, xMax);

    const [lo, hi] = extent([rs, y1s, y2s], 0, 1);
    const yr = niceRange(lo - 0.05, hi + 0.05);
    plotDO.setRanges(x0, x1, yr[0], yr[1]);
    plotDO.begin();
    plotDO.line(xs, rs, colors.r, { dash: [7, 5], name: 'r1' });
    plotDO.line(xs, y2s, colors.y2, { name: 'y2' });
    plotDO.line(xs, y1s, colors.y, { width: 2.5, name: 'y1' });
    plotDO.vline(state.dt, 'bozucu');
    plotDO.finish();

    const [ulo, uhi] = extent([us], -0.2, 1);
    const ur = niceRange(ulo - 0.1, uhi + 0.1);
    plotIN.setRanges(x0, x1, ur[0], ur[1]);
    plotIN.begin();
    plotIN.line(xs, us, colors.u, { width: 2.5, name: 'u' });
    plotIN.vline(state.dt, 'bozucu');
    plotIN.finish();
  }

  bindRange('r1', v=>{ state.r1 = v; });
  bindRange('kp1', v=>{ outer.kp = v; });
  bindRange('ki1', v=>{ outer.ki = v; });
  bindRange('kd1', v=>{ outer.kd = v; });
  bindRange('kp2', v=>{ inner.kp = v; });
  bindRange('ki2', v=>{ inner.ki = v; });
  bindRange('kd2', v=>{ inner.kd = v; });
  bindRange('dz', v=>{ state.dz = v; });
  bindRange('dt', v=>{ state.dt = v; });
  bindRange('simT', v=>{ state.T = v; });
  bindRange('dtms', v=>{
    state.hms = v;
    outer.h = inner.h = v / 1000;
    outer.prevY = inner.prevY = null;
  });
  const noiseBox = $('noise');
  noiseBox.addEventListener('change', ()=>{ state.noise = noiseBox.checked; });
  state.noise = noiseBox.checked;

  $('btnRestart').addEventListener('click', restart);
  const pause = $('btnPause');
  pause.addEventListener('click', ()=>{
    state.running = !state.running;
    pause.textContent = state.running ? 'Duraklat' : 'Devam et';
    pause.setAttribute('aria-pressed', String(!state.running));
  });

  restart();
  requestAnimationFrame(step);
})();
