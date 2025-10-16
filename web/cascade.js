// Cascade DO control simulator
(function(){
  const CSS = getComputedStyle(document.documentElement);
  const COLORS = {
    r: CSS.getPropertyValue('--r').trim() || '#fb7185',
    y1: CSS.getPropertyValue('--y').trim() || '#60a5fa',
    y2: '#F59E0B',
    u: CSS.getPropertyValue('--u').trim() || '#8b5cf6',
    grid:'#1f2a4d', axes:'#2a3766'
  };
  function Plot(canvas){ this.c=canvas; this.ctx=canvas.getContext('2d'); this.p={l:48,r:16,t:10,b:26}; this.x=[0,60]; this.y=[0,1.2]; const w=canvas.clientWidth||900; if(canvas.width!==w) canvas.width=w; }
  Plot.prototype.clear=function(){ this.ctx.clearRect(0,0,this.c.width,this.c.height); };
  Plot.prototype.grid=function(){ const {ctx,c,p}=this; const x0=p.l, x1=c.width-p.r, y0=p.t, y1=c.height-p.b; ctx.save(); ctx.strokeStyle=COLORS.axes; ctx.beginPath(); ctx.moveTo(x0,y1); ctx.lineTo(x1,y1); ctx.moveTo(x0,y0); ctx.lineTo(x0,y1); ctx.stroke(); ctx.strokeStyle=COLORS.grid; for(let i=1;i<10;i++){ const x=x0+(x1-x0)*i/10; ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,y1); ctx.stroke(); } for(let j=1;j<6;j++){ const y=y0+(y1-y0)*j/6; ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke(); } ctx.restore(); };
  Plot.prototype.pr=function(x,y){ const {c,p}=this; const [x0,x1]=this.x,[y0,y1]=this.y; const X=p.l+(x-x0)/(x1-x0)*(c.width-p.r-p.l); const Y=(c.height-p.b)-(y-y0)/(y1-y0)*(c.height-p.b-p.t); return [X,Y]; };
  Plot.prototype.line=function(xs,ys,col,w=2){ const {ctx}=this; if(xs.length===0)return; ctx.save(); ctx.strokeStyle=col; ctx.lineWidth=w; ctx.beginPath(); for(let i=0;i<xs.length;i++){ const [X,Y]=this.pr(xs[i],ys[i]); if(i===0)ctx.moveTo(X,Y); else ctx.lineTo(X,Y);} ctx.stroke(); ctx.restore(); };
  Plot.prototype.label=function(text,x,y,col){ const {ctx}=this; const [X,Y]=this.pr(x,y); ctx.save(); ctx.fillStyle=col||'#a7acc0'; ctx.font='12px Segoe UI, Arial'; ctx.fillText(text, X+6, Y-6); ctx.restore(); };
  Plot.prototype.vline=function(x,col){ const {ctx,c,p}=this; const [X]=this.pr(x,0); ctx.save(); ctx.strokeStyle=col||'#a7acc0'; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(X,p.t); ctx.lineTo(X,c.height-p.b); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); };

  function FO(K,tau){ let y=0; return { reset(){y=0;}, y(){return y;}, step(u,d,h){ y += (-(y)+K*(u+d))/tau*h; return y; } } }
  function PID(kp,ki,kd,h){ let I=0,pe=0; let uMin=-5,uMax=5; return { setSat(a,b){uMin=a;uMax=b;}, update(e){ I+=ki*e*h; const D=kd*(e-pe)/h; pe=e; let u=kp*e+I+D; if(u>uMax){I-=u-uMax; u=uMax;} if(u<uMin){I+=uMin-u; u=uMin;} return {u}; }, reset(){I=0;pe=0;} } }

  const els = {
    r1: document.getElementById('r1'), dz: document.getElementById('dz'), dt: document.getElementById('dt'), simT: document.getElementById('simT'), dtms: document.getElementById('dtms'), noise: document.getElementById('noise'),
    kp1: document.getElementById('kp1'), ki1: document.getElementById('ki1'), kd1: document.getElementById('kd1'),
    kp2: document.getElementById('kp2'), ki2: document.getElementById('ki2'), kd2: document.getElementById('kd2'),
    valR1: document.getElementById('valR1'), valDz: document.getElementById('valDz'), valDt: document.getElementById('valDt'), valT: document.getElementById('valT'), valH: document.getElementById('valH'), valKp1: document.getElementById('valKp1'), valKi1: document.getElementById('valKi1'), valKd1: document.getElementById('valKd1'), valKp2: document.getElementById('valKp2'), valKi2: document.getElementById('valKi2'), valKd2: document.getElementById('valKd2'),
    btnRestart: document.getElementById('btnRestart'), btnPause: document.getElementById('btnPause'), btnResume: document.getElementById('btnResume'),
    cdo: document.getElementById('c_do'), cin: document.getElementById('c_inner')
  };

  const state = { r1:0.6, dz:0.2, dt:10, T:60, hms:20, noise:false, kp1:0.9, ki1:0.22, kd1:0.12, kp2:1.5, ki2:0.5, kd2:0.12, running:true };
  function sync(){ els.valR1.textContent=state.r1.toFixed(2); els.valDz.textContent=state.dz.toFixed(2); els.valDt.textContent=state.dt.toFixed(0); els.valT.textContent=state.T.toFixed(0); els.valH.textContent=state.hms.toFixed(0); els.valKp1.textContent=state.kp1.toFixed(2); els.valKi1.textContent=state.ki1.toFixed(2); els.valKd1.textContent=state.kd1.toFixed(2); els.valKp2.textContent=state.kp2.toFixed(2); els.valKi2.textContent=state.ki2.toFixed(2); els.valKd2.textContent=state.kd2.toFixed(2); }

  [['r1','r1'],['dz','dz'],['dt','dt'],['simT','T'],['dtms','hms'],['kp1','kp1'],['ki1','ki1'],['kd1','kd1'],['kp2','kp2'],['ki2','ki2'],['kd2','kd2']].forEach(([id,key])=>{
    els[id].addEventListener('input', e=>{ state[key]=parseFloat(e.target.value); sync(); });
  });
  els.noise.addEventListener('change', ()=>{ state.noise=els.noise.checked; });
  els.btnPause.addEventListener('click', ()=>{ state.running=false; els.btnPause.disabled=true; els.btnResume.disabled=false; });
  els.btnResume.addEventListener('click', ()=>{ state.running=true; els.btnPause.disabled=false; els.btnResume.disabled=true; });
  els.btnRestart.addEventListener('click', ()=>{ restart(); });

  let fast, slow, outer, inner, t, xs, y1s, y2s, rs, us;
  const plotDO = new Plot(els.cdo); const plotIN = new Plot(els.cin); plotIN.y=[-5,5];

  function noise(){ if(!state.noise) return 0; return (Math.random()-0.5)*0.02; }
  function disturb(tt){ return tt>=state.dt ? state.dz : 0; }

  function restart(){ const h=state.hms/1000; fast=FO(1,0.5); slow=FO(1,3.0); outer=PID(state.kp1,state.ki1,state.kd1,h); inner=PID(state.kp2,state.ki2,state.kd2,h); inner.setSat(-5,5); outer.reset(); inner.reset(); fast.reset(); slow.reset(); t=0; xs=[]; y1s=[]; y2s=[]; rs=[]; us=[]; }

  function step(){ const h=state.hms/1000; if(state.running){ const r=state.r1; const y1m=(slow.y()+noise()); const e1=r-y1m; const r2=outer.update(e1).u; const e2=r2-fast.y(); const u=inner.update(e2).u; const y2=fast.step(u, disturb(t), h); const y1=slow.step(y2,0,h); t+=h; xs.push(t); rs.push(r); y1s.push(y1); y2s.push(y2); us.push(u); while(xs.length>0 && xs[xs.length-1]-xs[0]>state.T){ xs.shift(); rs.shift(); y1s.shift(); y2s.shift(); us.shift(); } }
    draw(); requestAnimationFrame(step); }

  function draw(){ // DO plot
    plotDO.clear(); plotDO.grid(); const xMax=xs[xs.length-1]||state.T; plotDO.x=[Math.max(0,xMax-state.T), xMax]; plotDO.y=[0,1.2];
    plotDO.line(xs, rs, COLORS.r, 2); plotDO.line(xs, y1s, COLORS.y1, 3); plotDO.line(xs, y2s, COLORS.y2, 2);
    const i=xs.length-1; if(i>0){ plotDO.label('r1 (DO setpoint)', xs[i], rs[i], COLORS.r); plotDO.label('y1 (DO)', xs[i], y1s[i], COLORS.y1); plotDO.label('y2 (rpm/air)', xs[i], y2s[i], COLORS.y2); }
    if(state.dt>=plotDO.x[0] && state.dt<=plotDO.x[1]){ plotDO.vline(state.dt, '#a7acc0'); plotDO.label('bozucu', state.dt, 1.15, '#a7acc0'); }

    // Inner control plot
    plotIN.clear(); plotIN.grid(); plotIN.x=plotDO.x; plotIN.line(xs, us, COLORS.u, 3); if(i>0){ plotIN.label('u (C2 output)', xs[i], us[i], COLORS.u); }
  }

  function onResize(){ [els.cdo, els.cin].forEach(cv=>{ const w=cv.clientWidth||900; if(cv.width!==w) cv.width=w; }); }
  window.addEventListener('resize', onResize);

  sync(); restart(); onResize(); requestAnimationFrame(step);
})();
