/* PID Visualizer - Bioprocess Control */

const COLORS = {
  r: getComputedStyle(document.documentElement).getPropertyValue('--r').trim() || '#fb7185',
  y: getComputedStyle(document.documentElement).getPropertyValue('--y').trim() || '#60a5fa',
  P: getComputedStyle(document.documentElement).getPropertyValue('--p').trim() || '#f472b6',
  I: getComputedStyle(document.documentElement).getPropertyValue('--i').trim() || '#22d3ee',
  D: getComputedStyle(document.documentElement).getPropertyValue('--d').trim() || '#c084fc',
  U: getComputedStyle(document.documentElement).getPropertyValue('--u').trim() || '#8b5cf6',
  grid: '#1f2a4d',
  axes: '#2a3766',
};

const state = {
  mode: 'PID', // 'PID' | 'ONOFF'
  kp: 1.2, ki: 0.4, kd: 0.2,
  r: 1.0,
  dz: 0.3,
  dt_s: 8.0,
  total_s: 40.0,
  h_ms: 16,
  hy: 0.05, // hysteresis band (+/- around error=0)
  u_hi: 2.0,
  u_lo: 0.0,
  showP: true, showI: true, showD: true, showU: true,
  antiWindup: true,
  noise: false,
  running: true,
};

// Plant: first-order with time constant and gain
function createPlant() {
  const K = 1.0;
  const tau = 1.8; // process time constant (s)
  let y = 0;
  return {
    reset() { y = 0; },
    step(u, d, h) { // Euler discretization
      const dy = (-(y) + K * (u + d)) / tau * h;
      y += dy;
      return y;
    },
    get y() { return y; }
  };
}

function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }

class PID {
  constructor(kp, ki, kd, h){
    this.kp = kp; this.ki = ki; this.kd = kd; this.h = h;
    this.i = 0; this.prevE = 0; this.uMin = -Infinity; this.uMax = Infinity;
  }
  reset(){ this.i = 0; this.prevE = 0; }
  setSaturation(lo, hi){ this.uMin = lo; this.uMax = hi; }
  update(e, antiWindup){
    const P = this.kp * e;
    this.i += this.ki * e * this.h;
    const D = this.kd * (e - this.prevE) / this.h;
    let u = P + this.i + D;
    const saturated = (u > this.uMax || u < this.uMin);
    if (antiWindup && saturated){
      // back-calculation: roll back integral contribution exceeding limits
      const uClamped = clamp(u, this.uMin, this.uMax);
      const excess = u - uClamped;
      this.i -= excess; // simple anti-windup
      u = uClamped;
    } else {
      u = clamp(u, this.uMin, this.uMax);
    }
    this.prevE = e;
    return { u, P, I: this.i, D };
  }
}

// Plotting utilities
class Plot {
  constructor(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.clientWidth || 900;
    this.height = canvas.height;
    if (canvas.width !== this.width) canvas.width = this.width;
    this.padding = {l:48, r:16, t:10, b:26};
    this.xRange = [0, 40];
    this.yRange = [-0.2, 2.0];
  }
  setRanges(x0,x1,y0,y1){ this.xRange=[x0,x1]; this.yRange=[y0,y1]; }
  clear(){ this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height); }
  drawGrid(){
    const {ctx,width,height,padding}=this;
    ctx.save();
    ctx.strokeStyle=COLORS.grid; ctx.lineWidth=1;
    const x0=padding.l, x1=width-padding.r, y0=padding.t, y1=height-padding.b;
    // axes
    ctx.strokeStyle=COLORS.axes; ctx.beginPath();
    ctx.moveTo(x0,y1); ctx.lineTo(x1,y1); // x-axis
    ctx.moveTo(x0,y0); ctx.lineTo(x0,y1); // y-axis
    ctx.stroke();
    // grid lines
    ctx.strokeStyle=COLORS.grid;
    const xTicks=10, yTicks=8;
    for(let i=1;i<xTicks;i++){
      const x = x0 + (x1-x0)*i/xTicks; ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,y1); ctx.stroke();
    }
    for(let j=1;j<yTicks;j++){
      const y = y0 + (y1-y0)*j/yTicks; ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke();
    }
    ctx.restore();
  }
  project(x,y){
    const {width,height,padding,xRange,yRange}=this;
    const x0=padding.l, x1=width-padding.r, y0=padding.t, y1=height-padding.b;
    const xp = x0 + (x - xRange[0])/(xRange[1]-xRange[0]) * (x1-x0);
    const yp = y1 - (y - yRange[0])/(yRange[1]-yRange[0]) * (y1-y0);
    return [xp, yp];
  }
  polyline(xs, ys, color, width=2){
    const {ctx}=this; if(xs.length===0) return;
    ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=width; ctx.beginPath();
    for(let i=0;i<xs.length;i++){
      const [px,py]=this.project(xs[i], ys[i]);
      if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.stroke(); ctx.restore();
  }
  label(text, x, y, color='#9aa3b2'){
    const {ctx}=this; ctx.save(); ctx.fillStyle=color; ctx.font='12px Segoe UI, Arial';
    const [px,py]=this.project(x,y); ctx.fillText(text, px+6, py-6); ctx.restore();
  }
}

// DOM
const els = {
  uPctVal: document.getElementById('uPctVal'),
  uPctFill: document.getElementById('uPctFill'),
  mode: document.getElementById('mode'), hy: document.getElementById('hy'), uhi: document.getElementById('uhi'), ulo: document.getElementById('ulo'),
  kp: document.getElementById('kp'), ki: document.getElementById('ki'), kd: document.getElementById('kd'),
  sp: document.getElementById('sp'), dz: document.getElementById('dz'), dt: document.getElementById('dt'),
  simT: document.getElementById('simT'), dtms: document.getElementById('dtms'),
  showP: document.getElementById('showP'), showI: document.getElementById('showI'), showD: document.getElementById('showD'), showU: document.getElementById('showU'),
  antiWindup: document.getElementById('antiWindup'), noise: document.getElementById('noise'),
  btnRestart: document.getElementById('btnRestart'), btnPause: document.getElementById('btnPause'), btnResume: document.getElementById('btnResume'),
  plotY: document.getElementById('plotY'), plotTerms: document.getElementById('plotTerms'),
  valKp: document.getElementById('valKp'), valKi: document.getElementById('valKi'), valKd: document.getElementById('valKd'),
  valR: document.getElementById('valR'), valDz: document.getElementById('valDz'), valDt: document.getElementById('valDt'), valT: document.getElementById('valT'), valH: document.getElementById('valH'),
  valHy: document.getElementById('valHy'), valUhi: document.getElementById('valUhi'), valUlo: document.getElementById('valUlo'),
  legend: document.getElementById('legend'),
};

function syncLabels(){
  els.mode.value = state.mode;
  els.valKp.textContent = state.kp.toFixed(2);
  els.valKi.textContent = state.ki.toFixed(2);
  els.valKd.textContent = state.kd.toFixed(2);
  els.valR.textContent = state.r.toFixed(2);
  els.valDz.textContent = state.dz.toFixed(2);
  els.valDt.textContent = state.dt_s.toFixed(0);
  els.valT.textContent = state.total_s.toFixed(0);
  els.valH.textContent = state.h_ms.toFixed(0);
  els.valHy.textContent = state.hy.toFixed(2);
  els.valUhi.textContent = state.u_hi.toFixed(1);
  els.valUlo.textContent = state.u_lo.toFixed(1);
}

function controlRange(){
  if(state.mode === 'PID'){
    const lo = (pid && typeof pid.uMin !== 'undefined') ? pid.uMin : -5;
    const hi = (pid && typeof pid.uMax !== 'undefined') ? pid.uMax : 5;
    return [lo, hi];
  }
  const lo = Math.min(state.u_lo, state.u_hi);
  const hi = Math.max(state.u_lo, state.u_hi);
  return [lo, hi === lo ? lo + 1e-6 : hi];
}

function updateUPct(uVal){
  const [umin, umax] = controlRange();
  const pct = Math.round(100 * (uVal - umin) / (umax - umin));
  const clampPct = Math.max(0, Math.min(100, pct));
  if (els.uPctVal) els.uPctVal.textContent = `${clampPct}%`;
  if (els.uPctFill) els.uPctFill.style.width = `${clampPct}%`;
}

function bindControls(){
  const map = [
    ['kp','kp'],['ki','ki'],['kd','kd'],['sp','r'],['dz','dz'],['dt','dt_s'],['simT','total_s'],['dtms','h_ms'],
    ['hy','hy'],['uhi','u_hi'],['ulo','u_lo']
  ];
  map.forEach(([id,key])=>{
    els[id].addEventListener('input', (e)=>{
      const v = parseFloat(e.target.value);
      state[key] = v;
      syncLabels();
      // Live-apply to controller without full restart
      if (pid) {
        if (key === 'kp') pid.kp = v;
        if (key === 'ki') pid.ki = v;
        if (key === 'kd') pid.kd = v;
        if (key === 'h_ms') { pid.h = state.h_ms / 1000; pid.prevE = 0; }
      }
    });
  });
  els.mode.addEventListener('change', ()=>{ state.mode = els.mode.value; });
  ['showP','showI','showD','showU','antiWindup','noise'].forEach(id=>{
    els[id].addEventListener('change', ()=>{ state[id] = els[id].checked; });
  });
  els.btnRestart.addEventListener('click', ()=>{ restart(); });
  els.btnPause.addEventListener('click', ()=>{ state.running=false; els.btnPause.disabled=true; els.btnResume.disabled=false; });
  els.btnResume.addEventListener('click', ()=>{ state.running=true; els.btnPause.disabled=false; els.btnResume.disabled=true; });
}

// Simulation loop
let plant, pid;
let onoff_state = 0; // 0=OFF, 1=ON
let t = 0; // seconds
let xs=[], rs=[], ys=[], Ps=[], Is=[], Ds=[], Us=[];

function restart(){
  const h = state.h_ms/1000;
  plant = createPlant(); plant.reset();
  pid = new PID(state.kp, state.ki, state.kd, h);
  pid.setSaturation(-5.0, 5.0);
  pid.reset();
  onoff_state = 0;
  t=0; xs=[]; rs=[]; ys=[]; Ps=[]; Is=[]; Ds=[]; Us=[];
}

function disturbance(tt){
  return tt >= state.dt_s ? state.dz : 0;
}

function noise(){
  if(!state.noise) return 0; return (Math.random()-0.5)*0.04;
}

function step(){
  const h = state.h_ms/1000;
  if(state.running){
    const r = state.r;
    const y_meas = plant.y + noise();
    const e = r - y_meas;
    let terms;
    if (state.mode === 'PID'){
      terms = pid.update(e, state.antiWindup);
      updateUPct(terms.u);
    } else { // ON-OFF with hysteresis
      const band = state.hy;
      if (onoff_state === 1 && e < -band) onoff_state = 0;
      else if (onoff_state === 0 && e > band) onoff_state = 1;
      const u = onoff_state ? state.u_hi : state.u_lo;
      terms = { u, P: onoff_state?u:0, I: 0, D: 0 };
      updateUPct(u);
    }
    const d = disturbance(t);
    const y = plant.step(terms.u, d, h);

    t += h;
    xs.push(t); rs.push(r); ys.push(y);
    Ps.push(terms.P); Is.push(terms.I); Ds.push(terms.D); Us.push(terms.u);

    // keep window
    const T = state.total_s; while(xs.length>0 && xs[xs.length-1]-xs[0]>T){
      xs.shift(); rs.shift(); ys.shift(); Ps.shift(); Is.shift(); Ds.shift(); Us.shift();
    }
  }
  draw();
  requestAnimationFrame(step);
}

// Drawing
const plotY = new Plot(els.plotY);
const plotTerms = new Plot(els.plotTerms);

function resizeCanvases(){
  // Match canvas internal width to CSS width for crisp lines
  [els.plotY, els.plotTerms].forEach(cv=>{
    const w = cv.clientWidth || cv.parentElement.clientWidth || 900;
    if (cv.width !== w) cv.width = w;
  });
  // Force plots to recompute width
  plotY.width = els.plotY.width; plotTerms.width = els.plotTerms.width;
}

function draw(){
  // ranges adapt to setpoint and observed values
  const yMin = Math.min(0, ...ys, ...rs) - 0.2;
  const yMax = Math.max(1.2, ...ys, ...rs) + 0.2;
  const xMax = xs.length>0 ? xs[xs.length-1] : state.total_s;

  plotY.setRanges(Math.max(0, xMax - state.total_s), xMax, yMin, yMax);
  plotY.clear(); plotY.drawGrid();
  plotY.polyline(xs, rs, COLORS.r, 2);
  plotY.polyline(xs, ys, COLORS.y, 3);
  plotY.label('r(t)', xMax, (state.r));
  if(xs.length>0) plotY.label('y(t)', xs[xs.length-1], ys[ys.length-1]);

  // widen control signal axis to better see P/I/D changes
  plotTerms.setRanges(Math.max(0, xMax - state.total_s), xMax, -5.0, 5.0);
  plotTerms.clear(); plotTerms.drawGrid();
  if(state.showP) plotTerms.polyline(xs, Ps, COLORS.P, 2);
  if(state.showI) plotTerms.polyline(xs, Is, COLORS.I, 2);
  if(state.showD) plotTerms.polyline(xs, Ds, COLORS.D, 2);
  if(state.showU) plotTerms.polyline(xs, Us, COLORS.U, 3);
}

// Legend
function buildLegend(){
  els.legend.innerHTML = '';
  const items = [
    ['r (setpoint)', COLORS.r], ['y (output)', COLORS.y], ['P', COLORS.P], ['I', COLORS.I], ['D', COLORS.D], ['u', COLORS.U]
  ];
  items.forEach(([text,color])=>{
    const span = document.createElement('span'); span.className='chip'; span.style.borderColor=color; span.textContent=text;
    els.legend.appendChild(span);
  });
}

function init(){
  // set initial values
  els.mode.value = state.mode;
  els.kp.value = state.kp; els.ki.value = state.ki; els.kd.value = state.kd;
  els.sp.value = state.r; els.dz.value = state.dz; els.dt.value = state.dt_s;
  els.simT.value = state.total_s; els.dtms.value = state.h_ms;
  els.hy.value = state.hy; els.uhi.value = state.u_hi; els.ulo.value = state.u_lo;
  els.showP.checked = state.showP; els.showI.checked = state.showI; els.showD.checked = state.showD; els.showU.checked = state.showU;
  els.antiWindup.checked = state.antiWindup; els.noise.checked = state.noise;
  syncLabels(); bindControls(); buildLegend();
  resizeCanvases();
  window.addEventListener('resize', resizeCanvases);
  restart(); step();
}

window.addEventListener('load', init);
