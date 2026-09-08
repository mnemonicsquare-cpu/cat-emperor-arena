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
  const pauseButton = document.querySelector("#pause-button");
  const touchToggle = document.querySelector("#touch-toggle");
  const touchControls = document.querySelector("#touch-controls");
  const touchHud = document.querySelector("#touch-hud");
  const touchHealth = document.querySelector("#touch-health");
  const touchEnemies = document.querySelector("#touch-enemies");
  const touchBeam = document.querySelector("#touch-beam");
  const touchButtons = [...document.querySelectorAll(".touch-button")];
  const input = new window.ArenaInput();
  let touchEnabled = (navigator.maxTouchPoints || 0) > 0 || window.matchMedia("(any-pointer: coarse)").matches;
  let immersive = false;
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
  const PROJECTILE_SPEED = 105;
  const PROJECTILE_HALF_W = 3;
  const PROJECTILE_HALF_H = 2;
  const ZOMBIE_REGEN_SECONDS = 12;
  const TELEPORT_VANISH_TIME = 0.55;
  const TELEPORT_DURATION = 1.25;

  canvas.width = W * RENDER_SCALE;
  canvas.height = H * RENDER_SCALE;
  ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
  ctx.imageSmoothingEnabled = false;

  function resizeGameSurface() {
    const viewport = window.visualViewport;
    const width = viewport?.width || window.innerWidth;
    const height = viewport?.height || window.innerHeight;
    document.documentElement.style.setProperty("--viewport-height", `${height}px`);
    const style = getComputedStyle(document.fullscreenElement || immersive ? gameShell : document.body);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const gap = parseFloat(getComputedStyle(gameShell).gap) || 0;
    const extras = [...gameShell.children].filter(child => child !== gameFrame && child.getBoundingClientRect().height > 0);
    const chrome = extras.reduce((sum, child) => sum + child.getBoundingClientRect().height, 0) + gap * extras.length;
    const displayWidth = window.fitArena(width, height, padX, padY, chrome, touchEnabled);
    gameShell.style.setProperty("--arena-width", `${displayWidth}px`);
  }
  const keys = input.keys;
  const pressed = input.pressed;
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
    catFx: "assets/sprites/cat_emperor_fx.png",
    catDetailed: "assets/sprites/cat_clean.webp",
    mouseDetailed: "assets/sprites/mouse_clean.webp",
    sorcererDetailed: "assets/sprites/sorcerer_clean.webp",
    zombieDetailed: "assets/sprites/zombie_clean.webp"
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
    attackHit: false, beamHit: false, beamCooldown: 0, strideDistance: 0
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
      type: spawn.type || "cultist", damage: spawn.type === "zombie" ? 2 : 1, regenTime: 0, regenPulse: 0,
      x: spawn.x, y: spawn.y ?? GROUND_Y, vx: 0, vy: 0,
      facing: -1, grounded: true, state: "idle", stateTime: index * 0.08,
      health: spawn.type === "zombie" ? 8 : 4, maxHealth: spawn.type === "zombie" ? 8 : 4, attackHit: false,
      patrolDir: index % 2 ? 1 : -1, alerted: false, jumpCooldown: 0, dropPlan: null,
      patrolMin: spawn.patrolMin, patrolMax: spawn.patrolMax,
      animOffset: index * 0.13, strideDistance: 0
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
      shotFired: false, teleported: false, teleportTarget: null, teleportOrigin: null,
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
    clearInput();
    victoryVideo.pause();
    victoryVideo.currentTime = 0;
    victoryCinematic.hidden = true;
    cinematicPlayButton.hidden = true;
    Object.assign(player, {
      x: 112, y: GROUND_Y, vx: 0, vy: 0, facing: 1, grounded: true,
      state: "idle", stateTime: 0, health: 5, invuln: 0,
      coyote: 0.08, jumpBuffer: 0, attackHit: false,
      beamHit: false, beamCooldown: 0, strideDistance: 0
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
    pauseButton.disabled = false;
    pauseButton.setAttribute("aria-label", "Пауза");
    overlay.hidden = true;
    setMusicLevel();
    prepareVictoryVideo().catch(() => {});
  }

  function showEnd(victory) {
    mode = victory ? "victory" : "defeat";
    clearInput();
    pauseButton.disabled = true;
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
    clearInput();
    pauseButton.disabled = true;
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
    clearInput();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (immersive) setImmersive(false);
      else if (gameShell.requestFullscreen && document.fullscreenEnabled) await gameShell.requestFullscreen();
      else setImmersive(true);
    } catch (_error) {
      // iPhone/browser fallback: expand within the page without promising to
      // hide system browser chrome or requiring an unsupported orientation lock.
      setImmersive(true);
    }
    syncFullscreenButton();
  }

  function setImmersive(active) {
    immersive = active;
    gameShell.classList.toggle("immersive", active);
    document.body.classList.toggle("immersive-active", active);
    resizeGameSurface();
  }

  function syncFullscreenButton() {
    const active = Boolean(document.fullscreenElement) || immersive;
    fullscreenButton.textContent = active ? "×" : "⛶";
    fullscreenButton.setAttribute("aria-label", active ? "Свернуть игру" : "Развернуть игру");
    resizeGameSurface();
  }

  function syncTouchButtons() {
    for (const button of touchButtons) button.classList.toggle("is-held", input.isDown(button.dataset.code));
  }

  function clearInput() {
    input.clear();
    syncTouchButtons();
  }

  function setTouchEnabled(active) {
    clearInput();
    touchEnabled = active;
    touchControls.hidden = !active;
    gameShell.classList.toggle("touch-enabled", active);
    touchToggle.setAttribute("aria-pressed", String(active));
    resizeGameSurface();
  }

  function pauseGame() {
    clearInput();
    if (mode === "cinematic") {
      victoryVideo.pause();
      cinematicPlayButton.hidden = false;
      return;
    }
    if (mode !== "playing") return;
    mode = "paused";
    overlay.hidden = false;
    title.textContent = "ПАУЗА";
    status.textContent = "Бой продолжится с того же места.";
    startButton.textContent = "ПРОДОЛЖИТЬ";
    startButton.disabled = false;
    pauseButton.setAttribute("aria-label", "Продолжить бой");
    setMusicLevel();
  }

  function resumeGame() {
    if (mode !== "paused") return;
    clearInput();
    mode = "playing";
    overlay.hidden = true;
    lastTime = performance.now();
    pauseButton.setAttribute("aria-label", "Пауза");
    setMusicLevel();
  }

  function togglePause() {
    ensureAudio();
    if (mode === "paused") resumeGame();
    else pauseGame();
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
    return codes.some(code => input.isDown(code));
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
    const zombie = mouse.type === "zombie";
    if (mouse.state === "dead" || (!zombie && mouse.state === "hurt")) return;
    mouse.alerted = true;
    mouse.health = Math.max(0, mouse.health - amount);
    burst(mouse.x, mouse.y - 35, "#ffb52e", 9);
    sound("hit");
    // Living zombies take damage without knockback, stagger, resetting the
    // machete timer, or even a global hit-stop that could delay their swing.
    if (zombie && mouse.health > 0) return;
    mouse.vx = player.facing * 145;
    hitStop = 0.055;
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
    const left = Math.max(48, cameraX + 56);
    const right = Math.min(WORLD_W - 48, cameraX + W - 56);
    for (const platform of platforms) {
      const start = Math.max(left, platform.x + 28);
      const end = Math.min(right, platform.x + platform.w - 28);
      for (let x = start; x <= end; x += 16) {
        surfaces.push({ x, y: platform.y });
      }
      if (start <= end) surfaces.push({ x: end, y: platform.y });
    }
    const candidates = surfaces.filter(point => validTeleportTarget(sorcerer, point));
    if (!candidates.length) return null;
    // Give every visible free platform a chance, not only distant locations.
    const levels = [...new Set(candidates.map(point => point.y))];
    const level = levels[Math.floor(Math.random() * levels.length)];
    const points = candidates.filter(point => point.y === level);
    return points[Math.floor(Math.random() * points.length)];
  }

  function validTeleportTarget(sorcerer, point) {
    if (!point) return false;
    // Fit the entire character, not only its centre, into the live viewport.
    const visible = point.x - 48 >= cameraX + 8 && point.x + 48 <= cameraX + W - 8
      && point.y - 104 >= cameraY + 8 && point.y <= cameraY + H - 12;
    const supported = platforms.some(platform => (
      point.y === platform.y && point.x >= platform.x + 28 && point.x <= platform.x + platform.w - 28
    ));
    const clearHeadroom = !platforms.some(platform => (
      platform.y !== point.y && point.x + 22 > platform.x && point.x - 22 < platform.x + platform.w
      && platform.y + 10 > point.y - 82 && platform.y < point.y - 2
    ));
    const overlaps = entity => Math.abs(point.x - entity.x) < 36 && Math.abs(point.y - entity.y) < 72;
    const unoccupied = !overlaps(player) && allEnemies().every(enemy => enemy === sorcerer || enemy.state === "dead" || !overlaps(enemy));
    const moved = Math.hypot(point.x - sorcerer.x, point.y - sorcerer.y) >= 8;
    return visible && supported && clearHeadroom && moved && unoccupied;
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
    if (!sorcerer.teleportTarget) return; // No escape: no teleport animation.
    sorcerer.teleportOrigin = { x: sorcerer.x, y: sorcerer.y };
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
    const previousX = player.x;
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
    if (player.grounded && player.state === "run") player.strideDistance += Math.abs(player.x - previousX);
  }

  function updateMouse(mouse, dt) {
    const zombie = mouse.type === "zombie";
    mouse.regenPulse = Math.max(0, mouse.regenPulse - dt);
    if (zombie && mouse.state !== "dead" && mouse.health < mouse.maxHealth) {
      mouse.regenTime += dt;
      if (mouse.regenTime >= ZOMBIE_REGEN_SECONDS) {
        mouse.health = Math.min(mouse.maxHealth, mouse.health + 1);
        mouse.regenTime = 0;
        mouse.regenPulse = 1.4;
        burst(mouse.x, mouse.y - 40, "#b4ee68", 16);
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
        mouse.dropPlan ||= { y: currentPlatform.y, direction: Math.sign(pursuitX - mouse.x) };
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
        mouse.dropPlan ||= { y: currentPlatform.y, direction: Math.sign(pursuitX - mouse.x) };
      }
      // Commit to stepping off until the feet have actually fallen below the
      // shelf. Re-routing on the first unsupported frame used to step back onto
      // it, alternating left/right every frame and preventing gravity from acting.
      if (mouse.dropPlan && (mouse.y > mouse.dropPlan.y + 24 || mouse.y < mouse.dropPlan.y - 3)) mouse.dropPlan = null;
      if (mouse.dropPlan) pursuitX = mouse.x + mouse.dropPlan.direction * 40;
      const pursuitDx = pursuitX - mouse.x;

      faceMouseToward(mouse, pursuitDx);
      mouse.vx = Math.abs(pursuitDx) > 5 ? Math.sign(pursuitDx) * (zombie && mouse.grounded ? 32 : 66) : 0;

      const targetIsAbove = navigationPlatform && navigationPlatform.y < mouse.y - 30;
      const nearTargetPlatform = navigationPlatform
        && mouse.x >= navigationPlatform.x - 60
        && mouse.x <= navigationPlatform.x + navigationPlatform.w + 60;
      const nearAirborneTarget = !targetPlatform && Math.abs(dx) < 115;

      if (!mouse.dropPlan && mouse.grounded && mouse.jumpCooldown <= 0 && targetIsAbove && (nearTargetPlatform || nearAirborneTarget)) {
        mouse.vy = -MOUSE_JUMP_SPEED;
        mouse.grounded = false;
        mouse.jumpCooldown = 0.78;
        if (Math.abs(pursuitDx) > 5) mouse.vx = Math.sign(pursuitDx) * 90;
        burst(mouse.x, mouse.y - 1, "#694431", 4);
      }
      setState(mouse, Math.abs(mouse.vx) > 1 ? "run" : "idle");
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
    const halfWidth = entity === player ? 14 : 12;
    return platforms.find(platform => (
      Math.abs(entity.y - platform.y) < 3
      && entity.x + halfWidth > platform.x
      && entity.x - halfWidth < platform.x + platform.w
    ));
  }

  function moveMouse(mouse, dt) {
    const previousY = mouse.y;
    const previousX = mouse.x;
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
    if (mouse.grounded && mouse.state === "run") mouse.strideDistance += Math.abs(mouse.x - previousX);
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
      if (!sorcerer.teleported && sorcerer.stateTime >= TELEPORT_VANISH_TIME) {
        // The camera/player may have moved during the windup. Never use a
        // stale target outside the current view or newly occupied surface.
        if (!validTeleportTarget(sorcerer, sorcerer.teleportTarget)) {
          sorcerer.teleportTarget = chooseTeleportTarget(sorcerer);
        }
        if (sorcerer.teleportTarget) {
          sorcerer.x = sorcerer.teleportTarget.x;
          sorcerer.y = sorcerer.teleportTarget.y;
        }
        sorcerer.teleported = true;
      }
      if (sorcerer.stateTime >= TELEPORT_DURATION) {
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
    const left = Math.min(projectile.previousX ?? projectile.x, projectile.x) - PROJECTILE_HALF_W;
    const right = Math.max(projectile.previousX ?? projectile.x, projectile.x) + PROJECTILE_HALF_W;
    if (right < 0 || left > WORLD_W || projectile.y + PROJECTILE_HALF_H >= GROUND_Y) return true;
    // Only the solid shelf blocks a shot. The old 58px box included transparent
    // space below the platform. Decorative supports are not an invisible wall.
    return platforms.some(platform => (
      right >= platform.x && left <= platform.x + platform.w
      && projectile.y + PROJECTILE_HALF_H >= platform.y - 1
      && projectile.y - PROJECTILE_HALF_H <= platform.y + 10
    ));
  }

  function updateProjectiles(dt) {
    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = projectiles[index];
      projectile.life -= dt;
      projectile.previousX = projectile.x;
      projectile.x += projectile.vx * dt;
      projectile.phase += dt * 9;

      if (projectileHitsTerrain(projectile) || projectile.life <= 0) {
        burst(projectile.x, projectile.y, "#278cff", 6);
        projectiles.splice(index, 1);
        continue;
      }

      const hitsPlayer = Math.max(projectile.x, projectile.previousX) + PROJECTILE_HALF_W > player.x - 12
        && Math.min(projectile.x, projectile.previousX) - PROJECTILE_HALF_W < player.x + 12
        && projectile.y + PROJECTILE_HALF_H > player.y - 68
        && projectile.y - PROJECTILE_HALF_H < player.y - 12;
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
    if (wasPressed("KeyR") && mode !== "loading") resetGame();
    if (mode !== "playing") return;
    worldTime += dt;

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
    let row = 0, frame = Math.floor(worldTime * 4) % 4;
    if (player.state === "dead") {
      row = 5; frame = Math.min(3, 1 + Math.floor(player.stateTime / 0.25));
    } else if (player.state === "hurt") {
      row = 5; frame = 0;
    } else if (player.state === "attack") {
      row = 3; frame = player.stateTime < 0.07 ? 0 : player.stateTime < 0.14 ? 1 : player.stateTime < 0.3 ? 2 : 3;
    } else if (player.state === "ranged") {
      row = 4; frame = player.stateTime < 0.08 ? 0 : player.stateTime < 0.17 ? 1 : player.stateTime < 0.36 ? 2 : 3;
    } else if (player.state === "air") {
      row = 2; frame = player.vy < -180 ? 0 : player.vy < 100 ? 1 : 2;
    } else if (player.state === "run") {
      row = 1; frame = Math.floor(player.strideDistance / 16) % 4;
    }
    drawDetailedFrame("catDetailed", row, frame, player);
    // Keep the established beam reach/FX and damage timings, independent of art.
    if (player.state === "ranged") {
      const f = Math.min(5, Math.floor(player.stateTime / 0.083));
      drawFrame(images.catFx, f, 128, 96, player.x - 64 + player.facing * 73,
        player.y - 92, player.facing > 0, 1);
    }
    ctx.globalAlpha = 1;
  }

  function drawMouse(mouse) {
    if (mouse.type === "zombie") {
      let row = 0, frame = Math.floor(worldTime * 3) % 4;
      if (mouse.state === "run") { row = 1; frame = mouse.grounded ? Math.floor(mouse.strideDistance / 10) % 4 : 1; }
      if (mouse.state === "attack") {
        row = 2;
        frame = mouse.stateTime < 0.4 ? 0 : mouse.stateTime < 0.8 ? 1 : mouse.stateTime < 0.95 ? 2 : 3;
      }
      if (mouse.state === "hurt") { row = 3; frame = 0; }
      if (mouse.state === "dead") { row = 3; frame = Math.min(3, Math.floor(mouse.stateTime / 0.22)); }
      drawZombieFrame(mouse, row, frame);
      drawZombieRegeneration(mouse);
      return;
    }
    let row = 0, frame = Math.floor((worldTime + mouse.animOffset) * 4) % 4;
    if (mouse.state === "dead") {
      row = 3; frame = Math.min(3, 1 + Math.floor(mouse.stateTime / 0.22));
    } else if (mouse.state === "hurt") {
      row = 3; frame = 0;
    } else if (mouse.state === "attack") {
      row = 2; frame = mouse.stateTime < 0.14 ? 0 : mouse.stateTime < 0.27 ? 1 : mouse.stateTime < 0.46 ? 2 : 3;
    } else if (mouse.state === "run") {
      row = 1; frame = mouse.grounded ? Math.floor(mouse.strideDistance / 8) % 4 : 1;
    }
    drawDetailedFrame("mouseDetailed", row, frame, mouse);
  }

  function drawDetailedFrame(name, row, frame, entity) {
    const atlas = window.ArenaAtlas[name];
    const [sx, sy, sw, sh, anchorX, feet] = atlas.rows[row][frame];
    ctx.save();
    ctx.translate(Math.round(entity.x), Math.round(entity.y));
    if (entity.facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(images[name], sx, sy, sw, sh,
      -anchorX * atlas.scale, -feet * atlas.scale, sw * atlas.scale, sh * atlas.scale);
    ctx.restore();
  }

  function drawZombieRegeneration(mouse) {
    if (mouse.state === "dead" || (mouse.health === mouse.maxHealth && mouse.regenPulse <= 0)) return;
    ctx.save();
    ctx.fillStyle = "#101708e6";
    ctx.fillRect(mouse.x - 25, mouse.y - 96, 50, 7);
    ctx.fillStyle = mouse.regenPulse > 0 ? "#d0ff83" : "#84b74a";
    ctx.fillRect(mouse.x - 24, mouse.y - 95, 48 * mouse.health / mouse.maxHealth, 4);
    ctx.fillStyle = "#bbe976";
    ctx.fillRect(mouse.x - 24, mouse.y - 90, 48 * mouse.regenTime / ZOMBIE_REGEN_SECONDS, 1);
    if (mouse.regenPulse > 0) {
      ctx.globalAlpha = Math.min(1, mouse.regenPulse);
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.fillText("+1", mouse.x, mouse.y - 101 - (1.4 - mouse.regenPulse) * 16);
    }
    ctx.restore();
  }

  function drawZombieFrame(mouse, row, frame) {
    drawDetailedFrame("zombieDetailed", row, frame, mouse);
  }

  function drawSorcerer(sorcerer) {
    let row = 0;
    let frame = Math.floor((worldTime + sorcerer.animOffset) * 4) % 4;
    ctx.save();
    if (sorcerer.state === "cast") {
      row = 1;
      frame = sorcerer.stateTime < 0.2 ? 0 : sorcerer.stateTime < 0.42 ? 1 : sorcerer.stateTime < 0.66 ? 2 : 3;
    } else if (sorcerer.state === "teleport") {
      ctx.globalAlpha = sorcerer.teleported
        ? Math.max(0, Math.min(1, (sorcerer.stateTime - TELEPORT_VANISH_TIME - 0.12) / 0.5))
        : Math.max(0, 1 - sorcerer.stateTime / TELEPORT_VANISH_TIME);
    } else if (sorcerer.state === "dead") {
      row = 2;
      frame = Math.min(3, 1 + Math.floor(sorcerer.stateTime / 0.22));
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, sorcerer.stateTime - 0.9));
    }
    drawDetailedFrame("sorcererDetailed", row, frame, sorcerer);
    ctx.restore();
    if (sorcerer.state === "teleport") {
      const t = sorcerer.stateTime;
      if (!sorcerer.teleported) drawTeleportMist(sorcerer, Math.min(1, t / 0.3), t);
      else {
        const remaining = Math.max(0, 1 - (t - TELEPORT_VANISH_TIME) / (TELEPORT_DURATION - TELEPORT_VANISH_TIME));
        drawTeleportMist(sorcerer, remaining, t);
        if (sorcerer.teleportTarget) drawTeleportMist(sorcerer.teleportOrigin, remaining * 0.55, t);
      }
    }
  }

  function drawTeleportMist(point, strength, phase) {
    if (!point || strength <= 0) return;
    ctx.save();
    for (let i = 0; i < 12; i += 1) {
      const angle = i * 2.4 + phase * 2;
      const x = point.x + Math.sin(angle) * 22;
      const y = point.y - 10 - i * 6 + Math.cos(angle * 1.2) * 8;
      const radius = 19 + Math.sin(angle) * 5;
      const fog = ctx.createRadialGradient(x, y, 0, x, y, radius);
      fog.addColorStop(0, `rgba(122,210,255,${strength * 0.62})`);
      fog.addColorStop(0.45, `rgba(46,110,220,${strength * 0.45})`);
      fog.addColorStop(1, "rgba(36,58,130,0)");
      ctx.fillStyle = fog;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    ctx.restore();
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
    touchHud.hidden = !touchEnabled || !["playing", "paused"].includes(mode);
    if (touchEnabled) {
      const alive = allEnemies().filter(enemy => enemy.state !== "dead").length;
      // DOM text remains readable in CSS pixels even when the canvas is small.
      const fields = [[touchHealth, `♥ ${player.health}/${player.maxHealth}`],
        [touchEnemies, `Враги ${alive}/${allEnemies().length}`],
        [touchBeam, player.beamCooldown <= 0 ? "Луч ✓" : `Луч ${Math.round(100 * (1 - player.beamCooldown / 1.05))}%`]];
      for (const [field, value] of fields) if (field.textContent !== value) field.textContent = value;
      return;
    }
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
    // Let focused UI buttons retain their native Enter/Space behavior.
    if (event.target?.tagName === "BUTTON" && ["Space", "Enter"].includes(event.code)) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(event.code)) event.preventDefault();
    input.keyDown(event.code, event.repeat);
    ensureAudio();
    if (!event.repeat && event.code === "Escape" && mode === "cinematic") finishVictoryCinematic();
    else if (!event.repeat && event.code === "Escape") { if (immersive) setImmersive(false); pauseGame(); syncFullscreenButton(); }
    if (!event.repeat && event.code === "KeyP") togglePause();
    if (!event.repeat && event.code === "KeyF") toggleFullscreen();
    if (!event.repeat && event.code === "KeyM") toggleMusic();
  });

  window.addEventListener("keyup", event => keys.delete(event.code));
  window.addEventListener("blur", pauseGame);
  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseGame(); });
  window.addEventListener("pagehide", pauseGame);
  window.addEventListener("orientationchange", () => { pauseGame(); resizeGameSurface(); });

  startButton.addEventListener("click", () => {
    ensureAudio();
    if (mode === "paused") resumeGame();
    else resetGame();
    startButton.blur();
  });

  for (const button of touchButtons) {
    button.addEventListener("pointerdown", event => {
      if (mode !== "playing" || (event.pointerType === "mouse" && event.button !== 0)) return;
      event.preventDefault();
      ensureAudio();
      button.setPointerCapture(event.pointerId);
      input.pointerDown(event.pointerId, button.dataset.code);
      syncTouchButtons();
    });
    button.addEventListener("pointermove", event => {
      const code = input.pointers.get(event.pointerId);
      if (!["KeyA", "KeyD"].includes(code)) return;
      const next = document.elementFromPoint(event.clientX, event.clientY)?.closest(".touch-button");
      if (next && ["KeyA", "KeyD"].includes(next.dataset.code) && next.dataset.code !== code) {
        input.pointerDown(event.pointerId, next.dataset.code);
        syncTouchButtons();
      }
    });
    const release = event => { input.pointers.delete(event.pointerId); syncTouchButtons(); };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
    button.addEventListener("contextmenu", event => event.preventDefault());
    button.addEventListener("click", event => {
      // Keyboard/assistive activation, without duplicating a pointer tap.
      if (event.detail === 0 && mode === "playing") pressed.add(button.dataset.code);
    });
  }
  touchToggle.addEventListener("click", () => setTouchEnabled(!touchEnabled));
  pauseButton.addEventListener("click", togglePause);
  pauseButton.disabled = true;
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
    clearInput();
    syncFullscreenButton();
  });

  window.addEventListener("resize", resizeGameSurface);
  window.visualViewport?.addEventListener("resize", resizeGameSurface);

  setTouchEnabled(touchEnabled);
  resizeGameSurface();
  loadAssets();
  requestAnimationFrame(loop);
})();
