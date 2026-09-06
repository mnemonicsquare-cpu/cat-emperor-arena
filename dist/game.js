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
  const RENDER_SCALE = 2;
  const GROUND_TILE_Y = 296;
  const GROUND_Y = 316;
  const PLAYER_JUMP_SPEED = 510;
  const MOUSE_JUMP_SPEED = 610;
  const MOUSE_GRAVITY = 1320;
  const MOUSE_DETECTION_RADIUS = 270;

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
    background: "assets/backgrounds/arena_far.png",
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
    mouseDeath: "assets/sprites/cultist_mouse_death.png"
  };

  const backgroundMusicParts = Array.from(
    { length: 7 },
    (_, index) => `assets/audio/litany-parts/litany.mp3.part-${String(index).padStart(2, "0")}`
  );

  const images = {};
  const platforms = [
    { x: 120, y: 240, drawY: 220, w: 192 },
    { x: 380, y: 195, drawY: 175, w: 128 },
    { x: 580, y: 248, drawY: 228, w: 192 },
    { x: 850, y: 188, drawY: 168, w: 128 },
    { x: 1040, y: 238, drawY: 218, w: 192 },
    { x: 1300, y: 178, drawY: 158, w: 128 },
    { x: 1490, y: 234, drawY: 214, w: 192 },
    { x: 1735, y: 190, drawY: 170, w: 128 }
  ];

  const player = {
    x: 112, y: GROUND_Y, vx: 0, vy: 0,
    facing: 1, grounded: true,
    state: "idle", stateTime: 0,
    health: 5, maxHealth: 5,
    invuln: 0, coyote: 0, jumpBuffer: 0,
    attackHit: false, beamHit: false, beamCooldown: 0
  };

  const mouseSpawns = [
    { x: 470, patrolMin: 390, patrolMax: 555 },
    { x: 735, patrolMin: 650, patrolMax: 825 },
    { x: 1050, patrolMin: 950, patrolMax: 1170 },
    { x: 1370, patrolMin: 1265, patrolMax: 1450 },
    { x: 1710, patrolMin: 1590, patrolMax: 1840 }
  ];

  function createMouse(spawn, index) {
    return {
      x: spawn.x, y: GROUND_Y, vx: 0, vy: 0,
      facing: -1, grounded: true, state: "idle", stateTime: index * 0.08,
      health: 4, maxHealth: 4, attackHit: false,
      patrolDir: index % 2 ? 1 : -1, alerted: false, jumpCooldown: 0,
      patrolMin: spawn.patrolMin, patrolMax: spawn.patrolMax,
      animOffset: index * 0.13
    };
  }

  const mice = mouseSpawns.map(createMouse);

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
      status.textContent = "Пять культистов. Большая арена. Ни шагу назад.";
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
    mice.splice(0, mice.length, ...mouseSpawns.map(createMouse));
    particles.length = 0;
    hitStop = 0;
    endTimer = 0;
    cameraX = 0;
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
      if (mice.every(candidate => candidate.state === "dead")) endTimer = 1.0;
    } else {
      setState(mouse, "hurt");
    }
  }

  function damagePlayer(attacker) {
    if (player.invuln > 0 || player.state === "dead") return;
    player.health = Math.max(0, player.health - 1);
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
        for (const mouse of mice) {
          const dx = mouse.x - player.x;
          if (mouse.state !== "dead" && Math.sign(dx || player.facing) === player.facing && Math.abs(dx) < 78 && Math.abs(mouse.y - player.y) < 56) {
            damageMouse(mouse, 1);
          }
        }
      }
      if (player.stateTime >= 0.43) setState(player, player.grounded ? "idle" : "air");
    } else if (player.state === "ranged") {
      if (!player.beamHit && player.stateTime >= 0.17) {
        player.beamHit = true;
        for (const mouse of mice) {
          const dx = mouse.x - player.x;
          if (mouse.state !== "dead" && Math.sign(dx || player.facing) === player.facing && Math.abs(dx) < 275 && Math.abs(mouse.y - player.y) < 68) {
            damageMouse(mouse, 1);
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
      if (!mouse.attackHit && mouse.stateTime >= 0.27) {
        mouse.attackHit = true;
        if (Math.abs(player.x - mouse.x) < 53 && Math.abs(player.y - mouse.y) < 55) damagePlayer(mouse);
      }
      if (mouse.stateTime >= 0.68) setState(mouse, "idle");
      moveMouse(mouse, dt);
      return;
    }

    const dx = player.x - mouse.x;
    const dy = player.y - mouse.y;
    const distance = Math.hypot(dx, dy);
    if (!mouse.alerted && player.state !== "dead" && distance <= MOUSE_DETECTION_RADIUS) {
      mouse.alerted = true;
    }

    if (player.state !== "dead" && distance < 48 && Math.abs(player.y - mouse.y) < 58) {
      faceMouseToward(mouse, dx);
      mouse.attackHit = false;
      setState(mouse, "attack");
    } else if (player.state !== "dead" && mouse.alerted) {
      const targetPlatform = platformSupporting(player);
      const currentPlatform = platformSupporting(mouse);
      let pursuitX = targetPlatform
        ? Math.max(targetPlatform.x + 18, Math.min(targetPlatform.x + targetPlatform.w - 18, player.x))
        : player.x;

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
      mouse.vx = Math.abs(pursuitDx) > 5 ? Math.sign(pursuitDx) * 66 : 0;

      const targetIsAbove = player.y < mouse.y - 30;
      const nearTargetPlatform = targetPlatform
        && mouse.x >= targetPlatform.x - 60
        && mouse.x <= targetPlatform.x + targetPlatform.w + 60;
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
      mouse.vx = mouse.patrolDir * 31;
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
    updateParticles(dt);

    const cameraTarget = Math.max(0, Math.min(WORLD_W - W, player.x - W * 0.42));
    cameraX += (cameraTarget - cameraX) * Math.min(1, dt * 7);

    if (endTimer > 0) {
      endTimer -= dt;
      if (endTimer <= 0) {
        if (mice.every(mouse => mouse.state === "dead")) {
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
    for (let x = 0; x < WORLD_W; x += W) {
      ctx.drawImage(images.background, x, 0, W, H);
    }
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

  function drawParticles() {
    for (const particle of particles) {
      ctx.globalAlpha = Math.min(1, particle.life * 4);
      ctx.fillStyle = particle.color;
      ctx.fillRect(Math.round(particle.x), Math.round(particle.y), particle.size, particle.size);
    }
    ctx.globalAlpha = 1;
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

    const livingMice = mice.filter(mouse => mouse.state !== "dead");
    if (livingMice.length) {
      const nearestMouse = livingMice.reduce((nearest, mouse) => (
        Math.abs(mouse.x - player.x) < Math.abs(nearest.x - player.x) ? mouse : nearest
      ));
      ctx.fillStyle = "#080606d9";
      ctx.fillRect(440, 10, 192, 34);
      ctx.strokeStyle = "#70251f";
      ctx.strokeRect(440.5, 10.5, 191, 33);
      ctx.fillStyle = "#cf9b70";
      ctx.textAlign = "right";
      ctx.fillText(`КУЛЬТИСТЫ: ${livingMice.length}/${mice.length}`, 624, 21);
      ctx.fillStyle = "#291416";
      ctx.fillRect(452, 27, 172, 8);
      ctx.fillStyle = "#9d2631";
      ctx.fillRect(452, 27, Math.round(172 * nearestMouse.health / nearestMouse.maxHealth), 8);
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
    ctx.translate(-Math.round(cameraX), 0);
    drawArena();
    for (const mouse of mice) drawMouse(mouse);
    drawPlayer();
    drawParticles();
    ctx.restore();
    drawHud();
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
