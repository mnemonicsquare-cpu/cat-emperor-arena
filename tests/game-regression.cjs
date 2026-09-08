const assert = require('node:assert/strict');
const {g, calls, sandbox} = require('./harness.cjs')();

// Exercise all platform choices, not just a lucky random layout.
const covered = new Set();
for (let i = 0; i < 32; i++) {
  sandbox.Math.random = () => (i + 0.5) / 32;
  const spawns = g.createMouseSpawns();
  assert.equal(spawns.length, 6);
  assert.equal(spawns.filter(s => s.type === 'zombie').length, 1);
  assert.equal(spawns.filter(s => s.y !== undefined).length, 3);
  for (const spawn of spawns.filter(s => s.y !== undefined)) {
    const platform = g.platforms.find(p => p.y === spawn.y);
    covered.add(platform);
    assert.ok(spawn.patrolMin >= platform.x + 28);
    assert.ok(spawn.patrolMax <= platform.x + platform.w - 28);
    const mouse = g.createMouse(spawn, 0);
    // With no living target, patrol must stay supported for many turnarounds.
    g.player.state = 'dead';
    for (let frame = 0; frame < 1800; frame++) g.updateMouse(mouse, 1 / 30);
    assert.equal(mouse.y, platform.y);
    assert.equal(mouse.grounded, true);
    assert.ok(mouse.x >= platform.x && mouse.x <= platform.x + platform.w);
  }
}
assert.equal(covered.size, g.platforms.length);

// Patrols must still detect and pursue the cat off their starting platform.
const platform = g.platforms[15];
const guard = g.createMouse({ x: platform.x + 60, y: platform.y,
  patrolMin: platform.x + 28, patrolMax: platform.x + platform.w - 28 }, 0);
Object.assign(g.player, { x: 360, y: platform.y, state: 'idle', grounded: false });
for (let frame = 0; frame < 150; frame++) g.updateMouse(guard, 1 / 30);
assert.equal(guard.alerted, true);
assert.ok(guard.y > platform.y);

// Render baselines must map exactly to the physics position in both directions.
g.images.zombieDetailed = {};
for (const facing of [-1, 1]) for (const y of [150, 550, g.GROUND_Y]) {
  for (let row = 0; row < 4; row++) for (let frame = 0; frame < 4; frame++) {
    calls.length = 0;
    g.drawZombieFrame({ x: 400, y, facing }, row, frame);
    const call = calls.find(c => c[0] === 'drawImage');
    const scaleY = call[9] / call[5];
    assert.ok(Math.abs(call[7] + sandbox.window.ArenaAtlas.zombieDetailed.rows[row][frame][5] * scaleY) < 1e-9);
    assert.ok(calls.some(c => c[0] === 'translate' && c[2] === y));
  }
}

// Existing zombie health, slow regeneration and damage stay intact.
const zombie = g.createMouse({ x: 1500, type: 'zombie', patrolMin: 1400, patrolMax: 1600 }, 0);
assert.equal(zombie.health, 8);
assert.equal(zombie.damage, 2);
g.player.state = 'dead';
zombie.health = 7;
for (let i = 0; i < g.ZOMBIE_REGEN_SECONDS * 30 - 10; i++) g.updateMouse(zombie, 1 / 30);
assert.equal(zombie.health, 7);
for (let i = 0; i < 20; i++) g.updateMouse(zombie, 1 / 30);
assert.equal(zombie.health, 8);

calls.length = 0;
g.images.background = {};
g.images.tiles = {};
g.drawArena();
const backgrounds = calls.filter(c => c[0] === 'drawImage' && c[1] === g.images.background);
assert.equal(backgrounds.length, 1);
assert.deepEqual(backgrounds[0].slice(2), [0, 0, 1920, 960]);
console.log('PASS: all 16 platform choices, sustained patrols, pursuit, 96 zombie render poses, regeneration, continuous palace.');
