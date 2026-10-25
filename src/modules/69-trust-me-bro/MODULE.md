# 69-trust-me-bro

Implementation in progress. All files stay inside this directory, as requested.
The game is not registered in the pipeline or catalogue, and no existing
catalogue slot is repurposed. A standalone browser preview will live here.

Dependencies: `00-core`, `02-player`, `09-net`, `15-minigames`, `68-minigame-kit` (public exports only).

The app-wide duck request replaces both the solo and adviser placeholders with
the shared `02-player` avatar, fitted to the stage's scale and facing convention.
The browser smoke check also found that the raw Canvas was not rendering the
named-priority frame loop. The preview now uses `GameCanvas`, with its existing
orthographic stage camera installed and restored through the renderer state.
The stage and all five ducks render in the retained browser screenshot.

Blocks:
- [x] 69.1 Deterministic four-round rules, kit setup, validated wire and shared arena loop.
- [ ] 69.2 Procedural trapdoor stage, solo controls, adviser messages and pointing.
- [ ] 69.3 Standalone preview with a real lobby and host controls.
- [ ] 69.4 Rule, conformance and networking tests; browser review; checks and handoff.

Scope blocker: main-dashboard integration requires a new catalogue id in
`15-minigames`, which the user explicitly declined to authorize. Pipeline
registration and composition edits are also left untouched under the request
to keep changes inside the new module.


## Procedural asset depth pass

Uses the public `76-minigame-art` contract for trust me bro scenery and lightly beveled existing box assets. Each scene supplies its own play bounds; decorative meshes ignore aiming rays and remain beyond the clear gameplay envelope. Game rules, collision, camera framing, player colours and controls are unchanged. Geometry is procedural, batched to at most three extra draws, with no added textures or lights.

Visual review is pending. Check the actual game, obstacle silhouettes, aiming, the smallest supported window and an eight-player round. Compare themed props in `/src/modules/76-minigame-art/review/gallery.html#trust-me-bro`. Existing screenshots and runtime measurements predate this pass.
