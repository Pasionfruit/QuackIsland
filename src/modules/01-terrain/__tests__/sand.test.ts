import { ShaderLib } from 'three'
import { createSandMaterial } from '../internal/sand-material'
import { describe, expect, it } from 'vitest'

/**
 * The sand shading is injected into three's standard material by replacing
 * named include lines. If three ever renames one of those chunks, the replace
 * silently does nothing: no error, no warning, just terrain that quietly loses
 * its wet band and its grain. Checking the hooks exist turns that into a gate
 * failure instead of a thing somebody notices weeks later.
 */
describe('sand shader injection points', () => {
  const vert = ShaderLib.standard.vertexShader
  const frag = ShaderLib.standard.fragmentShader

  it('has the vertex hooks the material relies on', () => {
    expect(vert).toContain('#include <common>')
    expect(vert).toContain('#include <begin_vertex>')
  })

  it('has the fragment hooks the material relies on', () => {
    expect(frag).toContain('#include <common>')
    expect(frag).toContain('#include <color_fragment>')
    expect(frag).toContain('#include <roughnessmap_fragment>')
  })
})

describe('the sand actually gets injected', () => {
  it('rewrites both shaders rather than silently doing nothing', () => {
    // String.replace on a miss returns the original untouched, so a wrong hook
    // name produces no error at all - just plain terrain. This runs the real
    // onBeforeCompile against the real shaders and checks the code landed.
    const material = createSandMaterial()
    const shader = {
      vertexShader: ShaderLib.standard.vertexShader,
      fragmentShader: ShaderLib.standard.fragmentShader,
      uniforms: {},
      defines: {},
    }
    material.onBeforeCompile(shader as never, undefined as never)

    expect(shader.vertexShader).toContain('vGroundY')
    expect(shader.fragmentShader).toContain('vGroundY')
    expect(shader.fragmentShader).toContain('diffuseColor.rgb = sand')
    expect(shader.fragmentShader).toContain('roughnessFactor = mix')
    // The wet band is the thing that makes it read as a beach; if this is
    // missing the shore will look like dry sand meeting a hard edge.
    expect(shader.fragmentShader).toContain('wetSand')
  })

  it('gives the material its own program cache key', () => {
    expect(createSandMaterial().customProgramCacheKey()).toContain('sand')
  })
})
