import * as THREE from 'three'

/** Planar-reflection canal water lying in the plane y = level. Calm, dark and reflective. */
export class CanalWater extends THREE.Mesh {
  rt: THREE.WebGLRenderTarget
  onReflect?: (on: boolean) => void
  reflectionsOn = true
  private level: number

  constructor(geometry: THREE.BufferGeometry, normals: THREE.Texture, size = 768, level = 0) {
    super(geometry)
    this.level = level
    const rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, samples: 4 })
    this.rt = rt
    const textureMatrix = new THREE.Matrix4()
    const mirrorCamera = new THREE.PerspectiveCamera()
    const mirrorPlane = new THREE.Plane()
    const normal = new THREE.Vector3(0, 1, 0)
    const mirrorPos = new THREE.Vector3(0, level, 0)
    const camPos = new THREE.Vector3()
    const view = new THREE.Vector3()
    const target = new THREE.Vector3()
    const lookAt = new THREE.Vector3()
    const rot = new THREE.Matrix4()
    const clip = new THREE.Vector4()
    const q = new THREE.Vector4()

    const uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib['fog'],
      THREE.UniformsLib['lights'],
      {
        normalSampler: { value: normals },
        mirrorSampler: { value: null },
        useMirror: { value: 1 },
        time: { value: 0 },
        textureMatrix: { value: textureMatrix },
        sunColor: { value: new THREE.Color('#fff2dc') },
        sunDirection: { value: new THREE.Vector3(0.5, 0.7, 0.3) },
        eye: { value: new THREE.Vector3() },
        waterColor: { value: new THREE.Color('#142318') },
        skyColor: { value: new THREE.Color('#5a7890') },
        ripple: { value: 0.04 },
        distortion: { value: 0.9 },
      },
    ])

    const mat = new THREE.ShaderMaterial({
      uniforms,
      lights: true,
      fog: true,
      vertexShader: /* glsl */ `
        uniform mat4 textureMatrix;
        varying vec4 mirrorCoord;
        varying vec4 worldPosition;
        #include <common>
        #include <fog_pars_vertex>
        #include <shadowmap_pars_vertex>
        void main() {
          mirrorCoord = modelMatrix * vec4( position, 1.0 );
          worldPosition = mirrorCoord;
          mirrorCoord = textureMatrix * mirrorCoord;
          vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
          gl_Position = projectionMatrix * mvPosition;
          #include <beginnormal_vertex>
          #include <defaultnormal_vertex>
          #include <fog_vertex>
          #include <shadowmap_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D mirrorSampler;
        uniform sampler2D normalSampler;
        uniform float useMirror;
        uniform float time;
        uniform vec3 sunColor;
        uniform vec3 sunDirection;
        uniform vec3 eye;
        uniform vec3 waterColor;
        uniform vec3 skyColor;
        uniform float ripple;
        uniform float distortion;
        varying vec4 mirrorCoord;
        varying vec4 worldPosition;
        #include <common>
        #include <packing>
        #include <bsdfs>
        #include <fog_pars_fragment>
        #include <lights_pars_begin>
        #include <shadowmap_pars_fragment>
        #include <shadowmask_pars_fragment>

        vec3 waveNormal( vec2 p ) {
          vec2 a = p / 9.0 + vec2( time * 0.012, time * 0.008 );
          vec2 b = p / 3.7 - vec2( time * 0.02, -time * 0.014 );
          vec2 c = p / 1.3 + vec2( -time * 0.035, time * 0.03 );
          vec3 n = texture2D( normalSampler, a ).xyz * 2.0 - 1.0;
          n += ( texture2D( normalSampler, b ).xyz * 2.0 - 1.0 ) * 0.7;
          n += ( texture2D( normalSampler, c ).xyz * 2.0 - 1.0 ) * 0.35;
          return normalize( vec3( n.x * ripple, n.z, n.y * ripple ) );
        }

        void main() {
          vec3 n = waveNormal( worldPosition.xz );
          vec3 toEye = eye - worldPosition.xyz;
          float dist = length( toEye );
          vec3 V = toEye / dist;
          float cosT = max( dot( V, n ), 0.0 );
          float F = 0.03 + 0.97 * pow( 1.0 - cosT, 5.0 );
          F = clamp( F * 1.1, 0.0, 1.0 );
          vec2 dis = n.xz * ( 0.002 + 1.0 / ( dist + 3.0 ) ) * distortion;
          vec3 refl = skyColor;
          if ( useMirror > 0.5 ) refl = texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + dis ).rgb;
          // sun glint
          vec3 R = reflect( -sunDirection, n );
          float spec = pow( max( dot( V, R ), 0.0 ), 900.0 ) * 40.0;
          vec3 body = waterColor * ( 0.35 + 0.65 * getShadowMask() );
          body += skyColor * 0.04;
          vec3 col = mix( body, mix( vec3( dot( refl, vec3( 0.33 ) ) ), refl, 0.7 ) * vec3(0.8, 0.88, 0.78), F ) + sunColor * spec * getShadowMask();
          gl_FragColor = vec4( col, 1.0 );
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    })
    uniforms.mirrorSampler.value = rt.texture
    this.material = mat
    this.userData.uniforms = uniforms

    this.onBeforeRender = (renderer, scene, camera) => {
      camPos.setFromMatrixPosition(camera.matrixWorld)
      view.subVectors(mirrorPos, camPos)
      if (view.dot(normal) > 0) return
      view.reflect(normal).negate()
      view.add(mirrorPos)
      rot.extractRotation(camera.matrixWorld)
      lookAt.set(0, 0, -1).applyMatrix4(rot).add(camPos)
      target.subVectors(mirrorPos, lookAt).reflect(normal).negate().add(mirrorPos)
      mirrorCamera.position.copy(view)
      mirrorCamera.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal)
      mirrorCamera.lookAt(target)
      mirrorCamera.far = (camera as THREE.PerspectiveCamera).far
      mirrorCamera.updateMatrixWorld()
      mirrorCamera.projectionMatrix.copy(camera.projectionMatrix)
      textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      textureMatrix.multiply(mirrorCamera.projectionMatrix).multiply(mirrorCamera.matrixWorldInverse)
      mirrorPlane.setFromNormalAndCoplanarPoint(normal, mirrorPos)
      mirrorPlane.applyMatrix4(mirrorCamera.matrixWorldInverse)
      clip.set(mirrorPlane.normal.x, mirrorPlane.normal.y, mirrorPlane.normal.z, mirrorPlane.constant)
      const pm = mirrorCamera.projectionMatrix
      q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0]
      q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5]
      q.z = -1
      q.w = (1 + pm.elements[10]) / pm.elements[14]
      clip.multiplyScalar(2 / clip.dot(q))
      pm.elements[2] = clip.x
      pm.elements[6] = clip.y
      pm.elements[10] = clip.z + 1
      pm.elements[14] = clip.w
      uniforms.eye.value.copy(camPos)

      if (!this.reflectionsOn) return
      const cur = renderer.getRenderTarget()
      const xr = renderer.xr.enabled
      const sh = renderer.shadowMap.autoUpdate
      this.visible = false
      renderer.xr.enabled = false
      renderer.shadowMap.autoUpdate = false
      this.onReflect?.(true)
      renderer.setRenderTarget(rt)
      renderer.state.buffers.depth.setMask(true)
      if (renderer.autoClear === false) renderer.clear()
      renderer.render(scene, mirrorCamera)
      this.onReflect?.(false)
      this.visible = true
      renderer.xr.enabled = xr
      renderer.shadowMap.autoUpdate = sh
      renderer.setRenderTarget(cur)
    }
  }

  setMirror(on: boolean) {
    this.reflectionsOn = on
    ;(this.userData.uniforms.useMirror as { value: number }).value = on ? 1 : 0
  }
  get u() {
    return this.userData.uniforms as Record<string, { value: any }>
  }
  getLevel() {
    return this.level
  }
}
