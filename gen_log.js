// Deterministic synthetic match log: one position per event, ~1000 events over 90'
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const rnd = mulberry32(20260906);
const W=105,H=68;
const types=['pass','pass','pass','pass','pass','carry','carry','tackle','clearance','cross','shot','save','foul'];
let t=0, team = rnd()<.5?'home':'away', score={home:0,away:0};
const ev=[];
let x = W/2, y = H/2;
function clamp(v,a,b){return v<a?a:v>b?b:v}
while(t < 5400 && ev.length < 1000){
  const dt = 3 + rnd()*7;
  t += dt;
  let type = types[Math.floor(rnd()*types.length)];
  const dir = team==='home' ? 1 : -1;
  x = clamp(x + dir*(rnd()*22-6), 2, W-2);
  y = clamp(y + (rnd()*30-15), 2, H-2);
  const attackingThird = team==='home' ? x>72 : x<33;
  if(type==='shot' && !attackingThird) type='pass';
  const e = { t:+t.toFixed(1), type, team, x:+x.toFixed(1), y:+y.toFixed(1),
              player: 1+Math.floor(rnd()*10)+1 };
  if(type==='shot'){
    const goal = rnd()<0.09;
    if(goal){ e.type='goal'; score[team]++; e.score={...score};
      x=W/2; y=H/2; team = team==='home'?'away':'home';
    } else if(rnd()<0.5){ e.outcome='save'; }
  }
  if(type==='foul'){ if(rnd()<0.18) e.card = rnd()<0.85?'yellow':'red'; team = team==='home'?'away':'home'; }
  if(type==='tackle'||type==='clearance'){ team = team==='home'?'away':'home'; }
  ev.push(e);
}
console.log(JSON.stringify({pitch:{w:W,h:H}, events:ev}));
