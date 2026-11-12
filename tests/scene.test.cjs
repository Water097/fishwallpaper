const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const core = require('../core.js');
const context = { window: { PondCore: core }, ImageData: class { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } } };
vm.runInNewContext(fs.readFileSync(require.resolve('../art.js'), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(require.resolve('../scene.js'), 'utf8'), context);
const { PondScene, lookFor } = context.window.PondScene;

// A stand-in renderer: the painting maps 1:1 onto a 1672×941 screen.
function pond(seed = 7) {
  let s = seed; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const R = { drops: [], imageToScreen: (x, y) => [x, y], drop(...a) { this.drops.push(a); } };
  const sim = new core.PondSimulation([core.createFish(0, rnd)], 1672, 941, rnd, [], false);
  const scene = new PondScene(R, sim, rnd); scene.layout(1672, 941);
  return scene;
}
const base = { turtles: false, butterflies: false, night: false, rainAmount: .9, snowAmount: .5 };

test('每种天气与夜色的画面参数键一致，天气切换可平滑过渡', () => {
  const keys = Object.keys(lookFor('sunny', false)).sort();
  for (const w of ['sunny', 'cloudy', 'rain', 'snow']) for (const night of [false, true]) assert.deepEqual(Object.keys(lookFor(w, night)).sort(), keys);
});

test('云量：晴天偶有云影，多云约半池云影，雨天满天阴云', () => {
  const cover = w => lookFor(w, false).cloudCover;
  assert.ok(cover('sunny') < .3 && cover('cloudy') > .4 && cover('cloudy') < .7 && cover('rain') === 1);
  assert.ok(lookFor('cloudy', false).caustic > lookFor('rain', false).caustic * 3, '多云时云隙阳光仍有焦散');
});

test('雨点打在荷叶、花苞上会溅起水花并让它们颤动，雨停后回稳', () => {
  const scene = pond();
  for (let i = 0; i < 90; i++) scene.update(1 / 30, { ...base, weather: 'rain' });
  assert.ok(scene.splashes.some(p => p.leaf), '荷叶上有雨滴水花');
  assert.ok(scene.floaters.some(f => f.ja !== 0 || f.ox !== 0), '有荷叶或花苞被雨点碰动');
  for (let i = 0; i < 600; i++) scene.update(1 / 30, { ...base, weather: 'sunny' });
  assert.ok(scene.floaters.every(f => Math.abs(f.ja) < .01 && Math.abs(f.ox) < .05 && Math.abs(f.oy) < .05));
  assert.equal(scene.splashes.length, 0);
});

test('大雨偶有闪电，闪光后发出雷声事件；小雨与晴天没有', () => {
  const scene = pond(3); let flashes = 0;
  for (let i = 0; i < 30 * 200; i++) { scene.update(1 / 30, { ...base, weather: 'rain' }); if (scene.look.flash > .05) flashes++; }
  const thunder = scene.events.filter(e => e.type === 'thunder');
  assert.ok(thunder.length >= 2 && thunder.length <= 12, `200 秒内雷声 ${thunder.length} 次`);
  assert.ok(flashes > 0 && thunder.every(e => e.delay >= 1 && e.delay <= 3.5));
  const calm = pond(4); calm.events.length = 0;
  for (let i = 0; i < 30 * 120; i++) calm.update(1 / 30, { ...base, weather: 'rain', rainAmount: .3 });
  assert.equal(calm.events.length, 0);
});

test('水面上的东西都不算水面：荷叶、荷花、石头，点到都不投喂', () => {
  const scene = pond();
  assert.equal(scene.onCover(1609, 267), true, '荷叶中心');
  assert.equal(scene.onCover(1609 + 60, 267), true, '靠近荷叶边缘仍是荷叶');
  assert.equal(scene.onCover(1609, 267 + 80), false, '荷叶外一步就是水');
  assert.equal(scene.onCover(1565, 147), true, '浮在水面的荷花');
  assert.equal(scene.onCover(224, 87), true, '露出水面的石头');
  assert.equal(scene.onCover(224 + 60, 87 + 50), false, '包围盒的角落是水：按椭圆算，不按方框算');
  assert.equal(scene.onCover(800, 500), false, '池心是水');
});

test('竖屏把底图转了四分之一，水面上的东西判定跟着转', () => {
  // A renderer that turns the painting a quarter and halves it, as the portrait layout does.
  let s = 5; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const R = { imageToScreen: (x, y) => [(941 - y) * .5, x * .5], drop() {} };
  const sim = new core.PondSimulation([core.createFish(0, rnd)], 470.5, 836, rnd, [], false);
  const scene = new PondScene(R, sim, rnd); scene.layout(470.5, 836);
  const [cx, cy] = R.imageToScreen(224, 87);
  assert.equal(scene.onCover(cx, cy), true, '石头中心');
  assert.equal(scene.onCover(cx, cy + 34), true, '沿长轴 34px 仍在石头里');
  assert.equal(scene.onCover(cx, cy + 40), false, '长轴外就是水');
  assert.equal(scene.onCover(cx + 30, cy), false, '短轴方向 30px 已经出界');
});

test('蝴蝶会落在荷叶上歇脚，也会飞出画面再飞回来', () => {
  const scene = pond();
  let rest = 0, all = 0, off = 0;
  for (let i = 0; i < 30 * 120; i++) {
    scene.update(1 / 30, { ...base, butterflies: true, weather: 'sunny' });
    for (const b of scene.butterflies) { all++; if (b.state === 'rest') rest++; if (b.x < 0 || b.x > 1672 || b.y < 0 || b.y > 941) off++; }
  }
  assert.ok(rest / all > .15, `停留时间占比只有 ${(rest / all * 100).toFixed(0)}%`);
  assert.ok(off > 0, '应该会飞出去');
});

test('鼠标赶过来，蝴蝶腾空、蜻蜓弹射', () => {
  const scene = pond();
  scene.update(1 / 30, { ...base, butterflies: true, weather: 'sunny' });
  const b = scene.butterflies[0];
  Object.assign(b, { x: 400, y: 300, state: 'rest', spook: 0 });
  scene.brush(410, 305);
  assert.equal(b.state, 'fly');
  assert.ok(b.spook > 0);
  const d = scene.dragonflies[0];
  Object.assign(d, { x: 500, y: 300, state: 'hover', spooked: 0 });
  scene.brush(505, 302);
  assert.equal(d.state, 'dart');
});

test('螃蟹受惊会跑到荷叶底下躲起来，而不是原地消失', () => {
  const scene = pond();
  const c = scene.crabs[0];
  Object.assign(c, { home: 2, state: 'idle', alpha: 1, under: false });
  [c.x, c.y] = c.at(scene.R, 2, 0, 0);
  scene.startle(c.x, c.y);
  assert.equal(c.state, 'flee');
  let hid = false;
  for (let i = 0; i < 30 * 10 && !hid; i++) { scene.update(1 / 30, { ...base, crabs: true }); hid = c.state === 'hide'; }
  assert.ok(hid, '十秒内应该钻进荷叶底下');
  assert.ok(scene.underLeaf(c.x, c.y), '藏身点在荷叶覆盖之处');
  assert.equal(c.under, true, '躲起来时画在荷叶下面');
});

test('石头整块都是硬障碍，鱼游不进去', () => {
  const scene = pond();
  const hard = scene.sim.obstacles.filter((o) => o.hard);
  assert.ok(hard.length >= 3, '一块石头要用几个圆盖住');
  const inside = (x, y) => hard.some((o) => Math.hypot(x - o.x, y - o.y) <= o.r);
  assert.ok(inside(224, 87), '石头中心');
  assert.ok(inside(224 + 63, 87), '长轴末端也要盖住，否则鱼能从侧面切进去');
  assert.ok(!inside(800, 500), '池心不是石头');
});

test('水里的螃蟹受惊就地沉下去，不会横穿水面', () => {
  const scene = pond();
  const c = scene.crabs[0];
  Object.assign(c, { home: 2, state: 'idle', alpha: 1, x: scene.w / 2, y: scene.h / 2, under: false });
  assert.equal(scene.onCover(c.x, c.y), false, '这里是水面');
  scene.startle(c.x, c.y);
  assert.equal(c.state, 'dive');
});

test('岸上的螃蟹受惊只往荷叶或自家石头边上跑，不往池心去', () => {
  const scene = pond();
  const c = scene.crabs[0];
  Object.assign(c, { home: 2, state: 'idle', alpha: 1 });
  [c.x, c.y] = c.at(scene.R, 2, 0, 0);
  const home = [c.x, c.y];
  scene.startle(c.x, c.y);
  assert.equal(c.state, 'flee');
  const toLeaf = scene.underLeaf(c.goal[0], c.goal[1]);
  const toRim = Math.hypot(c.goal[0] - home[0], c.goal[1] - home[1]) < 140;
  assert.ok(toLeaf || toRim, `逃跑目标 (${c.goal[0].toFixed(0)}, ${c.goal[1].toFixed(0)}) 既不在荷叶下也不在石头边`);
});
