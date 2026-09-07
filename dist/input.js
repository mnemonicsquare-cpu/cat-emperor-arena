/* One input state per device source: releasing a finger never releases a key. */
((root) => {
  class ArenaInput {
    constructor() {
      this.keys = new Set();
      this.pointers = new Map();
      this.pressed = new Set();
    }
    isDown(code) {
      return this.keys.has(code) || [...this.pointers.values()].includes(code);
    }
    keyDown(code, repeat = false) {
      if (!repeat && !this.isDown(code)) this.pressed.add(code);
      this.keys.add(code);
    }
    pointerDown(id, code) {
      if (!this.isDown(code)) this.pressed.add(code);
      this.pointers.set(id, code);
    }
    clear() {
      this.keys.clear();
      this.pointers.clear();
      this.pressed.clear();
    }
  }

  function fitArena(width, height, horizontalPadding, verticalPadding, chromeHeight, touch) {
    const availableW = Math.max(1, width - horizontalPadding - 6);
    const availableH = Math.max(1, height - verticalPadding - chromeHeight - 6);
    const scale = Math.min(availableW / 640, availableH / 360);
    // Keep the original integer scaling on desktop; touch screens use all space.
    const chosen = !touch && scale >= 2 ? Math.floor(scale) : scale;
    return Math.max(1, Math.floor(chosen * 640));
  }
  root.ArenaInput = ArenaInput;
  root.fitArena = fitArena;
  if (typeof module !== 'undefined') module.exports = { ArenaInput, fitArena };
})(typeof window !== 'undefined' ? window : globalThis);
