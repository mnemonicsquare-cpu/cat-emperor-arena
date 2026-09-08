((root, factory) => {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CatEmperorFPSCore = api;
})(typeof window !== "undefined" ? window : globalThis, () => {
  "use strict";

  const MAP_W = 27;
  const MAP_H = 22;
  const TILE = Object.freeze({ FLOOR: 0, BRASS: 1, STONE: 2, PORTRAIT: 3, DOOR: 4, BANNER: 7 });
  const ENEMY_TYPES = Object.freeze({
    cultist: Object.freeze({ health: 3, speed: 1.22, radius: 0.22, damage: 9, detection: 8.5, attackRange: 0.78, cooldown: 0.95, spriteScale: 0.84, score: 100 }),
    sorcerer: Object.freeze({ health: 3, speed: 0.76, radius: 0.23, damage: 11, detection: 10.5, attackRange: 7.2, preferredRange: 4.2, cooldown: 1.7, projectileSpeed: 2.35, spriteScale: 0.92, score: 160 }),
    zombie: Object.freeze({ health: 8, speed: 0.66, radius: 0.29, damage: 18, detection: 10.5, attackRange: 0.95, cooldown: 1.75, spriteScale: 1.12, score: 240, unstunnable: true, regenSeconds: 12 })
  });

  const key = (x, y) => `${x},${y}`;
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

  function buildWorld() {
    const map = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(TILE.BRASS));
    const floor = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(5));
    const carve = (x1, y1, x2, y2) => {
      for (let y = y1; y <= y2; y += 1) for (let x = x1; x <= x2; x += 1) map[y][x] = TILE.FLOOR;
    };

    // Start chamber, bent approach, memorable central hall, two side rooms,
    // the sealed north gallery and a compact final audience chamber.
    carve(2, 17, 7, 20);
    carve(4, 12, 4, 17);
    carve(4, 6, 21, 14);
    carve(1, 8, 2, 11);
    carve(23, 8, 25, 11);
    carve(12, 3, 12, 6);
    carve(8, 1, 17, 3);

    const doors = new Map();
    const addDoor = (id, x, y, locked = false) => {
      map[y][x] = TILE.DOOR;
      const door = { id, x, y, locked, open: 0, target: 0, velocity: 0 };
      doors.set(key(x, y), door);
      return door;
    };
    addDoor("start", 4, 16);
    addDoor("reliquary", 3, 9);
    addDoor("switch-room", 22, 9);
    addDoor("imperial-seal", 12, 5, true);

    // Decorative wall faces; these are textures, not collision ornaments.
    map[5][8] = TILE.PORTRAIT;
    map[5][17] = TILE.BANNER;
    map[14][10] = TILE.BANNER;
    map[14][17] = TILE.PORTRAIT;
    map[7][3] = TILE.STONE;
    map[7][22] = TILE.STONE;

    // A carpet path bends from the starting apartments into the hall, then
    // aligns with its northern ceremonial axis.
    for (let y = 17; y <= 20; y += 1) for (let x = 4; x <= 5; x += 1) floor[y][x] = 4;
    for (let y = 12; y <= 16; y += 1) floor[y][4] = 4;
    for (let x = 4; x <= 13; x += 1) for (let y = 12; y <= 13; y += 1) floor[y][x] = 4;
    for (let y = 6; y <= 14; y += 1) for (let x = 12; x <= 13; x += 1) floor[y][x] = 4;
    for (let y = 1; y <= 6; y += 1) floor[y][12] = 4;

    const enemies = [
      ["cultist", 5.1, 12.2, "approach"],
      ["cultist", 7.2, 9.2, "hall"],
      ["cultist", 18.6, 12.1, "hall"],
      ["sorcerer", 17.5, 8.1, "hall"],
      ["cultist", 1.7, 9.7, "side"],
      ["sorcerer", 24.3, 10.3, "side"],
      ["cultist", 9.4, 2.1, "final"],
      ["sorcerer", 15.8, 2.0, "final"],
      ["zombie", 12.8, 2.6, "final"]
    ].map(([type, x, y, zone], id) => ({ id, type, x, y, zone }));

    const props = [
      { id: "start-ammo", type: "ammo", x: 3.0, y: 19.2, amount: 18, active: true },
      { id: "hall-ammo", type: "ammo", x: 19.7, y: 7.1, amount: 16, active: true },
      { id: "reliquary-health", type: "health", x: 1.6, y: 10.4, amount: 28, active: true },
      { id: "reliquary-ammo", type: "ammo", x: 2.3, y: 8.6, amount: 20, active: true },
      { id: "switch", type: "lever", x: 24.7, y: 9.0, active: true, pulled: false },
      { id: "final-health", type: "health", x: 16.3, y: 2.7, amount: 24, active: true },
      { id: "exit", type: "exit", x: 12.5, y: 1.35, active: true }
    ];

    return { width: MAP_W, height: MAP_H, map, floor, doors, enemies, props };
  }

  function cell(world, x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    return inBounds(ix, iy) ? world.map[iy][ix] : TILE.BRASS;
  }

  function doorAt(world, x, y) {
    return world.doors.get(key(Math.floor(x), Math.floor(y)));
  }

  function pointSolid(world, x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (!inBounds(ix, iy)) return true;
    const tile = world.map[iy][ix];
    if (tile === TILE.FLOOR) return false;
    if (tile === TILE.DOOR) return (world.doors.get(key(ix, iy))?.open || 0) < 0.84;
    return true;
  }

  function canStand(world, x, y, radius = 0.2) {
    const samples = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
    return samples.every(([sx, sy]) => !pointSolid(world, x + sx * radius, y + sy * radius));
  }

  function moveCircle(world, entity, dx, dy, radius = entity.radius || 0.2) {
    const startX = entity.x, startY = entity.y;
    if (canStand(world, entity.x + dx, entity.y, radius)) entity.x += dx;
    if (canStand(world, entity.x, entity.y + dy, radius)) entity.y += dy;
    return Math.hypot(entity.x - startX, entity.y - startY);
  }

  function castRay(world, originX, originY, rayX, rayY, maxDistance = 30) {
    let mapX = Math.floor(originX), mapY = Math.floor(originY);
    const deltaX = Math.abs(1 / (rayX || 1e-9));
    const deltaY = Math.abs(1 / (rayY || 1e-9));
    const stepX = rayX < 0 ? -1 : 1, stepY = rayY < 0 ? -1 : 1;
    let sideX = rayX < 0 ? (originX - mapX) * deltaX : (mapX + 1 - originX) * deltaX;
    let sideY = rayY < 0 ? (originY - mapY) * deltaY : (mapY + 1 - originY) * deltaY;
    let side = 0, tile = TILE.BRASS, door = null, distance = maxDistance;
    for (let guard = 0; guard < 96; guard += 1) {
      if (sideX < sideY) { distance = sideX; sideX += deltaX; mapX += stepX; side = 0; }
      else { distance = sideY; sideY += deltaY; mapY += stepY; side = 1; }
      if (!inBounds(mapX, mapY) || distance > maxDistance) break;
      tile = world.map[mapY][mapX];
      if (tile === TILE.DOOR) {
        door = world.doors.get(key(mapX, mapY));
        if ((door?.open || 0) >= 0.94) { door = null; continue; }
        break;
      }
      if (tile !== TILE.FLOOR) break;
    }
    const wallX = side === 0 ? originY + distance * rayY : originX + distance * rayX;
    return { distance: Math.max(0.001, distance), tile, side, mapX, mapY, wallX: wallX - Math.floor(wallX), door };
  }

  function lineOfSight(world, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, distance = Math.hypot(dx, dy);
    if (distance < 0.01) return true;
    return castRay(world, ax, ay, dx / distance, dy / distance, distance + 0.05).distance >= distance - 0.08;
  }

  function pathCellPassable(world, x, y) {
    if (!inBounds(x, y)) return false;
    const tile = world.map[y][x];
    if (tile === TILE.FLOOR) return true;
    if (tile !== TILE.DOOR) return false;
    return !world.doors.get(key(x, y))?.locked;
  }

  function findPath(world, fromX, fromY, toX, toY, maxNodes = 420) {
    const sx = Math.floor(fromX), sy = Math.floor(fromY), gx = Math.floor(toX), gy = Math.floor(toY);
    if (!inBounds(sx, sy) || !inBounds(gx, gy)) return [];
    const start = sy * MAP_W + sx, goal = gy * MAP_W + gx;
    const queue = new Int32Array(MAP_W * MAP_H), previous = new Int32Array(MAP_W * MAP_H);
    previous.fill(-2); previous[start] = -1; queue[0] = start;
    let head = 0, tail = 1, visited = 0;
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    while (head < tail && visited++ < maxNodes) {
      const current = queue[head++];
      if (current === goal) break;
      const x = current % MAP_W, y = Math.floor(current / MAP_W);
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy, next = ny * MAP_W + nx;
        if (!pathCellPassable(world, nx, ny) || previous[next] !== -2) continue;
        previous[next] = current; queue[tail++] = next;
      }
    }
    if (previous[goal] === -2) return [];
    const reversed = [];
    for (let at = goal; at !== start && at >= 0; at = previous[at]) reversed.push({ x: at % MAP_W + 0.5, y: Math.floor(at / MAP_W) + 0.5 });
    return reversed.reverse();
  }

  function findTeleportSpot(world, sorcerer, player, occupied = [], random = Math.random) {
    const candidates = [];
    for (let y = 1; y < MAP_H - 1; y += 1) for (let x = 1; x < MAP_W - 1; x += 1) {
      if (world.map[y][x] !== TILE.FLOOR) continue;
      const px = x + 0.5, py = y + 0.5, d = Math.hypot(px - player.x, py - player.y);
      if (d < 3.0 || Math.hypot(px - sorcerer.x, py - sorcerer.y) < 1.5 || !canStand(world, px, py, sorcerer.radius)) continue;
      if (occupied.some(other => other !== sorcerer && other.state !== "dead" && Math.hypot(px - other.x, py - other.y) < 0.75)) continue;
      const front = ((px - player.x) * Math.cos(player.angle) + (py - player.y) * Math.sin(player.angle)) / d;
      // A teleport destination has to remain inside the player's current view.
      // Distance keeps the sorcerer out of the cat's face; line of sight and
      // the forward cone prevent disappearing behind scenery or the camera.
      if (front < 0.82 || !lineOfSight(world, player.x, player.y, px, py)) continue;
      if (!findPath(world, sorcerer.x, sorcerer.y, px, py).length) continue;
      candidates.push({ x: px, y: py });
    }
    return candidates.length ? candidates[Math.floor(random() * candidates.length)] : null;
  }

  return { MAP_W, MAP_H, TILE, ENEMY_TYPES, key, buildWorld, cell, doorAt, pointSolid, canStand, moveCircle, castRay, lineOfSight, findPath, findTeleportSpot };
});
