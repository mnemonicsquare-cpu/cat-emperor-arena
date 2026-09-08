# Level 2 generated asset brief

All assets use the supplied palace FPS screenshot only as a composition and
palette reference. They keep the game's existing Cat Emperor enemy designs and
create original parody-imperial emblems rather than copying another franchise.

- `weapon_source.webp`: first-person, original oversized cat-imperial firearm;
  stock and orange paws closest at the bottom, barrel receding away toward the
  upper centre, visible top rail and rear sight, muzzle never aimed at the
  viewer, dark metal and brass, transparent background.
- `cultist_fps_source.webp`: five left-to-right states (idle, walk, machete
  attack, hurt, dead) of the grey mouse cultist in a red horned robe, consistent
  scale and baseline, transparent background.
- `sorcerer_fps_source.webp`: five states (idle, move, cast, blue-mist hurt or
  teleport, dead) of the blue-purple mouse sorcerer, transparent background.
- `zombie_fps_source.webp`: five states (idle, relentless walk, long machete
  wind-up, non-interrupting hit reaction, dead) of the large zombie mouse,
  transparent background.
- `textures_source.webp`: seamless 4×2 atlas of riveted brass wall, dark stone,
  mechanical cat-emblem door, monumental Cat Emperor portrait, red carpet,
  worn stone floor, bronze ceiling and red cat banner.
- `props_source.webp`: four left-to-right transparent props: ammunition crate,
  medkit, imperial lever and golden exit shrine.

The final atlases are rebuilt with:

```bash
node scripts/pack-fps-assets.cjs
```
