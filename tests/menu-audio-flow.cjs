const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../dist");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const fps = fs.readFileSync(path.join(root, "level2.js"), "utf8");

for (const id of ["main-menu", "choose-level-1", "choose-level-2", "menu-button"]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `missing ${id}`);
}

const finishVideo = game.slice(game.indexOf("function finishVictoryCinematic"), game.indexOf("function startLevelOne"));
assert.match(finishVideo, /showMainMenu\(\)/, "the cinematic must return to the main menu");
assert.doesNotMatch(finishVideo, /CatEmperorLevel2\.start/, "the cinematic must not auto-start level two");

const fpsVictory = fps.slice(fps.indexOf("function showVictory"), fps.indexOf("function announce"));
assert.match(fpsVictory, /CatEmperorApp\?\.playVictoryVideo\(\)/, "level two victory must use the shared cinematic");
assert.doesNotMatch(fps, /movementY/, "vertical mouse look must remain disabled");
assert.match(fps, /function drawCrosshair\(\)\{\s*const x=W\/2,y=H\/2;/, "crosshair must remain fixed at screen centre");

const audioRoot = path.join(root, "assets/audio/fps");
for (const name of [
  "weapon-shot.mp3", "weapon-reload.mp3", "magic-spell.mp3", "zombie-roar.mp3",
  "door-open.mp3", "seal-powerdown.mp3", "step-1.mp3", "step-2.mp3", "step-3.mp3", "step-4.mp3"
]) {
  assert.ok(fs.statSync(path.join(audioRoot, name)).size > 5_000, `${name} is missing or empty`);
}

const musicParts = fs.readdirSync(path.join(audioRoot, "iron-titan-parts")).sort();
assert.equal(musicParts.length, 6, "music must contain all six transport-safe parts");
assert.ok(musicParts.reduce((sum, name) => sum + fs.statSync(path.join(audioRoot, "iron-titan-parts", name)).size, 0) > 3_000_000);

console.log("PASS: menu flow, shared cinematic, fixed FPS aim and Level 2 audio are wired correctly.");
