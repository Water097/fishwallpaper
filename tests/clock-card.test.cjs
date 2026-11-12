const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
// app.js is a browser script with a lot of DOM at the top level, so these checks read the wiring as source:
// every style the settings offer must have a real card rule, a preview swatch and a place in the save file.
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = read('app.js'), css = read('style.css'), html = read('index.html');
const styles = [...(app.match(/const CLOCK_STYLES=\[(.*?)\];/) || [, ''])[1].matchAll(/\['([a-z]+)','([^']+)'\]/g)].map(m => [m[1], m[2]]);

test('设置里提供的每种卡片版式都有名字，且默认版式写进了页面', () => {
  assert.ok(styles.length >= 3, '至少要给几种版式供选择');
  assert.equal(new Set(styles.map(s => s[0])).size, styles.length, '版式 key 不能重复');
  assert.ok(styles.every(([, name]) => name.length > 0));
  assert.match(app, /clockOn:true,clockStyle:'paper'/);
  assert.match(html, /class="weather-card ui" data-clock-style="paper"/);
});

test('每种版式都同时有卡片外观、设置小样，隐藏开关压得住横幅的 display:flex', () => {
  for (const [key] of styles) {
    assert.ok(css.includes(`[data-clock-style="${key}"]`), `${key} 缺少样式规则`);
    assert.ok(css.includes(`.cs-preview[data-clock-style="${key}"]`), `${key} 缺少设置里的小样`);
  }
  assert.match(css, /\.weather-card\[hidden\]\{display:none!important\}/, '横幅版式是 flex，隐藏时必须用 !important 压住');
  assert.ok(css.includes('.weather-card[data-clock-style="strip"]'), '横幅版式要能真正改变排版');
});

test('卡片开关与版式都进入存档、跨窗口同步，并即时作用到卡片上', () => {
  assert.match(app, /'clockOn'\]\)if\(typeof src\[key\]/);
  assert.match(app, /CLOCK_STYLES\.some\(\(\[v\]\)=>v===src\.clockStyle\)/);
  assert.match(app, /function applyClockCard\(\)\{[\s\S]*?card\.hidden=!settings\.clockOn;[\s\S]*?card\.dataset\.clockStyle=settings\.clockStyle;[\s\S]*?\}/);
  assert.match(app, /applyWeather\(\);applyVerse\(\);applyClockCard\(\);/);
  assert.match(app, /applyWeather\(\);applyClockCard\(\);if\(settings\.autoWeather/);
  assert.match(app, /id="clock-on"/);
  assert.match(app, /\.clock-style\[data-clock-style\]/);
  assert.match(app, /clockStyleName\(settings\.clockStyle\)/);
});
