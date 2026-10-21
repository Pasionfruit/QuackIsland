# Duck Szn browser evidence

Run with the repository's
[`run-localrot` skill](../../../../.claude/skills/run-localrot/SKILL.md):

```powershell
node src/modules/70-duck-szn/review/browser.mjs
node src/modules/70-duck-szn/review/render.mjs
```

The dev server on 5199 and relay on 8791 must already be running. Drivers launch
separate GPU-backed headless Chromes with temporary profiles, then close them.
They do not alter gameplay state to produce an outcome. Pointer-lock acquisition
is stood in for because headless Chrome does not support it; keyboard, mouse
movement and shooting then use the game's input handlers.

[`browser-results.json`](browser-results.json) records eight successful checks:

1. Countdown blocks movement and firing.
2. Solo human Hunter plus four stand-ins; WASD motion, exact mouse direction/
   sensitivity and firing cooldown work.
3. Host selection of the guest Hunter sticks; clients share the round and seed,
   with the correct own body in each.
4. Duck movement, crouch and release reach the other browser.
5. A guest Hunter's shot eliminates the host duck; both receive Hunter victory.
6. Shared pause stops both simulation clocks and resume restarts them.
7. A guest Hunter leaving awards the host duck the round.
8. A real 60-second solo round ends in duck victory with four survivors.

All successful-run browser console error arrays are empty.

[`render-results.json`](render-results.json) records the final lighting/layout
check: 69 draw calls, 3,828 triangles, 60 fps; 800 px document width in an 800 px
viewport and a 413 px game area. Performance is a local sample, not a guarantee
for other hardware or network conditions.

Inspected representative screenshots:

- [Final marsh rendering](screenshots/marsh-final.png)
- [Compact layout](screenshots/compact-layout.png)
- [Duck hiding](screenshots/duck-hiding.png)
- [Guest Hunter victory](screenshots/hunter-wins.png)
- [Ducks surviving the minute](screenshots/ducks-win.png)

The first browser attempt exposed two module integration errors: using a raw
Canvas bypassed the core's explicit render call; treating a locally decided
round as paused prevented a pending final snapshot from reaching the guest.
The game now uses `GameCanvas` and keeps the shared net loop active after a
decision. The repeated browser suite passed. Final lighting was reviewed again
with `render.mjs` after removing duplicate lights from the scene.

The pipeline gate remains unavailable until module registration is authorized;
these checks do not constitute human PASS.
