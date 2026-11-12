(function (root) {
  'use strict';
  const PALETTES = [
    { name: '红白', base: '#f5f0e2', spot: '#cc4a2c', fin: '#f3f0e6', kind: 'kohaku' },
    { name: '大正三色', base: '#f3eee1', spot: '#c8482c', second: '#1d2526', fin: '#f0ede3', kind: 'sanke' },
    { name: '黄金', base: '#d9a23a', spot: '#d49a2e', fin: '#e2b458', kind: 'ogon' },
    { name: '白写', base: '#efeee5', spot: '#1e2727', fin: '#ecebe3', kind: 'utsuri' },
    { name: '丹顶', base: '#f6f3ea', spot: '#cf3f2b', fin: '#f2f1e9', kind: 'tancho' },
    { name: '墨鲤', base: '#2a3130', spot: '#161c1d', fin: '#444c49', kind: 'karasu' },
    { name: '纯红', base: '#cb3025', spot: '#cb3025', fin: '#c9382c', kind: 'benigoi' }
  ];
  const SILVER_CARP = { name: '青鲢', base: '#184140', spot: '#184140', fin: '#a9c4bd', kind: 'silvercarp' };
  const fishPalette = f => f.species === 'silvercarp' ? SILVER_CARP : PALETTES[f.palette] || PALETTES[0];
  // Fish body in local units: nose at +34, tail tip at -58; sprites span x -60..36, y -14..14.
  const BODY = { nose: 34, tail: -58, length: 92, segments: 16, rigid: 5, left: -60, width: 96, half: 14 };
  const TAU = Math.PI * 2;
  // Seconds a koi takes to go from a full belly to ravenous (×each fish's own metabolism).
  const HUNGER_TIME = 480;
  function randomSeed(seed) { let s = seed >>> 0; return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; }; }
  function weatherFromCode(code) { if ([71,73,75,77,85,86].includes(code)) return 'snow'; if (code >= 51) return 'rain'; if (code >= 2) return 'cloudy'; return 'sunny'; }
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  function createFish(index, random = Math.random) {
    const names = ['锦时','小满','丹朱','听雨','白露','金盏','青禾','望舒','知秋','浮玉','映月','点绛','云游','春水','琥珀','松墨','桃夭','长安','涟漪','拾光','朝露','小暑','如意','团团'];
    return { id: `koi-${Date.now()}-${index}`, name: names[index % names.length], palette: index % PALETTES.length, size: .62 + random() * .4, seed: Math.floor(random()*100000), eaten: 0, hunger: .28 + random() * .24, x: .17 + random()*.66, y: .18+random()*.62, angle: random()*TAU, phase: random()*10, speed: .85+random()*.3, target: null };
  }
  // Resident shoal is separate from the saved koi collection and its 60-fish limit.
  function createSilverCarpShoal(random = Math.random) {
    return Array.from({ length: 4 }, (_, i) => ({
      ...createFish(i, random), id: `silvercarp-${i}`, species: 'silvercarp', name: `青鲢${i + 1}`,
      size: .88 + random() * .24, x: .36 + i * .075, y: .43 + random() * .12, angle: -.25, speed: 1.12
    }));
  }
  // Runtime-only swimming state; never persisted.
  function wake(f, random) {
    if (f.v !== undefined) return;
    f.v = 0; f.turn = 0; f.thrust = 0; f.amp = .25; f.beating = false;
    f.depth = f.species === 'silvercarp' ? .23 + random() * .2 : .25 + random() * .55; f.depthGoal = f.depth;
    f.goal = null; f.goalTime = 0; f.rest = 0; f.flee = 0; f.fleeAngle = 0;
    f.cruise = (.3 + random() * .22) * clamp(Number(f.speed) || 1, .5, 1.5);
    f.react = .15 + random() * .9; f.appetite = .55 + random() * .45;
    // Metabolism is per fish, so the shoal does not get hungry in lockstep.
    f.hungerRate = .75 + random() * .6;
    if (typeof f.hunger !== 'number' || !Number.isFinite(f.hunger)) f.hunger = .3 + random() * .2;
    f.spine = null; f.spineSeg = 0;
  }
  // Head-led chain: the front of the body is rigid, the rest follows the path the head swam.
  function updateSpine(f, s, w, h) {
    const rigid = f.species === 'silvercarp' ? 4 : BODY.rigid;
    const n = BODY.segments, seg = BODY.length / n * s, x = f.x * w, y = f.y * h, c = Math.cos(f.angle), si = Math.sin(f.angle);
    const nx = x + c * BODY.nose * s, ny = y + si * BODY.nose * s;
    let p = f.spine;
    if (!p || Math.abs(f.spineSeg - seg) > seg * .3 || Math.hypot(p[0] - nx, p[1] - ny) > seg * 3) {
      p = f.spine = new Float32Array((n + 1) * 2);
      for (let i = 0; i <= n; i++) { p[i*2] = nx - c * seg * i; p[i*2+1] = ny - si * seg * i; }
    }
    f.spineSeg = seg;
    for (let i = 0; i <= rigid; i++) { p[i*2] = nx - c * seg * i; p[i*2+1] = ny - si * seg * i; }
    let prev = f.angle;
    for (let i = rigid + 1; i <= n; i++) {
      const px = p[(i-1)*2], py = p[(i-1)*2+1], lim = f.species === 'silvercarp' ? .13 + .22 * i / n : .1 + .16 * i / n;
      const a = prev + clamp(wrap(Math.atan2(py - p[i*2+1], px - p[i*2]) - prev), -lim, lim);
      p[i*2] = px - Math.cos(a) * seg; p[i*2+1] = py - Math.sin(a) * seg; prev = a;
    }
  }
  // Spine points with the travelling tail-beat wave; out holds x, y, normalX, normalY per point.
  function fishPose(f, s, out = new Float32Array((BODY.segments + 1) * 4)) {
    const silver = f.species === 'silvercarp';
    const n = BODY.segments, p = f.spine, amp = (f.amp || 0) * (silver ? 4.8 : 6.4) * s;
    for (let i = 0; i <= n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n, i + 1);
      let tx = p[a*2] - p[b*2], ty = p[a*2+1] - p[b*2+1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const u = i / n, env = .05 + .95 * Math.pow(Math.max(0, (u - .2) / .8), 1.5), lat = amp * env * Math.sin(f.phase - u * (silver ? 6.4 : 5.4));
      out[i*4] = p[i*2] - ty * lat; out[i*4+1] = p[i*2+1] + tx * lat;
    }
    for (let i = 0; i <= n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n, i + 1);
      let tx = out[a*4] - out[b*4], ty = out[a*4+1] - out[b*4+1]; const l = Math.hypot(tx, ty) || 1;
      out[i*4+2] = -ty / l; out[i*4+3] = tx / l;
    }
    return out;
  }
  class PondSimulation {
    constructor(fish,width,height,random=Math.random,residents=[],residentsOn=true) { this.fish=fish; this.residents=residents; this.residentsOn=residentsOn; this.width=width; this.height=height; this.random=random; this.food=[]; this.totalEaten=0; this.scale=1; this.time=0; this.obstacles=[]; this.events=[]; }
    get allFish() { return this.residentsOn?this.fish.concat(this.residents):this.fish; }
    feed(x,y,count=9) {
      if(this.food.length >= 180) return false;
      for(let i=0;i<count && this.food.length<180;i++){const a=this.random()*TAU,r=Math.sqrt(this.random())*24;let px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;
        // A pellet in the ring around a rock that no koi can reach would sit there until it rotted: push it out
        // past the stone. Repeat, because leaving one circle of a rock can land it inside the next circle, or
        // straight into a neighbour and wedge it in the crack between two stones.
        const keep=42*this.scale;
        for(let pass=0;pass<8;pass++){let moved=false;for(const ob of this.obstacles)if(ob.hard){const dx=px-ob.x,dy=py-ob.y,d=Math.hypot(dx,dy)||1,R=ob.r+keep;if(d<R-.5){px=ob.x+dx/d*R;py=ob.y+dy/d*R;moved=true;}}if(!moved)break;}
        this.food.push({x:clamp(px,15,this.width-15),y:clamp(py,15,this.height-15),life:25,age:0,drift:this.random()*6,vx:Math.cos(a)*r*.8,vy:Math.sin(a)*r*.8,eaten:false});}
      return true;
    }
    // A tap without food startles nearby fish into a short dash away from it.
    scare(x,y,radius=170) {
      for(const f of this.allFish){wake(f,this.random);const dx=f.x*this.width-x,dy=f.y*this.height-y,d=Math.hypot(dx,dy);if(d<radius){f.flee=.45+(1-d/radius)*.7;f.fleeAngle=Math.atan2(dy,dx)+(this.random()-.5)*.9;f.beating=true;f.v=Math.max(f.v,BODY.length*f.size*this.scale*.8);f.depthGoal=Math.min(.95,f.depth+.35);}}
    }
    pickGoal(f) {
      const r=this.random,w=this.width,h=this.height,m=.15,span=Math.min(w,h);let best=null,score=-Infinity;
      for(let i=0;i<8;i++){const gx=m+r()*(1-2*m),gy=m+r()*(1-2*m),dx=(gx-f.x)*w,dy=(gy-f.y)*h,d=Math.hypot(dx,dy);if(this.obstacles.some(o=>Math.hypot(gx*w-o.x,gy*h-o.y)<o.r+40))continue;const sc=-Math.abs(wrap(Math.atan2(dy,dx)-f.angle))*1.2+Math.min(d,span*.6)/span*2+r()*.6;if(sc>score){score=sc;best={x:gx,y:gy};}}
      f.goal=best||{x:.5,y:.5};f.goalTime=7+r()*12;
    }
    step(dt,speedFactor=1) {
      dt=clamp(dt,0,.05);this.time+=dt;const w=this.width,h=this.height;
      for(const p of this.food){p.life-=dt;p.age+=dt;const k=Math.exp(-dt*1.8);p.vx*=k;p.vy*=k;p.x=clamp(p.x+(p.vx+Math.sin(this.time*.35+p.drift)*1.2)*dt,8,w-8);p.y=clamp(p.y+(p.vy+Math.cos(this.time*.29+p.drift*1.3)*1.2)*dt,8,h-8);}
      this.food=this.food.filter(p=>p.life>0&&!p.eaten);
      const sdt=dt*clamp(speedFactor,.1,3);
      const neighbours=this.allFish;
      for(const f of neighbours)wake(f,this.random);
      // Hunger creeps up with the clock, at each fish's own pace. The resident silver carp forage for themselves.
      for(const f of neighbours)if(f.species!=='silvercarp')f.hunger=Math.min(1,f.hunger+dt/(HUNGER_TIME*f.hungerRate));
      for(const f of neighbours)this.swim(f,sdt,neighbours);
      if(this.food.some(p=>p.eaten))this.food=this.food.filter(p=>!p.eaten);
    }
    // Is the water a body-length or so ahead open? Used to keep a detour from turning into a dead end.
    clearAhead(x, y, dirX, dirY, L) {
      const w = this.width, h = this.height, px = x + dirX * L * 1.6, py = y + dirY * L * 1.6;
      if (px < w * .05 || px > w * .95 || py < h * .05 || py > h * .95) return false;
      for (const ob of this.obstacles) if (ob.hard && Math.hypot(px - ob.x, py - ob.y) < ob.r + L * .35) return false;
      return true;
    }
    // If a rock stands in the way of where the fish wants to go, this returns the angle to swim instead: along the
    // rock's rim, on the side that still makes progress toward the goal. Null when the way is clear.
    rockRim(x, y, dirX, dirY, L, goalDist) {
      for (const ob of this.obstacles) {
        if (!ob.hard) continue;
        const dx = ob.x - x, dy = ob.y - y, dist = Math.hypot(dx, dy) || 1, reach = ob.r + L * .3;
        if (dist > reach + L * 2.6) continue;             // too far off to matter yet
        if (dist > goalDist + ob.r * .5) continue;         // the goal is nearer than the rock: no need to go round
        const along = dx * dirX + dy * dirY;              // how far ahead the rock sits
        const across = Math.abs(dx * dirY - dy * dirX);   // how far off the line it sits
        if (along < 0 || across > reach) continue;        // behind us, or the line passes clear
        const nx = dx / dist, ny = dy / dist;             // pointing away from the rock
        let tx = -ny, ty = nx;                            // along its rim
        if (tx * dirX + ty * dirY < 0) { tx = -tx; ty = -ty; }
        // Do not send the fish along a rim that runs straight into the bank or another rock; the other side is just
        // as far the long way round, and if both are blocked the escape manoeuvre in swim() takes over.
        if (!this.clearAhead(x, y, tx, ty, L)) { tx = -tx; ty = -ty; if (!this.clearAhead(x, y, tx, ty, L)) return null; }
        return Math.atan2(ty, tx);
      }
      return null;
    }
    swim(f,dt,neighbours=this.allFish) {
      const w=this.width,h=this.height,s=f.size*this.scale,L=BODY.length*s,random=this.random,silver=f.species==='silvercarp';
      let x=f.x*w,y=f.y*h;const cos=Math.cos(f.angle),sin=Math.sin(f.angle),mx=x+cos*BODY.nose*s,my=y+sin*BODY.nose*s;
      // A full koi barely notices food; an empty one spots it from across the pond.
      const blocked=f.blocked||0;f.blocked=0;let food=null,fd=Infinity;const reach=Math.max(w,h)*f.appetite*(.5+.5*f.hunger);
      // A pellet it has jammed on three times in a row is left alone for a few seconds, so a koi cannot spend the
      // afternoon circling one grain stuck in a crack.
      if(f.ignore){f.ignore.t-=dt;if(f.ignore.t<=0)f.ignore=null;}
      for(const p of (f.species === 'silvercarp' ? [] : this.food)){if(p.eaten||(f.ignore&&f.ignore.p===p))continue;const d=Math.hypot(p.x-mx,p.y-my);if(d<fd&&d<reach&&p.age>f.react+d/650){fd=d;food=p;}}
      let gx,gy,want,turnGain=silver?3.5:2,maxTurn=silver?2.4:1.3,sepW=2.4,boundW=3;
      f.flee=Math.max(0,f.flee-dt);
      // Startle: a fast C-turn away, then a dash.
      if(f.flee>0){gx=Math.cos(f.fleeAngle);gy=Math.sin(f.fleeAngle);want=2.6*L;turnGain=9;maxTurn=7;}
      else if(food){
        const dx=food.x-x,dy=food.y-y,d=Math.hypot(dx,dy)||1,err=Math.abs(wrap(Math.atan2(dy,dx)-f.angle));
        gx=dx/d;gy=dy/d;want=clamp(fd/L*1.3,.25,2.2)*L*Math.max(.28,Math.cos(Math.min(err,Math.PI/2))**2);
        // Food under the body can't be reached by pivoting; swim on to open a gap, then come back around.
        if(d<BODY.nose*s*1.15&&err>.6&&!blocked){gx=cos;gy=sin;want=.7*L;}
        turnGain=4.5;maxTurn=3.4;sepW=1.1;boundW=.8;f.depthGoal=.04;
        // A hungry koi throws itself at the food; a full one only picks at what drifts past it.
        want*=.3+.7*f.hunger;
        if(fd<Math.max(6,7*s)){food.eaten=true;f.eaten++;f.hunger=Math.max(0,f.hunger-.09);this.totalEaten++;this.events.push({type:'eat',x:food.x,y:food.y,fish:f});}
      } else {
        f.goalTime-=dt;
        if(!f.goal||f.goalTime<=0||Math.hypot(f.goal.x*w-x,f.goal.y*h-y)<L*1.3)this.pickGoal(f);
        const a=Math.atan2(f.goal.y*h-y,f.goal.x*w-x)+Math.sin(this.time*.21+f.seed)*.45+Math.sin(this.time*.53+f.seed*1.7)*.2;
        gx=Math.cos(a);gy=Math.sin(a);
        f.rest=Math.max(0,f.rest-dt);if(f.rest<=0&&random()<dt*.02)f.rest=silver?.6+random()*1.2:2+random()*4;
        // An empty belly shows in the tail: the hungrier the koi, the more it holds back. A meal brings the pace back.
        want=f.cruise*L*(f.rest>0?.12:1)*(silver?1:1-.55*f.hunger);
        if(random()<dt*.015)f.depthGoal=silver?.18+random()*.4:.15+random()*.75;
      }
      // Neighbours: keep personal space, sidestep head-on meetings, loosely match heading.
      let sx=0,sy=0,ax=0,ay=0,cx=0,cy=0,companions=0;
      for(const o of neighbours){
        if(o===f)continue;const ox=o.x*w-x,oy=o.y*h-y,d=Math.hypot(ox,oy);if(d<1e-6)continue;
        const R=(L+BODY.length*o.size*this.scale)*.52,near=1-Math.min(1,Math.abs(o.depth-f.depth)*1.6);
        if(d<R){const k=(1-d/R)**2*near;sx-=ox/d*k;sy-=oy/d*k;}
        if((ox*cos+oy*sin)/d>.8&&d<L*1.6&&near>.3){const side=(oy*cos-ox*sin)>0?-1:1,k=.35*(1-d/(L*1.6));sx-=sin*side*k;sy+=cos*side*k;}
        if(!food&&d<L*2.5&&o.species===f.species){ax+=Math.cos(o.angle);ay+=Math.sin(o.angle);}
        if(f.species==='silvercarp'&&o.species===f.species&&d<L*5){cx+=ox;cy+=oy;companions++;}
      }
      if(companions&&f.flee<=0){const d=Math.hypot(cx,cy);if(d>L){gx+=cx/d*.65;gy+=cy/d*.65;}}
      const al=Math.hypot(ax,ay);if(al>0){ax/=al;ay/=al;}
      // Look ahead and turn back before the pond edge or a lily-pad cluster.
      const mX=Math.min(w*.1+L*.3,w*.3),mY=Math.min(h*.1+L*.3,h*.3),lx=x+cos*L*1.2,ly=y+sin*L*1.2;let bx=0,by=0;
      if(lx<mX)bx=(mX-lx)/mX;else if(lx>w-mX)bx=(w-mX-lx)/mX;
      if(ly<mY)by=(mY-ly)/mY;else if(ly>h-mY)by=(h-mY-ly)/mY;
      for(const ob of this.obstacles)for(const [px,py,R] of [[lx,ly,ob.r+L*.4],[x,y,ob.r+L*.2]]){const dx=px-ob.x,dy=py-ob.y,d=Math.hypot(dx,dy)||1;if(d<R){const k=(1-d/R)*2.5;bx+=dx/d*k;by+=dy/d*k;}}
      const desired=Math.atan2(gy+sy*sepW+ay*.15+by*boundW,gx+sx*sepW+ax*.15+bx*boundW);
      // A koi can wedge itself into a pocket where the push out of a rock and the push back from the bank cancel
      // each other: it keeps swimming on the spot. Count the time spent pressed into rock, and after a while hand
      // it an escape heading — the clearest way out of the pocket, not the way toward the food.
      if(f.blockedT>.7&&!(f.escape>0)){
        const n=Math.hypot(bx,by),away=n>.02?Math.atan2(by,bx):f.angle+Math.PI;
        let best=away,bestScore=-1e9;
        for(let i=0;i<9;i++){
          const a=away+(i-4)*.42,score=(this.clearAhead(x,y,Math.cos(a),Math.sin(a),L)?1:0)-Math.abs(i-4)*.1;
          if(score>bestScore){bestScore=score;best=a;}
        }
        f.escapeAngle=wrap(best+(random()-.5)*.3);f.escape=1.4+random()*.5;
        f.v=Math.max(f.v,L*.5);f.blockedT=0;
        // Jammed on the same grain three times? Leave it; it is in a crack no koi can get its mouth into.
        if(food){if(f.jamFood===food)f.jams=(f.jams||0)+1;else{f.jamFood=food;f.jams=1;}if(f.jams>=3){f.ignore={p:food,t:9};f.jams=0;f.jamFood=null;}}
      }
      // Last resort: six seconds of going nowhere with no stone to blame. A crowd can pin a koi just as well, so
      // turn it around and let it push out on its own.
      if(f.v<L*.12&&f.rest<=0&&f.flee<=0&&!(f.escape>0))f.idleT=(f.idleT||0)+dt;
      else f.idleT=Math.max(0,(f.idleT||0)-dt*2);
      if(f.idleT>6){f.idleT=0;f.escapeAngle=wrap(f.angle+Math.PI*(.55+random()*.5));f.escape=.8;f.v=L*.45;f.goal=null;}
      // While escaping, aim at the way out and turn hard; food can wait a second.
      let aim=desired;
      if(f.escape>0){f.escape-=dt;aim=f.escapeAngle;turnGain=6;maxTurn=4;want=Math.max(want,L*.7);}
      // If a rock stands between the fish and where it is heading, follow the rim of the rock instead of butting
      // into it — on the side that still makes progress toward the goal. Without this a koi whose food lies straight
      // behind a rock presses against it forever.
      const goalDist=food?fd:(f.goal?Math.hypot(f.goal.x*w-x,f.goal.y*h-y):1e9);
      const rim=f.flee>0||f.escape>0?null:this.rockRim(x,y,Math.cos(desired),Math.sin(desired),L,goalDist);
      if(rim!==null)f.turn+=(clamp(wrap(rim-f.angle)*6,-maxTurn*1.6,maxTurn*1.6)-f.turn)*Math.min(1,dt*8);
      else f.turn+=(clamp(wrap(aim-f.angle)*turnGain,-maxTurn,maxTurn)-f.turn)*Math.min(1,dt*(f.flee>0?14:silver?7:4));
      f.angle=wrap(f.angle+f.turn*dt);
      // Beat-and-glide: a few tail strokes to speed up, then coast.
      if(f.v<want*.8)f.beating=true;else if(f.v>want*1.15)f.beating=false;
      f.thrust+=((f.beating?1:0)-f.thrust)*Math.min(1,dt*6);
      if(f.beating)f.v+=(want*1.25-f.v)*(1-Math.exp(-dt*(silver?3.4:2.4)*f.thrust));
      else f.v*=Math.exp(-dt*(f.v>want*1.6?1.6:.5));
      f.v*=Math.exp(-dt*Math.abs(f.turn)*(silver?.17:.25));
      const bl=f.v/L;
      f.phase=(f.phase+dt*TAU*(silver?1.22:1)*(.45+f.thrust*(1.1+1.3*Math.min(2.5,bl))+Math.abs(f.turn)*.35))%(TAU*1000);
      f.amp+=((.14+.86*f.thrust*Math.min(1,.5+bl*.6)+Math.min(.4,Math.abs(f.turn)*.25))-f.amp)*Math.min(1,dt*3);
      x+=Math.cos(f.angle)*f.v*dt;y+=Math.sin(f.angle)*f.v*dt;
      // Solid rock is not swimmable: a koi that overlaps it is pushed back out, twice round so a run of
      // overlapping circles (one rock, several circles) cannot squeeze it through a gap.
      let hit=0;
      for(let pass=0;pass<2;pass++)for(const ob of this.obstacles)if(ob.hard){const dx=x-ob.x,dy=y-ob.y,d=Math.hypot(dx,dy)||1,R=ob.r+L*.28;if(d<R){x=ob.x+dx/d*R;y=ob.y+dy/d*R;f.blocked=1;if(dx*Math.cos(f.angle)+dy*Math.sin(f.angle)<=0)hit=1;}}
      // One brake per frame, not one per circle: a rock made of three circles used to slow the koi six times over,
      // which is what left it hanging motionless against the stone.
      if(hit)f.v*=.88;
      if(f.blocked)f.blockedT=(f.blockedT||0)+dt;else f.blockedT=Math.max(0,(f.blockedT||0)-dt*1.5);
      f.x=clamp(x/w,.03,.97);f.y=clamp(y/h,.035,.965);
      f.depth+=(f.depthGoal-f.depth)*Math.min(1,dt*(food?1.2:.35));
      updateSpine(f,s,w,h);
    }
  }
  function sanitizeSave(data) {
    if(!data||!Array.isArray(data.fish)||!data.fish.length) return null;
    const fish=data.fish.slice(0,60).filter(f=>f&&typeof f.name==='string').map((f,i)=>{
      const defaults=createFish(i,randomSeed(i+8));
      return {...defaults,id:typeof f.id==='string'?f.id.slice(0,80):defaults.id,name:f.name.trim().slice(0,12)||defaults.name,palette:Number.isInteger(f.palette)?clamp(f.palette,0,PALETTES.length-1):0,size:clamp(Number(f.size)||.8,.45,1.5),seed:Number.isFinite(f.seed)?f.seed:defaults.seed,eaten:clamp(Math.floor(Number(f.eaten)||0),0,9999999),hunger:Number.isFinite(Number(f.hunger))?clamp(Number(f.hunger),0,1):defaults.hunger,marks:Array.isArray(f.marks)?f.marks.slice(0,400).filter(m=>m&&Number.isFinite(m.x)&&Number.isFinite(m.y)&&Number.isFinite(m.r)&&/^#[0-9a-f]{6}$/i.test(m.color)).map(m=>({x:clamp(m.x,-32,32),y:clamp(m.y,-16,16),r:clamp(m.r,1,8),color:m.color})):[]};
    });
    return fish.length?{fish,settings:data.settings&&typeof data.settings==='object'?data.settings:{},daily:data.daily}:null;
  }
  const api={PALETTES,SILVER_CARP,fishPalette,createSilverCarpShoal,BODY,HUNGER_TIME,randomSeed,weatherFromCode,clamp,wrap,createFish,updateSpine,fishPose,PondSimulation,sanitizeSave};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.PondCore=api;
})(typeof window!=='undefined'?window:globalThis);
