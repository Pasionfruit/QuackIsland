/**
 * 60-volcano-map-landmarks - the public contract.
 *
 * Deterministic route furniture that makes the Volcano Island start, climb
 * milestones, and finish readable without owning movement or game state.
 */
export { VOLCANO_LANDMARK_BUDGET, VOLCANO_LANDMARKS, createVolcanoLandmarks, volcanoLandmarkPose, type VolcanoLandmark, type VolcanoLandmarkKind, type VolcanoLandmarkPose, } from './internal/layout';
export { volcanoLandmarksVisible } from './internal/visibility';
export { VolcanoMapLandmarks } from './internal/VolcanoMapLandmarksView';
