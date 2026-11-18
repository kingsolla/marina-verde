# marina-verde

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/kingsolla/marina-verde/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/kingsolla/marina-verde/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Marina Verde: Full Tide — a sun-soaked open-world crime game in the browser. Explore a procedural coastal city on foot and by car, steal cars, outrun the marina police and their helicopter, and run twelve story jobs in three acts for Rosa and Marco — from your first stolen wheels to the grand getaway yacht. Built with three.js (vendored, offline), original art, synthesised WebAudio sound and 3 radio stations, a live minimap HUD, four weapons, shops, a garage, a clinic, a safehouse, a Turf Ledger, handbrake drifting, and a save system.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 — no build step, no network, just static files under `game/`.

## How to play

- **W A S D** — walk / drive · **Mouse** — look around · **Shift** — run · **Space** — handbrake / drift
- **E** — enter / exit a car (stealing a car raises your wanted level) / open a shop. Pressing E next to a moving traffic car carjacks it: the driver gets out and the car is yours (+1 extra star if police are near).
- **GPS** — the HUD shows distance + a direction arrow to your objective, and the minimap draws a dashed gold route line to it.
- **Street Race** — after mission 11, a checkered start gantry on the beachfront road opens a repeatable race (3 checkpoints → hospital, 75 s, $200 prize, results in the Turf Ledger).
- **Click** — shoot · **V** — punch · **P** — pause · **M** — full map (districts, GPS route, Turf Ledger, 12-mission list)
- **1–4** — select weapon (pistol, SMG, shotgun, rifle) · **Q** — cycle weapon · **R** — cycle radio station
- **1–5 stars** — the marina police chase, ram and try to bust you; at 4–5 stars a helicopter joins with a searchlight. Break line of sight and the MVPD switches to SEARCH: a search zone appears on the minimap — stay out of it and unseen to lose the heat for good.
- **9 named districts** — Beachfront, Marina, Lighthouse Point, Palm Row, Old Market, Downtown, Northgate, West End, Eastside — each tracked in the Turf Ledger.
- **12 story missions in 3 acts** — Wheels Up, Sunset Courier, Armed & Ready, Midnight Taxi, Heat Wave, Tail Job, Rooftop Rumble, Quiet Streets, Garage Run, Storm the Pier, The Long Way Home, Grand Getaway. Rosa runs the crew, Marco drives getaway. Finish them all and the city is yours.
- **HUD** — mission panel (act, timer, stage x/12, next job), MVPD RESPONSE panel (unit callsigns, distance, PURSUIT / RAMMING / ROADBLOCK / SPOTLIGHT chips), IN SIGHT / SEARCHING badge, DAY clock, weapon slots, radio with now-playing song + EQ, district label + REP bar, dialog with character portraits, car panel (name, CONDITION %, gear, km/h).
- **Shops** — Verde Arms (weapons + ammo), Rosa's Garage (repair + repaint), Coral Clinic (health kits), Safehouse (free rest + save). Finishing an act raises your Turf Ledger rep and earns a 5% shop discount per act.

---

Entered on [make.fun](https://make.fun/?ref=66g3b6zn&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards
