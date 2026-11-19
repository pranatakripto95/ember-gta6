[![make.fun gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![Ember Vice rank](https://make.fun/badge/gta6-01/pranatakripto95/ember-gta6/rank.svg)](https://make.fun/c/gta6-01)
[![Ember Vice reward](https://make.fun/badge/gta6-01/pranatakripto95/ember-gta6/reward.svg)](https://make.fun/c/gta6-01)

# Ember Vice

An original open-world crime game in the spirit of GTA 6, built for the
[make.fun gta6-01 bounty](https://make.fun/c/gta6-01).

Dario Cruz is back in Solmar City after five years away — and he owes Lena
Marlowe a debt. Drive the avenues, steal what you need, lose the cops, and
run five story jobs to buy your freedom.

## The city

- **Solmar City** — a procedural golden-hour city: downtown towers, the
  central plaza, two parks, a beach and ocean, and a working marina with
  bobbing boats.
- **On foot and by car** — third-person walking with a mouse-orbit camera,
  and arcade driving with traffic that shares the roads.
- **Traffic and pedestrians** — cars cruise the avenues and pause at
  intersections; pedestrians stroll the sidewalks and flee from gunfire.
- **Steal any car** — walk up to a parked or stopped car, press E, and it is
  yours. Stealing in sight of the police raises your wanted level.
- **Wanted level and police** — five stars of heat. Police cars chase and
  ram you, foot cops run you down and make the arrest. Break line of sight
  to cool off; get busted or wasted and you wake up at Solmar General,
  lighter in the wallet.
- **Five story missions** — First Gear, Package Run, Hot Wheels, Dockside
  Heat and The Big Score, with waypoints, timers, a shootout and a getaway.
- **Combat** — pistol with tracer fire, punches, reloads, and Vulture
  gunmen who shoot back.
- **HUD with a live minimap** — cash, health, wanted stars, speed, ammo,
  mission objective, timer and a top-down map with the player, traffic,
  police and the mission marker.
- **Start screen and save** — new game, continue, how to play, pause, and
  automatic saving to localStorage, plus ten hidden ember stashes worth
  $250 each.
- **Sound** — every effect and the ambient music loop are synthesised with
  WebAudio: engine hum, sirens, gunshots, pickups and mission jingles.
  M mutes.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk or drive |
| Mouse | Look (click to lock the pointer) |
| Shift | Run |
| Space | Jump |
| E | Steal / enter / exit a car |
| Click | Shoot the pistol |
| F | Punch |
| R | Reload |
| P / Esc | Pause |
| M | Mute |

## Play it

Serve `game/` with any static server and open `index.html` in desktop Chrome:

```sh
cd game && python3 -m http.server
```

No build step, no network requests, no external assets — three.js is
vendored under `game/vendor/` and every sound is synthesised in code.

## Shots

`shots.json` lists the four screenshots in `screenshots/` (cover first):

- `1-drive.jpg` — cruising downtown with two stars and a cop closing in
- `2-street.jpg` — on foot in the plaza, first mission marker ahead
- `3-chase.jpg` — three-star escape during The Big Score
- `4-marina.jpg` — the Dockside Heat shootout at the marina

Retake them with `node gta6-shots.mjs` (Playwright, headless Chromium) or
open `index.html?shot=drive&seed=7` (also `street`, `chase`, `marina`) in a
browser.

## Entry

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to `/output` and writes `/output/dossier.json`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Everything in the game — the city, characters, vehicles, names, story, art
and sounds — is original work made for this entry. License: MIT — see
`LICENSE`.
