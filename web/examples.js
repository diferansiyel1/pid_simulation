// Lightweight cascade demos for examples page
(function(){
  const COLORS = {
    r:'#fb7185', y:'#60a5fa', y2:'#F59E0B', u:'#8b5cf6', grid:'#1f2a4d', axes:'#2a3766'
  };
  function Plot(canvas){
    this.c=canvas; this.ctx=canvas.getContext('2d'); this.p={l:36,r:10,t:10,b:20};
    this.x=[0,40]; this.y=[-0.2,2];
    const w = canvas.clientWidth||800; if(canvas.width!==w) canvas.width=w;
  }
  Plot.prototype.clear=function(){ this.ctx.clearRect(0,0,this.c.width,this.c.height); };
  Plot.prototype.grid=function(){ const {ctx,c,p}=this; const x0=p.l, x1=c.width-p.r, y0=p.t, y1=c.height-p.b; ctx.save();
    ctx.strokeStyle=COLORS.axes; ctx.beginPath(); ctx.moveTo(x0,y1); ctx.lineTo(x1,y1); ctx.moveTo(x0,y0); ctx.lineTo(x0,y1); ctx.stroke();
    ctx.strokeStyle=COLORS.grid; for(let i=1;i<10;i++){ const x=x0+(x1-x0)*i/10; ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,y1); ctx.stroke(); }
    for(let j=1;j<6;j++){ const y=y0+(y1-y0)*j/6; ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke(); } ctx.restore(); };
  Plot.prototype.pr=function(x,y){ const {c,p}=this; const [x0,x1]=this.x,[y0,y1]=this.y; const X=p.l+(x-x0)/(x1-x0)*(c.width-p.r-p.l); const Y=(c.height-p.b)-(y-y0)/(y1-y0)*(c.height-p.b-p.t); return [X,Y]; };
  Plot.prototype.line=function(xs,ys,col,w=2){ const {ctx}=this; if(xs.length===0)return; ctx.save(); ctx.strokeStyle=col; ctx.lineWidth=w; ctx.beginPath(); for(let i=0;i<xs.length;i++){ const [X,Y]=this.pr(xs[i],ys[i]); if(i===0)ctx.moveTo(X,Y); else ctx.lineTo(X,Y);} ctx.stroke(); ctx.restore(); };
  Plot.prototype.label=function(text,x,y,col){ const {ctx}=this; const [X,Y]=this.pr(x,y); ctx.save(); ctx.fillStyle=col||'#a7acc0'; ctx.font='12px Segoe UI, Arial'; ctx.fillText(text, X+6, Y-6); ctx.restore(); };
  Plot.prototype.vline=function(x,col){ const {ctx,c,p}=this; const [X]=this.pr(x,0); ctx.save(); ctx.strokeStyle=col||'#a7acc0'; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(X,p.t); ctx.lineTo(X,c.height-p.b); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); };

  function FO(K,tau){ let y=0; return { reset(){y=0;}, y(){return y;}, step(u,d,h){ y += (-(y)+K*(u+d))/tau*h; return y; } } }
  function PID(kp,ki,kd,h){ let I=0,pe=0; return { update(e){ I+=ki*e*h; const D=kd*(e-pe)/h; pe=e; return {u:kp*e+I+D}; }, reset(){I=0;pe=0;} } }

  function demo(canvasId, params){
    const el=document.getElementById(canvasId); if(!el) return; const plot=new Plot(el);
    const h=0.02; let t=0; const xs=[], ys=[], y2s=[], rs=[], us=[];
    const fast=FO(1, params.tauFast); const slow=FO(1, params.tauSlow);
    const outer=PID(params.kp1, params.ki1, params.kd1, h);
    const inner=PID(params.kp2, params.ki2, params.kd2, h);
    fast.reset(); slow.reset(); outer.reset(); inner.reset();
    function disturb(tt){ return tt>=params.dTime ? params.dAmp : 0; }
    function step(){
      // cascade
      const r=1.0; const e1=r - slow.y(); const r2 = outer.update(e1).u;
      const e2 = r2 - fast.y(); const u = inner.update(e2).u;
      const y2 = fast.step(u, disturb(t), h);
      const y1 = slow.step(y2, 0, h);
      t+=h; xs.push(t); rs.push(r); ys.push(y1); y2s.push(y2); us.push(u);
      while(xs.length>0 && xs[xs.length-1]-xs[0]>40){ xs.shift(); rs.shift(); ys.shift(); y2s.shift(); us.shift(); }
      draw(); requestAnimationFrame(step);
    }
    function draw(){ plot.clear(); plot.grid(); plot.x=[Math.max(0,xs[xs.length-1]-40)||0, xs[xs.length-1]||40]; plot.y=[-0.2,2.0];
      plot.line(xs, rs, COLORS.r, 2); plot.line(xs, ys, COLORS.y, 3); plot.line(xs, y2s, COLORS.y2, 2);
      // semantic overlays
      const i = xs.length-1; if(i>0){
        plot.label('r: setpoint', xs[i], rs[i], COLORS.r);
        plot.label('y1: output (slow)', xs[i], ys[i], COLORS.y);
        plot.label('y2: inner (fast)', xs[i], y2s[i], COLORS.y2);
      }
      // disturbance marker
      if(params.dTime>=plot.x[0] && params.dTime<=plot.x[1]){
        plot.vline(params.dTime, '#a7acc0');
        plot.label('disturbance', params.dTime, plot.y[1]-0.05, '#a7acc0');
      }
    }
    function onResize(){ const w = el.clientWidth||800; if(el.width!==w) el.width=w; }
    window.addEventListener('resize', onResize);
    onResize(); step();
  }

  // Example presets
  window.addEventListener('load', ()=>{
    demo('ex1', { tauFast:0.6, tauSlow:2.5, kp1:0.8, ki1:0.2, kd1:0.1, kp2:1.2, ki2:0.4, kd2:0.1, dTime:6, dAmp:0.3 });
    demo('ex2', { tauFast:0.5, tauSlow:3.0, kp1:0.7, ki1:0.25, kd1:0.1, kp2:1.4, ki2:0.5, kd2:0.1, dTime:8, dAmp:-0.25 });
    demo('ex3', { tauFast:0.4, tauSlow:3.5, kp1:0.9, ki1:0.22, kd1:0.12, kp2:1.5, ki2:0.5, kd2:0.12, dTime:5, dAmp:0.2 });
  });
})();
