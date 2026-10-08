export const effects = [
  { value: -1, name: "无悬停效果", detail: "保留原图，只显示横向视差。" },
  { value: 0, name: "噪声扰动", detail: "鼠标周围出现细腻的流动纹理。" },
  { value: 1, name: "RGB 色散", detail: "红绿蓝通道随鼠标轻微分离。" },
  { value: 2, name: "波纹", detail: "鼠标周围出现连续的波浪起伏。" },
  { value: 3, name: "柔和扭曲", detail: "大块柔和噪声使局部画面流动。" },
  { value: 4, name: "胶片颗粒", detail: "局部动态颗粒与轻微图像扰动。" },
  { value: 5, name: "马赛克", detail: "鼠标周围的图像变成像素方块。" },
  { value: 6, name: "放大镜", detail: "鼠标周围的图像局部放大。" },
] as const;

export type GalleryImage = { id: string; name: string; src: string; effect: number };
export type GallerySettings = {
  mode: "webgl" | "dom";
  parallaxIntensity: number;
  uvScale: number;
  shaderMultiplier: number;
  hoverDistortionStrength: number;
  grainStrength: number;
  effectRadius: number;
  hoverTransitionSpeed: number;
  scrollEase: number;
  gap: number;
  height: number;
  aspect: number;
  background: string;
};
export type GalleryProject = {
  version: 1;
  title: string;
  images: GalleryImage[];
  settings: GallerySettings;
};

export const defaultSettings: GallerySettings = {
  mode: "webgl", parallaxIntensity: 0.4, uvScale: 0.85, shaderMultiplier: 1,
  hoverDistortionStrength: 0.06, grainStrength: 0.08, effectRadius: 0.45,
  hoverTransitionSpeed: 0.08, scrollEase: 0.07, gap: 24, height: 68,
  aspect: 4 / 3, background: "#090909",
};

export function createProject(basePath = "/"): GalleryProject {
  return {
    version: 1, title: "我的视差画廊", settings: { ...defaultSettings },
    images: Array.from({ length: 7 }, (_, i) => ({
      id: `sample-${i}`, name: `人像习作 ${String(i + 1).padStart(2, "0")}`,
      src: `${basePath}gallery/${String(i + 1).padStart(2, "0")}.png`, effect: i,
    })),
  };
}

export const settingRanges = {
  parallaxIntensity: [0, 1, 0.01], uvScale: [0.7, 1, 0.01],
  shaderMultiplier: [0, 2, 0.1], hoverDistortionStrength: [0, 0.2, 0.005],
  grainStrength: [0, 0.3, 0.005], effectRadius: [0.1, 1, 0.01],
  hoverTransitionSpeed: [0.02, 0.3, 0.01], scrollEase: [0.02, 0.2, 0.01],
  gap: [0, 80, 1], height: [30, 90, 1], aspect: [0.5, 2, 0.01],
} as const;

export function parseProject(value: unknown): GalleryProject {
  const invalid = () => { throw new Error("这不是有效的画廊备份文件。"); };
  if (!value || typeof value !== "object") return invalid();
  const p = value as GalleryProject;
  if (p.version !== 1 || typeof p.title !== "string" || p.title.length > 100 ||
    !Array.isArray(p.images) || p.images.length > 100 || !p.settings) return invalid();
  if (p.settings.mode !== "dom" && p.settings.mode !== "webgl") return invalid();
  if (typeof p.settings.background !== "string" || !/^#[0-9a-f]{6}$/i.test(p.settings.background)) return invalid();
  for (const key of Object.keys(settingRanges) as (keyof typeof settingRanges)[]) {
    const v = p.settings[key];
    const [min, max] = settingRanges[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) return invalid();
  }
  const ids = new Set<string>();
  for (const image of p.images) {
    if (!image || typeof image.id !== "string" || !image.id || ids.has(image.id) ||
      typeof image.name !== "string" || image.name.length > 200 ||
      typeof image.src !== "string" || image.src.length > 30_000_000 ||
      !(/^(?:\/|\.\/)?(?:[\w-]+\/)*gallery\/[\w.-]+\.(?:png|jpg|jpeg|webp|avif)$/i.test(image.src) ||
        /^data:image\/(?:png|jpeg|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i.test(image.src)) ||
      !Number.isInteger(image.effect) || image.effect < -1 || image.effect > 6) return invalid();
    ids.add(image.id);
  }
  // Return only the supported fields, so imports cannot introduce unknown options.
  return { version: 1, title: p.title, images: p.images.map(({ id, name, src, effect }) => ({ id, name, src, effect })),
    settings: { ...defaultSettings, ...Object.fromEntries(Object.keys(defaultSettings).map(key => [key, p.settings[key as keyof GallerySettings]])) } };
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("parallax-studio", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("projects");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("请关闭其他画廊窗口后重试。"));
  });
}

export async function loadProject(): Promise<GalleryProject | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("projects").objectStore("projects").get("current");
      request.onsuccess = () => {
        try { resolve(request.result ? parseProject(request.result) : null); }
        catch (error) { reject(error); }
      };
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function saveProject(project: GalleryProject) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("projects", "readwrite");
      transaction.objectStore("projects").put(project, "current");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

export function readImage(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type)) return Promise.reject(new Error("请选择 PNG、JPG、WebP、GIF 或 AVIF 图片。"));
  if (file.size > 20 * 1024 * 1024) return Promise.reject(new Error("单张图片请控制在 20 MB 以内。"));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败，请重新选择。"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("这张图片无法打开，请检查图片格式。"));
      image.onload = () => resolve(reader.result as string);
      image.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export async function portableProject(project: GalleryProject): Promise<GalleryProject> {
  const images = await Promise.all(project.images.map(async image => {
    if (image.src.startsWith("data:")) return image;
    const response = await fetch(image.src);
    if (!response.ok) throw new Error("示例图片读取失败，请稍后重新导出。");
    const blob = await response.blob();
    return { ...image, src: await readImage(new File([blob], image.name, { type: blob.type })) };
  }));
  return { ...project, images };
}
