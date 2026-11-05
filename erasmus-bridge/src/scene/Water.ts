import * as THREE from 'three'

/**
 * Planar-reflection river water (adapted from three.js examples Water.js) with:
 *  – HDR (half float) reflection target so sky / sun highlights survive tone-mapping
 *  – physically plausible Fresnel (F0 ≈ 0.02) instead of a mirror
 *  – sky-lit "murky river" body colour, sun glitter and distance-dependent chop
 */
export class Water extends THREE.Mesh {
  declare material: THREE.ShaderMaterial
  rt: THREE.WebGLRenderTarget

  constructor(
    geometry: THREE.BufferGeometry,
    opts: { normals: THREE.Texture; size?: number; res?: number; distortion?: number },
  ) {
    super(geometry)
    const res = opts.res ?? 1024
    this.rt = new THREE.WebGLRenderTarget(res, res, { type: THREE.HalfFloatType, samples: 4 })

    const mirrorPlane = new THREE.Plane()
    const normal = new THREE.Vector3()
    const mirrorPos = new THREE.Vector3()
    const camPos = new THREE.Vector3()
    const rot = new THREE.Matrix4()
    const lookAt = new THREE.Vector3()
    const clip = new THREE.Vector4()
    const view = new THREE.Vector3()
    const target = new THREE.Vector3()
    const q = new THREE.Vector4()
    const texMat = new THREE.Matrix4()
    const mirrorCam = new THREE.PerspectiveCamera()

    const uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib['fog'],
      THREE.UniformsLib['lights'],
      {
        normalSampler: { value: opts.normals },
        mirrorSampler: { value: this.rt.texture },
        time: { value: 0 },
        size: { value: opts.size ?? 3.5 },
        distortionScale: { value: opts.distortion ?? 4 },
        textureMatrix: { value: texMat },
        sunColor: { value: new THREE.Color('#ffffff') },
        sunDirection: { value: new THREE.Vector3(0.5, 0.7, 0.2) },
        eye: { value: new THREE.Vector3() },
        waterColor: { value: new THREE.Color('#2a3d3c') },
        ambient: { value: new THREE.Color('#8fa8bc') },
        reflGain: { value: 1.0 },
      },
    ])

    this.material = new THREE.ShaderMaterial({
      name: 'RiverWater',
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
          mirrorCoord = modelMatrix * vec4(position, 1.0);
          worldPosition = mirrorCoord;
          mirrorCoord = textureMatrix * mirrorCoord;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <beginnormal_vertex>
          #include <defaultnormal_vertex>
          #include <fog_vertex>
          #include <shadowmap_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D mirrorSampler;
        uniform float time;
        uniform float size;
        uniform float distortionScale;
        uniform sampler2D normalSampler;
        uniform vec3 sunColor;
        uniform vec3 sunDirection;
        uniform vec3 eye;
        uniform vec3 waterColor;
        uniform vec3 ambient;
        uniform float reflGain;
        varying vec4 mirrorCoord;
        varying vec4 worldPosition;

        vec4 getNoise(vec2 uv) {
          vec2 uv0 = (uv / 103.0) + vec2(time / 17.0, time / 29.0);
          vec2 uv1 = uv / 107.0 - vec2(time / -19.0, time / 31.0);
          vec2 uv2 = uv / vec2(8907.0, 9803.0) + vec2(time / 101.0, time / 97.0);
          vec2 uv3 = uv / vec2(1091.0, 1027.0) - vec2(time / 109.0, time / -113.0);
          vec4 noise = texture2D(normalSampler, uv0) + texture2D(normalSampler, uv1) +
                       texture2D(normalSampler, uv2) + texture2D(normalSampler, uv3);
          return noise * 0.5 - 1.0;
        }
        #include <common>
        #include <packing>
        #include <bsdfs>
        #include <fog_pars_fragment>
        #include <lights_pars_begin>
        #include <shadowmap_pars_fragment>
        #include <shadowmask_pars_fragment>
        void main() {
          vec3 worldToEye = eye - worldPosition.xyz;
          float dist = length(worldToEye);
          vec3 eyeDir = normalize(worldToEye);
          vec4 noise = getNoise(worldPosition.xz * size);
          // flatten the chop with distance to avoid shimmering
          float flatten = clamp(dist / 900.0, 0.0, 0.85);
          vec3 n = normalize(noise.xzy * vec3(1.5, 1.0, 1.5));
          n = normalize(mix(n, vec3(0.0, 1.0, 0.0), flatten));

          vec2 distortion = n.xz * (0.001 + min(1.0 / dist, 0.02)) * distortionScale;
          vec3 refl = texture2D(mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion).rgb * reflGain;

          float cosT = max(dot(eyeDir, n), 0.0);
          float F = 0.04 + 0.96 * pow(1.0 - cosT, 4.0);
          F = clamp(F * 1.2, 0.0, 1.0);

          // sun glitter
          vec3 r = normalize(reflect(-sunDirection, n));
          float spec = pow(max(dot(eyeDir, r), 0.0), 220.0) * 6.0 + pow(max(dot(eyeDir, r), 0.0), 24.0) * 0.25;
          vec3 glitter = sunColor * spec * getShadowMask();

          float sunDiffuse = max(dot(sunDirection, vec3(0.0, 1.0, 0.0)), 0.0);
          vec3 body = waterColor * (ambient * 0.9 + sunColor * sunDiffuse * 0.35 * getShadowMask());
          body *= 0.55 + 0.45 * cosT;

          vec3 col = mix(body, refl, F) + glitter * F;
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
    })

    // (UniformsUtils.merge cannot clone render-target textures, so assign afterwards)
    this.material.uniforms.mirrorSampler.value = this.rt.texture
    this.material.uniforms.textureMatrix.value = texMat

    this.onBeforeRender = (renderer, scene, camera) => {
      this.material.uniforms.eye.value.setFromMatrixPosition(camera.matrixWorld)
      mirrorPos.setFromMatrixPosition(this.matrixWorld)
      camPos.setFromMatrixPosition(camera.matrixWorld)
      rot.extractRotation(this.matrixWorld)
      normal.set(0, 0, 1).applyMatrix4(rot)
      view.subVectors(mirrorPos, camPos)
      if (view.dot(normal) > 0) return
      view.reflect(normal).negate().add(mirrorPos)
      rot.extractRotation(camera.matrixWorld)
      lookAt.set(0, 0, -1).applyMatrix4(rot).add(camPos)
      target.subVectors(mirrorPos, lookAt).reflect(normal).negate().add(mirrorPos)
      mirrorCam.position.copy(view)
      mirrorCam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal)
      mirrorCam.lookAt(target)
      mirrorCam.far = (camera as THREE.PerspectiveCamera).far
      mirrorCam.updateMatrixWorld()
      mirrorCam.projectionMatrix.copy((camera as THREE.PerspectiveCamera).projectionMatrix)

      texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      texMat.multiply(mirrorCam.projectionMatrix).multiply(mirrorCam.matrixWorldInverse)

      mirrorPlane.setFromNormalAndCoplanarPoint(normal, mirrorPos)
      mirrorPlane.applyMatrix4(mirrorCam.matrixWorldInverse)
      clip.set(mirrorPlane.normal.x, mirrorPlane.normal.y, mirrorPlane.normal.z, mirrorPlane.constant)
      const pm = mirrorCam.projectionMatrix
      q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0]
      q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5]
      q.z = -1
      q.w = (1 + pm.elements[10]) / pm.elements[14]
      clip.multiplyScalar(2 / clip.dot(q))
      pm.elements[2] = clip.x
      pm.elements[6] = clip.y
      pm.elements[10] = clip.z + 1
      pm.elements[14] = clip.w

      const prevRT = renderer.getRenderTarget()
      const prevXr = renderer.xr.enabled
      const prevShadow = renderer.shadowMap.autoUpdate
      const prevTM = renderer.toneMapping
      this.visible = false
      renderer.xr.enabled = false
      renderer.shadowMap.autoUpdate = false
      renderer.setRenderTarget(this.rt)
      renderer.state.buffers.depth.setMask(true)
      if (renderer.autoClear === false) renderer.clear()
      renderer.render(scene, mirrorCam)
      this.visible = true
      renderer.xr.enabled = prevXr
      renderer.shadowMap.autoUpdate = prevShadow
      renderer.toneMapping = prevTM
      renderer.setRenderTarget(prevRT)
      const vp = (camera as any).viewport
      if (vp !== undefined) renderer.state.viewport(vp)
    }
  }

  setTime(t: number) {
    this.material.uniforms.time.value = t
  }
}
