export function makeRenderer(canvas, pitch){
  const g = canvas.getContext('2d');
  const W = pitch.w, H = pitch.h;
  const VIEW_M = 94;                       // metres of pitch width visible at zoom 1

  function setCam(cam){
    const scale = (canvas.width / VIEW_M) * cam.z;
    const halfW = canvas.width/(2*scale), halfH = canvas.height/(2*scale);
    const cx = Math.min(Math.max(cam.cx, halfW-4), W-halfW+4);
    const cy = Math.min(Math.max(cam.cy, halfH-3), H-halfH+3);
    g.setTransform(scale,0,0,scale, canvas.width/2 - cx*scale, canvas.height/2 - cy*scale);
    return scale;
  }
  function pitchDraw(){
    g.fillStyle='#2f7d3c'; g.fillRect(-10,-10,W+20,H+20);
    for(let i=0;i<10;i++){ g.fillStyle = i%2 ? '#348a42' : '#2f7d3c';
      g.fillRect(i*(W/10),-10,W/10,H+20); }
    g.strokeStyle='rgba(255,255,255,.85)'; g.lineWidth=.22;
    g.strokeRect(0,0,W,H);
    g.beginPath(); g.moveTo(W/2,0); g.lineTo(W/2,H); g.stroke();
    g.beginPath(); g.arc(W/2,H/2,9.15,0,7); g.stroke();
    for(const s of [0,1]){
      const x0 = s? W-16.5 : 0, x1 = s? W : 16.5;
      g.strokeRect(x0, H/2-20.16, 16.5, 40.32);
      const bx0 = s? W-5.5 : 0;
      g.strokeRect(bx0, H/2-9.16, 5.5, 18.32);
      g.fillStyle='rgba(255,255,255,.9)';
      g.fillRect(s? W-0.5 : -0.9, H/2-3.66, 1.4, 7.32);   // goal
    }
  }
  function bust(p, scale){
    const R = 1.05;
    const home = p.team==='home';
    const body = p.gk ? (home?'#f4d03f':'#d7dbdd') : (home?'#1f6feb':'#e03131');
    const trim = p.gk ? '#111' : (home?'#0b3d8f':'#8f1010');
    g.save(); g.translate(p.x,p.y);
    g.fillStyle='rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(0,R*0.85,R*0.95,R*0.4,0,0,7); g.fill();
    g.fillStyle=body; g.strokeStyle=trim; g.lineWidth=.16;                 // shoulders
    g.beginPath(); g.moveTo(-R*0.95,R*0.75); g.quadraticCurveTo(0,-R*0.25,R*0.95,R*0.75); g.closePath();
    g.fill(); g.stroke();
    g.fillStyle='#f1c27d'; g.beginPath(); g.arc(0,-R*0.55,R*0.55,0,7); g.fill();  // head
    g.fillStyle='#3b2a1a'; g.beginPath(); g.arc(0,-R*0.72,R*0.55,Math.PI,2*Math.PI); g.fill();
    if(p.involved){ g.strokeStyle='rgba(255,255,255,.95)'; g.lineWidth=.14;
      g.beginPath(); g.arc(0,0,R*1.5,0,7); g.stroke(); }
    g.restore();
  }
  function hud(s){
    g.setTransform(1,0,0,1,0,0);
    const mm = Math.floor(s.clock/60), ss = Math.floor(s.clock%60);
    const pad=16, w=290, h=52;
    g.fillStyle='rgba(12,16,22,.82)'; g.fillRect(pad,pad,w,h);
    g.fillStyle='#fff'; g.font='600 22px system-ui, sans-serif';
    g.fillText(`${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`, pad+14, pad+34);
    g.fillStyle='#4da3ff'; g.fillRect(pad+92,pad+14,10,24);
    g.fillStyle='#fff'; g.fillText(`HOME ${s.score.home}`, pad+110, pad+34);
    g.fillStyle='#ff6b6b'; g.fillRect(pad+212,pad+14,10,24);
    g.fillStyle='#fff'; g.fillText(`${s.score.away} AWAY`, pad+230, pad+34);
    if(s.moment){
      const e=s.moment.e;
      const label = e.type==='goal' ? 'GOAL' : e.card ? (e.card.toUpperCase()+' CARD') : 'SAVE';
      const a = Math.min(1, s.moment.age*4) * Math.min(1,(3.2-s.moment.age)*2);
      g.globalAlpha = Math.max(0,a);
      g.fillStyle='rgba(12,16,22,.86)'; g.fillRect(canvas.width/2-170, 92, 340, 62);
      g.fillStyle = e.type==='goal' ? '#7bd88f' : e.card==='red' ? '#ff6b6b' : '#ffd166';
      g.font='700 34px system-ui, sans-serif'; g.textAlign='center';
      g.fillText(label, canvas.width/2, 134);
      g.textAlign='left'; g.globalAlpha=1;
    }
  }
  return function frame(s, cam){
    g.setTransform(1,0,0,1,0,0); g.clearRect(0,0,canvas.width,canvas.height);
    const scale = setCam(cam);
    pitchDraw();
    const ps = s.players.slice().sort((a,b)=>a.y-b.y);
    for(const p of ps) bust(p, scale);
    g.fillStyle='rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(s.bx,s.by+.5,.55,.25,0,0,7); g.fill();
    g.fillStyle='#fff'; g.strokeStyle='#222'; g.lineWidth=.1;
    g.beginPath(); g.arc(s.bx,s.by,.45,0,7); g.fill(); g.stroke();
    hud(s);
  };
}
