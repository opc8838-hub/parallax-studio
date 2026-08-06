"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import gsap from "gsap";
import GUI from "lil-gui";

type HorizontalGalleryProps = { images: string[] };

const vertexShader = `
  #define PI 3.1415926535897932384626433832795
  precision highp float;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform vec2 uResolution;
  uniform vec2 uImageResolution;
  uniform float uParallax;
  uniform float uUvScale;
  uniform float uShaderMultiplier;
  uniform float uTime;
  uniform float uHoverProgress;
  uniform vec2 uMousePosition;
  uniform float uHoverDistortionStrength;
  uniform float uGrainStrength;
  uniform float uEffectRadius;
  uniform float uEffectType;

  vec2 coverUv(vec2 uv, vec2 resolution, vec2 imageResolution) {
    vec2 ratio = vec2(
      min((resolution.x / resolution.y) / (imageResolution.x / imageResolution.y), 1.0),
      min((resolution.y / resolution.x) / (imageResolution.y / imageResolution.x), 1.0)
    );
    return vec2(
      uv.x * ratio.x + (1.0 - ratio.x) * 0.5,
      uv.y * ratio.y + (1.0 - ratio.y) * 0.5
    );
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    // Soft circular mask around the mouse position (aspect-corrected so it stays round)
    vec2 maskUv = vUv - uMousePosition;
    maskUv.x *= uResolution.x / uResolution.y;
    float mask = (1.0 - smoothstep(uEffectRadius * 0.3, uEffectRadius, length(maskUv))) * uHoverProgress;

    vec2 uv = coverUv(vUv, uResolution, uImageResolution);
    uv.x += uParallax * uShaderMultiplier;
    uv -= 0.5;
    uv *= uUvScale;
    uv += 0.5;

    int effectType = int(uEffectType + 0.5);
    float grainAmount = uGrainStrength;
    vec3 col;

    if (effectType == 1) {
      // Chromatic aberration radiating from the cursor
      vec2 dir = vUv - uMousePosition;
      float amt = uHoverDistortionStrength * mask * 0.6;
      col.r = texture2D(uTexture, uv + dir * amt).r;
      col.g = texture2D(uTexture, uv).g;
      col.b = texture2D(uTexture, uv - dir * amt).b;
    } else if (effectType == 2) {
      // Sine wave ripple
      uv.x += sin(vUv.y * 30.0 + uTime * 1.6) * uHoverDistortionStrength * 0.35 * mask;
      uv.y += sin(vUv.x * 24.0 - uTime * 1.2) * uHoverDistortionStrength * 0.25 * mask;
      col = texture2D(uTexture, uv).rgb;
    } else if (effectType == 3) {
      // Large soft noise blobs
      vec2 blob = vec2(
        noise(vUv * 2.5 + uTime * 0.15),
        noise(vUv * 2.5 + 50.0 - uTime * 0.12)
      ) - 0.5;
      uv += blob * uHoverDistortionStrength * 2.4 * mask;
      col = texture2D(uTexture, uv).rgb;
    } else if (effectType == 4) {
      // Film grain dominant, barely any distortion
      vec2 distortion = vec2(
        noise(vUv * 6.0 + uTime * 0.4),
        noise(vUv * 6.0 + 100.0 - uTime * 0.3)
      ) - 0.5;
      uv += distortion * uHoverDistortionStrength * 0.3 * mask;
      col = texture2D(uTexture, uv).rgb;
      grainAmount *= 2.6;
    } else if (effectType == 5) {
      // Mosaic pixelation around the cursor
      vec2 px = 14.0 / uResolution;
      vec2 mosaic = (floor(uv / px) + 0.5) * px;
      col = texture2D(uTexture, mix(uv, mosaic, mask)).rgb;
    } else if (effectType == 6) {
      // Magnifying lens centered on the cursor
      vec2 muv = coverUv(uMousePosition, uResolution, uImageResolution);
      muv.x += uParallax * uShaderMultiplier;
      muv -= 0.5;
      muv *= uUvScale;
      muv += 0.5;
      uv = mix(uv, muv + (uv - muv) * 0.65, mask);
      col = texture2D(uTexture, uv).rgb;
    } else {
      // Fine noise ripple distortion (default)
      vec2 distortion = vec2(
        noise(vUv * 6.0 + uTime * 0.4),
        noise(vUv * 6.0 + 100.0 - uTime * 0.3)
      ) - 0.5;
      uv += distortion * uHoverDistortionStrength * mask;
      col = texture2D(uTexture, uv).rgb;
    }

    // Fine animated grain, only where the hover mask is active
    float grain = hash(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5;
    col += grain * grainAmount * mask;

    gl_FragColor = vec4(col, 1.0);
  }
`;

type Media = {
  element: HTMLImageElement;
  bounds: DOMRect;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  material: THREE.ShaderMaterial;
  texture: THREE.Texture;
  parallaxIntensity: number;
  hoverTarget: number;
};

const clamp = (min: number, max: number, value: number) => gsap.utils.clamp(min, max, value);
const lerp = (start: number, end: number, amount: number) => gsap.utils.interpolate(start, end, amount);

export function HorizontalGallery({ images }: HorizontalGalleryProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    const container = containerRef.current;
    if (!canvas || !wrapper || !container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }

    const screen = { width: window.innerWidth, height: window.innerHeight };
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(screen.width, screen.height);

    const scene = new THREE.Scene();
    const group = new THREE.Group();
    scene.add(group);
    const fov = 2 * Math.atan(screen.height / 2 / 100) * (180 / Math.PI);
    const camera = new THREE.PerspectiveCamera(fov, screen.width / screen.height, 0.01, 1000);
    camera.position.set(0, 0, 100);
    const geometry = new THREE.PlaneGeometry(1, 1, 32, 32);
    const textureLoader = new THREE.TextureLoader();
    const medias: Media[] = [];
    const scroll = { current: 0, target: 0, ease: 0.07, limit: 0 };
    const params = {
      parallaxIntensity: 0.4,
      uvScale: 0.85,
      shaderMultiplier: 1.0,
      hoverDistortionStrength: 0.06,
      grainStrength: 0.08,
      effectRadius: 0.45,
      hoverTransitionSpeed: 0.08,
    };
    // Hover effects only on devices with a real pointer, and never under prefers-reduced-motion
    const hoverEnabled =
      window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointer = { x: 0, y: 0, active: false };
    const clock = new THREE.Clock();
    let gui: GUI | null = null;
    let animationFrame = 0;
    let disposed = false;

    const setLimit = () => {
      scroll.limit = container.scrollWidth - wrapper.clientWidth;
    };

    const updateMediaScale = (media: Media) => {
      media.bounds = media.element.getBoundingClientRect();
      media.mesh.scale.set(media.bounds.width, media.bounds.height, 1);
      media.material.uniforms.uResolution.value.set(media.bounds.width, media.bounds.height);
    };

    const updateMediaPosition = (media: Media) => {
      const x = media.bounds.left - scroll.current - screen.width / 2 + media.bounds.width / 2;
      const y = -media.bounds.top + screen.height / 2 - media.bounds.height / 2;
      media.mesh.position.set(x, y, 0);
    };

    const updateMediaParallax = (media: Media) => {
      const elementLeft = media.bounds.left - scroll.current;
      const elementRight = elementLeft + media.bounds.width;
      if (elementRight >= 0 && elementLeft <= window.innerWidth) {
        const elementCenter = elementLeft + media.bounds.width / 2;
        const viewportCenter = window.innerWidth / 2;
        const distance = (elementCenter - viewportCenter) / window.innerWidth;
        media.material.uniforms.uParallax.value = distance * media.parallaxIntensity;
      }
    };

    const updateMediaHover = (media: Media) => {
      if (!hoverEnabled) return;
      const left = media.bounds.left - scroll.current;
      const top = media.bounds.top;
      media.hoverTarget =
        pointer.active &&
        pointer.x >= left && pointer.x <= left + media.bounds.width &&
        pointer.y >= top && pointer.y <= top + media.bounds.height
          ? 1
          : 0;
      const progress = media.material.uniforms.uHoverProgress.value as number;
      let next = lerp(progress, media.hoverTarget, params.hoverTransitionSpeed);
      // Snap to exact 0/1 at the end so the resting state is the untouched original image
      if (media.hoverTarget === 0 && next < 0.002) next = 0;
      if (media.hoverTarget === 1 && next > 0.998) next = 1;
      media.material.uniforms.uHoverProgress.value = next;
      if (pointer.active) {
        const mx = clamp(0, 1, (pointer.x - left) / media.bounds.width);
        const my = clamp(0, 1, 1 - (pointer.y - top) / media.bounds.height);
        media.material.uniforms.uMousePosition.value.set(mx, my);
      }
    };

    const onResize = () => {
      screen.width = window.innerWidth;
      screen.height = window.innerHeight;
      camera.aspect = screen.width / screen.height;
      camera.fov = 2 * Math.atan(screen.height / 2 / 100) * (180 / Math.PI);
      camera.updateProjectionMatrix();
      renderer.setSize(screen.width, screen.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      medias.forEach(updateMediaScale);
      setLimit();
    };

    const onWheel = (event: WheelEvent) => {
      scroll.target += event.deltaY;
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
    };

    const onPointerLeave = () => {
      pointer.active = false;
    };

    const render = () => {
      scroll.target = clamp(0, scroll.limit, scroll.target);
      scroll.current = lerp(scroll.current, scroll.target, scroll.ease);
      const time = clock.getElapsedTime();
      medias.forEach((media) => {
        updateMediaParallax(media);
        updateMediaPosition(media);
        updateMediaHover(media);
        media.material.uniforms.uTime.value = time;
      });
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(render);
    };

    const setup = async () => {
      const elements = Array.from(container.querySelectorAll<HTMLImageElement>(".gallery__media__image__gl"));
      await Promise.all(elements.map((element) => new Promise<void>((resolve) => {
        if (element.complete) return resolve();
        element.addEventListener("load", () => resolve(), { once: true });
        element.addEventListener("error", () => resolve(), { once: true });
      })));
      if (disposed) return;

      elements.forEach((element, index) => {
        const bounds = element.getBoundingClientRect();
        const texture = textureLoader.load(element.getAttribute("src") ?? "", (loadedTexture) => {
          material.uniforms.uImageResolution.value.set(loadedTexture.image.width, loadedTexture.image.height);
        });
        const material = new THREE.ShaderMaterial({
          uniforms: {
            uTexture: { value: texture },
            uResolution: { value: new THREE.Vector2(bounds.width || 1, bounds.height || 1) },
            uImageResolution: { value: new THREE.Vector2(1, 1) },
            uParallax: { value: 0 },
            uUvScale: { value: params.uvScale },
            uShaderMultiplier: { value: params.shaderMultiplier },
            uTime: { value: 0 },
            uHoverProgress: { value: 0 },
            uMousePosition: { value: new THREE.Vector2(0.5, 0.5) },
            uHoverDistortionStrength: { value: params.hoverDistortionStrength },
            uGrainStrength: { value: params.grainStrength },
            uEffectRadius: { value: params.effectRadius },
            // Each photo gets its own hover texture style: 0 noise ripple, 1 chromatic
            // aberration, 2 sine wave, 3 soft blobs, 4 film grain, 5 mosaic, 6 lens
            uEffectType: { value: index % 7 },
          },
          vertexShader,
          fragmentShader,
        });
        const mesh = new THREE.Mesh(geometry, material);
        group.add(mesh);
        const media: Media = { element, bounds, mesh, material, texture, parallaxIntensity: params.parallaxIntensity, hoverTarget: 0 };
        medias.push(media);
        updateMediaScale(media);
      });

      gui = new GUI();
      gui.add(params, "parallaxIntensity", 0, 1, 0.01).name("Parallax Intensity").onChange((value: number) => {
        medias.forEach((media) => { media.parallaxIntensity = value; });
      });
      gui.add(params, "uvScale", 0.7, 1.0, 0.01).name("UV Scale (Buffer)").onChange((value: number) => {
        medias.forEach((media) => { media.material.uniforms.uUvScale.value = value; });
      });
      gui.add(params, "shaderMultiplier", 0, 2, 0.1).name("Shader Multiplier").onChange((value: number) => {
        medias.forEach((media) => { media.material.uniforms.uShaderMultiplier.value = value; });
      });
      gui.add(params, "hoverDistortionStrength", 0, 0.2, 0.005).name("Hover Distortion Strength").onChange((value: number) => {
        medias.forEach((media) => { media.material.uniforms.uHoverDistortionStrength.value = value; });
      });
      gui.add(params, "grainStrength", 0, 0.3, 0.005).name("Grain Strength").onChange((value: number) => {
        medias.forEach((media) => { media.material.uniforms.uGrainStrength.value = value; });
      });
      gui.add(params, "effectRadius", 0.1, 1.0, 0.01).name("Effect Radius").onChange((value: number) => {
        medias.forEach((media) => { media.material.uniforms.uEffectRadius.value = value; });
      });
      gui.add(params, "hoverTransitionSpeed", 0.02, 0.3, 0.01).name("Hover Transition Speed");

      setLimit();
      onResize();
      setLoaded(true);
      animationFrame = requestAnimationFrame(render);
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("wheel", onWheel, { passive: true });
    if (hoverEnabled) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onPointerLeave);
    }
    setup().catch(() => setFailed(true));

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("wheel", onWheel);
      if (hoverEnabled) {
        window.removeEventListener("pointermove", onPointerMove);
        document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      }
      gui?.destroy();
      medias.forEach(({ material, texture }) => {
        material.dispose();
        texture.dispose();
      });
      geometry.dispose();
      renderer.dispose();
    };
  }, [images]);

  return (
    <main>
      <header className="frame">
        <h1 className="frame__title">Horizontal Parallax Gallery (WebGL)</h1>
        <a className="frame__back" href="https://tympanus.net/codrops/2026/02/19/creating-a-smooth-horizontal-parallax-gallery-from-dom-to-webgl/">Tutorial</a>
        <a className="frame__archive" href="https://tympanus.net/codrops/hub/">All demos</a>
        <a className="frame__github" href="https://github.com/davidfaure/horizontal-parallax-gallery-codrops">GitHub</a>
        <nav className="frame__tags" aria-label="Tags">
          <a href="https://tympanus.net/codrops/demos/?tag=scroll">#scroll</a>
          <a href="https://tympanus.net/codrops/demos/?tag=three-js">#three.js</a>
          <a href="https://tympanus.net/codrops/demos/?tag=webgl">#webgl</a>
        </nav>
        <nav className="frame__demos" aria-label="Demo version">
          <a className="button" href="https://tympanus.net/Tutorials/HorizontalParallaxGallery/index.html">2D/DOM Version</a>
        </nav>
      </header>

      <div className="content">
        <div ref={wrapperRef} className="gallery__wrapper__gl">
          <div ref={containerRef} className="gallery__image__container__gl">
            {images.map((src, index) => (
              <picture className="gallery__media__gl" key={src}>
                <img src={src} alt={`Xian portrait ${index + 1}`} className="gallery__media__image__gl" draggable={false} />
              </picture>
            ))}
          </div>
        </div>
      </div>

      <canvas ref={canvasRef} aria-label="Horizontal WebGL gallery of seven Xian portraits" />
      {!loaded && !failed && <div className="loading-screen" aria-label="Loading" />}
      {failed && <p className="webgl-error">WebGL is unavailable in this browser.</p>}
    </main>
  );
}
