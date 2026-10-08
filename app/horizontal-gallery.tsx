"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import gsap from "gsap";
import { fragmentShader, vertexShader } from "./gallery-shaders";
import type { GalleryImage, GallerySettings } from "./gallery-project";

type Props = {
  images: GalleryImage[];
  settings: GallerySettings;
  focusId: string | null;
  onSelect: (id: string) => void;
};

export function HorizontalGallery({ images, settings, focusId, onSelect }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef({ images, settings, onSelect });
  const seekRef = useRef<(id: string) => void>(() => {});
  const redrawRef = useRef<() => void>(() => {});
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const [progress, setProgress] = useState(0);
  const [motionReduced, setMotionReduced] = useState(false);
  const imageKey = JSON.stringify(images.map(image => [image.id, image.src]));

  useEffect(() => { liveRef.current = { images, settings, onSelect }; redrawRef.current(); }, [images, settings, onSelect]);
  useEffect(() => { if (focusId) seekRef.current(focusId); }, [focusId]);

  useEffect(() => {
    const stage = stageRef.current;
    const track = trackRef.current;
    const canvas = canvasRef.current;
    if (!stage || !track || !canvas) return;
    let disposed = false;
    let initialized = false;
    let animationFrame = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000);
    camera.position.z = 10;
    const geometry = new THREE.PlaneGeometry(1, 1);
    const loader = new THREE.TextureLoader();
    type Media = { element: HTMLElement; image: HTMLImageElement; left: number; top: number;
      width: number; height: number; material: THREE.ShaderMaterial | null;
      mesh: THREE.Mesh | null; texture: THREE.Texture | null; progress: number };
    const media: Media[] = [];
    const scroll = { current: 0, target: 0, limit: 0 };
    const pointer = { x: 0, y: 0, active: false, down: false, startX: 0, startTarget: 0, moved: false };
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = reducedQuery.matches;
    const clock = new THREE.Clock();
    let lastProgress = -1;
    const schedule = () => {
      if (initialized && !disposed && !animationFrame) animationFrame = requestAnimationFrame(render);
    };
    redrawRef.current = schedule;

    if (settings.mode === "webgl") {
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      } catch { /* DOM gallery remains usable when WebGL is unavailable. */ }
    }
    const gl = renderer;
    stage.dataset.renderer = gl ? "webgl" : "dom";

    const measure = () => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      camera.left = -width / 2; camera.right = width / 2;
      camera.top = height / 2; camera.bottom = -height / 2;
      camera.updateProjectionMatrix();
      gl?.setSize(width, height, false);
      for (const item of media) {
        item.left = item.element.offsetLeft;
        item.top = item.element.offsetTop + track.offsetTop;
        item.width = item.element.offsetWidth;
        item.height = item.element.offsetHeight;
        item.mesh?.scale.set(item.width, item.height, 1);
        item.material?.uniforms.uResolution.value.set(item.width, item.height);
      }
      scroll.limit = Math.max(0, track.scrollWidth - width + 40);
      scroll.target = Math.min(scroll.target, scroll.limit);
      scroll.current = Math.min(scroll.current, scroll.limit);
      schedule();
    };
    const seek = (id: string) => {
      const index = liveRef.current.images.findIndex(image => image.id === id);
      const item = media[index];
      if (item) scroll.target = gsap.utils.clamp(0, scroll.limit, item.left + item.width / 2 - stage.clientWidth / 2);
      schedule();
    };
    seekRef.current = seek;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientWidth : 1;
      scroll.target += (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit;
      schedule();
    };
    const onPointerMove = (event: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active = true;
      if (pointer.down) {
        const delta = event.clientX - pointer.startX;
        if (Math.abs(delta) > 5) pointer.moved = true;
        scroll.target = pointer.startTarget - delta;
      }
      schedule();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointer.down = true; pointer.moved = false;
      pointer.startX = event.clientX; pointer.startTarget = scroll.target;
      stage.setPointerCapture(event.pointerId);
      stage.dataset.dragging = "true";
      onPointerMove(event);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!pointer.down) return;
      pointer.down = false;
      stage.dataset.dragging = "false";
      if (!pointer.moved) {
        const index = media.findIndex(item => pointer.x >= item.left - scroll.current &&
          pointer.x <= item.left - scroll.current + item.width && pointer.y >= item.top && pointer.y <= item.top + item.height);
        if (index >= 0) liveRef.current.onSelect(liveRef.current.images[index].id);
      }
      if (event.pointerType === "touch") pointer.active = false;
      schedule();
    };
    const onPointerLeave = () => { if (!pointer.down) pointer.active = false; schedule(); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault(); scroll.target += (event.key === "ArrowRight" ? 1 : -1) * stage.clientWidth * 0.65;
      } else if (event.key === "Home") { event.preventDefault(); scroll.target = 0; }
      else if (event.key === "End") { event.preventDefault(); scroll.target = scroll.limit; }
      schedule();
    };
    const onMotionChange = () => { reduced = reducedQuery.matches; setMotionReduced(reduced); schedule(); };
    onMotionChange();

    const render = () => {
      animationFrame = 0;
      const p = liveRef.current.settings;
      scroll.target = gsap.utils.clamp(0, scroll.limit, scroll.target);
      scroll.current = reduced ? scroll.target : gsap.utils.interpolate(scroll.current, scroll.target, p.scrollEase);
      if (Math.abs(scroll.current - scroll.target) < 0.01) scroll.current = scroll.target;
      let moving = Math.abs(scroll.current - scroll.target) > 0.01 || pointer.down;
      const time = clock.getElapsedTime();
      track.style.transform = `translate3d(${-scroll.current}px, 0, 0)`;
      media.forEach((item, i) => {
        const left = item.left - scroll.current;
        const distance = (left + item.width / 2 - stage.clientWidth / 2) / stage.clientWidth;
        const hovered = Boolean(gl) && (liveRef.current.images[i]?.effect ?? -1) >= 0 && !reduced && pointer.active && pointer.x >= left && pointer.x <= left + item.width &&
          pointer.y >= item.top && pointer.y <= item.top + item.height;
        item.progress = gsap.utils.interpolate(item.progress, hovered ? 1 : 0, p.hoverTransitionSpeed);
        if (item.progress < 0.002) item.progress = 0;
        if (hovered || item.progress > 0) moving = true;
        if (item.material && item.mesh) {
          const u = item.material.uniforms;
          item.mesh.position.set(left + item.width / 2 - stage.clientWidth / 2, stage.clientHeight / 2 - item.top - item.height / 2, 0);
          item.mesh.visible = left + item.width >= 0 && left <= stage.clientWidth;
          u.uParallax.value = reduced ? 0 : distance * p.parallaxIntensity;
          u.uUvScale.value = p.uvScale; u.uShaderMultiplier.value = p.shaderMultiplier;
          u.uHoverDistortionStrength.value = p.hoverDistortionStrength;
          u.uGrainStrength.value = p.grainStrength; u.uEffectRadius.value = p.effectRadius;
          u.uHoverProgress.value = item.progress; u.uTime.value = time;
          u.uEffectType.value = liveRef.current.images[i]?.effect ?? -1;
          u.uMousePosition.value.set(gsap.utils.clamp(0, 1, (pointer.x - left) / item.width),
            gsap.utils.clamp(0, 1, 1 - (pointer.y - item.top) / item.height));
        } else {
          // Translate within the oversized image, matching the original DOM gallery.
          const scale = 1 / p.uvScale;
          const maxShift = (scale - 1) * item.width / 2;
          const shift = reduced ? 0 : gsap.utils.clamp(-maxShift, maxShift, -distance * item.width * p.parallaxIntensity * p.shaderMultiplier);
          item.image.style.transform = `translate3d(${shift}px, 0, 0) scale(${scale})`;
        }
      });
      gl?.render(scene, camera);
      const percent = Math.round((scroll.limit ? scroll.current / scroll.limit : 0) * 100);
      if (percent !== lastProgress) { lastProgress = percent; setProgress(percent); }
      if (moving) schedule();
    };

    const observer = new ResizeObserver(measure);
    const setup = async () => {
      const elements = Array.from(track.querySelectorAll<HTMLElement>(".gallery-frame"));
      await Promise.all(elements.map(async element => {
        const image = element.querySelector("img")!;
        try { await image.decode(); } catch { /* Keep a visible fallback for a broken image. */ }
        if (disposed) return;
        let texture: THREE.Texture | null = null;
        let material: THREE.ShaderMaterial | null = null;
        let mesh: THREE.Mesh | null = null;
        if (gl && image.naturalWidth) {
          texture = await loader.loadAsync(image.src);
          if (disposed) { texture.dispose(); return; }
          material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: {
            uTexture: { value: texture }, uResolution: { value: new THREE.Vector2(1, 1) },
            uImageResolution: { value: new THREE.Vector2(image.naturalWidth, image.naturalHeight) },
            uParallax: { value: 0 }, uUvScale: { value: settings.uvScale }, uShaderMultiplier: { value: 1 },
            uTime: { value: 0 }, uHoverProgress: { value: 0 }, uMousePosition: { value: new THREE.Vector2(0.5, 0.5) },
            uHoverDistortionStrength: { value: 0.06 }, uGrainStrength: { value: 0.08 },
            uEffectRadius: { value: 0.45 }, uEffectType: { value: -1 },
          } });
          mesh = new THREE.Mesh(geometry, material); scene.add(mesh);
        }
        media.push({ element, image, left: 0, top: 0, width: 0, height: 0, texture, material, mesh, progress: 0 });
      }));
      if (disposed) return;
      // Texture downloads can finish in any order; frame indices must follow the project.
      media.sort((a, b) => elements.indexOf(a.element) - elements.indexOf(b.element));
      elements.forEach(element => observer.observe(element));
      measure();
      stage.dataset.ready = "true";
      setStatus(gl || settings.mode === "dom" ? "ready" : "fallback");
      initialized = true;
      render();
    };
    setStatus("loading");
    stage.dataset.ready = "false";
    setup().catch(() => {
      if (disposed) return;
      stage.dataset.renderer = "dom";
      setStatus("fallback");
    });
    observer.observe(stage); observer.observe(track);
    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("pointermove", onPointerMove);
    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointerup", onPointerUp);
    stage.addEventListener("pointercancel", onPointerUp);
    stage.addEventListener("pointerleave", onPointerLeave);
    stage.addEventListener("keydown", onKeyDown);
    reducedQuery.addEventListener("change", onMotionChange);
    return () => {
      disposed = true; cancelAnimationFrame(animationFrame); observer.disconnect();
      seekRef.current = () => {};
      redrawRef.current = () => {};
      stage.removeEventListener("wheel", onWheel); stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerdown", onPointerDown); stage.removeEventListener("pointerup", onPointerUp);
      stage.removeEventListener("pointercancel", onPointerUp); stage.removeEventListener("pointerleave", onPointerLeave);
      stage.removeEventListener("keydown", onKeyDown); reducedQuery.removeEventListener("change", onMotionChange);
      media.forEach(item => { item.material?.dispose(); item.texture?.dispose(); item.image.style.transform = ""; });
      geometry.dispose(); gl?.dispose(); track.style.transform = "";
    };
    // Only new image sources or a render-mode change require a new renderer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageKey, settings.mode]);

  const style = { "--frame-height": `${settings.height}%`, "--frame-aspect": settings.aspect,
    "--gallery-gap": `${settings.gap}px`, background: settings.background } as CSSProperties;
  return <div className="gallery-preview">
    <div ref={stageRef} className="gallery-stage" style={style} tabIndex={0} role="region" aria-label="画廊预览，用滚轮、拖动或左右方向键浏览">
      <div ref={trackRef} className="gallery-track">
        {images.map((image, index) => <div className="gallery-frame" key={image.id}>
          <img src={image.src} alt={image.name} draggable={false} />
          <span className="gallery-caption">{String(index + 1).padStart(2, "0")}<span>{image.name}</span></span>
        </div>)}
      </div>
      <canvas ref={canvasRef} aria-label="WebGL 画廊效果" />
      {!images.length && <div className="stage-empty"><span>你的画廊，从第一张图片开始。</span><small>点击「上传图片」，或把图片拖到编辑面板。</small></div>}
      {status === "loading" && images.length > 0 && <div className="stage-loading" role="status">正在准备图片…</div>}
      {status === "fallback" && <div className="stage-notice">WebGL 未能加载，正在显示普通图片。可切换到 2D 视差继续编辑。</div>}
      {motionReduced && <div className="stage-notice">系统已开启减少动态效果；悬停动画已关闭。</div>}
    </div>
    <div className="preview-bottom"><span>滚轮浏览 <b>·</b> 拖动切换 <b>·</b> 悬停查看效果</span><span>{String(progress).padStart(2, "0")} / 100</span></div>
    <div className="preview-progress"><span style={{ width: `${progress}%` }} /></div>
  </div>;
}
