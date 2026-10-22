/* Uygulama örnekleri sayfası için hafif kaskad demoları */
(function(){
  const { PID, firstOrder, Plot, colors } = Sim;
  const WINDOW = 40; // s

  function demo(canvasId, params){
    const el = document.getElementById(canvasId); if (!el) return;
    const plot = new Plot(el, { yLabel: 'normalize değer' });
    const h = 0.02; let t = 0;
    const xs = [], ys = [], y2s = [], rs = [];
    const fast = firstOrder(1, params.tauFast), slow = firstOrder(1, params.tauSlow);
    const outer = new PID({ kp: params.kp1, ki: params.ki1, kd: params.kd1, h });
    const inner = new PID({ kp: params.kp2, ki: params.ki2, kd: params.kd2, h });
    const disturb = (tt)=> tt >= params.dTime ? params.dAmp : 0;

    function step(){
      const r = 1.0;
      const r2 = outer.update(r - slow.y, slow.y).u;
      const u = inner.update(r2 - fast.y, fast.y).u;
      const y2 = fast.step(u, disturb(t), h);
      const y1 = slow.step(y2, 0, h);
      t += h; xs.push(t); rs.push(r); ys.push(y1); y2s.push(y2);
      while (xs.length > 0 && xs[xs.length - 1] - xs[0] > WINDOW){ xs.shift(); rs.shift(); ys.shift(); y2s.shift(); }
      draw(); requestAnimationFrame(step);
    }
    function draw(){
      const xMax = xs.length ? xs[xs.length - 1] : 0;
      plot.setRanges(Math.max(0, xMax - WINDOW), Math.max(WINDOW, xMax), -0.5, 2.0);
      plot.begin();
      plot.line(xs, rs, colors.r, { dash: [7, 5], name: 'r' });
      plot.line(xs, y2s, colors.y2, { name: 'y2' });
      plot.line(xs, ys, colors.y, { width: 2.5, name: 'y1' });
      plot.vline(params.dTime, 'bozucu');
      plot.finish();
    }
    requestAnimationFrame(step);
  }

  demo('ex1', { tauFast: 0.6, tauSlow: 2.5, kp1: 0.8, ki1: 0.2, kd1: 0.1, kp2: 1.2, ki2: 0.4, kd2: 0.1, dTime: 6, dAmp: 0.3 });
  demo('ex2', { tauFast: 0.5, tauSlow: 3.0, kp1: 0.7, ki1: 0.25, kd1: 0.1, kp2: 1.4, ki2: 0.5, kd2: 0.1, dTime: 8, dAmp: -0.25 });
  demo('ex3', { tauFast: 0.4, tauSlow: 3.5, kp1: 0.9, ki1: 0.22, kd1: 0.12, kp2: 1.5, ki2: 0.5, kd2: 0.12, dTime: 5, dAmp: 0.2 });
})();
