import { ShaderLib } from 'three'
import { describe, expect, it } from 'vitest'
import { createPrintMaterial } from '../internal/FootprintsView'

/**
 * The print shading is injected into three's standard material by replacing
 * named include lines. A wrong hook name makes `replace` a no-op - no error,
 * no warning, just prints that quietly lose their shape. These run the real
 * injection and check what came out.
 */
function compiled() {
  const material = createPrintMaterial()
  const shader = {
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
    uniforms: {},
    defines: {},
  }
  material.onBeforeCompile(shader as never, undefined as never)
  return shader
}

describe('the print material', () => {
  it('injects into both shaders rather than silently doing nothing', () => {
    const shader = compiled()
    expect(shader.vertexShader).toContain('vFade')
    expect(shader.fragmentShader).toContain('vFade')
    // The radius is read from XZ, because the disc is laid flat at build time.
    expect(shader.vertexShader).toContain('position.xz')
  })

  it('fades per instance', () => {
    expect(compiled().fragmentShader).toContain('gl_FragColor.a *= vFade')
  })

  it('is a plain oval with no bright rim', () => {
    // A bright edge is what makes a thing read as raised rather than pressed
    // in - it turned every print into an iris. Nothing here may brighten the
    // fragment; the shading is shadow and a soft edge, nothing else.
    const frag = compiled().fragmentShader
    const injected = frag.slice(frag.indexOf('#include <dithering_fragment>'))
    expect(injected).not.toContain('lip')
    expect(injected).not.toMatch(/gl_FragColor\.rgb\s*=/)
    expect(injected).toContain('smoothstep')
  })

  it('draws darker than the sand it sits in', () => {
    // Sand is around #d0bd90; a dent has to be clearly below that or it will
    // not read as a depression at all.
    const material = createPrintMaterial()
    expect(material.color.r).toBeLessThan(0.45)
    expect(material.color.g).toBeLessThan(0.45)
    expect(material.color.b).toBeLessThan(0.45)
  })

  it('keeps out of a depth fight with the ground', () => {
    // The prints sit in the surface rather than above it, so they rely on the
    // polygon offset entirely.
    const material = createPrintMaterial()
    expect(material.polygonOffset).toBe(true)
    expect(material.polygonOffsetFactor).toBeLessThan(0)
    expect(material.depthWrite).toBe(false)
  })
})
