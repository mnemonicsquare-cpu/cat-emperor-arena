// Import the six generated Level 2 source images and pack the browser-ready
// FPS atlases. The runtime consumes only the compact files one directory up;
// the source WebPs remain available for deterministic repacking.
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const fpsRoot = path.join(__dirname, "../dist/assets/fps");
const sourceRoot = path.join(fpsRoot, "source");
const sourceNames = [
  "weapon_source.webp",
  "cultist_fps_source.webp",
  "sorcerer_fps_source.webp",
  "zombie_fps_source.webp",
  "textures_source.webp",
  "props_source.webp"
];

fs.mkdirSync(sourceRoot, { recursive: true });

async function importSources(files) {
  if (files.length !== sourceNames.length) {
    throw new Error(`Expected ${sourceNames.length} source images, received ${files.length}`);
  }
  await Promise.all(files.map((file, index) => sharp(path.resolve(file))
    .webp({ quality: 94, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toFile(path.join(sourceRoot, sourceNames[index]))));
}

function alphaBounds(canvas, threshold = 12) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
  for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
    if (pixels[(y * canvas.width + x) * 4 + 3] <= threshold) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top) throw new Error("Generated frame has no visible pixels");
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function cropFrame(image, left, right) {
  const width = right - left;
  const canvas = createCanvas(width, image.height);
  canvas.getContext("2d").drawImage(image, left, 0, width, image.height, 0, 0, width, image.height);
  return { canvas, bounds: alphaBounds(canvas) };
}

async function packCharacters() {
  const definitions = [
    ["cultist_fps_source.webp", [0, 434, 868, 1276, 1685, 2172]],
    ["sorcerer_fps_source.webp", [0, 395, 790, 1325, 1685, 2172]],
    ["zombie_fps_source.webp", [0, 430, 850, 1250, 1680, 2172]]
  ];
  const sheet = createCanvas(256 * 5, 256 * 3);
  const ctx = sheet.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  for (let row = 0; row < definitions.length; row += 1) {
    const [file, boundaries] = definitions[row];
    const image = await loadImage(path.join(sourceRoot, file));
    for (let column = 0; column < 5; column += 1) {
      const frame = cropFrame(image, boundaries[column], boundaries[column + 1]);
      const scale = Math.min(236 / frame.bounds.width, 236 / frame.bounds.height);
      const width = Math.max(1, Math.round(frame.bounds.width * scale));
      const height = Math.max(1, Math.round(frame.bounds.height * scale));
      const x = column * 256 + Math.round((256 - width) / 2);
      const y = row * 256 + 248 - height;
      ctx.drawImage(frame.canvas,
        frame.bounds.x, frame.bounds.y, frame.bounds.width, frame.bounds.height,
        x, y, width, height);
    }
  }
  fs.writeFileSync(path.join(fpsRoot, "enemies.webp"), sheet.toBuffer("image/webp", 92));
}

async function packProps() {
  const image = await loadImage(path.join(sourceRoot, "props_source.webp"));
  const boundaries = [0, 630, 1150, 1600, 2172];
  const sheet = createCanvas(256 * 4, 256);
  const ctx = sheet.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  for (let column = 0; column < 4; column += 1) {
    const frame = cropFrame(image, boundaries[column], boundaries[column + 1]);
    const scale = Math.min(230 / frame.bounds.width, 224 / frame.bounds.height);
    const width = Math.max(1, Math.round(frame.bounds.width * scale));
    const height = Math.max(1, Math.round(frame.bounds.height * scale));
    const x = column * 256 + Math.round((256 - width) / 2);
    const y = 246 - height;
    ctx.drawImage(frame.canvas,
      frame.bounds.x, frame.bounds.y, frame.bounds.width, frame.bounds.height,
      x, y, width, height);
  }
  fs.writeFileSync(path.join(fpsRoot, "props.webp"), sheet.toBuffer("image/webp", 92));
}

async function packWeapon() {
  const image = await loadImage(path.join(sourceRoot, "weapon_source.webp"));
  const canvas = createCanvas(768, 512);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // Remove only the extremely faint generated fringe. The actual weapon,
  // paws and their one-pixel antialiasing remain untouched.
  for (let i = 3; i < pixels.data.length; i += 4) if (pixels.data[i] < 10) pixels.data[i] = 0;
  ctx.putImageData(pixels, 0, 0);
  fs.writeFileSync(path.join(fpsRoot, "weapon.webp"), canvas.toBuffer("image/webp", 94));
}

async function packTextures() {
  await sharp(path.join(sourceRoot, "textures_source.webp"))
    .resize(256, 128, { kernel: "nearest", fit: "fill" })
    .webp({ quality: 94, effort: 6 })
    .toFile(path.join(fpsRoot, "textures.webp"));
}

(async () => {
  if (process.argv.length > 2) await importSources(process.argv.slice(2));
  for (const file of sourceNames) {
    if (!fs.existsSync(path.join(sourceRoot, file))) throw new Error(`Missing source: ${file}`);
  }
  await Promise.all([packCharacters(), packProps(), packWeapon(), packTextures()]);
  process.stdout.write("Packed Level 2 weapon, enemies, props and textures.\n");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
