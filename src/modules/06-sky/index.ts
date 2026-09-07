/**
 * 06-sky - the public contract.
 *
 * What is above the island: a gradient dome with the sun, stars and cloud in
 * it, and whatever is falling out of it. Reads the light and the weather from
 * 00-core and draws them; it decides neither.
 */

export { SKY, cloudThreshold, cloudUv, domeFits, horizonFalloff } from './internal/dome'
export { PRECIPITATION, type FallStyle } from './internal/fall'
export { SkyDome } from './internal/SkyDome'
export { Precipitation } from './internal/Precipitation'
export { Sky } from './internal/Sky'
