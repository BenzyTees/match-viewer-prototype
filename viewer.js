/* Match viewer core: state at time T is a PURE function of (log, T).
   No accumulated state, so seek is exact and replay is deterministic. */
export function buildIndex(log){
  const ev = log.events;
  const kf = new Map();            // playerKey -> [{t,x,y}]
  for (const e of ev){
    const k = e.team + '-' + e.player;
    if(!kf.has(k)) kf.set(k, []);
    kf.get(k).push({t:e.t, x:e.x, y:e.y});
  }
  const key = ev.map((e,i)=>({i,e})).filter(o=>
    o.e.type==='goal' || o.e.card || o.e.outcome==='save');
  return {ev, kf, key, pitch: log.pitch};
}
const ease = u => u<.5 ? 2*u*u : 1-Math.pow(-2*u+2,2)/2;
const lerp = (a,b,u) => a+(b-a)*u;
const clamp = (v,a,b) => v<a?a:v>b?b:v;

function bracket(arr, t){
  let lo=0, hi=arr.length-1, res=-1;
  while(lo<=hi){ const m=(lo+hi)>>1; if(arr[m].t<=t){res=m;lo=m+1;} else hi=m-1; }
  return res;                       // index of last entry with t <= T (-1 if none)
}

/* 4-4-2 (home, attacks +x) and 4-3-3 (away, attacks -x), as pitch fractions */
const HOME=[[.04,.50],[.20,.18],[.20,.39],[.20,.61],[.20,.82],
            [.42,.16],[.42,.38],[.42,.62],[.42,.84],[.62,.38],[.62,.62]];
const AWAY=[[.96,.50],[.80,.18],[.80,.39],[.80,.61],[.80,.82],
            [.60,.28],[.58,.50],[.60,.72],[.36,.22],[.34,.50],[.36,.78]];

function anchor(team, idx, ballX, W, H){
  const a = (team==='home'?HOME:AWAY)[idx];
  const shift = clamp((ballX/W - .5)*0.55, -.28, .28);
  const fx = clamp(a[0] + shift, .02, .98);
  const spread = 0.86 + 0.14*(1-Math.abs(ballX/W-.5)*2);
  const fy = .5 + (a[1]-.5)*spread;
  return [fx*W, fy*H];
}

export function stateAt(ix, T){
  const {ev, kf, key, pitch} = ix;
  const W=pitch.w, H=pitch.h;
  const i = bracket(ev, T);
  const cur = ev[Math.max(0,i)], nxt = ev[Math.min(ev.length-1, i+1)];

  /* ---- ball ---- */
  let bx, by;
  if(i < 0){ bx=W/2; by=H/2; }
  else if(cur.type==='goal'){
    const u = clamp((T-cur.t)/2.0,0,1);          // roll in, then reset to centre
    const gx = cur.team==='home' ? W : 0;
    bx = lerp(cur.x, u<.5?gx:W/2, u<.5?ease(u*2):1); by = lerp(cur.y, u<.5?H/2:H/2, ease(u));
  } else {
    const gap = Math.max(0.001, nxt.t - cur.t);
    const dist = Math.hypot(nxt.x-cur.x, nxt.y-cur.y);
    const flighty = ['pass','cross','shot','clearance'].includes(cur.type);
    const dur = flighty ? clamp(dist/26, .35, Math.min(1.7, gap)) : gap;   // carry = whole gap
    const u = clamp((T-cur.t)/dur, 0, 1);
    const e = flighty ? 1-Math.pow(1-u,2.2) : ease(u);                     // fast-out for passes
    bx = lerp(cur.x, nxt.x, e); by = lerp(cur.y, nxt.y, e);
  }

  /* ---- players ---- */
  const players = [];
  for(const team of ['home','away']){
    for(let n=0;n<11;n++){
      const num = n+1;
      const [ax, ay] = anchor(team, n, bx, W, H);
      const arr = kf.get(team+'-'+num);
      let px=ax, py=ay, involved=false;
      if(arr && arr.length){
        const j = bracket(arr, T);
        const k0 = j>=0 ? arr[j] : null;
        const k1 = j+1 < arr.length ? arr[j+1] : null;
        if(k0 && k1 && (k1.t-k0.t) <= 30){
          // both keyframes close together: walk the player along the real path
          const u = ease(clamp((T-k0.t)/(k1.t-k0.t),0,1));
          px = lerp(k0.x,k1.x,u); py = lerp(k0.y,k1.y,u); involved = true;
        } else {
          // otherwise hold formation, but blend to/from the nearest keyframe
          let w = 0, tx = ax, ty = ay;
          if(k0 && T-k0.t < 8){ w = 1-(T-k0.t)/8; tx=k0.x; ty=k0.y; }
          if(k1 && k1.t-T < 8){ const w2 = 1-(k1.t-T)/8; if(w2>w){ w=w2; tx=k1.x; ty=k1.y; } }
          w = ease(clamp(w,0,1));
          px = lerp(ax, tx, w); py = lerp(ay, ty, w); involved = w>.5;
        }
      }
      // deterministic idle drift so the shape breathes without being random
      const ph = (num*1.7 + (team==='home'?0:3.1));
      px += Math.sin(T*0.5 + ph)*0.7;
      py += Math.cos(T*0.37 + ph*1.3)*0.9;
      players.push({team, num, x:clamp(px,1,W-1), y:clamp(py,1,H-1), involved,
                    gk: num===1});
    }
  }

  /* ---- score, clock, key moment ---- */
  let score={home:0,away:0};
  for(let z=0; z<=i; z++) if(ev[z].score) score = ev[z].score;
  let moment=null;
  for(let z=key.length-1; z>=0; z--){
    const e = key[z].e;
    if(e.t<=T && T-e.t < 8){ moment = {e, age:T-e.t}; break; }
    if(e.t<=T) break;
  }
  return {bx, by, players, score, moment, cur, clock:T};
}

/* Playback rate as a pure function of T: dips near key moments so a goal is
   readable at 45x without ever cutting away or freezing the clock. */
export function rateAt(ix, T){
  let r = 1;
  for(const {e} of ix.key){
    if(e.t > T) break;
    const a = T - e.t;
    if(a < 4)      r = Math.min(r, 0.10);
    else if(a < 9) r = Math.min(r, 0.10 + 0.90*((a-4)/5));
  }
  return r;
}

export function cameraAt(ix, T, prev, dt){
  const s = stateAt(ix, T);
  const zTarget = s.moment ? 1.55 : 1.0;
  const z = prev ? prev.z + (zTarget-prev.z)*Math.min(1, dt*3.2) : zTarget;
  const cx = prev ? prev.cx + (s.bx-prev.cx)*Math.min(1, dt*3.0) : s.bx;
  const cy = prev ? prev.cy + (s.by-prev.cy)*Math.min(1, dt*3.0) : s.by;
  return {cx, cy, z};
}
