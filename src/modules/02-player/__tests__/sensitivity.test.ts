import { describe, expect, it } from 'vitest'
import {
  CAMERA_SENSITIVITY_DEFAULT,
  CAMERA_SENSITIVITY_MAX,
  CAMERA_SENSITIVITY_MIN,
  normaliseCameraSensitivity,
} from '../internal/sensitivity'

describe('camera sensitivity', () => {
  it('keeps every preference in the usable aiming range', () => {
    expect(normaliseCameraSensitivity(-4)).toBe(CAMERA_SENSITIVITY_MIN)
    expect(normaliseCameraSensitivity(20)).toBe(CAMERA_SENSITIVITY_MAX)
    expect(normaliseCameraSensitivity(1.35)).toBe(1.35)
  })

  it('returns the standard setting for unusable saved values', () => {
    expect(normaliseCameraSensitivity(null)).toBe(CAMERA_SENSITIVITY_DEFAULT)
    expect(normaliseCameraSensitivity('not a number')).toBe(CAMERA_SENSITIVITY_DEFAULT)
  })
})
