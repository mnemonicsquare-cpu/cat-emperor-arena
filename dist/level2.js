(() => {
  "use strict";

  const core = window.CatEmperorFPSCore;
  if (!core) throw new Error("FPS core is not loaded");

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const gameFrame = document.querySelector("#game-frame");
  const gameShell = document.querySelector(".game-shell");
  const levelOneOverlay = document.querySelector("#loading");
  const cinematic = document.querySelector("#victory-cinematic");
  const pauseButton = document.querySelector("#pause-button");
  const musicButton = document.querySelector("#music-button");
  const fpsOverlay = document.querySelector("#fps-overlay");
  const fpsTitle = document.querySelector("#fps-title");
  const fpsStatus = document.querySelector("#fps-status");
  const fpsAction = document.querySelector("#fps-action");
  const fpsPrompt = document.querySelector("#fps-prompt");
  const fpsTouch = document.querySelector("#fps-touch");
  const fpsStick = document.querySelector("#fps-stick");
  const fpsStickKnob = document.querySelector("#fps-stick-knob");
  const fpsLook = document.querySelector("#fps-look");
  const fpsFire = document.querySelector("#fps-fire");
  const fpsUse = document.querySelector("#fps-use");

  const W = 640, H = 360;
  const FOV = Math.PI * 0.39;
  const ASSET_PATHS = Object.freeze({
    textures: "assets/fps/textures.webp",
    enemies: "assets/fps/enemies.webp",
    props: "assets/fps/props.webp",
    weapon: "assets/fps/weapon-v2.png",
    portrait: "assets/ui/cat_emperor_portrait.png"
  });
  const AUDIO_PATHS = Object.freeze({
    shot: "assets/audio/fps/weapon-shot.mp3",
    reload: "assets/audio/fps/weapon-reload.mp3",
    magic: "assets/audio/fps/magic-spell.mp3",
    roar: "assets/audio/fps/zombie-roar.mp3",
    door: "assets/audio/fps/door-open.mp3",
    seal: "assets/audio/fps/seal-powerdown.mp3",
    step1: "assets/audio/fps/step-1.mp3",
    step2: "assets/audio/fps/step-2.mp3",
    step3: "assets/audio/fps/step-3.mp3",
    step4: "assets/audio/fps/step-4.mp3"
  });
  const TYPE_ROW = Object.freeze({ cultist: 0, sorcerer: 1, zombie: 2 });
  const STATE_FRAME = Object.freeze({ idle: 0, walk: 1, attack: 2, hurt: 3, teleport: 3, dead: 4 });
  const PROP_FRAME = Object.freeze({ ammo: 0, health: 1, lever: 2, exit: 3 });

  const images = {};
  const keys = new Set();
  const particles = [];
  const projectiles = [];
  const zBuffer = [];
  const spritePool = [];
  const visibleSprites = [];
  const sortSprites = (a,b) => b.d-a.d;
  const touchMove = { x: 0, y: 0, pointer: null };
  const lookTouch = { pointer: null, x: 0, y: 0 };
  let world = null;
  let enemies = [];
  let active = false;
  let mode = "inactive";
  let assetsPromise = null;
  let levelMusicPromise = null;
  let lastTime = performance.now();
  let sceneW = 320, sceneH = 180;
  let sceneCanvas = document.createElement("canvas");
  let sceneCtx = sceneCanvas.getContext("2d", { alpha: false });
  let sceneImage = null;
  let texturePixels = [];
  let averageFrame = 1 / 60;
  let slowFrames = 0;
  let fireHeld = false;
  let nearbyInteraction = null;
  let message = "";
  let messageTime = 0;
  let audioContext = null;
  let soundEnabled = true;
  let score = 0;
  let kills = 0;
  let elapsed = 0;
  let recoil = 0;
  let muzzleFlash = 0;
  let damageFlash = 0;
  let cameraKick = 0;
  let shotTrace = 0;
  const ejectedCases = [];
  const samples = Object.fromEntries(Object.entries(AUDIO_PATHS).map(([name, src]) => {
    const audio = new Audio(src); audio.preload = "metadata"; return [name, audio];
  }));
  const levelMusicParts = Array.from({ length: 6 }, (_, index) =>
    `assets/audio/fps/iron-titan-parts/iron-titan-orbit.mp3.part-${String(index).padStart(2, "0")}`
  );
  const levelMusic = new Audio();
  levelMusic.loop = true;
  levelMusic.preload = "metadata";
  levelMusic.volume = 0.26;

  const player = {
    x: 4.5, y: 19.2, angle: -Math.PI / 2,
    radius: 0.2, health: 100, maxHealth: 100,
    magazine: 12, reserve: 30, magazineSize: 12, maxAmmo: 90,
    fireCooldown: 0, reloadTimer: 0, invuln: 0, bob: 0,
    moving: 0, stepDistance: 0, stepIndex: 0
  };

  function setSceneResolution(width, height) {
    sceneW = width; sceneH = height;
    sceneCanvas.width = width; sceneCanvas.height = height;
    sceneCtx = sceneCanvas.getContext("2d", { alpha: false });
    sceneCtx.imageSmoothingEnabled = false;
    sceneImage = sceneCtx.createImageData(width, height);
    zBuffer.length = width;
  }
  setSceneResolution(sceneW, sceneH);

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
      image.src = src;
    });
  }

  function loadAssets() {
    if (assetsPromise) return assetsPromise;
    assetsPromise = Promise.all(Object.entries(ASSET_PATHS).map(async ([name, src]) => [name, await loadImage(src)]))
      .then(entries => {
        Object.assign(images, Object.fromEntries(entries));
        prepareTextures();
      }).catch(error => {
        assetsPromise = null;
        throw error;
      });
    return assetsPromise;
  }

  function prepareLevelMusic() {
    if (levelMusicPromise) return levelMusicPromise;
    levelMusicPromise = (async () => {
      const parts = [];
      for (const path of levelMusicParts) {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);
        parts.push(await response.arrayBuffer());
      }
      levelMusic.src = URL.createObjectURL(new Blob(parts, { type: "audio/mpeg" }));
      levelMusic.load();
    })().catch(error => {
      levelMusicPromise = null;
      throw error;
    });
    return levelMusicPromise;
  }

  function prepareTextures() {
    const source = images.textures;
    const cellW = source.width / 4, cellH = source.height / 2;
    texturePixels = [];
    for (let index = 0; index < 8; index += 1) {
      const buffer = document.createElement("canvas");
      buffer.width = 64; buffer.height = 64;
      const bufferCtx = buffer.getContext("2d", { willReadFrequently: true });
      bufferCtx.imageSmoothingEnabled = false;
      bufferCtx.drawImage(source, (index % 4) * cellW, Math.floor(index / 4) * cellH, cellW, cellH, 0, 0, 64, 64);
      texturePixels.push(bufferCtx.getImageData(0, 0, 64, 64).data);
    }
  }

  function makeEnemy(spawn) {
    const config = core.ENEMY_TYPES[spawn.type];
    return {
      ...spawn, ...config, maxHealth: config.health, state: "idle", stateTime: 0,
      alerted: false, cooldown: 0.5 + spawn.id * 0.11, path: [], pathTimer: 0,
      attackDone: false, teleport: null, flash: 0, regenTime: 0,
      patrolAngle: (spawn.id * 1.93) % (Math.PI * 2), corpseTime: 0
    };
  }

  function resetLevel() {
    world = core.buildWorld();
    enemies = world.enemies.map(makeEnemy);
    projectiles.length = 0;
    particles.length = 0;
    Object.assign(player, {
      x: 4.5, y: 19.2, angle: -Math.PI / 2, radius: 0.2,
      health: 100, maxHealth: 100, magazine: 12, reserve: 30,
      magazineSize: 12, maxAmmo: 90, fireCooldown: 0, reloadTimer: 0,
      invuln: 0, bob: 0, moving: 0, stepDistance: 0, stepIndex: 0
    });
    score = 0; kills = 0; elapsed = 0;
    recoil = 0; muzzleFlash = 0; damageFlash = 0; cameraKick = 0;
    shotTrace = 0; ejectedCases.length = 0; fireHeld = false; message = ""; messageTime = 0;
    nearbyInteraction = null;
    levelMusic.currentTime = 0;
  }

  async function start(options = {}) {
    if (active) return;
    active = true;
    mode = "loading";
    document.body.classList.remove("menu-active");
    document.body.classList.add("fps-active");
    cinematic.hidden = true;
    levelOneOverlay.hidden = true;
    fpsOverlay.hidden = false;
    fpsTitle.textContent = "УРОВЕНЬ II";
    fpsStatus.textContent = "Открываются внутренние покои…";
    fpsAction.hidden = true;
    window.dispatchEvent(new CustomEvent("cat-emperor:level2-active", { detail: { active: true } }));
    syncTouchMode();
    setSceneResolution(isTouchMode() ? 256 : 320, isTouchMode() ? 144 : 180);
    resetLevel();
    try {
      await loadAssets();
      prepareLevelMusic().catch(() => {});
      if (!active) return;
      mode = "intro";
      fpsTitle.textContent = "ВНУТРЕННИЕ ПОКОИ";
      fpsStatus.textContent = "Мыши захватили внутренние покои. Найдите рычаг в правом крыле, снимите печать с северной двери и очистите тронный зал.";
      fpsAction.textContent = "НАЧАТЬ ЗАЧИСТКУ";
      fpsAction.hidden = false;
      render();
    } catch (error) {
      mode = "error";
      fpsTitle.textContent = "ОШИБКА ЗАГРУЗКИ";
      fpsStatus.textContent = error.message;
      fpsAction.hidden = true;
    }
  }

  function beginPlay(restart = false) {
    if (restart) resetLevel();
    mode = "playing";
    fpsOverlay.hidden = true;
    lastTime = performance.now();
    pauseButton.disabled = false;
    pauseButton.setAttribute("aria-label", "Пауза");
    ensureAudio();
    setLevelMusic(true);
    if (!isTouchMode()) canvas.requestPointerLock?.();
    announce("Найдите рычаг в правом крыле дворца", 3.4);
  }

  function pause() {
    if (!active || mode !== "playing") return;
    mode = "paused";
    fireHeld = false;
    keys.clear();
    touchMove.pointer = null; touchMove.x = 0; touchMove.y = 0;
    lookTouch.pointer = null;
    fpsStickKnob.style.transform = "translate(0, 0)";
    setLevelMusic(false);
    document.exitPointerLock?.();
    fpsOverlay.hidden = false;
    fpsTitle.textContent = "ПАУЗА";
    fpsStatus.textContent = "Зачистка продолжится с того же места.";
    fpsAction.textContent = "ПРОДОЛЖИТЬ";
    fpsAction.hidden = false;
    pauseButton.setAttribute("aria-label", "Продолжить бой");
  }

  function resume() {
    if (mode !== "paused") return;
    mode = "playing";
    fpsOverlay.hidden = true;
    lastTime = performance.now();
    pauseButton.setAttribute("aria-label", "Пауза");
    setLevelMusic(true);
    if (!isTouchMode()) canvas.requestPointerLock?.();
  }

  function togglePause() {
    if (mode === "paused") resume();
    else pause();
  }

  function showDefeat() {
    mode = "defeat";
    fireHeld = false;
    setLevelMusic(false);
    document.exitPointerLock?.();
    fpsOverlay.hidden = false;
    fpsTitle.textContent = "ИМПЕРАТОР ПАЛ";
    fpsStatus.textContent = `Уничтожено мышей: ${kills} из ${enemies.length}.`;
    fpsAction.textContent = "НАЧАТЬ ЗАНОВО";
    fpsAction.hidden = false;
  }

  function showVictory() {
    if (mode === "victory") return;
    mode = "victory";
    fireHeld = false;
    setLevelMusic(false);
    document.exitPointerLock?.();
    fpsOverlay.hidden = true;
    sound("victory");
    window.CatEmperorApp?.playVictoryVideo();
  }

  function announce(text, duration = 2.2) {
    message = text; messageTime = duration;
  }

  function isTouchMode() {
    return gameShell.classList.contains("touch-enabled");
  }

  function syncTouchMode() {
    if (!active) { fpsTouch.hidden = true; return; }
    fpsTouch.hidden = !isTouchMode();
  }

  function ensureAudio() {
    if (!soundEnabled) return null;
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    return audioContext;
  }

  function playSample(name, volume = 0.7, playbackRate = 1) {
    if (!soundEnabled || !samples[name]) return;
    const voice = samples[name].cloneNode();
    voice.volume = Math.max(0, Math.min(1, volume));
    voice.playbackRate = playbackRate;
    voice.play().catch(() => {});
  }

  function setLevelMusic(playing) {
    if (!playing || !soundEnabled || mode !== "playing") {
      levelMusic.pause();
      return;
    }
    prepareLevelMusic().then(() => {
      if (soundEnabled && mode === "playing") levelMusic.play().catch(() => {});
    }).catch(() => {});
  }

  function tone(from, to, duration, type = "square", volume = 0.035, delay = 0) {
    const audio = ensureAudio();
    if (!audio) return;
    const now = audio.currentTime + delay;
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(now); oscillator.stop(now + duration);
  }

  function noise(duration, volume, delay = 0) {
    const audio = ensureAudio();
    if (!audio) return;
    const length = Math.ceil(audio.sampleRate * duration), buffer = audio.createBuffer(1, length, audio.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = audio.createBufferSource(), gain = audio.createGain();
    source.buffer = buffer; gain.gain.value = volume;
    source.connect(gain).connect(audio.destination); source.start(audio.currentTime + delay);
  }

  function sound(kind) {
    if (!soundEnabled) return;
    if (kind === "shot") { playSample("shot", 0.82, 0.96 + Math.random() * 0.07); }
    else if (kind === "hit") { tone(170, 70, 0.08, "square", 0.04); }
    else if (kind === "enemy-dead") { tone(115, 36, 0.24, "sawtooth", 0.042); }
    else if (kind === "hurt") { noise(0.12, 0.045); tone(80, 48, 0.18, "sawtooth", 0.05); }
    else if (kind === "door") { playSample("door", 0.66); }
    else if (kind === "pickup") { tone(340, 680, 0.12, "square", 0.033); }
    else if (kind === "lever") { playSample("seal", 0.75); tone(120, 55, 0.18, "square", 0.025); }
    else if (kind === "magic") { playSample("magic", 0.68, 0.96 + Math.random() * 0.08); }
    else if (kind === "teleport") { playSample("magic", 0.56, 1.2); tone(170, 920, 0.38, "sine", 0.025); }
    else if (kind === "claw") { tone(130, 62, 0.12, "sawtooth", 0.04); }
    else if (kind === "victory") { tone(330, 660, 0.22, "square", 0.035); tone(440, 880, 0.3, "square", 0.035, 0.18); }
  }

  function startReload() {
    if (player.reloadTimer > 0 || player.reserve <= 0 || player.magazine >= player.magazineSize) return;
    player.reloadTimer = 3.3;
    playSample("reload", 0.58);
    announce("ПЕРЕЗАРЯДКА", 1.1);
  }

  function finishReload() {
    const loaded = Math.min(player.magazineSize - player.magazine, player.reserve);
    player.magazine += loaded;
    player.reserve -= loaded;
  }

  function update(dt) {
    if (mode !== "playing") return;
    elapsed += dt;
    messageTime = Math.max(0, messageTime - dt);
    player.fireCooldown = Math.max(0, player.fireCooldown - dt);
    if (player.reloadTimer > 0) {
      player.reloadTimer = Math.max(0, player.reloadTimer - dt);
      if (player.reloadTimer === 0) finishReload();
    } else if (player.magazine === 0 && player.reserve > 0) startReload();
    player.invuln = Math.max(0, player.invuln - dt);
    recoil = Math.max(0, recoil - dt * 7.4);
    muzzleFlash = Math.max(0, muzzleFlash - dt);
    shotTrace = Math.max(0, shotTrace - dt);
    damageFlash = Math.max(0, damageFlash - dt * 2.6);
    cameraKick += (0 - cameraKick) * Math.min(1, dt * 13);

    updateDoors(dt);
    updatePlayer(dt);
    updateEnemies(dt);
    separatePlayerAndEnemies();
    updateProjectiles(dt);
    updateParticles(dt);
    updateInteraction();
    if (fireHeld && player.fireCooldown <= 0 && player.reloadTimer <= 0) shoot();

    averageFrame = averageFrame * 0.96 + dt * 0.04;
    if (averageFrame > 1 / 43) slowFrames += 1; else slowFrames = Math.max(0, slowFrames - 2);
    if (slowFrames > 90 && sceneW > 256) { setSceneResolution(256, 144); slowFrames = 0; }
  }

  function updateDoors(dt) {
    for (const door of world.doors.values()) {
      const delta = door.target - door.open;
      if (Math.abs(delta) < 0.001) { door.open = door.target; continue; }
      door.velocity += Math.sign(delta) * dt * 4.8;
      door.velocity *= Math.pow(0.04, dt);
      door.open = Math.max(0, Math.min(1, door.open + door.velocity * dt));
      if ((delta > 0 && door.open >= door.target) || (delta < 0 && door.open <= door.target)) { door.open = door.target; door.velocity = 0; }
    }
  }

  function inputAxis(positive, negative) {
    return (keys.has(positive) ? 1 : 0) - (keys.has(negative) ? 1 : 0);
  }

  function updatePlayer(dt) {
    let forward = inputAxis("KeyW", "KeyS") - touchMove.y;
    let strafe = inputAxis("KeyD", "KeyA") + touchMove.x;
    const length = Math.hypot(forward, strafe);
    if (length > 1) { forward /= length; strafe /= length; }
    const speed = 2.2, cos = Math.cos(player.angle), sin = Math.sin(player.angle);
    const dx = (cos * forward - sin * strafe) * speed * dt;
    const dy = (sin * forward + cos * strafe) * speed * dt;
    const previousX = player.x, previousY = player.y;
    core.moveCircle(world, player, dx, dy, player.radius);
    for (const enemy of enemies) {
      if (enemy.state === "dead") continue;
      const ex = player.x - enemy.x, ey = player.y - enemy.y, min = player.radius + enemy.radius;
      const d = Math.hypot(ex, ey);
      if (d < min) {
        player.x = previousX; player.y = previousY; break;
      }
    }
    const moved = Math.hypot(player.x - previousX, player.y - previousY);
    player.moving = moved / Math.max(dt, 0.001);
    player.bob += moved * 4.7;
    player.stepDistance += moved;
    if (player.stepDistance >= 0.72) {
      player.stepDistance %= 0.72;
      player.stepIndex = (player.stepIndex + 1) % 4;
      playSample(`step${player.stepIndex + 1}`, 0.32, 0.94 + Math.random() * 0.1);
    }
    collectPickups();
  }

  function collectPickups() {
    for (const prop of world.props) {
      if (!prop.active || !["ammo", "health"].includes(prop.type) || Math.hypot(prop.x - player.x, prop.y - player.y) > 0.48) continue;
      if (prop.type === "ammo") {
        const total = player.magazine + player.reserve;
        if (total >= player.maxAmmo) continue;
        const added = Math.min(prop.amount, player.maxAmmo - total);
        player.reserve += added;
        announce(`Боеприпасы +${added}`);
      } else {
        if (player.health >= player.maxHealth) continue;
        const restored = Math.min(prop.amount, player.maxHealth - player.health);
        player.health += restored; announce(`Здоровье +${restored}`);
      }
      prop.active = false; score += 25; sound("pickup");
    }
  }

  function shoot() {
    if (mode !== "playing" || player.fireCooldown > 0 || player.reloadTimer > 0) return;
    if (player.magazine <= 0) {
      if (player.reserve > 0) startReload();
      else { player.fireCooldown = 0.28; tone(90, 72, 0.06, "square", 0.025); announce("Боеприпасы закончились", 1.1); }
      return;
    }
    player.magazine -= 1;
    player.fireCooldown = 0.19;
    recoil = 1; muzzleFlash = 0.075; shotTrace = 0.06; cameraKick = -1.4;
    ejectedCases.push({ time: 0, x: W * 0.69, y: H * 0.70, vx: 72 + Math.random() * 32, vy: -92 - Math.random() * 28, spin: 7 + Math.random() * 5 });
    if (ejectedCases.length > 7) ejectedCases.shift();
    sound("shot");
    const wall = core.castRay(world, player.x, player.y, Math.cos(player.angle), Math.sin(player.angle), 24);
    let victim = null, victimDistance = Infinity;
    for (const enemy of enemies) {
      if (enemy.state === "dead") continue;
      const dx = enemy.x - player.x, dy = enemy.y - player.y, distance = Math.hypot(dx, dy);
      const forward = dx * Math.cos(player.angle) + dy * Math.sin(player.angle);
      const lateral = Math.abs(-dx * Math.sin(player.angle) + dy * Math.cos(player.angle));
      if (forward <= 0 || distance > wall.distance + 0.12 || lateral > enemy.radius * 1.38 || !core.lineOfSight(world, player.x, player.y, enemy.x, enemy.y)) continue;
      if (distance < victimDistance) { victim = enemy; victimDistance = distance; }
    }
    if (victim) damageEnemy(victim, 1);
    else spawnImpact(player.x + Math.cos(player.angle) * Math.min(wall.distance, 7), player.y + Math.sin(player.angle) * Math.min(wall.distance, 7), "#d7a447");
  }

  function damageEnemy(enemy, amount) {
    enemy.health = Math.max(0, enemy.health - amount);
    enemy.flash = 0.18;
    enemy.alerted = true;
    spawnImpact(enemy.x, enemy.y, enemy.type === "zombie" ? "#79924d" : "#b54a37");
    sound("hit");
    if (enemy.health <= 0) {
      enemy.state = "dead"; enemy.stateTime = 0; enemy.corpseTime = 0;
      kills += 1; score += enemy.score; sound("enemy-dead");
      if (enemy.zone === "final" && finalRemaining() === 0) announce("Финальная зона очищена. Подойдите к золотому выходу.", 4);
      return;
    }
    if (enemy.type === "sorcerer") {
      const target = core.findTeleportSpot(world, enemy, player, enemies);
      if (target) {
        enemy.teleport = { time: 0, target, moved: false };
        enemy.state = "teleport"; enemy.stateTime = 0; sound("teleport");
      } else {
        enemy.state = "hurt"; enemy.stateTime = 0;
      }
    } else if (!enemy.unstunnable) {
      enemy.state = "hurt"; enemy.stateTime = 0;
    }
  }

  function updateEnemies(dt) {
    for (const enemy of enemies) {
      enemy.stateTime += dt;
      enemy.cooldown = Math.max(0, enemy.cooldown - dt);
      enemy.flash = Math.max(0, enemy.flash - dt);
      if (enemy.state === "dead") { enemy.corpseTime += dt; continue; }
      if (enemy.type === "zombie" && enemy.health < enemy.maxHealth) {
        enemy.regenTime += dt;
        if (enemy.regenTime >= enemy.regenSeconds) {
          enemy.regenTime = 0; enemy.health += 1; enemy.flash = 0.35;
          for (let i = 0; i < 12 && particles.length < 96; i += 1) particles.push({
            x: enemy.x + (Math.random() - 0.5) * 0.48,
            y: enemy.y + (Math.random() - 0.5) * 0.48,
            vx: (Math.random() - 0.5) * 0.16,
            vy: (Math.random() - 0.5) * 0.16,
            life: 0.55 + Math.random() * 0.45,
            color: "#8fe35d"
          });
        }
      }
      if (enemy.state === "teleport") { updateTeleport(enemy, dt); continue; }
      if (enemy.state === "hurt") {
        if (enemy.stateTime >= 0.22) { enemy.state = "idle"; enemy.stateTime = 0; }
        continue;
      }
      if (enemy.state === "attack") { updateEnemyAttack(enemy); continue; }

      const dx = player.x - enemy.x, dy = player.y - enemy.y, distance = Math.hypot(dx, dy);
      const seesPlayer = distance <= enemy.detection && core.lineOfSight(world, enemy.x, enemy.y, player.x, player.y);
      if (seesPlayer && !enemy.alerted && enemy.type === "zombie") playSample("roar", 0.72, 0.94 + Math.random() * 0.08);
      if (seesPlayer) enemy.alerted = true;
      if (!enemy.alerted) { patrolEnemy(enemy, dt); continue; }

      if (enemy.type === "sorcerer" && seesPlayer && distance <= enemy.attackRange && distance >= 2.2 && enemy.cooldown <= 0) {
        startEnemyAttack(enemy); continue;
      }
      if (enemy.type !== "sorcerer" && seesPlayer && distance <= enemy.attackRange && enemy.cooldown <= 0) {
        startEnemyAttack(enemy); continue;
      }
      navigateEnemy(enemy, dt, distance, seesPlayer);
    }
    separateEnemies();
  }

  function patrolEnemy(enemy, dt) {
    enemy.patrolAngle += dt * (enemy.id % 2 ? 0.21 : -0.18);
    if (enemy.stateTime < 1.2) { enemy.state = "idle"; return; }
    enemy.state = "walk";
    const dx = Math.cos(enemy.patrolAngle) * enemy.speed * 0.24 * dt;
    const dy = Math.sin(enemy.patrolAngle) * enemy.speed * 0.24 * dt;
    if (!core.moveCircle(world, enemy, dx, dy, enemy.radius)) { enemy.patrolAngle += Math.PI * 0.72; enemy.stateTime = 0; }
  }

  function navigateEnemy(enemy, dt, distance, seesPlayer) {
    enemy.pathTimer -= dt;
    if (enemy.pathTimer <= 0) {
      enemy.pathTimer = 0.42 + (enemy.id % 4) * 0.07;
      if (enemy.type === "sorcerer" && seesPlayer && distance < enemy.preferredRange * 0.68) enemy.path = retreatPath(enemy);
      else enemy.path = core.findPath(world, enemy.x, enemy.y, player.x, player.y);
    }
    while (enemy.path.length && Math.hypot(enemy.path[0].x - enemy.x, enemy.path[0].y - enemy.y) < 0.18) enemy.path.shift();
    const target = enemy.path[0] || (seesPlayer ? player : null);
    if (!target) { enemy.state = "idle"; return; }
    const cellDoor = core.doorAt(world, target.x, target.y);
    if (cellDoor && !cellDoor.locked && cellDoor.open < 0.84) {
      cellDoor.target = 1; enemy.state = "idle"; return;
    }
    const dx = target.x - enemy.x, dy = target.y - enemy.y, length = Math.hypot(dx, dy) || 1;
    const direction = enemy.type === "sorcerer" && seesPlayer && distance < enemy.preferredRange * 0.68 ? 1 : 1;
    const moved = core.moveCircle(world, enemy, dx / length * enemy.speed * direction * dt, dy / length * enemy.speed * direction * dt, enemy.radius);
    enemy.state = moved > 0.0001 ? "walk" : "idle";
    if (!moved) enemy.pathTimer = 0;
  }

  function retreatPath(enemy) {
    const around = [[1,0],[-1,0],[0,1],[0,-1]]
      .map(([x,y]) => ({ x: Math.floor(enemy.x) + x + 0.5, y: Math.floor(enemy.y) + y + 0.5 }))
      .filter(point => core.canStand(world, point.x, point.y, enemy.radius))
      .sort((a,b) => Math.hypot(b.x-player.x,b.y-player.y)-Math.hypot(a.x-player.x,a.y-player.y));
    return around.length ? [around[0]] : [];
  }

  function separateEnemies() {
    for (let i = 0; i < enemies.length; i += 1) for (let j = i + 1; j < enemies.length; j += 1) {
      const a = enemies[i], b = enemies[j];
      if (a.state === "dead" || b.state === "dead") continue;
      const dx = a.x - b.x, dy = a.y - b.y, distance = Math.hypot(dx, dy), minimum = a.radius + b.radius + 0.05;
      if (distance >= minimum || distance < 0.001) continue;
      const push = (minimum - distance) * 0.45;
      core.moveCircle(world, a, dx / distance * push, dy / distance * push, a.radius);
      core.moveCircle(world, b, -dx / distance * push, -dy / distance * push, b.radius);
    }
  }

  function separatePlayerAndEnemies() {
    for (const enemy of enemies) {
      if (enemy.state === "dead" || enemy.state === "teleport") continue;
      let dx = enemy.x - player.x, dy = enemy.y - player.y;
      let distance = Math.hypot(dx, dy);
      const minimum = player.radius + enemy.radius + 0.08;
      if (distance >= minimum) continue;
      if (distance < 0.001) {
        dx = -Math.cos(player.angle); dy = -Math.sin(player.angle); distance = 1;
      }
      const push = minimum - distance + 0.012;
      const nx = dx / distance, ny = dy / distance;
      const moved = core.moveCircle(world, enemy, nx * push, ny * push, enemy.radius);
      if (moved < push * 0.5) core.moveCircle(world, player, -nx * (push - moved), -ny * (push - moved), player.radius);
    }
  }

  function startEnemyAttack(enemy) {
    enemy.state = "attack"; enemy.stateTime = 0; enemy.attackDone = false;
    if (enemy.type === "sorcerer") sound("magic"); else sound("claw");
  }

  function updateEnemyAttack(enemy) {
    const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    const windup = enemy.type === "zombie" ? 0.92 : enemy.type === "sorcerer" ? 0.42 : 0.28;
    const duration = enemy.type === "zombie" ? 1.55 : enemy.type === "sorcerer" ? 0.9 : 0.66;
    if (!enemy.attackDone && enemy.stateTime >= windup) {
      enemy.attackDone = true;
      if (enemy.type === "sorcerer") fireMagic(enemy);
      else if (distance <= enemy.attackRange + 0.18 && core.lineOfSight(world, enemy.x, enemy.y, player.x, player.y)) damagePlayer(enemy.damage);
    }
    if (enemy.stateTime >= duration) { enemy.state = "idle"; enemy.stateTime = 0; enemy.cooldown = core.ENEMY_TYPES[enemy.type].cooldown; }
  }

  function updateTeleport(enemy) {
    const teleport = enemy.teleport;
    if (!teleport) { enemy.state = "idle"; return; }
    teleport.time = enemy.stateTime;
    if (!teleport.moved && teleport.time >= 0.48) {
      let target = teleport.target;
      if (!core.canStand(world, target.x, target.y, enemy.radius) || enemies.some(other => other !== enemy && other.state !== "dead" && Math.hypot(target.x-other.x,target.y-other.y)<0.7)) {
        target = core.findTeleportSpot(world, enemy, player, enemies);
      }
      if (target) { enemy.x = target.x; enemy.y = target.y; }
      teleport.moved = true;
      spawnMist(enemy.x, enemy.y);
    }
    if (teleport.time >= 1.0) { enemy.state = "idle"; enemy.stateTime = 0; enemy.teleport = null; enemy.cooldown = 0.65; }
  }

  function fireMagic(enemy) {
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    projectiles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * enemy.projectileSpeed, vy: Math.sin(angle) * enemy.projectileSpeed, life: 5.5, phase: 0, damage: enemy.damage });
  }

  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i -= 1) {
      const p = projectiles[i]; p.life -= dt; p.phase += dt * 8;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      if (p.life <= 0 || core.pointSolid(world, nx, ny)) { spawnImpact(p.x, p.y, "#2c8cff"); projectiles.splice(i,1); continue; }
      p.x = nx; p.y = ny;
      if (Math.hypot(p.x-player.x,p.y-player.y) < 0.27) { damagePlayer(p.damage); spawnImpact(p.x,p.y,"#5bcaff"); projectiles.splice(i,1); }
    }
  }

  function damagePlayer(amount) {
    if (player.invuln > 0 || mode !== "playing") return;
    player.health = Math.max(0, player.health - amount);
    player.invuln = 0.48; damageFlash = 1; cameraKick = 3.5; sound("hurt");
    if (player.health <= 0) showDefeat();
  }

  function spawnImpact(x, y, color) {
    for (let i = 0; i < 8 && particles.length < 96; i += 1) particles.push({ x, y, vx: (Math.random()-.5)*0.8, vy:(Math.random()-.5)*0.8, life:.18+Math.random()*.18, color });
  }

  function spawnMist(x, y) {
    for (let i = 0; i < 18 && particles.length < 96; i += 1) particles.push({ x:x+(Math.random()-.5)*.45, y:y+(Math.random()-.5)*.45, vx:(Math.random()-.5)*.18, vy:(Math.random()-.5)*.18, life:.5+Math.random()*.45, color:"#48c9ff" });
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i]; p.life -= dt; p.x += p.vx*dt; p.y += p.vy*dt;
      if (p.life <= 0) particles.splice(i,1);
    }
    for (let i = ejectedCases.length - 1; i >= 0; i -= 1) {
      const shell = ejectedCases[i];
      shell.time += dt; shell.x += shell.vx*dt; shell.y += shell.vy*dt; shell.vy += 260*dt;
      if (shell.time > .82) ejectedCases.splice(i, 1);
    }
  }

  function updateInteraction() {
    nearbyInteraction = null;
    const ray = core.castRay(world, player.x, player.y, Math.cos(player.angle), Math.sin(player.angle), 1.35);
    if (ray.tile === core.TILE.DOOR && ray.distance <= 1.25) nearbyInteraction = { type: "door", value: ray.door };
    for (const prop of world.props) {
      if (!prop.active || !["lever","exit"].includes(prop.type)) continue;
      const dx=prop.x-player.x,dy=prop.y-player.y,d=Math.hypot(dx,dy),dot=(dx*Math.cos(player.angle)+dy*Math.sin(player.angle))/(d||1);
      if (d < 1.2 && dot > 0.15 && (!nearbyInteraction || d < ray.distance)) nearbyInteraction={type:prop.type,value:prop};
    }
    const label = nearbyInteraction?.type === "door" ? (nearbyInteraction.value.locked ? "СЕВЕРНАЯ ДВЕРЬ ЗАПЕЧАТАНА" : "E · ОТКРЫТЬ ДВЕРЬ")
      : nearbyInteraction?.type === "lever" ? "E · СНЯТЬ ИМПЕРСКУЮ ПЕЧАТЬ"
      : nearbyInteraction?.type === "exit" ? (finalRemaining() ? "ВЫХОД ЗАКРЫТ: ТРОННЫЙ ЗАЛ НЕ ОЧИЩЕН" : "E · ПОКИНУТЬ УРОВЕНЬ") : "";
    if(fpsPrompt.textContent!==label)fpsPrompt.textContent=label;
    if(fpsPrompt.hidden!==!label)fpsPrompt.hidden=!label;
    const hideUse=!isTouchMode()||!nearbyInteraction;
    if(fpsUse.hidden!==hideUse)fpsUse.hidden=hideUse;
    if(fpsUse.disabled)fpsUse.disabled=false;
  }

  function interact() {
    if (mode !== "playing" || !nearbyInteraction) return;
    const { type, value } = nearbyInteraction;
    if (type === "door") {
      if (value.locked) { announce("Найдите рычаг в правом крыле дворца", 2.6); tone(62,50,.12,"square",.03); return; }
      if (value.target < 1) { value.target = 1; sound("door"); }
    } else if (type === "lever" && !value.pulled) {
      value.pulled = true;
      world.doors.get(core.key(12,5)).locked = false;
      score += 150; sound("lever"); announce("Северная дверь разблокирована. Вернитесь в центральный зал.", 4);
    } else if (type === "exit") {
      if (finalRemaining()) announce(`Выход запечатан: осталось ${finalRemaining()}`, 2.2);
      else showVictory();
    }
  }

  function finalRemaining() {
    return enemies.filter(enemy => enemy.zone === "final" && enemy.state !== "dead").length;
  }

  function render() {
    if (!active || !images.textures) return;
    renderWorld();
    renderSprites();
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0,0,W,H);
    ctx.drawImage(sceneCanvas, 0, 0, W, H);
    drawWeapon();
    drawHud();
    drawCrosshair();
    if (damageFlash > 0) { ctx.fillStyle=`rgba(170,8,8,${damageFlash*.24})`;ctx.fillRect(0,0,W,H); }
    if (messageTime > 0) drawMessage();
  }

  function writePixel(data, x, y, color, shade=1) {
    if (x<0||y<0||x>=sceneW||y>=sceneH)return;
    const i=(y*sceneW+x)*4;
    data[i]=color[0]*shade;data[i+1]=color[1]*shade;data[i+2]=color[2]*shade;data[i+3]=255;
  }

  function writeTexturePixel(data, x, y, texture, textureX, textureY, shade) {
    const source=(texturePixels[texture]||texturePixels[0]),sourceIndex=(((textureY&63)*64)+(textureX&63))*4,targetIndex=(y*sceneW+x)*4;
    data[targetIndex]=source[sourceIndex]*shade;data[targetIndex+1]=source[sourceIndex+1]*shade;data[targetIndex+2]=source[sourceIndex+2]*shade;data[targetIndex+3]=255;
  }

  function drawWallColumn(data, x, hit, rayX, rayY, horizon) {
    const fullHeight=Math.min(sceneH*4,Math.abs(sceneH/hit.distance));
    let start=horizon-fullHeight/2,end=horizon+fullHeight/2,shift=0;
    if(hit.door){shift=-hit.door.open*fullHeight;start+=shift;end+=shift;}
    const texture=hit.tile===core.TILE.STONE?1:hit.tile===core.TILE.PORTRAIT?3:hit.tile===core.TILE.DOOR?2:hit.tile===core.TILE.BANNER?7:0;
    let textureX=Math.floor(hit.wallX*64);if((hit.side===0&&rayX>0)||(hit.side===1&&rayY<0))textureX=63-textureX;
    const shade=Math.max(.22,Math.min(1,1-hit.distance/18))*(hit.side?.76:1);
    const y0=Math.max(0,Math.floor(start)),y1=Math.min(sceneH-1,Math.ceil(end));
    for(let y=y0;y<=y1;y+=1){const originalY=y-shift,textureY=Math.floor((originalY-(horizon-fullHeight/2))*64/fullHeight);writeTexturePixel(data,x,y,texture,textureX,textureY,shade);}
  }

  function renderWorld() {
    const data=sceneImage.data, dirX=Math.cos(player.angle),dirY=Math.sin(player.angle),planeSize=Math.tan(FOV/2);
    const planeX=-dirY*planeSize,planeY=dirX*planeSize;
    const bob=Math.sin(player.bob)*Math.min(1.3,player.moving*.38),horizon=Math.round(sceneH/2+bob+cameraKick*.5);
    const leftX=dirX-planeX,leftY=dirY-planeY,rightX=dirX+planeX,rightY=dirY+planeY;
    for(let y=0;y<sceneH;y+=1){
      if(y===horizon){for(let x=0;x<sceneW;x++)writePixel(data,x,y,[50,35,21],.8);continue;}
      const lower=y>horizon,dy=Math.abs(y-horizon),distance=sceneH/(2*Math.max(1,dy));
      let wx=player.x+distance*leftX,wy=player.y+distance*leftY;
      const stepX=distance*(rightX-leftX)/sceneW,stepY=distance*(rightY-leftY)/sceneW;
      const shade=Math.max(.2,Math.min(.92,1-distance/22))*(lower?1:.72);
      let targetIndex=y*sceneW*4;
      for(let x=0;x<sceneW;x+=1){
        const tx=Math.floor(wx*64)&63,ty=Math.floor(wy*64)&63,ix=Math.floor(wx),iy=Math.floor(wy);
        const texture=lower?(world.floor[iy]?.[ix]===4?4:5):6;
        const source=texturePixels[texture],sourceIndex=(ty*64+tx)*4;
        data[targetIndex++]=source[sourceIndex]*shade;
        data[targetIndex++]=source[sourceIndex+1]*shade;
        data[targetIndex++]=source[sourceIndex+2]*shade;
        data[targetIndex++]=255;
        wx+=stepX;wy+=stepY;
      }
    }
    for(let x=0;x<sceneW;x+=1){
      const camera=2*x/sceneW-1,rayX=dirX+planeX*camera,rayY=dirY+planeY*camera;
      const hit=core.castRay(world,player.x,player.y,rayX,rayY,30);
      if(hit.door&&hit.door.open>.01){
        const advance=hit.distance+.015;
        const rear=core.castRay(world,player.x+rayX*advance,player.y+rayY*advance,rayX,rayY,30-advance);
        rear.distance+=advance;
        drawWallColumn(data,x,rear,rayX,rayY,horizon);
      }
      zBuffer[x]=hit.distance;
      drawWallColumn(data,x,hit,rayX,rayY,horizon);
    }
    sceneCtx.putImageData(sceneImage,0,0);
  }

  function renderSprites() {
    const dirX=Math.cos(player.angle),dirY=Math.sin(player.angle),planeSize=Math.tan(FOV/2),planeX=-dirY*planeSize,planeY=dirX*planeSize;
    const sprites=visibleSprites;sprites.length=0;
    for(const enemy of enemies)queueSprite("enemy",enemy);
    for(const prop of world.props)if(prop.active)queueSprite("prop",prop);
    for(const projectile of projectiles)queueSprite("projectile",projectile);
    for(const particle of particles)queueSprite("particle",particle);
    sprites.sort(sortSprites);
    for(const sprite of sprites)projectSprite(sprite,dirX,dirY,planeX,planeY);
  }

  function queueSprite(kind,value){
    const index=visibleSprites.length;
    const entry=spritePool[index]||(spritePool[index]={kind:"",value:null,d:0});
    entry.kind=kind;entry.value=value;
    entry.d=(value.x-player.x)**2+(value.y-player.y)**2;
    visibleSprites.push(entry);
  }

  function projectSprite(sprite,dirX,dirY,planeX,planeY) {
    const item=sprite.value,dx=item.x-player.x,dy=item.y-player.y,inv=1/(planeX*dirY-dirX*planeY);
    const tx=inv*(dirY*dx-dirX*dy),ty=inv*(-planeY*dx+planeX*dy);
    if(ty<=.08)return;
    const screenX=Math.floor(sceneW/2*(1+tx/ty));
    const bob=Math.sin(player.bob)*Math.min(1.3,player.moving*.38),horizon=Math.round(sceneH/2+bob+cameraKick*.5);
    if(sprite.kind==="projectile"||sprite.kind==="particle"){
      const size=Math.max(2,Math.min(14,sceneH/ty*(sprite.kind==="projectile"?.22:.055))),x=Math.round(screenX-size/2),y=Math.round(horizon-size*.7);
      if(screenX>=0&&screenX<sceneW&&ty<zBuffer[Math.max(0,Math.min(sceneW-1,screenX))]){
        sceneCtx.fillStyle=sprite.kind==="projectile"?"#56d8ff":item.color;sceneCtx.globalAlpha=sprite.kind==="projectile"?1:Math.min(1,item.life*2);sceneCtx.fillRect(x,y,size,size);sceneCtx.globalAlpha=1;
      }return;
    }
    let image,cols,rows,frame,row,scale,alpha=1;
    if(sprite.kind==="enemy"){
      image=images.enemies;cols=5;rows=3;row=TYPE_ROW[item.type];frame=STATE_FRAME[item.state]??0;scale=item.spriteScale;
      if(item.type==="sorcerer"&&item.state==="attack")frame=1;
      if(item.state==="teleport")alpha=item.stateTime<.48?Math.max(0,1-item.stateTime/.48):Math.min(1,(item.stateTime-.48)/.52);
      if(item.flash>0&&Math.floor(item.flash*40)%2===0)alpha*=.45;
    }else{
      image=images.props;cols=4;rows=1;row=0;frame=PROP_FRAME[item.type];scale=item.type==="exit"?1.0:item.type==="lever"?.72:.46;
      if(item.type==="lever"&&item.pulled)alpha=.58;
      if(item.type==="exit"&&finalRemaining())alpha=.48;
    }
    const sourceW=image.width/cols,sourceH=image.height/rows,spriteHeight=Math.abs(sceneH/ty)*scale,spriteWidth=spriteHeight*(sourceW/sourceH);
    const bottom=horizon+sceneH/(2*ty),startY=bottom-spriteHeight,startX=screenX-spriteWidth/2,endX=startX+spriteWidth;
    sceneCtx.globalAlpha=alpha;
    let runStart=-1;
    const drawRun=(from,to)=>{
      if(to<=from)return;
      const sourceX=frame*sourceW+(from-startX)/spriteWidth*sourceW;
      const sourceWidth=(to-from)/spriteWidth*sourceW;
      sceneCtx.drawImage(image,sourceX,row*sourceH,sourceWidth,sourceH,from,startY,to-from,spriteHeight);
    };
    const firstStripe=Math.max(0,Math.ceil(startX)),lastStripe=Math.min(sceneW,Math.floor(endX));
    for(let stripe=firstStripe;stripe<lastStripe;stripe+=1){
      const visible=ty<zBuffer[stripe];
      if(visible&&runStart<0)runStart=stripe;
      else if(!visible&&runStart>=0){drawRun(runStart,stripe);runStart=-1;}
    }
    if(runStart>=0)drawRun(runStart,lastStripe);
    sceneCtx.globalAlpha=1;
    if(sprite.kind==="enemy"&&item.state==="teleport")drawProjectedMist(screenX,bottom,spriteHeight,item.stateTime);
  }

  function drawProjectedMist(x,bottom,height,time){
    sceneCtx.globalAlpha=.45;
    for(let i=0;i<9;i++){const phase=i*2.31+time*5,size=Math.max(2,height*.09);sceneCtx.fillStyle=i%2?"#2e78d5":"#74d8ff";sceneCtx.fillRect(x+Math.sin(phase)*height*.28-size/2,bottom-height*(i/10)-size/2,size,size);}
    sceneCtx.globalAlpha=1;
  }

  function drawWeapon() {
    if(!images.weapon)return;
    const bobX=Math.sin(player.bob*.5)*Math.min(3,player.moving),bobY=Math.abs(Math.cos(player.bob))*Math.min(2.4,player.moving*.7);
    const width=354,height=images.weapon.height/images.weapon.width*width;
    const x=W/2-width/2+40+bobX+recoil*4,y=H-height+16+bobY-recoil*10;
    const muzzleX=x+width*(304/768),muzzleY=y+height*(105/512);
    ctx.drawImage(images.weapon,x,y,width,height);
    if(muzzleFlash>0){
      const strength=Math.min(1,muzzleFlash/.075),gradient=ctx.createRadialGradient(muzzleX,muzzleY,0,muzzleX,muzzleY,52);
      ctx.save();ctx.globalCompositeOperation="screen";gradient.addColorStop(0,`rgba(255,246,185,${.9*strength})`);gradient.addColorStop(.25,`rgba(255,151,37,${.38*strength})`);gradient.addColorStop(1,"rgba(255,92,14,0)");ctx.fillStyle=gradient;ctx.fillRect(muzzleX-54,muzzleY-54,108,108);ctx.restore();
      ctx.fillStyle="#fff6bd";ctx.fillRect(muzzleX-4,muzzleY-8,8,17);ctx.fillStyle="#ffb229";ctx.fillRect(muzzleX-11,muzzleY-3,22,6);ctx.fillStyle="#e75b16";ctx.fillRect(muzzleX-3,muzzleY-15,6,30);
    }
    if(shotTrace>0){
      const dx=W/2-muzzleX,dy=H/2-muzzleY,length=Math.hypot(dx,dy)||1,nx=dx/length,ny=dy/length;
      ctx.save();ctx.globalAlpha=Math.min(1,shotTrace/.06);ctx.strokeStyle="#fff2a3";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(muzzleX,muzzleY);ctx.lineTo(W/2+nx*13,H/2+ny*13);ctx.stroke();ctx.restore();
    }
    for(const shell of ejectedCases){ctx.save();ctx.translate(shell.x,shell.y);ctx.rotate(shell.time*shell.spin);ctx.fillStyle="#4b2b0e";ctx.fillRect(-6,-3,12,6);ctx.fillStyle="#e1a33a";ctx.fillRect(-5,-2,10,4);ctx.fillStyle="#ffe089";ctx.fillRect(-4,-2,6,1);ctx.restore();}
  }

  function drawHud() {
    const top=H-42;
    ctx.fillStyle="#090909e8";ctx.fillRect(0,top,W,42);
    ctx.fillStyle="#5f452a";ctx.fillRect(0,top, W,2);
    ctx.fillStyle="#bd8231";for(let x=6;x<W;x+=32)ctx.fillRect(x,top+1,2,2);
    ctx.drawImage(images.portrait,8,top+5,31,31);
    if(player.health<34){ctx.fillStyle="#9e101066";ctx.fillRect(8,top+5,31,31);}else if(player.health<67){ctx.fillStyle="#b95e1640";ctx.fillRect(8,top+5,31,31);}
    ctx.font="bold 9px monospace";ctx.fillStyle="#c79a51";ctx.fillText("ЗДОРОВЬЕ",45,top+13);ctx.fillStyle=player.health<30?"#ff453c":"#f0d277";ctx.font="bold 18px monospace";ctx.fillText(String(player.health).padStart(3,"0"),45,top+31);
    ctx.textAlign="right";ctx.font="bold 9px monospace";ctx.fillStyle="#c79a51";ctx.fillText(player.reloadTimer>0?"ПЕРЕЗАРЯДКА":"МАГАЗИН / ЗАПАС",W-10,top+13);ctx.fillStyle=player.magazine<4?"#ff6a3d":"#f0d277";ctx.font="bold 18px monospace";ctx.fillText(`${String(player.magazine).padStart(2,"0")} / ${String(player.reserve).padStart(2,"0")}`,W-10,top+31);
    ctx.textAlign="center";ctx.font="bold 8px monospace";ctx.fillStyle="#a88a57";ctx.fillText(objectiveText(),W/2,top+16);ctx.fillStyle="#66563c";ctx.fillText(`МЫШИ ${enemies.length-kills}/${enemies.length}  ·  ${score}`,W/2,top+29);ctx.textAlign="left";
  }

  function objectiveText(){
    const lever=world.props.find(p=>p.type==="lever");
    if(!lever.pulled)return "НАЙТИ И ОПУСТИТЬ РЫЧАГ В ПРАВОМ КРЫЛЕ";
    if(player.y>5.5)return "ПРОЙТИ ЧЕРЕЗ СЕВЕРНУЮ ДВЕРЬ";
    if(finalRemaining())return "ОЧИСТИТЬ ТРОННЫЙ ЗАЛ";
    return "АКТИВИРОВАТЬ ЗОЛОТОЙ ВЫХОД";
  }

  function drawCrosshair(){
    const x=W/2,y=H/2;
    ctx.fillStyle="#120b08";ctx.fillRect(x-7,y-1,5,3);ctx.fillRect(x+3,y-1,5,3);ctx.fillRect(x-1,y-7,3,5);ctx.fillRect(x-1,y+3,3,5);
    ctx.fillStyle="#fff1a0";ctx.fillRect(x-6,y,4,1);ctx.fillRect(x+3,y,4,1);ctx.fillRect(x,y-6,1,4);ctx.fillRect(x,y+3,1,4);
  }

  function drawMessage(){
    ctx.font="bold 9px monospace";const width=Math.min(420,ctx.measureText(message).width+20);ctx.fillStyle="#070707d9";ctx.fillRect(W/2-width/2,14,width,23);ctx.strokeStyle="#95682c";ctx.strokeRect(W/2-width/2+.5,14.5,width-1,22);ctx.fillStyle="#f2d58a";ctx.textAlign="center";ctx.fillText(message,W/2,29);ctx.textAlign="left";
  }

  function frame(now){
    const dt=Math.min(.05,(now-lastTime)/1000||0);lastTime=now;
    if(active){update(dt);render();}
    requestAnimationFrame(frame);
  }

  function handleKeyDown(event){
    if(!active)return;
    if(["KeyW","KeyA","KeyS","KeyD","KeyE","Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.code))event.preventDefault();
    keys.add(event.code);ensureAudio();
    if(event.repeat)return;
    if(event.code==="KeyE")interact();
    else if(event.code==="KeyR")beginPlay(true);
  }

  function releasePointer(id){
    if(touchMove.pointer===id){touchMove.pointer=null;touchMove.x=0;touchMove.y=0;fpsStickKnob.style.transform="translate(0, 0)";}
    if(lookTouch.pointer===id)lookTouch.pointer=null;
  }

  function stop(){
    if(!active)return;
    active=false;mode="inactive";fireHeld=false;keys.clear();
    touchMove.pointer=null;touchMove.x=0;touchMove.y=0;lookTouch.pointer=null;
    fpsStickKnob.style.transform="translate(0, 0)";
    fpsOverlay.hidden=true;fpsPrompt.hidden=true;fpsTouch.hidden=true;
    setLevelMusic(false);document.exitPointerLock?.();
    document.body.classList.remove("fps-active");
  }

  fpsAction.addEventListener("click",()=>{if(mode==="paused")resume();else beginPlay(mode==="defeat"||mode==="victory");fpsAction.blur();});
  window.addEventListener("keydown",handleKeyDown,{passive:false});
  window.addEventListener("keyup",event=>keys.delete(event.code));
  canvas.addEventListener("mousedown",event=>{if(!active||mode!=="playing"||event.button!==0)return;ensureAudio();if(document.pointerLockElement!==canvas)canvas.requestPointerLock?.();fireHeld=true;shoot();});
  window.addEventListener("mouseup",event=>{if(event.button===0)fireHeld=false;});
  document.addEventListener("mousemove",event=>{if(!active||mode!=="playing"||document.pointerLockElement!==canvas)return;player.angle+=event.movementX*.00245;});
  gameFrame.addEventListener("contextmenu",event=>{if(active)event.preventDefault();});
  fpsStick.addEventListener("pointerdown",event=>{event.preventDefault();ensureAudio();touchMove.pointer=event.pointerId;fpsStick.setPointerCapture(event.pointerId);});
  fpsStick.addEventListener("pointermove",event=>{if(touchMove.pointer!==event.pointerId)return;const r=fpsStick.getBoundingClientRect(),x=event.clientX-(r.left+r.width/2),y=event.clientY-(r.top+r.height/2),max=r.width*.34,length=Math.hypot(x,y),scale=length>max?max/length:1;touchMove.x=x*scale/max;touchMove.y=y*scale/max;fpsStickKnob.style.transform=`translate(${x*scale}px, ${y*scale}px)`;});
  for(const type of ["pointerup","pointercancel","lostpointercapture"])fpsStick.addEventListener(type,event=>releasePointer(event.pointerId));
  fpsLook.addEventListener("pointerdown",event=>{event.preventDefault();ensureAudio();lookTouch.pointer=event.pointerId;lookTouch.x=event.clientX;lookTouch.y=event.clientY;fpsLook.setPointerCapture(event.pointerId);});
  fpsLook.addEventListener("pointermove",event=>{if(lookTouch.pointer!==event.pointerId||mode!=="playing")return;player.angle+=(event.clientX-lookTouch.x)*.006;lookTouch.x=event.clientX;lookTouch.y=event.clientY;});
  for(const type of ["pointerup","pointercancel","lostpointercapture"])fpsLook.addEventListener(type,event=>releasePointer(event.pointerId));
  fpsFire.addEventListener("pointerdown",event=>{event.preventDefault();ensureAudio();fpsFire.setPointerCapture(event.pointerId);fireHeld=true;shoot();fpsFire.classList.add("is-held");});
  const releaseFire=()=>{fireHeld=false;fpsFire.classList.remove("is-held");};
  for(const type of ["pointerup","pointercancel","lostpointercapture"])fpsFire.addEventListener(type,releaseFire);
  fpsUse.addEventListener("pointerdown",event=>{event.preventDefault();ensureAudio();interact();});
  musicButton.addEventListener("click",()=>{if(active)soundEnabled=musicButton.getAttribute("aria-pressed")==="true";});
  new MutationObserver(syncTouchMode).observe(gameShell,{attributes:true,attributeFilter:["class"]});

  window.CatEmperorLevel2={start,stop,get active(){return active;},get mode(){return mode;},pause,resume,togglePause,interact,shoot,
    syncSound(enabled){soundEnabled=Boolean(enabled);setLevelMusic(soundEnabled&&mode==="playing");},
    _debug:{player,getWorld:()=>world,getEnemies:()=>enemies,update,finalRemaining,objectiveText}};
  requestAnimationFrame(frame);
  if(new URLSearchParams(location.search).get("level")==="2")start({direct:true});
})();
