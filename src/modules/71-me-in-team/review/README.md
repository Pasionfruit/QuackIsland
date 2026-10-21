# ME in Team browser evidence

The repository's [`run-localrot` skill](../../../../.claude/skills/run-localrot/SKILL.md)
drives separate GPU-backed headless Chrome processes. Run from the repo root
with Vite on port 5199 and the relay on port 8791:

```powershell
node src/modules/71-me-in-team/review/browser.mjs
node src/modules/71-me-in-team/review/render.mjs
```

The drivers leave temporary Chrome profiles under the system temp directory,
save representative screenshots here, and close their browsers afterward.
They stand in for pointer lock, then dispatch real keyboard/mouse events through
the game's handlers. They do not edit game state to produce the results.

[`browser-results.json`](browser-results.json) records nine successful checks:

1. Countdown ignored walking input.
2. Solo human, four stand-ins, camera-relative WASD and exact mouse sensitivity;
   connected chain and nonzero rendering within the declared budgets.
3. Three browsers shared round/seed/solo selection and correct own bodies.
4. The solo stopped at z = 1.46 against a chain spanning z = 1, despite continued
   forward input: the solo could not pass between the two teammates.
5. One guest's movement pulled an idle teammate from z = 1 to about -1.11 on the
   host, with the link held to 2.6 m.
6. Pause stopped all three clients' clocks and bodies; resume restarted them.
7. A guest selected by the host collected all three flags and reached the exit
   using WASD/mouse events. All clients agreed on solo victory at about 11.35 s.
8. A teammate leaving reduced the chain; the solo leaving awarded the team the win.
9. A real 60-second solo round ended in team victory at exactly 60 seconds.

No browser console errors were captured. The full runtime ended normally.

[`render-results.json`](render-results.json) records the compact-layout check:
800 px document width in an 800 px viewport, a 392 px game area, 63 draw calls,
3,010 triangles and a local 60 fps sample. The earlier 1200×820 sample recorded
62 draw calls and 2,998 triangles. These are local samples, not guarantees for
every machine or network.

Inspected screenshots:

- [Solo course and stand-in chain](screenshots/solo-course.png)
- [Chain blocking the solo](screenshots/chain-blocking.png)
- [Guest pulling an idle teammate](screenshots/guest-chain.png)
- [Solo escape](screenshots/solo-wins.png)
- [Timed team victory](screenshots/team-wins.png)
- [Compact layout](screenshots/compact-layout.png)

Main-dashboard integration and the module gate are deferred under the user's
module-only scope. These automated checks do not constitute human PASS.
