import { useEffect, useRef } from 'react'

const vertexSource = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * .5 + .5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

// Bilerek düşük kontrastlı: oyun bilgisi, efektin her zaman önünde kalmalı.
const fragmentSource = `
precision highp float;
varying vec2 v_uv;
uniform float u_time;
uniform vec2 u_resolution;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + 1.), f.x), f.y);
}
float fbm(vec2 p) {
  float value = 0.0, amplitude = .5;
  for (int i = 0; i < 4; i++) { value += amplitude * noise(p); p = p * 2.02 + 4.1; amplitude *= .5; }
  return value;
}
void main() {
  vec2 aspect = vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
  vec2 p = v_uv * aspect * 2.1;
  float time = u_time * .024;
  float haze = fbm(p + vec2(time, -time * .62));
  float streak = fbm(p * 1.9 + vec2(-time * .55, time));
  vec3 abyss = vec3(.008, .025, .052);
  vec3 blue = vec3(.015, .11, .20);
  vec3 cyan = vec3(.10, .72, .76);
  vec3 color = mix(abyss, blue, smoothstep(.22, .88, haze) * .56);
  color += cyan * pow(streak, 8.0) * .085;
  gl_FragColor = vec4(color, 1.0);
}`

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  gl.deleteShader(shader)
  return null
}

/** Hafif WebGL ambiyansı; destek yoksa veya hareket azaltılmışsa sessizce devre dışı kalır. */
export function AmbientShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'low-power' })
    if (!gl) return
    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
    if (!vertex || !fragment) return
    const program = gl.createProgram()
    if (!program) return
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return

    const buffer = gl.createBuffer()
    const position = gl.getAttribLocation(program, 'a_position')
    const time = gl.getUniformLocation(program, 'u_time')
    const resolution = gl.getUniformLocation(program, 'u_resolution')
    if (!buffer || position < 0 || !time || !resolution) return

    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio))
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio))
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
    }
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    if (resizeObserver) resizeObserver.observe(canvas)
    else window.addEventListener('resize', resize)
    resize()

    let frame = 0
    let alive = true
    const render = (now: number) => {
      if (!alive || document.hidden) return
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform1f(time, now * .001)
      gl.uniform2f(resolution, canvas.width, canvas.height)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      frame = requestAnimationFrame(render)
    }
    const onVisibilityChange = () => {
      cancelAnimationFrame(frame)
      if (!document.hidden && alive) frame = requestAnimationFrame(render)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    frame = requestAnimationFrame(render)
    return () => {
      alive = false
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', resize)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)
    }
  }, [])

  return <canvas ref={canvasRef} className="qt-ambient-shader" aria-hidden="true" />
}
