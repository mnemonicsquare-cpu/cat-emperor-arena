const assert = require("node:assert/strict");
const core = require("../dist/level2-core.js");

const world = core.buildWorld();
assert.equal(world.width, 27);
assert.equal(world.height, 22);
assert.equal(world.doors.size, 4);
assert.equal(world.enemies.length, 9);
assert.ok(world.enemies.some(enemy => enemy.type === "cultist"));
assert.ok(world.enemies.some(enemy => enemy.type === "sorcerer"));
assert.ok(world.enemies.some(enemy => enemy.type === "zombie"));

for (const [type, config] of Object.entries(core.ENEMY_TYPES)) {
  for (const field of ["health", "speed", "radius", "damage", "detection", "attackRange", "cooldown", "spriteScale", "score"]) {
    assert.ok(Number.isFinite(config[field]) && config[field] > 0, `${type}.${field}`);
  }
}
assert.equal(core.ENEMY_TYPES.zombie.unstunnable, true);
assert.ok(core.ENEMY_TYPES.sorcerer.projectileSpeed < 3);

// The sealed final gallery is impossible to reach before the lever, and
// becomes reachable without changing map geometry after it is activated.
assert.equal(core.findPath(world, 4.5, 12.5, 12.5, 2.5).length, 0);
const seal = world.doors.get(core.key(12, 5));
seal.locked = false;
const pathToFinal = core.findPath(world, 4.5, 12.5, 12.5, 2.5);
assert.ok(pathToFinal.length > 0);
assert.ok(pathToFinal.some(point => Math.floor(point.x) === 12 && Math.floor(point.y) === 5));

// Closed doors block physics, while the sliding threshold leaves enough
// clearance for the deliberately small player collider.
seal.open = 0;
assert.equal(core.pointSolid(world, 12.5, 5.5), true);
seal.open = 0.84;
assert.equal(core.pointSolid(world, 12.5, 5.5), false);
assert.equal(core.canStand(world, 12.5, 5.5, 0.2), true);

// The FPS sorcerer can only choose a free, reachable point that is actually
// in front of and visible to the player, never right in the player's face.
seal.open = 1;
const sorcerer = { x: 17.5, y: 8.1, radius: core.ENEMY_TYPES.sorcerer.radius, state: "idle" };
const player = { x: 12.5, y: 12.5, angle: -Math.PI / 2 };
for (let step = 0; step < 20; step += 1) {
  const spot = core.findTeleportSpot(world, sorcerer, player, [], () => step / 20);
  if (!spot) continue;
  const distance = Math.hypot(spot.x - player.x, spot.y - player.y);
  const front = ((spot.x - player.x) * Math.cos(player.angle) + (spot.y - player.y) * Math.sin(player.angle)) / distance;
  assert.ok(distance >= 3);
  assert.ok(front >= 0.82);
  assert.equal(core.lineOfSight(world, player.x, player.y, spot.x, spot.y), true);
  assert.equal(core.canStand(world, spot.x, spot.y, sorcerer.radius), true);
}

console.log("PASS: Level 2 map, centralized balance, sealed route, collisions and visible teleports.");
