const test=require('node:test');
const assert=require('node:assert/strict');
const {PondSimulation,createFish,randomSeed,weatherFromCode,sanitizeSave,fishPose,BODY,PALETTES,createSilverCarpShoal}=require('../core.js');
test('锦鲤会追逐并吃掉鱼食，每颗只记一次',()=>{
  const random=randomSeed(2),fish=createFish(0,random);fish.x=.5;fish.y=.5;fish.angle=0;
  const pond=new PondSimulation([fish],1000,700,random);pond.feed(610,350,8);
  for(let i=0;i<1200;i++)pond.step(1/60);
  assert.equal(pond.food.length,0);assert.equal(fish.eaten,8);assert.equal(pond.totalEaten,8);
});
test('长时间游动保持边界与数值稳定',()=>{
  const random=randomSeed(4),fish=Array.from({length:24},(_,i)=>createFish(i,random));
  const pond=new PondSimulation(fish,390,844,random);
  for(let i=0;i<5000;i++)pond.step(.04);
  for(const f of fish){assert.ok(f.x>=.03&&f.x<=.97);assert.ok(f.y>=.035&&f.y<=.965);assert.ok(Number.isFinite(f.angle));}
});
test('食物有数量上限并会过期',()=>{
  const pond=new PondSimulation([],1000,700,randomSeed(2));for(let i=0;i<40;i++)pond.feed(500,300);
  assert.equal(pond.food.length,180);assert.equal(pond.feed(500,300),false);
  for(let i=0;i<600;i++)pond.step(.05);assert.equal(pond.food.length,0);
});
test('天气代码正确区分晴、阴、雨、雪',()=>{
  for(const c of [0,1])assert.equal(weatherFromCode(c),'sunny');
  for(const c of [2,3,45,48])assert.equal(weatherFromCode(c),'cloudy');
  for(const c of [51,63,80,95])assert.equal(weatherFromCode(c),'rain');
  for(const c of [71,73,75,77,85,86])assert.equal(weatherFromCode(c),'snow');
});
test('读取存档时限制异常数据，保留用户命名和记录',()=>{
  assert.equal(sanitizeSave(null),null);assert.equal(sanitizeSave({fish:[]}),null);
  const saved=sanitizeSave({fish:[{name:'小满',palette:999,size:-8,eaten:37,seed:42}]});
  assert.equal(saved.fish[0].name,'小满');assert.equal(saved.fish[0].eaten,37);assert.equal(saved.fish[0].palette,PALETTES.length-1);assert.equal(saved.fish[0].size,.45);
  assert.equal(sanitizeSave({fish:Array.from({length:100},()=>({name:'鱼'}))}).fish.length,60);
});
test('手绘花纹经过存档清洗后保留，丢弃无效笔触',()=>{
  const data=sanitizeSave({fish:[{name:'小花',marks:[{x:10,y:2,r:3,color:'#bc5036'},{x:NaN,y:2,r:3,color:'#ffffff'},{x:1,y:1,r:3,color:'invalid'}]}]});
  assert.deepEqual(data.fish[0].marks,[{x:10,y:2,r:3,color:'#bc5036'}]);
});
test('饿着的锦鲤会把落在各处的鱼食吃光，包括正好落在鱼身下方',()=>{
  for(let t=0;t<40;t++){
    const random=randomSeed(t*7+1),fish=createFish(0,random);fish.x=.2+random()*.6;fish.y=.2+random()*.6;fish.angle=random()*6.28;fish.hunger=.9;
    const pond=new PondSimulation([fish],1200,800,random);pond.scale=1.1;pond.feed(200+random()*800,150+random()*500,9);
    for(let i=0;i<60*24&&pond.food.length;i++){fish.hunger=.9;pond.step(1/60);}
    assert.equal(fish.eaten,9,`第 ${t} 组没有吃完`);
  }
});
test('一池饱鱼吃食磨蹭，一池饿鱼几秒就抢光',()=>{
  const clear=(hunger)=>{
    const random=randomSeed(101),fish=Array.from({length:24},(_,i)=>createFish(i,random));
    const pond=new PondSimulation(fish,1672,941,random);pond.scale=1.1;pond.feed(836,470,9);
    let t=0;for(;t<60*60&&pond.food.length;t++){fish.forEach(f=>f.hunger=hunger);pond.step(1/60);}
    return t;
  };
  const full=clear(0),starving=clear(1);
  assert.equal(starving>0&&full>0,true);
  assert.ok(full>starving*2,`饱鱼 ${(full/60).toFixed(1)}s vs 饿鱼 ${(starving/60).toFixed(1)}s`);
});
test('游动姿态沿脊柱弯曲，数值有限且体长基本不变',()=>{
  const random=randomSeed(9),fish=Array.from({length:12},(_,i)=>createFish(i,random));
  const pond=new PondSimulation(fish,1000,700,random);
  for(let i=0;i<900;i++)pond.step(1/60);
  for(const f of fish){
    const s=f.size*pond.scale,pose=fishPose(f,s);let len=0;
    assert.ok(pose.every(Number.isFinite));
    for(let i=1;i<=BODY.segments;i++)len+=Math.hypot(pose[i*4]-pose[i*4-4],pose[i*4+1]-pose[i*4-3]);
    assert.ok(Math.abs(len/(BODY.length*s)-1)<.12,`体长偏差 ${len/(BODY.length*s)}`);
  }
});
test('观鱼模式轻点水面，附近的鱼会受惊游开',()=>{
  const random=randomSeed(5),fish=createFish(0,random);fish.x=.5;fish.y=.5;fish.angle=0;
  const pond=new PondSimulation([fish],1000,700,random);pond.step(1/60);
  pond.scare(520,350);assert.ok(fish.flee>0);
  for(let i=0;i<45;i++)pond.step(1/60);
  assert.ok(Math.hypot(fish.x*1000-520,fish.y*700-350)>60);
});
test('锦鲤绕开荷叶丛',()=>{
  const random=randomSeed(11),fish=Array.from({length:16},(_,i)=>createFish(i,random));
  const pond=new PondSimulation(fish,1200,800,random);pond.obstacles=[{x:600,y:400,r:140}];
  let inside=0,samples=0;
  for(let i=0;i<60*60;i++){pond.step(1/60);if(i>300&&i%10===0)for(const f of fish){samples++;if(Math.hypot(f.x*1200-600,f.y*800-400)<140)inside++;}}
  assert.ok(inside/samples<.03,`在荷叶下的比例 ${inside/samples}`);
});

test('纯红花色能随旧存档往返，原有花色编号不变',()=>{
  const red=PALETTES.findIndex(p=>p.kind==='benigoi');
  const saved=sanitizeSave(JSON.parse(JSON.stringify({fish:[{name:'朱砂',palette:red},{name:'墨墨',palette:5}]})));
  assert.equal(saved.fish[0].palette,red);
  assert.equal(PALETTES[saved.fish[1].palette].kind,'karasu');
});
test('青鲢独立于锦鲤名额，混游稳定且不争抢投喂颗粒',()=>{
  const random=randomSeed(38),koi=createFish(0,random),shoal=createSilverCarpShoal(random);
  const pond=new PondSimulation([koi],1000,700,random,shoal);
  assert.equal(pond.allFish.length,5);assert.equal(pond.fish.length,1);assert.equal(shoal.length,4);
  pond.feed(600,350,9);
  for(let i=0;i<3600;i++)pond.step(1/60);
  assert.equal(koi.eaten,9);
  for(const f of shoal){assert.equal(f.eaten,0);assert.ok(fishPose(f,f.size).every(Number.isFinite));assert.ok(f.x>=.03&&f.x<=.97&&f.y>=.035&&f.y<=.965);}
  pond.scare(shoal[0].x*1000,shoal[0].y*700);assert.ok(shoal[0].flee>0);
});

test('青鲢转向响应比锦鲤灵活，急转后脊柱仍连续稳定',()=>{
  function turn(species){
    const f={...createFish(0,()=>.5),species,x:.5,y:.5,size:1,speed:1,angle:0};
    const pond=new PondSimulation([f],4000,3000,()=>1);
    pond.step(0);f.goal={x:.5,y:.85};f.goalTime=100;f.depthGoal=f.depth;
    for(let i=0;i<30;i++)pond.step(1/60);
    return {f,pond};
  }
  const koi=turn(undefined),carp=turn('silvercarp');
  assert.ok(carp.f.angle > koi.f.angle * 1.4, '相同转弯目标下青鲢应更快改变航向');
  const {f,pond}=carp;pond.scare(f.x*4000+30,f.y*3000);
  for(let t=0;t<600;t++){
    pond.step(1/60);const pose=fishPose(f,1);assert.ok(pose.every(Number.isFinite));
    let length=0;for(let i=1;i<=BODY.segments;i++)length+=Math.hypot(pose[i*4]-pose[i*4-4],pose[i*4+1]-pose[i*4-3]);
    assert.ok(Math.abs(length/BODY.length-1)<.15);
  }
});

test('饥饿度随时间慢慢上涨，到顶就封顶',()=>{
  const random=randomSeed(11),fish=Array.from({length:4},(_,i)=>createFish(i,random));
  fish.forEach(f=>{f.hunger=.2;});
  const pond=new PondSimulation(fish,1000,700,random);
  for(let i=0;i<60*60;i++)pond.step(1/60);
  for(const f of fish)assert.ok(f.hunger>.27&&f.hunger<.42,`60 秒后饥饿度 ${f.hunger}`);
  for(let i=0;i<60*900;i++)pond.step(1/60);
  for(const f of fish)assert.equal(f.hunger,1);
});

test('青鲢自己觅食，不参与饥饿度',()=>{
  const random=randomSeed(12),koi=createFish(0,random),shoal=createSilverCarpShoal(random).slice(0,1);
  const before=shoal[0].hunger;
  const pond=new PondSimulation([koi],800,600,random,shoal,true);
  for(let i=0;i<60*120;i++)pond.step(1/60);
  assert.equal(shoal[0].hunger,before);
});

test('越饿游得越慢，吃饱了跑得轻快',()=>{
  const mean=(hunger)=>{
    const random=randomSeed(31),fish=createFish(0,random);fish.x=.5;fish.y=.5;fish.hunger=hunger;
    const pond=new PondSimulation([fish],1000,700,random);pond.scale=1;
    for(let i=0;i<60*20;i++){fish.hunger=hunger;pond.step(1/60);}
    let sum=0;for(let i=0;i<60*15;i++){fish.hunger=hunger;pond.step(1/60);sum+=fish.v;}
    return sum/(60*15);
  };
  const full=mean(0),starving=mean(1);
  assert.ok(full>starving*1.5,`吃饱 ${full.toFixed(1)} vs 饿透 ${starving.toFixed(1)}`);
});

test('吃饱的锦鲤不理远处的鱼食，饿的会横穿池塘去吃',()=>{
  const eaten=(hunger)=>{
    const random=randomSeed(41),fish=createFish(0,random);fish.x=.12;fish.y=.12;fish.angle=0;fish.hunger=hunger;
    const pond=new PondSimulation([fish],1200,800,random);pond.scale=1.1;
    pond.feed(1030,690,9);
    for(let i=0;i<60*20&&pond.food.length;i++){fish.hunger=hunger;pond.step(1/60);}
    return 9-pond.food.length;
  };
  assert.ok(eaten(1)>=3,'饿的时候整池都闻得到');
  assert.equal(eaten(.05),0,'饱的时候对远处的鱼食无动于衷');
});

test('饥饿度存进存档能读回来，异常值被夹住',()=>{
  const save=sanitizeSave({fish:[{id:'a',name:'甲',hunger:.73},{id:'b',name:'乙',hunger:9},{id:'c',name:'丙',hunger:'x'},{id:'d',name:'丁'}]});
  assert.equal(save.fish[0].hunger,.73);
  assert.equal(save.fish[1].hunger,1);
  for(const f of save.fish.slice(2))assert.ok(f.hunger>0&&f.hunger<1,`旧存档应给一个合理的饥饿度，得到 ${f.hunger}`);
});

test('石头是实心的：鱼被挤到石头边上也进不去',()=>{
  const random=randomSeed(5),fish=createFish(0,random);fish.x=.5;fish.y=.5;fish.angle=0;
  const pond=new PondSimulation([fish],1000,700,random);pond.scale=1;
  pond.obstacles=[{x:500,y:350,r:40,hard:true}];
  let min=Infinity;
  for(let i=0;i<60*25;i++){pond.step(1/60);min=Math.min(min,Math.hypot(fish.x*1000-500,fish.y*700-350));}
  assert.ok(min>=40,`最近只到 ${min.toFixed(1)}px，应该始终在石头的 40px 外`);
});

test('石头挡在中间时鱼会绕过去，不会被卡住',()=>{
  for(const [fx,fy,tx,ty] of [[560,350,440,350],[560,360,440,340],[500,400,500,300],[540,300,460,400],[480,350,560,350]]){
    const random=randomSeed(3),fish=createFish(0,random);
    fish.x=fx/1000;fish.y=fy/700;fish.angle=0;fish.hunger=.9;
    const pond=new PondSimulation([fish],1000,700,random);pond.scale=1;
    pond.obstacles=[{x:500,y:350,r:40,hard:true}];
    pond.feed(tx,ty,1);
    for(let i=0;i<60*20&&pond.food.length;i++){fish.hunger=.9;pond.step(1/60);}
    assert.equal(pond.food.length,0,`(${fx},${fy}) → (${tx},${ty}) 卡在 ${(fish.x*1000).toFixed(0)},${(fish.y*700).toFixed(0)}`);
  }
});

test('鱼食不会落进石头旁边鱼够不着的死角',()=>{
  const random=randomSeed(9),fish=createFish(0,random);
  const pond=new PondSimulation([fish],1000,700,random);
  pond.obstacles=[{x:500,y:350,r:40,hard:true}];
  for(let t=0;t<60;t++){
    pond.food.length=0;pond.feed(500+random()*60-30,350+random()*60-30,9);
    for(const p of pond.food)assert.ok(Math.hypot(p.x-500,p.y-350)>=40+29,`落在死角 ${Math.hypot(p.x-500,p.y-350).toFixed(0)}px`);
  }
});
