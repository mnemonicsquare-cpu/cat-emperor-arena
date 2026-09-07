const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ArenaInput, fitArena } = require('../dist/input.js');

module.exports = function harness() {
  const calls = [];
  const context = new Proxy({}, { get: (_, key) => (...args) => {
    calls.push([key, ...args]);
    if (key === 'createRadialGradient') return {addColorStop() {}};
  } });
  const elements = new Map();
  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const handlers = {};
    const classes = new Set();
    const e = { id, handlers, children: [], style: { setProperty() {} }, dataset: {}, attributes: {},
      classList: { toggle(name, active) { active ? classes.add(name) : classes.delete(name); } },
      querySelector: s => element(id + s), getContext: () => context,
      getBoundingClientRect: () => ({height: 0}),
      addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
      emit(type, data = {}) { for (const fn of handlers[type] || []) fn(data); },
      setAttribute(k, v) { this.attributes[k] = v; }, setPointerCapture() {},
      pause() {}, load() {}, play: () => Promise.resolve(), blur() {} };
    elements.set(id, e);
    return e;
  }
  const buttons = ['KeyA', 'KeyD', 'KeyJ', 'KeyK', 'Space'].map(code => {
    const e = element(code); e.dataset.code = code; return e;
  });
  const document = element('document');
  Object.assign(document, { querySelector: element, querySelectorAll: () => buttons,
    documentElement: element('html'), body: element('body') });
  const window = element('window');
  Object.assign(window, { ArenaInput, fitArena, innerWidth: 1280, innerHeight: 800,
    matchMedia: () => ({matches: false}) });
  const sandbox = {document, window, navigator: {maxTouchPoints: 0},
    getComputedStyle: () => ({paddingLeft:'8px',paddingRight:'8px',paddingTop:'8px',paddingBottom:'8px',gap:'8px'}),
    Audio: function () { return element('audio'); }, performance: {now: () => 0}, Math: Object.create(Math),
    fetch: () => Promise.reject(new Error('Offline test; media intentionally disabled')) };
  const source = fs.readFileSync(path.join(__dirname, '../dist/game.js'), 'utf8');
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/atlas.js'),'utf8'),sandbox);
  vm.runInNewContext(source.replace('  loadAssets();\n  requestAnimationFrame(loop);', `
    globalThis.game = { createMouseSpawns, createMouse, createSorcerer, platforms, player, mice, sorcerers,
      updateMouse, moveMouse, drawZombieFrame, zombieRows, images, drawArena, resetGame, update, draw,
      damageMouse, damageSorcerer, updateSorcerer, chooseTeleportTarget, validTeleportTarget,
      projectileHitsTerrain, updateProjectiles, projectiles, drawProjectiles, drawSorcerer, drawPlayer,
      drawDetailedFrame, drawTeleportMist, assetPaths,
      input, clearInput, pauseGame, resumeGame, setTouchEnabled, toggleFullscreen, fitArena: window.fitArena,
      setMode: value => { mode = value; }, getMode: () => mode,
      getHitStop: () => hitStop, clearHitStop: () => { hitStop = 0; },
      setCamera: (x, y) => { cameraX = x; cameraY = y; },
      GROUND_Y, ZOMBIE_REGEN_SECONDS, TELEPORT_VANISH_TIME, TELEPORT_DURATION };
  `), sandbox);
  return { g: sandbox.game, calls, sandbox, elements, element, buttons };
};
