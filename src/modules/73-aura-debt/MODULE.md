# 73-aura-debt

Aura Debt pits one skateboard rider against the other players operating traps.
The rider rolls forward automatically, steers with A/D, accelerates with W,
brakes with S, and drags the mouse to move the chase camera. Trap operators
select a crate, oil slick, or crosswind, aim across the course with the mouse,
and left-click the course to release it ahead of the rider. Each operator has
a separate cooldown. A shared release interval prevents simultaneous trap spam.

The course gets faster and releases environmental obstacles more frequently as
the round progresses. Impacts reduce stability and disturb balance; slicks
reduce steering grip, and gusts push sideways. Stability gradually recovers.
Rolling over an edge, losing balance, or exhausting stability gives the trap
operators the win. Surviving 90 seconds gives the rider the win. The result
reports survival time and distance. Disconnecting the rider ends the round;
losing every operator awards the rider the win.

## Contract and implementation

`index.ts` exports the round types, deterministic rules, `newRound`, roster and
seed functions, `AuraDebtGame`, and `AuraDebtPanel`. The game component accepts
a round, playing/paused flags, and an optional result callback. The panel is
the shared registry adapter, with `useFinish` and team standings.

Setup uses `oneVsAllSetup` and `castOneVsAll` from `68-minigame-kit`.
That kit supplies the lobby roster, identity and seed dealer; a solo human rides
against three trap bots. `oneVsAllProblems` checks the setup contract.
Networking uses `useArenaNet`/`ArenaRules`, with kit header, pose and claim
codecs. Guests send steering inputs rather than claiming positions or hits;
the host simulates the rider, cooldowns, course and collisions. Trap claims
validate role, round, aim, sequence, cooldown and capacity. Snapshot decoding
rejects nonfinite values, duplicate IDs and excessive hazard lists.

Geometry is procedural: a duck rider, skateboard, road, buildings, markers and
three traps. No images, textures, model downloads or new packages are required.
The course uses metres and -Z for forward travel. Random course placement uses
the core seeded RNG. Simulation is independent from the rendering frame rate
through small integration steps, with a capped frame delta.

## Integration finding

The user explicitly requested keeping changes inside this new module after
being informed that `15-minigames` lacks an `aura-debt` catalogue ID. Consequently
this module does not register itself, alter an existing game, or claim a
reserved slot. It is not available from the shared minigame menu or party
rotation. A later authorized catalogue change must add Aura Debt with its
one-vs-all description and controls, and connect `newRound`/`AuraDebtPanel`
through `registerMinigame`. The normal application build does not include this
unregistered module, so its bundle budget is not a measured contribution yet.

The direct preview lives entirely inside this module. It starts a solo rider
round and offers Pause, Ride again and Try traps. Try traps creates an explicit
second human preview seat as the rider so the local user can inspect the
operator controls. That preview rider rolls straight ahead; this button is a
control demonstration rather than an AI rider or a multiplayer lobby launcher.
The shared lobby transport is exercised in tests through two kit arena links.

## Validation

The machine gate cleared typecheck, production build, the repository test suite,
boundaries, frozen modules, public contracts and bundle budgets. Module tests
cover kit setup, determinism, swept collisions, warnings, trap effects,
steering, survival, disconnects, malformed packets, role checks, pause, guest
claims and two-client snapshot synchronization. The preview entry also builds
separately through Vite with output writing disabled.

Browser visual review and live relay play are pending. The browser automation
inventory returned no available browsers, so no screenshots or visual/performance
measurements are claimed. Human PASS remains pending.

## How to review

1. Run `npm run dev` and open
   `http://localhost:5173/src/modules/73-aura-debt/preview.html`.
2. Ride with WASD, countersteer away from warnings, and drag the mouse to look.
   Check readable warnings, camera comfort, skateboard motion, escalating
   difficulty, stability recovery and the fall/result screen.
3. Pause while holding a steering key, release it, then resume. Check that
   neither time nor hazards advanced during pause and steering is released.
4. Select Try traps. Select each trap, move the mouse across the road, and
   left-click the course. Check the white target, placement, warning duration,
   cooldown display, trap effects and operator result.
5. Select Ride again and check that time, stability, controls and hazards reset.
6. After catalogue integration is authorized, review with two real browsers:
   host-selected rider, guest rider controls, guest traps, shared pause,
   disconnects, replay and team podium. Measure draw calls and frame time here.
