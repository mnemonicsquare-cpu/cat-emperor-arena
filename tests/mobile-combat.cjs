const assert = require('node:assert/strict');
const {ArenaInput, fitArena} = require('../dist/input.js');
const {g, buttons, element, sandbox, calls} = require('./harness.cjs')();

// Multitouch, two fingers on one action, mixed keyboard and touch, cancellations.
const input = new ArenaInput();
input.keyDown('KeyD');
input.pointerDown(1, 'KeyD'); input.pointerDown(2, 'Space'); input.pointerDown(3, 'KeyJ');
assert.ok(['KeyD', 'Space', 'KeyJ'].every(code => input.isDown(code)));
input.pointers.delete(1); assert.ok(input.isDown('KeyD'));
input.pointerDown(4, 'Space'); input.pointers.delete(2); assert.ok(input.isDown('Space'));
input.clear(); assert.equal(input.pressed.size + input.keys.size + input.pointers.size, 0);

g.setMode('playing');
for (const [index, button] of buttons.entries()) button.emit('pointerdown', {
  pointerType: 'touch', pointerId: index, preventDefault() {} });
assert.equal(g.input.pointers.size, 5);
buttons[0].emit('pointercancel', {pointerId: 0});
buttons[1].emit('lostpointercapture', {pointerId: 1});
assert.ok(!g.input.isDown('KeyA') && !g.input.isDown('KeyD'));
const startX = g.player.x;
g.pauseGame(); g.update(1);
assert.equal(g.getMode(), 'paused'); assert.equal(g.player.x, startX);
assert.equal(g.input.pointers.size, 0);
g.resumeGame(); assert.equal(g.getMode(), 'playing');
sandbox.document.hidden = true;
sandbox.document.emit('visibilitychange'); assert.equal(g.getMode(), 'paused');
sandbox.document.hidden = false;
g.resetGame();
assert.equal(g.mice.length, 6); assert.equal(g.sorcerers.length, 2);
assert.equal(g.input.keys.size, 0);

// Realistic iPhone/iPad portrait/landscape safe areas + toolbar/control heights.
for (const [w,h,px,py,chrome] of [[320,568,16,16,176],[390,664,16,42,176],
  [844,390,118,29,124],[667,375,16,16,124],[768,1024,16,44,156],
  [1024,768,16,44,156],[1366,1024,16,44,156]]) {
  const width = fitArena(w,h,px,py,chrome,true);
  assert.ok(width + px + 6 <= w);
  assert.ok(width * 9/16 + py + chrome + 6 <= h + 1);
  assert.ok(width >= Math.min(300,w-px-6), `play area too small: ${w}x${h}`);
}
assert.equal(fitArena(1400,1000,16,16,70,false), 1280);

// Repeated sword hits cannot reset or stop a zombie's windup, but can kill it.
const zombie = g.createMouse({x:900,type:'zombie',patrolMin:850,patrolMax:1000},0);
Object.assign(zombie, {state:'attack', stateTime:0.8, vx:32, facing:-1});
g.clearHitStop();
for (let i=0;i<3;i++) g.damageMouse(zombie,1);
assert.equal(zombie.health,5); assert.equal(zombie.state,'attack');
assert.equal(zombie.stateTime,0.8); assert.equal(zombie.vx,32); assert.equal(g.getHitStop(),0);
Object.assign(g.player,{x:865,y:g.GROUND_Y,health:5,invuln:0,state:'idle'});
g.updateMouse(zombie,0.16);
assert.equal(g.player.health,3); assert.ok(zombie.attackHit);
g.damageMouse(zombie,10); assert.equal(zombie.state,'dead');
const cultist = g.createMouse({x:700,patrolMin:650,patrolMax:750},0);
g.damageMouse(cultist,1); assert.equal(cultist.state,'hurt');

// Solid shelf collision vs the old invisible box under it. Sprite unchanged.
const p = g.platforms[15];
assert.equal(g.projectileHitsTerrain({x:p.x+80,y:p.y+24}),false);
assert.equal(g.projectileHitsTerrain({x:p.x+80,y:p.y+4}),true);
assert.equal(g.projectileHitsTerrain({x:p.x+80,y:p.y-8}),false);
assert.equal(g.projectileHitsTerrain({x:p.x+p.w+20,previousX:p.x-20,y:p.y+4}),true);
g.projectiles.length=0;
g.projectiles.push({x:100,y:100,facing:1,phase:0});
calls.length=0;g.drawProjectiles();
assert.ok(calls.some(c=>c[0]==='fillRect'&&c[3]===12&&c[4]===10));
g.projectiles.length=0;

// Teleport selection: real support, no occupants, entire sprite inside viewport.
g.setCamera(0,600);
Object.assign(g.player,{x:112,y:g.GROUND_Y,state:'idle'});
const wizard=g.sorcerers[0];Object.assign(wizard,{x:180,y:g.GROUND_Y,state:'idle',health:3});
for(const mouse of g.mice) mouse.state='dead';
g.sorcerers[1].state='dead';
const target = g.chooseTeleportTarget(wizard);
assert.ok(target); assert.ok(g.validTeleportTarget(wizard,target));
assert.ok(target.x-48>=8&&target.x+48<=632&&target.y-104>=608&&target.y<=948);
g.damageSorcerer(wizard,1); assert.equal(wizard.state,'teleport');
const originX=wizard.x;
g.updateSorcerer(wizard,0.3); assert.equal(wizard.x,originX);
g.updateSorcerer(wizard,0.26); assert.equal(wizard.teleported,true);
assert.ok(wizard.x>=56&&wizard.x<=584);
g.updateSorcerer(wizard,0.8); assert.equal(wizard.state,'idle');
// No surfaces visible: receive damage but do not start an empty animation.
g.setCamera(1900,0);wizard.state='idle';wizard.health=3;
assert.equal(g.chooseTeleportTarget(wizard),null);
g.damageSorcerer(wizard,1);assert.equal(wizard.health,2);assert.equal(wizard.state,'idle');
// A target lost to camera motion must be revalidated before the actual move.
g.setCamera(0,600);Object.assign(wizard,{x:180,y:g.GROUND_Y,state:'idle',health:3});
g.damageSorcerer(wizard,1);assert.equal(wizard.state,'teleport');
g.setCamera(1900,0);g.updateSorcerer(wizard,0.6);
assert.equal(wizard.x,180);assert.equal(wizard.teleportTarget,null);

// All 68 detailed poses keep a fixed scale and put the measured feet on y.
for (const [name,atlas] of Object.entries(sandbox.window.ArenaAtlas)) {
  g.images[name]={};
  for(let row=0;row<atlas.rows.length;row++) for(let frame=0;frame<4;frame++) {
    for(const facing of [-1,1]) {
      calls.length=0;g.drawDetailedFrame(name,row,frame,{x:300,y:550,facing});
      const call=calls.find(c=>c[0]==='drawImage');
      assert.ok(Math.abs(call[7]+atlas.rows[row][frame][5]*atlas.scale)<1e-9);
      assert.ok(Math.abs(call[8]/call[4]-atlas.scale)<1e-9);
    }
  }
}
// Blue fog is actually drawn for both departure and arrival, not just a state flag.
calls.length=0;g.drawTeleportMist({x:300,y:550},1,0.3);
assert.equal(calls.filter(c=>c[0]==='createRadialGradient').length,12);
assert.equal(calls.filter(c=>c[0]==='fillRect').length,12);

// Fullscreen API missing: the in-page fallback works and toggles back.
(async () => {
  await g.toggleFullscreen();assert.equal(element('#fullscreen-button').attributes['aria-label'],'Свернуть игру');
  await g.toggleFullscreen();assert.equal(element('#fullscreen-button').attributes['aria-label'],'Развернуть игру');
})().catch(error=>{console.error(error);process.exitCode=1;});

console.log('PASS: multitouch, cancellation, pause/restart, 7 mobile viewports, unstoppable zombie, projectile clearance, visible-only teleports.');
