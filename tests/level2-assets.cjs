const assert = require("node:assert/strict");
const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const root = path.join(__dirname, "../dist/assets/fps");

async function alphaAt(image, x, y) {
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(x, y, 1, 1).data[3];
}

(async () => {
  const weapon = await loadImage(path.join(root, "weapon-v2.png"));
  const enemies = await loadImage(path.join(root, "enemies.webp"));
  const props = await loadImage(path.join(root, "props.webp"));
  const textures = await loadImage(path.join(root, "textures.webp"));
  assert.deepEqual([weapon.width, weapon.height], [768, 512]);
  assert.deepEqual([enemies.width, enemies.height], [1280, 768]);
  assert.deepEqual([props.width, props.height], [1024, 256]);
  assert.deepEqual([textures.width, textures.height], [256, 128]);
  assert.equal(await alphaAt(weapon, 700, 450), 0, "rear arm is removed from the weapon sprite");
  assert.ok(await alphaAt(weapon, 430, 430) > 0, "the gripping paw remains visible");
  for (const image of [weapon, enemies, props]) {
    assert.equal(await alphaAt(image, 0, 0), 0, "transparent top-left gutter");
    assert.equal(await alphaAt(image, image.width - 1, 0), 0, "transparent top-right gutter");
  }
  console.log("PASS: Level 2 atlases have exact dimensions and transparent sprite gutters.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
