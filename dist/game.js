(() => {
  "use strict";

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const overlay = document.querySelector("#loading");
  const title = overlay.querySelector("h1");
  const status = document.querySelector("#load-status");
  const startButton = document.querySelector("#start");
  const gameShell = document.querySelector(".game-shell");
  const gameFrame = document.querySelector("#game-frame");
  const fullscreenButton = document.querySelector("#fullscreen-button");
  const musicButton = document.querySelector("#music-button");
  const victoryCinematic = document.querySelector("#victory-cinematic");
  const victoryVideo = document.querySelector("#victory-video");
  const cinematicPlayButton = document.querySelector("#cinematic-play");
  const cinematicSkipButton = document.querySelector("#cinematic-skip");

  const W = 640;
  const H = 360;
  const WORLD_W = 1920;
  const WORLD_H = 960;
  const RENDER_SCALE = 2;
  const GROUND_TILE_Y = 896;
  const GROUND_Y = 916;
  const PLAYER_JUMP_SPEED = 510;
  const MOUSE_JUMP_SPEED = 610;
  const MOUSE_GRAVITY = 1320;
  const MOUSE_DETECTION_RADIUS = 270;
  const SORCERER_LEVEL_TOLERANCE = 44;
  const SORCERER_TELEPORT_RADIUS = 720;
  const PROJECTILE_SPEED = 105;

  canvas.width = W * RENDER_SCALE;
  canvas.height = H * RENDER_SCALE;
  ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
  ctx.imageSmoothingEnabled = false;

  function resizeGameSurface() {
    const fullscreen = Boolean(document.fullscreenElement);
    const horizontalMargin = fullscreen ? 0 : 16;
    const verticalMargin = fullscreen ? 0 : 68;
    const availableW = Math.max(1, window.innerWidth - horizontalMargin);
    const availableH = Math.max(1, window.innerHeight - verticalMargin);
    const availableScale = Math.min(availableW / W, availableH / H);
    const pixelScale = availableScale >= 2 ? Math.floor(availableScale) : availableScale;
    const displayWidth = Math.floor(W * pixelScale);

    if (fullscreen) {
      gameShell.style.width = "";
      canvas.style.width = `${displayWidth}px`;
    } else {
      gameShell.style.width = `${displayWidth}px`;
      canvas.style.width = "100%";
    }
  }
  const keys = new Set();
  const pressed = new Set();
  const particles = [];
  let mode = "loading";
  let lastTime = performance.now();
  let worldTime = 0;
  let cameraX = 0;
  let cameraY = WORLD_H - H;
  let hitStop = 0;
  let endTimer = 0;
  let audioContext = null;
  let musicEnabled = true;
  let backgroundMusicPromise = null;
  let victoryVideoPromise = null;

  const backgroundMusic = new Audio();
  backgroundMusic.loop = true;
  backgroundMusic.preload = "auto";
  backgroundMusic.volume = 0.32;

  const assetPaths = {
    background: "assets/backgrounds/palace_interior.webp",
    tiles: "assets/tiles/arena_tileset.png",
    portrait: "assets/ui/cat_emperor_portrait.png",
    catIdle: "assets/sprites/cat_emperor_idle.png",
    catRun: "assets/sprites/cat_emperor_run.png",
    catAir: "assets/sprites/cat_emperor_airborne.png",
    catAttack: "assets/sprites/cat_emperor_attack.png",
    catRanged: "assets/sprites/cat_emperor_ranged.png",
    catDamage: "assets/sprites/cat_emperor_damage.png",
    catFx: "assets/sprites/cat_emperor_fx.png",
    mouseIdle: "assets/sprites/cultist_mouse_idle.png",
    mouseRun: "assets/sprites/cultist_mouse_run.png",
    mouseAttack: "assets/sprites/cultist_mouse_attack.png",
    mouseHurt: "assets/sprites/cultist_mouse_hurt.png",
    mouseDeath: "assets/sprites/cultist_mouse_death.png",
    sorcerer: "assets/sprites/sorcerer_mouse.png",
    zombie: "assets/sprites/zombie_mouse.png"
  };

  const backgroundMusicParts = Array.from(
    { length: 7 },
    (_, index) => `assets/audio/litany-parts/litany.mp3.part-${String(index).padStart(2, "0")}`
  );

  const images = {};
  const platforms = [
    { x: 120, y: 840, drawY: 820, w: 192 },
    { x: 380, y: 795, drawY: 775, w: 128 },
    { x: 580, y: 848, drawY: 828, w: 192 },
    { x: 850, y: 788, drawY: 768, w: 128 },
    { x: 1040, y: 838, drawY: 818, w: 192 },
    { x: 1300, y: 778, drawY: 758, w: 128 },
    { x: 1490, y: 834, drawY: 814, w: 192 },
    { x: 1735, y: 790, drawY: 770, w: 128 },
    { x: 1620, y: 710, drawY: 690, w: 192 },
    { x: 1400, y: 630, drawY: 610, w: 192 },
    { x: 1180, y: 550, drawY: 530, w: 192 },
    { x: 960, y: 470, drawY: 450, w: 192 },
    { x: 740, y: 390, drawY: 370, w: 192 },
    { x: 520, y: 310, drawY: 290, w: 192 },
    { x: 300, y: 230, drawY: 210, w: 192 },
    { x: 80, y: 150, drawY: 130, w: 192 }
  ];
  const climbPlatforms = platforms.slice(7);

  const player = {
    x: 112, y: GROUND_Y, vx: 0, vy: 0,
    facing: 1, grounded: true,
    state: "idle", stateTime: 0,
    health: 5, maxHealth: 5,
    invuln: 0, coyote: 0, jumpBuffer: 0,
    attackHit: false, beamHit: false, beamCooldown: 0
  };

  const groundMouseSpawns = [
    { x: 470, patrolMin: 390, patrolMax: 555 },
    { x: 1370, patrolMin: 1265, patrolMax: 1450 },
    { x: 1510, patrolMin: 1420, patrolMax: 1630, type: "zombie" }
  ];

  function createMouseSpawns() {
    // Keep five cultists, with a patrol on each tier. Every platform can be
    // selected; choose again on restart without changing the arena's geometry.
    const tiers = [platforms.slice(0, 8), platforms.slice(8, 12), platforms.slice(12)];
    return [...groundMouseSpawns, ...tiers.map(tier => {
      const platform = tier[Math.floor(Math.random() * tier.length)];
      return {
        x: platform.x + 32, y: platform.y,
        patrolMin: platform.x + 28,
        patrolMax: platform.x + platform.w - 28
      };
    })];
  }

  function createMouse(spawn, index) {
    return {
      type: spawn.type || "cultist", damage: spawn.type === "zombie" ? 2 : 1, regenTime: 0,
      x: spawn.x, y: spawn.y ?? GROUND_Y, vx: 0, vy: 0,
      facing: -1, grounded: true, state: "idle", stateTime: index * 0.08,
      health: spawn.type === "zombie" ? 8 : 4, maxHealth: spawn.type === "zombie" ? 8 : 4, attackHit: false,
      patrolDir: index % 2 ? 1 : -1, alerted: false, jumpCooldown: 0,
      patrolMin: spawn.patrolMin, patrolMax: spawn.patrolMax,
      animOffset: index * 0.13
    };
  }

  const mice = createMouseSpawns().map(createMouse);
  const sorcererSpawns = [
    { x: 1130, y: 838 },
    { x: 615, y: 310 }
  ];

  function createSorcerer(spawn, index) {
    return {
      type: "sorcerer", x: spawn.x, y: spawn.y,
      facing: -1, state: "idle", stateTime: index * 0.1,
      health: 3, maxHealth: 3, castCooldown: 0.8 + index * 0.45,
      shotFired: false, teleported: false, teleportTarget: null,
      animOffset: index * 0.17
    };
  }

  const sorcerers = sorcererSpawns.map(createSorcerer);
  const projectiles = [];

  function allEnemies() {
    return [...mice, ...sorcerers];
  }

  function allEnemiesDefeated() {
    return allEnemies().every(enemy => enemy.state === "dead");
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
      img.src = src;
    });
  }

  async function loadAssets() {
    try {
      const entries = await Promise.all(
        Object.entries(assetPaths).map(async ([name, src]) => [name, await loadImage(src)])
      );
      Object.assign(images, Object.fromEntries(entries));
      mode = "ready";
      status.textContent = "Пять культистов, два колдуна и одна мышь-зомби.";
      startButton.textContent = "ВСТУПИТЬ В БОЙ";
      startButton.disabled = false;
      draw();
    } catch (error) {
      status.textContent = error.message;
    }
  }

  function prepareVictoryVideo() {
    if (victoryVideoPromise) return victoryVideoPromise;
    victoryVideoPromise = fetch("assets/video/victory.mp4").then(async response => {
      if (!response.ok) throw new Error("Не удалось загрузить победный ролик");
      victoryVideo.src = URL.createObjectURL(new Blob([await response.arrayBuffer()], { type: "video/mp4" }));
      victoryVideo.load();
    }).catch(error => {
      victoryVideoPromise = null;
      throw error;
    });
    return victoryVideoPromise;
  }

  function prepareBackgroundMusic() {
    if (backgroundMusicPromise) return backgroundMusicPromise;
    backgroundMusicPromise = Promise.all(backgroundMusicParts.map(async path => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);
      return response.arrayBuffer();
    })).then(parts => {
      backgroundMusic.src = URL.createObjectURL(new Blob(parts, { type: "audio/mpeg" }));
      backgroundMusic.load();
    }).catch(error => {
      backgroundMusicPromise = null;
      throw error;
    });
    return backgroundMusicPromise;
  }

  function resetGame() {
    victoryVideo.pause();
    victoryVideo.currentTime = 0;
    victoryCinematic.hidden = true;
    cinematicPlayButton.hidden = true;
    Object.assign(player, {
      x: 112, y: GROUND_Y, vx: 0, vy: 0, facing: 1, grounded: true,
      state: "idle", stateTime: 0, health: 5, invuln: 0,
      coyote: 0.08, jumpBuffer: 0, attackHit: false,
      beamHit: false, beamCooldown: 0
    });
    mice.splice(0, mice.length, ...createMouseSpawns().map(createMouse));
    sorcerers.splice(0, sorcerers.length, ...sorcererSpawns.map(createSorcerer));
    particles.length = 0;
    projectiles.length = 0;
    hitStop = 0;
    endTimer = 0;
    cameraX = 0;
    cameraY = WORLD_H - H;
    mode = "playing";
    overlay.hidden = true;
    setMusicLevel();
    prepareVictoryVideo().catch(() => {});
  }

  function showEnd(victory) {
    mode = victory ? "victory" : "defeat";
    overlay.hidden = false;
    title.textContent = victory ? "ВРАГ ПОВЕРЖЕН" : "СВЕТ УГАС";
    status.textContent = victory
      ? "Испытание завершено. Арена очищена."
      : "Даже бессмертной воле иногда требуется ещё одна попытка.";
    startButton.textContent = "СРАЗИТЬСЯ СНОВА";
    startButton.disabled = false;
  }

  function setMusicLevel() {
    if (!musicEnabled || mode !== "playing") {
      backgroundMusic.pause();
      return;
    }
    prepareBackgroundMusic().then(() => {
      if (musicEnabled && mode === "playing") {
        backgroundMusic.volume = 0.32;
        backgroundMusic.play().catch(() => {});
      }
    }).catch(() => {
      if (mode === "playing") status.textContent = "Не удалось загрузить фоновую музыку.";
    });
  }

  async function beginVictoryCinematic() {
    if (mode === "cinematic") return;
    mode = "cinematic";
    keys.clear();
    player.vx = 0;
    for (const mouse of mice) mouse.vx = 0;
    projectiles.length = 0;
    setMusicLevel();
    victoryCinematic.hidden = false;
    cinematicPlayButton.hidden = true;
    try {
      await prepareVictoryVideo();
      if (mode !== "cinematic") return;
      victoryVideo.currentTime = 0;
      victoryVideo.volume = 0.9;
      await victoryVideo.play();
    } catch (_error) {
      if (mode === "cinematic") cinematicPlayButton.hidden = false;
    }
  }

  function finishVictoryCinematic() {
    if (mode !== "cinematic") return;
    victoryVideo.pause();
    victoryCinematic.hidden = true;
    cinematicPlayButton.hidden = true;
    showEnd(true);
  }

  function ensureAudio() {
    if (!audioContext) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (AudioCtor) {
        audioContext = new AudioCtor();
      }
    }
    if (audioContext?.state === "suspended") audioContext.resume();
  }

  function toggleMusic() {
    ensureAudio();
    musicEnabled = !musicEnabled;
    setMusicLevel();
    musicButton.textContent = musicEnabled ? "♫" : "♪";
    musicButton.setAttribute("aria-pressed", String(musicEnabled));
    musicButton.setAttribute("aria-label", musicEnabled ? "Выключить музыку" : "Включить музыку");
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await gameFrame.requestFullscreen();
    } catch (_error) {
      status.textContent = "Полноэкранный режим заблокирован браузером.";
    }
  }

  function sound(kind) {
    if (!audioContext) return;
    const settings = {
      jump: [210, 330, 0.09, "square"],
      slash: [130, 70, 0.08, "sawtooth"],
      beam: [520, 180, 0.16, "square"],
      hit: [90, 42, 0.1, "square"],
      hurt: [75, 48, 0.14, "sawtooth"],
      victory: [330, 660, 0.28, "square"]
    }[kind];
    if (!settings) return;
    const [from, to, duration, type] = settings;
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + duration);
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  function setState(entity, next) {
    if (entity.state === next) return;
    entity.state = next;
    entity.stateTime = 0;
  }

  function isDown(...codes) {
    return codes.some(code => keys.has(code));
  }

  function wasPressed(...codes) {
    return codes.some(code => pressed.has(code));
  }

  function beginAttack() {
    if (["attack", "ranged", "hurt", "dead"].includes(player.state)) return;
    setState(player, "attack");
    player.attackHit = false;
    player.vx *= 0.25;
    sound("slash");
  }

  function beginBeam() {
    if (player.beamCooldown > 0 || ["attack", "ranged", "hurt", "dead"].includes(player.state)) return;
    setState(player, "ranged");
    player.beamHit = false;
    player.beamCooldown = 1.05;
    player.vx *= 0.2;
    sound("beam");
  }

  function damageMouse(mouse, amount) {
    if (["hurt", "dead"].includes(mouse.state)) return;
    mouse.alerted = true;
    mouse.health = Math.max(0, mouse.health - amount);
    mouse.vx = player.facing * 145;
    burst(mouse.x, mouse.y - 35, "#ffb52e", 9);
    hitStop = 0.055;
    sound("hit");
    if (mouse.health === 0) {
      setState(mouse, "dead");
      mouse.vx = player.facing * 70;
      if (allEnemiesDefeated()) endTimer = 1.0;
    } else {
      setState(mouse, "hurt");
    }
  }

  function chooseTeleportTarget(sorcerer) {
    const surfaces = [];
    for (let x = 80; x < WORLD_W - 80; x += 160) surfaces.push({ x, y: GROUND_Y });
    for (const platform of platforms) {
      surfaces.push(
        { x: platform.x + 34, y: platform.y },
        { x: platform.x + platform.w / 2, y: platform.y },
        { x: platform.x + platform.w - 34, y: platform.y }
      );
    }
    const candidates = surfaces.filter(point => {
      const withinRange = Math.hypot(point.x - sorcerer.x, point.y - sorcerer.y) <= SORCERER_TELEPORT_RADIUS;
      const farFromPlayer = Math.hypot(point.x - player.x, point.y - player.y) >= 260;
      const unoccupied = allEnemies().every(enemy => (
        enemy === sorcerer || enemy.state === "dead" || Math.hypot(point.x - enemy.x, point.y - enemy.y) >= 72
      ));
      return withinRange && farFromPlayer && unoccupied;
    });
    if (!candidates.length) return { x: sorcerer.x, y: sorcerer.y };
    candidates.sort((a, b) => (
      Math.hypot(b.x - player.x, b.y - player.y) - Math.hypot(a.x - player.x, a.y - player.y)
    ));
    return candidates[Math.floor(Math.random() * Math.min(3, candidates.length))];
  }

  function damageSorcerer(sorcerer, amount) {
    if (["teleport", "dead"].includes(sorcerer.state)) return;
    sorcerer.health = Math.max(0, sorcerer.health - amount);
    burst(sorcerer.x, sorcerer.y - 38, "#42d9ff", 14);
    hitStop = 0.055;
    sound("hit");
    if (sorcerer.health === 0) {
      setState(sorcerer, "dead");
      if (allEnemiesDefeated()) endTimer = 1.0;
      return;
    }
    sorcerer.teleportTarget = chooseTeleportTarget(sorcerer);
    sorcerer.teleported = false;
    setState(sorcerer, "teleport");
  }

  function damageEnemy(enemy, amount) {
    if (enemy.type === "sorcerer") damageSorcerer(enemy, amount);
    else damageMouse(enemy, amount);
  }

  function damagePlayer(attacker) {
    if (player.invuln > 0 || player.state === "dead") return;
    player.health = Math.max(0, player.health - (attacker.damage || 1));
    player.invuln = 0.85;
    player.vx = attacker.facing * 155;
    player.vy = -185;
    player.grounded = false;
    burst(player.x, player.y - 44, "#ffdf75", 12);
    hitStop = 0.07;
    sound("hurt");
    if (player.health === 0) {
      setState(player, "dead");
      endTimer = 1.25;
    } else {
      setState(player, "hurt");
    }
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      particles.push({
        x, y, color,
        vx: (Math.random() - 0.5) * 190,
        vy: -40 - Math.random() * 150,
        life: 0.22 + Math.random() * 0.28,
        size: Math.random() < 0.45 ? 2 : 3
      });
    }
  }

  function updatePlayer(dt) {
    player.stateTime += dt;
    player.invuln = Math.max(0, player.invuln - dt);
    player.beamCooldown = Math.max(0, player.beamCooldown - dt);
    player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
    player.coyote = player.grounded ? 0.09 : Math.max(0, player.coyote - dt);

    if (wasPressed("Space", "KeyW", "ArrowUp")) player.jumpBuffer = 0.11;
    if (wasPressed("KeyJ", "KeyX")) beginAttack();
    if (wasPressed("KeyK", "KeyC")) beginBeam();

    const locked = ["attack", "ranged", "hurt", "dead"].includes(player.state);
    let direction = 0;
    if (!locked) {
      if (isDown("KeyA", "ArrowLeft")) direction -= 1;
      if (isDown("KeyD", "ArrowRight")) direction += 1;
      if (direction) player.facing = direction;
      const target = direction * 150;
      player.vx += (target - player.vx) * Math.min(1, dt * (player.grounded ? 14 : 7));
      if (!direction && player.grounded) player.vx *= Math.pow(0.0008, dt);
    }

    if (player.jumpBuffer > 0 && player.coyote > 0 && !locked) {
      player.vy = -PLAYER_JUMP_SPEED;
      player.grounded = false;
      player.coyote = 0;
      player.jumpBuffer = 0;
      sound("jump");
      burst(player.x, player.y - 2, "#9b6b32", 5);
    }

    if (!isDown("Space", "KeyW", "ArrowUp") && player.vy < -180) player.vy += 1050 * dt;

    if (player.state === "attack") {
      if (!player.attackHit && player.stateTime >= 0.14) {
        player.attackHit = true;
        for (const enemy of allEnemies()) {
          const dx = enemy.x - player.x;
          if (enemy.state !== "dead" && Math.sign(dx || player.facing) === player.facing && Math.abs(dx) < 78 && Math.abs(enemy.y - player.y) < 62) {
            damageEnemy(enemy, 1);
          }
        }
      }
      if (player.stateTime >= 0.43) setState(player, player.grounded ? "idle" : "air");
    } else if (player.state === "ranged") {
      if (!player.beamHit && player.stateTime >= 0.17) {
        player.beamHit = true;
        for (const enemy of allEnemies()) {
          const dx = enemy.x - player.x;
          if (enemy.state !== "dead" && Math.sign(dx || player.facing) === player.facing && Math.abs(dx) < 275 && Math.abs(enemy.y - player.y) < 68) {
            damageEnemy(enemy, 1);
          }
        }
      }
      if (player.stateTime >= 0.5) setState(player, player.grounded ? "idle" : "air");
    } else if (player.state === "hurt" && player.stateTime >= 0.38) {
      setState(player, player.grounded ? "idle" : "air");
    }

    const previousY = player.y;
    if (!player.grounded) player.vy += 1320 * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = Math.max(28, Math.min(WORLD_W - 28, player.x));

    let landed = false;
    if (player.vy >= 0) {
      for (const platform of platforms) {
        const overlaps = player.x + 14 > platform.x && player.x - 14 < platform.x + platform.w;
        if (overlaps && previousY <= platform.y && player.y >= platform.y) {
          player.y = platform.y;
          landed = true;
          break;
        }
      }
      if (!landed && previousY <= GROUND_Y && player.y >= GROUND_Y) {
        player.y = GROUND_Y;
        landed = true;
      }
    }

    if (landed) {
      if (!player.grounded && player.vy > 280) burst(player.x, player.y - 2, "#8a6338", 6);
      player.vy = 0;
      player.grounded = true;
    } else if (player.y < GROUND_Y) {
      player.grounded = false;
    }

    if (!locked && !["attack", "ranged", "hurt", "dead"].includes(player.state)) {
      if (!player.grounded) setState(player, "air");
      else if (Math.abs(player.vx) > 18) setState(player, "run");
      else setState(player, "idle");
    }
  }

  function updateMouse(mouse, dt) {
    const zombie = mouse.type === "zombie";
    if (zombie && mouse.state !== "dead" && mouse.health < mouse.maxHealth) {
      mouse.regenTime += dt;
      if (mouse.regenTime >= 20) {
        mouse.health = Math.min(mouse.maxHealth, mouse.health + 1);
        mouse.regenTime = 0;
        burst(mouse.x, mouse.y - 40, "#789c45", 5);
      }
    }
    mouse.stateTime += dt;
    mouse.jumpCooldown = Math.max(0, mouse.jumpCooldown - dt);

    if (mouse.state === "dead") {
      mouse.vx *= Math.pow(0.02, dt);
      moveMouse(mouse, dt);
      return;
    }
    if (mouse.state === "hurt") {
      mouse.vx *= Math.pow(0.01, dt);
      if (mouse.stateTime >= 0.34) setState(mouse, "idle");
      moveMouse(mouse, dt);
      return;
    }
    if (mouse.state === "attack") {
      mouse.vx = 0;
      if (!mouse.attackHit && mouse.stateTime >= (zombie ? 0.95 : 0.27)) {
        mouse.attackHit = true;
        if (Math.abs(player.x - mouse.x) < (zombie ? 70 : 53) && Math.abs(player.y - mouse.y) < 55 && (player.x - mouse.x) * mouse.facing >= -8) damagePlayer(mouse);
      }
      if (mouse.stateTime >= (zombie ? 1.65 : 0.68)) setState(mouse, "idle");
      moveMouse(mouse, dt);
      return;
    }

    const dx = player.x - mouse.x;
    const dy = player.y - mouse.y;
    const distance = Math.hypot(dx, dy);
    if (!mouse.alerted && player.state !== "dead" && distance <= MOUSE_DETECTION_RADIUS) {
      mouse.alerted = true;
    }

    if (player.state !== "dead" && distance < (zombie ? 65 : 48) && Math.abs(player.y - mouse.y) < 58) {
      faceMouseToward(mouse, dx);
      mouse.attackHit = false;
      setState(mouse, "attack");
    } else if (player.state !== "dead" && mouse.alerted) {
      const targetPlatform = platformSupporting(player);
      const currentPlatform = platformSupporting(mouse);
      const targetClimbIndex = climbPlatforms.indexOf(targetPlatform);
      const currentClimbIndex = climbPlatforms.indexOf(currentPlatform);
      let navigationPlatform = targetPlatform;

      if (targetClimbIndex >= 0 && targetPlatform.y < mouse.y - 115) {
        if (!currentPlatform) navigationPlatform = climbPlatforms[0];
        else if (currentClimbIndex >= 0 && currentClimbIndex < targetClimbIndex) {
          navigationPlatform = climbPlatforms[currentClimbIndex + 1];
        } else if (currentClimbIndex < 0) {
          navigationPlatform = null;
        }
      }

      let pursuitX = navigationPlatform
        ? Math.max(navigationPlatform.x + 18, Math.min(navigationPlatform.x + navigationPlatform.w - 18, player.x))
        : player.x;

      if (!navigationPlatform && currentPlatform && targetClimbIndex >= 0) {
        pursuitX = climbPlatforms[0].x > mouse.x
          ? currentPlatform.x + currentPlatform.w + 18
          : currentPlatform.x - 18;
      }

      if (
        currentPlatform
        && player.y > mouse.y + 30
        && player.x > currentPlatform.x
        && player.x < currentPlatform.x + currentPlatform.w
      ) {
        const leftEdge = currentPlatform.x - 18;
        const rightEdge = currentPlatform.x + currentPlatform.w + 18;
        pursuitX = mouse.x - leftEdge < rightEdge - mouse.x ? leftEdge : rightEdge;
      }
      const pursuitDx = pursuitX - mouse.x;

      faceMouseToward(mouse, pursuitDx);
      mouse.vx = Math.abs(pursuitDx) > 5 ? Math.sign(pursuitDx) * (zombie && mouse.grounded ? 32 : 66) : 0;

      const targetIsAbove = navigationPlatform && navigationPlatform.y < mouse.y - 30;
      const nearTargetPlatform = navigationPlatform
        && mouse.x >= navigationPlatform.x - 60
        && mouse.x <= navigationPlatform.x + navigationPlatform.w + 60;
      const nearAirborneTarget = !targetPlatform && Math.abs(dx) < 115;

      if (mouse.grounded && mouse.jumpCooldown <= 0 && targetIsAbove && (nearTargetPlatform || nearAirborneTarget)) {
        mouse.vy = -MOUSE_JUMP_SPEED;
        mouse.grounded = false;
        mouse.jumpCooldown = 0.78;
        if (Math.abs(pursuitDx) > 5) mouse.vx = Math.sign(pursuitDx) * 90;
        burst(mouse.x, mouse.y - 1, "#694431", 4);
      }
      setState(mouse, "run");
    } else {
      if (mouse.x < mouse.patrolMin) mouse.patrolDir = 1;
      if (mouse.x > mouse.patrolMax) mouse.patrolDir = -1;
      mouse.facing = mouse.patrolDir;
      mouse.vx = mouse.patrolDir * (zombie ? 16 : 31);
      setState(mouse, "run");
    }
    moveMouse(mouse, dt);
  }

  function faceMouseToward(mouse, dx) {
    if (Math.abs(dx) > 5) mouse.facing = Math.sign(dx);
  }

  function platformSupporting(entity) {
    if (!entity.grounded) return null;
    return platforms.find(platform => (
      Math.abs(entity.y - platform.y) < 3
      && entity.x >= platform.x - 14
      && entity.x <= platform.x + platform.w + 14
    ));
  }

  function moveMouse(mouse, dt) {
    const previousY = mouse.y;
    if (!mouse.grounded) mouse.vy += MOUSE_GRAVITY * dt;
    mouse.x += mouse.vx * dt;
    mouse.y += mouse.vy * dt;
    mouse.x = Math.max(28, Math.min(WORLD_W - 28, mouse.x));

    let landed = false;
    if (mouse.vy >= 0) {
      for (const platform of platforms) {
        const overlaps = mouse.x + 12 > platform.x && mouse.x - 12 < platform.x + platform.w;
        if (overlaps && previousY <= platform.y && mouse.y >= platform.y) {
          mouse.y = platform.y;
          landed = true;
          break;
        }
      }
      if (!landed && previousY <= GROUND_Y && mouse.y >= GROUND_Y) {
        mouse.y = GROUND_Y;
        landed = true;
      }
    }

    if (landed) {
      mouse.vy = 0;
      mouse.grounded = true;
    } else if (mouse.y < GROUND_Y) {
      mouse.grounded = false;
    }
  }

  function fireSorcererProjectile(sorcerer) {
    projectiles.push({
      x: sorcerer.x + sorcerer.facing * 34,
      y: sorcerer.y - 42,
      vx: sorcerer.facing * PROJECTILE_SPEED,
      facing: sorcerer.facing,
      life: 12,
      phase: Math.random() * Math.PI * 2
    });
    sound("beam");
  }

  function updateSorcerer(sorcerer, dt) {
    sorcerer.stateTime += dt;
    sorcerer.castCooldown = Math.max(0, sorcerer.castCooldown - dt);
    if (sorcerer.state === "dead") return;

    if (sorcerer.state === "teleport") {
      if (!sorcerer.teleported && sorcerer.stateTime >= 0.18) {
        burst(sorcerer.x, sorcerer.y - 36, "#6550ff", 18);
        sorcerer.x = sorcerer.teleportTarget.x;
        sorcerer.y = sorcerer.teleportTarget.y;
        sorcerer.teleported = true;
        burst(sorcerer.x, sorcerer.y - 36, "#42d9ff", 18);
      }
      if (sorcerer.stateTime >= 0.52) {
        sorcerer.castCooldown = 0.9;
        setState(sorcerer, "idle");
      }
      return;
    }

    if (sorcerer.state === "cast") {
      if (!sorcerer.shotFired && sorcerer.stateTime >= 0.42) {
        sorcerer.shotFired = true;
        fireSorcererProjectile(sorcerer);
      }
      if (sorcerer.stateTime >= 0.86) {
        sorcerer.castCooldown = 1.65;
        setState(sorcerer, "idle");
      }
      return;
    }

    const dx = player.x - sorcerer.x;
    const onSameLevel = Math.abs(player.y - sorcerer.y) <= SORCERER_LEVEL_TOLERANCE;
    if (player.state !== "dead" && onSameLevel) {
      if (Math.abs(dx) > 4) sorcerer.facing = Math.sign(dx);
      if (sorcerer.castCooldown <= 0) {
        sorcerer.shotFired = false;
        setState(sorcerer, "cast");
      }
    }
  }

  function projectileHitsTerrain(projectile) {
    if (projectile.x < 0 || projectile.x > WORLD_W || projectile.y >= GROUND_TILE_Y) return true;
    return platforms.some(platform => (
      projectile.x >= platform.x
      && projectile.x <= platform.x + platform.w
      && projectile.y >= platform.drawY
      && projectile.y <= platform.drawY + 58
    ));
  }

  function updateProjectiles(dt) {
    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = projectiles[index];
      projectile.life -= dt;
      projectile.x += projectile.vx * dt;
      projectile.phase += dt * 9;

      if (projectileHitsTerrain(projectile) || projectile.life <= 0) {
        burst(projectile.x, projectile.y, "#278cff", 6);
        projectiles.splice(index, 1);
        continue;
      }

      const hitsPlayer = Math.abs(projectile.x - player.x) < 20
        && projectile.y > player.y - 78
        && projectile.y < player.y - 8;
      if (hitsPlayer) {
        damagePlayer(projectile);
        burst(projectile.x, projectile.y, "#4adfff", 10);
        projectiles.splice(index, 1);
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.life -= dt;
      particle.vy += 420 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      if (particle.life <= 0) particles.splice(i, 1);
    }
  }

  function update(dt) {
    worldTime += dt;
    if (wasPressed("KeyR")) resetGame();
    if (mode !== "playing") return;

    if (hitStop > 0) {
      hitStop -= dt;
      updateParticles(dt * 0.25);
      return;
    }

    updatePlayer(dt);
    for (const mouse of mice) updateMouse(mouse, dt);
    for (const sorcerer of sorcerers) updateSorcerer(sorcerer, dt);
    updateProjectiles(dt);
    updateParticles(dt);

    const cameraTargetX = Math.max(0, Math.min(WORLD_W - W, player.x - W * 0.42));
    const cameraTargetY = Math.max(0, Math.min(WORLD_H - H, player.y - H * 0.58));
    cameraX += (cameraTargetX - cameraX) * Math.min(1, dt * 7);
    cameraY += (cameraTargetY - cameraY) * Math.min(1, dt * 7);

    if (endTimer > 0) {
      endTimer -= dt;
      if (endTimer <= 0) {
        if (allEnemiesDefeated()) {
          sound("victory");
          beginVictoryCinematic();
        } else if (player.state === "dead") {
          showEnd(false);
        }
      }
    }
  }

  function drawFrame(image, frame, frameW, frameH, x, y, flip = false, row = 0, drawW = frameW, drawH = frameH) {
    const sx = frame * frameW;
    const sy = row * frameH;
    ctx.save();
    if (flip) {
      ctx.translate(Math.round(x + drawW), Math.round(y));
      ctx.scale(-1, 1);
      ctx.drawImage(image, sx, sy, frameW, frameH, 0, 0, drawW, drawH);
    } else {
      ctx.drawImage(image, sx, sy, frameW, frameH, Math.round(x), Math.round(y), drawW, drawH);
    }
    ctx.restore();
  }

  function drawTile(index, x, y) {
    const sx = (index % 4) * 64;
    const sy = Math.floor(index / 4) * 64;
    ctx.drawImage(images.tiles, sx, sy, 64, 64, x, y, 64, 64);
  }

  function drawArena() {
    // One continuous palace, from floor to vaults, rather than stacked rooms.
    ctx.drawImage(images.background, 0, 0, WORLD_W, WORLD_H);
    for (let x = 0; x < WORLD_W; x += 64) {
      const index = x === 0 ? 0 : x >= WORLD_W - 64 ? 2 : 1;
      drawTile(index, x, GROUND_TILE_Y);
    }
    for (const platform of platforms) drawPlatform(platform);
  }

  function drawPlatform(platform) {
    const tileCount = Math.ceil(platform.w / 64);
    for (let i = 0; i < tileCount; i += 1) {
      const index = i === 0 ? 4 : i === tileCount - 1 ? 6 : 5;
      drawTile(index, platform.x + i * 64, platform.drawY);
    }
  }

  function drawPlayer() {
    const flash = player.invuln > 0 && Math.floor(player.invuln * 18) % 2 === 0;
    if (flash) ctx.globalAlpha = 0.48;
    const flip = player.facing > 0;

    if (player.state === "dead") {
      const f = Math.min(7, Math.floor(player.stateTime / 0.115));
      drawFrame(images.catDamage, f % 4, 128, 96, player.x - 64, player.y - 96, flip, 1 + Math.floor(f / 4));
    } else if (player.state === "hurt") {
      const f = Math.min(3, Math.floor(player.stateTime / 0.095));
      drawFrame(images.catDamage, f, 128, 96, player.x - 64, player.y - 96, flip);
    } else if (player.state === "attack") {
      const f = Math.min(5, Math.floor(player.stateTime / 0.072));
      drawFrame(images.catAttack, f, 128, 80, player.x - 64, player.y - 80, flip);
      const slashFlip = player.facing < 0;
      drawFrame(images.catFx, f, 128, 96, player.x - 64 + player.facing * 43, player.y - 91, slashFlip);
    } else if (player.state === "ranged") {
      const f = Math.min(5, Math.floor(player.stateTime / 0.083));
      drawFrame(images.catRanged, f, 128, 80, player.x - 64, player.y - 80, flip);
      drawFrame(images.catFx, f, 128, 96, player.x - 64 + player.facing * 73, player.y - 92, flip, 1);
    } else if (player.state === "air") {
      const f = player.vy < -230 ? 1 : player.vy < -40 ? 2 : player.vy < 170 ? 4 : 6;
      drawFrame(images.catAir, f, 96, 96, player.x - 48, player.y - 96, flip);
    } else if (player.state === "run") {
      // Four deliberately distinct poses: contact, passing, opposite contact,
      // passing. The slower cadence keeps the heavy armored stride readable.
      const f = Math.floor(worldTime * 9) % 4;
      drawFrame(images.catRun, f, 96, 80, player.x - 48, player.y - 80, flip);
    } else {
      const f = Math.floor(worldTime * 6) % 6;
      drawFrame(images.catIdle, f, 96, 80, player.x - 48, player.y - 80, flip);
    }
    ctx.globalAlpha = 1;
  }

  function drawMouse(mouse) {
    if (mouse.type === "zombie") {
      let row = 0, frame = Math.floor(worldTime * 3) % 4;
      if (mouse.state === "run") row = 1;
      if (mouse.state === "attack") {
        row = 2;
        frame = mouse.stateTime < 0.4 ? 0 : mouse.stateTime < 0.8 ? 1 : mouse.stateTime < 0.95 ? 2 : 3;
      }
      if (mouse.state === "hurt") { row = 3; frame = 0; }
      if (mouse.state === "dead") { row = 3; frame = Math.min(3, Math.floor(mouse.stateTime / 0.22)); }
      drawZombieFrame(mouse, row, frame);
      return;
    }
    const flip = mouse.facing > 0;
    if (mouse.state === "dead") {
      const f = Math.min(7, Math.floor(mouse.stateTime / 0.105));
      drawFrame(images.mouseDeath, f, 104, 64, mouse.x - 52, mouse.y - 64, flip);
    } else if (mouse.state === "hurt") {
      const f = Math.min(3, Math.floor(mouse.stateTime / 0.085));
      drawFrame(images.mouseHurt, f, 88, 64, mouse.x - 44, mouse.y - 64, flip);
    } else if (mouse.state === "attack") {
      const f = Math.min(5, Math.floor(mouse.stateTime / 0.11));
      drawFrame(images.mouseAttack, f, 96, 64, mouse.x - 48, mouse.y - 64, flip);
    } else if (mouse.state === "run") {
      const f = Math.floor((worldTime + mouse.animOffset) * 10) % 8;
      drawFrame(images.mouseRun, f, 80, 64, mouse.x - 40, mouse.y - 64, flip);
    } else {
      const f = Math.floor((worldTime + mouse.animOffset) * 5) % 4;
      drawFrame(images.mouseIdle, f, 64, 64, mouse.x - 32, mouse.y - 64, flip);
    }
  }

  // The source sheet has uneven row spacing: a regular 4x4 cut includes
  // transparent padding below the walking feet (and part of the next sword).
  // Source baselines anchor visible feet to the same y used by collision physics.
  const zombieRows = [
    { y: 0, h: 310, feet: [296, 295, 295, 296], edges: [0, 310, 610, 914, 1246] },
    { y: 310, h: 300, feet: [279, 279, 279, 279], edges: [0, 310, 634, 928, 1246] },
    { y: 610, h: 340, feet: [328, 328, 329, 330] },
    { y: 950, h: 312, feet: [272, 270, 284, 286] }
  ];

  function drawZombieFrame(mouse, row, frame) {
    const source = zombieRows[row];
    const fw = images.zombie.width / 4;
    const sx = source.edges ? source.edges[frame] : frame * fw;
    const sw = source.edges ? source.edges[frame + 1] - sx : fw;
    const scaleY = 104 / (images.zombie.height / 4);
    ctx.save();
    ctx.translate(Math.round(mouse.x), Math.round(mouse.y));
    if (mouse.facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(images.zombie, sx, source.y, sw, source.h,
      -56 + (sx - frame * fw) * 112 / fw, -source.feet[frame] * scaleY,
      sw * 112 / fw, source.h * scaleY);
    ctx.restore();
  }

  function drawSorcerer(sorcerer) {
    const flip = sorcerer.facing < 0;
    let row = 0;
    let frame = Math.floor((worldTime + sorcerer.animOffset) * 4) % 4;

    if (sorcerer.state === "cast") {
      row = 1;
      frame = Math.min(3, Math.floor(sorcerer.stateTime / 0.19));
    } else if (sorcerer.state === "teleport") {
      row = sorcerer.stateTime < 0.12 ? 2 : 3;
      frame = Math.min(3, Math.floor(sorcerer.stateTime / 0.13));
    } else if (sorcerer.state === "dead") {
      row = 3;
      frame = Math.min(3, Math.floor(sorcerer.stateTime / 0.12));
      ctx.globalAlpha = Math.max(0, 1 - sorcerer.stateTime * 1.5);
    }

    drawFrame(images.sorcerer, frame, 128, 128, sorcerer.x - 48, sorcerer.y - 96, flip, row, 96, 96);
    ctx.globalAlpha = 1;
  }

  function drawProjectiles() {
    for (const projectile of projectiles) {
      const pulse = Math.sin(projectile.phase) > 0 ? 1 : 0;
      const trailDirection = projectile.facing > 0 ? -1 : 1;
      ctx.fillStyle = "#1748d5";
      ctx.fillRect(Math.round(projectile.x - 6), Math.round(projectile.y - 5), 12, 10);
      ctx.fillStyle = "#31bfff";
      ctx.fillRect(Math.round(projectile.x - 4), Math.round(projectile.y - 3), 8, 6);
      ctx.fillStyle = "#d4fbff";
      ctx.fillRect(Math.round(projectile.x - 1), Math.round(projectile.y - 2), 3, 3);
      ctx.fillStyle = pulse ? "#6a55ff" : "#248cff";
      ctx.fillRect(Math.round(projectile.x + trailDirection * 10), Math.round(projectile.y - 2), 4, 4);
      ctx.fillRect(Math.round(projectile.x + trailDirection * 16), Math.round(projectile.y), 3, 3);
    }
  }

  function drawParticles() {
    for (const particle of particles) {
      ctx.globalAlpha = Math.min(1, particle.life * 4);
      ctx.fillStyle = particle.color;
      ctx.fillRect(Math.round(particle.x), Math.round(particle.y), particle.size, particle.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawEnemyPointer() {
    if (mode !== "playing") return;
    const enemies = allEnemies().filter(enemy => enemy.state !== "dead");
    if (!enemies.length) return;
    const nearest = enemies.reduce((a, b) =>
      Math.hypot(a.x - player.x, a.y - player.y) < Math.hypot(b.x - player.x, b.y - player.y) ? a : b);
    const sx = nearest.x - cameraX, sy = nearest.y - 40 - cameraY;
    if (sx >= 0 && sx <= W && sy >= 0 && sy <= H) return;
    const dx = sx - W / 2, dy = sy - H / 2;
    const scale = Math.min((W / 2 - 24) / Math.abs(dx || 0.001), (H / 2 - 72) / Math.abs(dy || 0.001));
    ctx.save();
    ctx.translate(W / 2 + dx * scale, H / 2 + dy * scale);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.beginPath();
    ctx.moveTo(12, 0); ctx.lineTo(-7, -8); ctx.lineTo(-3, 0); ctx.lineTo(-7, 8); ctx.closePath();
    ctx.fillStyle = "#ffda65"; ctx.strokeStyle = "#241008"; ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawHud() {
    ctx.fillStyle = "#080606d9";
    ctx.fillRect(8, 8, 198, 54);
    ctx.strokeStyle = "#9f6b24";
    ctx.strokeRect(8.5, 8.5, 198, 54);
    ctx.drawImage(images.portrait, 11, 11, 48, 48);

    ctx.fillStyle = "#d6a642";
    ctx.font = "bold 9px monospace";
    ctx.fillText("ИМПЕРСКАЯ ВОЛЯ", 67, 21);
    for (let i = 0; i < player.maxHealth; i += 1) {
      ctx.fillStyle = i < player.health ? "#c63c24" : "#291616";
      ctx.fillRect(67 + i * 25, 29, 20, 12);
      ctx.fillStyle = i < player.health ? "#f37a36" : "#422222";
      ctx.fillRect(69 + i * 25, 31, 16, 3);
    }
    ctx.fillStyle = player.beamCooldown <= 0 ? "#ffd95e" : "#5e4824";
    ctx.fillRect(67, 47, Math.round(125 * (1 - player.beamCooldown / 1.05)), 5);

    const livingEnemies = allEnemies().filter(enemy => enemy.state !== "dead");
    if (livingEnemies.length) {
      const nearestEnemy = livingEnemies.reduce((nearest, enemy) => (
        Math.hypot(enemy.x - player.x, enemy.y - player.y) < Math.hypot(nearest.x - player.x, nearest.y - player.y) ? enemy : nearest
      ));
      ctx.fillStyle = "#080606d9";
      ctx.fillRect(440, 10, 192, 34);
      ctx.strokeStyle = "#70251f";
      ctx.strokeRect(440.5, 10.5, 191, 33);
      ctx.fillStyle = "#cf9b70";
      ctx.textAlign = "right";
      ctx.fillText(`ВРАГИ: ${livingEnemies.length}/${allEnemies().length}`, 624, 21);
      ctx.fillStyle = "#291416";
      ctx.fillRect(452, 27, 172, 8);
      ctx.fillStyle = nearestEnemy.type === "sorcerer" ? "#286bd7" : "#9d2631";
      ctx.fillRect(452, 27, Math.round(172 * nearestEnemy.health / nearestEnemy.maxHealth), 8);
      ctx.textAlign = "left";
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (!images.background) {
      ctx.fillStyle = "#080606";
      ctx.fillRect(0, 0, W, H);
      return;
    }
    ctx.save();
    ctx.translate(-Math.round(cameraX), -Math.round(cameraY));
    drawArena();
    for (const mouse of mice) drawMouse(mouse);
    for (const sorcerer of sorcerers) drawSorcerer(sorcerer);
    drawProjectiles();
    drawPlayer();
    drawParticles();
    ctx.restore();
    drawHud();
    drawEnemyPointer();
  }

  function loop(now) {
    const dt = Math.min(1 / 30, (now - lastTime) / 1000 || 0);
    lastTime = now;
    update(dt);
    draw();
    pressed.clear();
    requestAnimationFrame(loop);
  }

  window.addEventListener("keydown", event => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(event.code)) event.preventDefault();
    if (!event.repeat) pressed.add(event.code);
    keys.add(event.code);
    ensureAudio();
    if (!event.repeat && event.code === "Escape" && mode === "cinematic") finishVictoryCinematic();
    if (!event.repeat && event.code === "KeyF") toggleFullscreen();
    if (!event.repeat && event.code === "KeyM") toggleMusic();
  });

  window.addEventListener("keyup", event => keys.delete(event.code));
  window.addEventListener("blur", () => keys.clear());

  startButton.addEventListener("click", () => {
    ensureAudio();
    resetGame();
  });

  fullscreenButton.addEventListener("click", toggleFullscreen);
  musicButton.addEventListener("click", toggleMusic);
  cinematicSkipButton.addEventListener("click", finishVictoryCinematic);
  cinematicPlayButton.addEventListener("click", () => {
    ensureAudio();
    victoryVideo.play().then(() => {
      cinematicPlayButton.hidden = true;
    }).catch(() => {
      cinematicPlayButton.hidden = false;
    });
  });
  victoryVideo.addEventListener("ended", finishVictoryCinematic);
  victoryVideo.addEventListener("error", finishVictoryCinematic);
  musicButton.setAttribute("aria-pressed", "true");

  document.addEventListener("fullscreenchange", () => {
    const active = Boolean(document.fullscreenElement);
    fullscreenButton.textContent = active ? "×" : "⛶";
    fullscreenButton.setAttribute("aria-label", active ? "Выйти из полноэкранного режима" : "Перейти в полноэкранный режим");
    resizeGameSurface();
  });

  window.addEventListener("resize", resizeGameSurface);

  resizeGameSurface();
  loadAssets();
  requestAnimationFrame(loop);
})();
