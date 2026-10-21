# 69-trust-me-bro

Implementation in progress. All files stay inside this directory, as requested.
The game is not registered in the pipeline or catalogue, and no existing
catalogue slot is repurposed. A standalone browser preview will live here.

Dependencies: `00-core`, `09-net`, `15-minigames`, `68-minigame-kit` (public exports only).

Blocks:
- [x] 69.1 Deterministic four-round rules, kit setup, validated wire and shared arena loop.
- [ ] 69.2 Procedural trapdoor stage, solo controls, adviser messages and pointing.
- [ ] 69.3 Standalone preview with a real lobby and host controls.
- [ ] 69.4 Rule, conformance and networking tests; browser review; checks and handoff.

Scope blocker: main-dashboard integration requires a new catalogue id in
`15-minigames`, which the user explicitly declined to authorize. Pipeline
registration and composition edits are also left untouched under the request
to keep changes inside the new module.
