"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { HorizontalGallery } from "./horizontal-gallery";
import { createProject, defaultSettings, effects, loadProject, parseProject, portableProject, readImage,
  saveProject, settingRanges, type GalleryImage, type GalleryProject, type GallerySettings } from "./gallery-project";

function Icon({ name }: { name: "upload" | "arrow" | "plus" | "expand" | "close" | "download" }) {
  const paths = { upload: "M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6", arrow: "M5 12h14m-6-6 6 6-6 6",
    plus: "M12 5v14M5 12h14", expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
    close: "m6 6 12 12M6 18 18 6", download: "M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4" };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
type NumericSetting = keyof typeof settingRanges;
const controls: { key: NumericSetting; label: string; hint?: string }[] = [
  { key: "parallaxIntensity", label: "视差强度" }, { key: "uvScale", label: "图片缩放", hint: "数值越小，图片放大越多" },
  { key: "shaderMultiplier", label: "视差倍率" }, { key: "scrollEase", label: "滚动跟随速度" },
];
const hoverControls: { key: NumericSetting; label: string }[] = [
  { key: "hoverDistortionStrength", label: "扭曲强度" }, { key: "grainStrength", label: "颗粒强度" },
  { key: "effectRadius", label: "效果范围" }, { key: "hoverTransitionSpeed", label: "过渡速度" },
];

export function GalleryEditor({ basePath = "/" }: { basePath?: string }) {
  const [project, setProject] = useState<GalleryProject>(() => createProject(basePath));
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState("正在读取草稿");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState("sample-0");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [tab, setTab] = useState<"images" | "effects" | "layout">("images");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const revision = useRef(0);
  const saveQueue = useRef(Promise.resolve());
  const selected = project.images.find(image => image.id === selectedId) ?? project.images[0];

  useEffect(() => {
    let cancelled = false;
    loadProject().then(saved => {
      if (cancelled) return;
      if (saved) { setProject(saved); setSelectedId(saved.images[0]?.id ?? ""); }
    }).catch(() => {
      if (!cancelled) setError("无法读取本机草稿。你仍可以编辑，并导出备份。");
    }).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const current = ++revision.current;
    setSaveState("有未保存的修改");
    const timer = setTimeout(() => {
      setSaveState("正在保存");
      // Serialize writes so an older upload cannot overwrite a newer edit.
      saveQueue.current = saveQueue.current.catch(() => {}).then(() => saveProject(project));
      saveQueue.current.then(() => {
        if (revision.current === current) setSaveState("已自动保存到本机");
      }).catch(() => {
        if (revision.current === current) { setSaveState("保存失败"); setError("本机存储不可用或空间不足，请导出备份后再继续。"); }
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [project, ready]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPreview(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function setting<K extends keyof GallerySettings>(key: K, value: GallerySettings[K]) {
    setProject(previous => ({ ...previous, settings: { ...previous.settings, [key]: value } }));
  }
  function updateImage(id: string, changes: Partial<GalleryImage>) {
    setProject(previous => ({ ...previous, images: previous.images.map(image => image.id === id ? { ...image, ...changes } : image) }));
  }
  function select(id: string, focus = false) {
    setSelectedId(id);
    if (focus) { setFocusId(null); requestAnimationFrame(() => setFocusId(id)); }
  }
  async function upload(files: FileList | File[], replacementId?: string) {
    if (busy || !files.length) return;
    const list = Array.from(files);
    if (!replacementId && project.images.length + list.length > 100) { setError("一个画廊最多可放 100 张图片。"); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const results = await Promise.all(list.map(async (file, index) => ({
        id: crypto.randomUUID(), src: await readImage(file), name: file.name.slice(0, 200), effect: (project.images.length + index) % 7,
      })));
      if (replacementId) {
        updateImage(replacementId, { src: results[0].src, name: results[0].name });
        setNotice("图片已替换，原来的特效设置已保留。");
      } else {
        setProject(previous => ({ ...previous, images: [...previous.images, ...results] }));
        setSelectedId(results[0].id); setNotice(`已添加 ${results.length} 张图片。`);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "图片上传失败，请重试。"); }
    finally { setBusy(false); }
  }
  function fileChange(event: ChangeEvent<HTMLInputElement>, replacementId?: string) {
    if (event.target.files) void upload(event.target.files, replacementId);
    event.target.value = "";
  }
  function move(id: string, direction: number) {
    setProject(previous => {
      const images = [...previous.images]; const i = images.findIndex(image => image.id === id);
      if (i + direction < 0 || i + direction >= images.length) return previous;
      [images[i], images[i + direction]] = [images[i + direction], images[i]];
      return { ...previous, images };
    });
  }
  function remove(id: string) {
    const images = project.images.filter(image => image.id !== id);
    setProject(previous => ({ ...previous, images }));
    if (id === selectedId) setSelectedId(images[0]?.id ?? "");
  }
  function addNeonSamples() {
    if (project.images.length + 10 > 100) { setError("一个画廊最多可放 100 张图片。"); return; }
    const images = Array.from({ length: 10 }, (_, index) => ({
      id: crypto.randomUUID(), name: `霓虹人像 ${String(index + 1).padStart(2, "0")}`,
      src: `${basePath}gallery/neon-${index + 1}.webp`, effect: index % 7,
    }));
    setProject(previous => ({ ...previous, images: [...previous.images, ...images] }));
    setSelectedId(images[0].id); setNotice("已添加 Codrops 霓虹示例图。原来的图片已保留。");
  }
  async function exportBackup() {
    setBusy(true); setError("");
    try {
      const portable = await portableProject(project);
      const url = URL.createObjectURL(new Blob([JSON.stringify(portable)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url;
      link.download = `${project.title.replace(/[<>:"/\\|?*]/g, "_") || "画廊"}.json`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("备份已导出，包含所有图片和参数。可在另一台电脑导入继续编辑。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "导出失败，请重试。"); }
    finally { setBusy(false); }
  }
  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setBusy(true); setError("");
    try {
      if (file.size > 150 * 1024 * 1024) throw new Error("备份文件请控制在 150 MB 以内。");
      const imported = parseProject(JSON.parse(await file.text()));
      imported.images = imported.images.map(image => image.src.startsWith("data:") ? image :
        { ...image, src: `${basePath}gallery/${image.src.split("/").pop()}` });
      await Promise.all(imported.images.map(async image => {
        const probe = new Image(); probe.src = image.src;
        try { await probe.decode(); }
        catch { throw new Error(`备份中的图片「${image.name}」无法打开，当前画廊已保留。`); }
      }));
      setProject(imported); setSelectedId(imported.images[0]?.id ?? ""); setFocusId(null);
      setNotice("备份已导入。图片与参数已恢复。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "备份读取失败。"); }
    finally { setBusy(false); }
  }
  function slider(key: NumericSetting, label: string, hint?: string) {
    const [min, max, step] = settingRanges[key];
    return <div className="slider-field" key={key}><span><label htmlFor={`setting-${key}`}>{label}</label><output>{Number(project.settings[key].toFixed(3))}</output></span>
      <input id={`setting-${key}`} type="range" min={min} max={max} step={step} value={project.settings[key]} onChange={event => setting(key, Number(event.target.value))} />
      {hint && <small>{hint}</small>}</div>;
  }

  return <main className={`studio ${preview ? "is-preview" : ""}`}>
    <header className="studio-header">
      <a className="brand" href={basePath} aria-label="视差工坊首页"><span className="brand-mark"><i /><i /><i /></span><span>视差工坊<small>PARALLAX STUDIO</small></span></a>
      <div className="header-middle"><span className={`save-dot ${saveState === "保存失败" ? "error" : ""}`} /><span role="status">{saveState}</span></div>
      <div className="header-actions"><button className="text-button" disabled={busy || !ready} onClick={() => importRef.current?.click()}>导入备份</button>
        <button className="button secondary" disabled={busy || !ready} onClick={() => void exportBackup()}><Icon name="download" />导出备份</button>
        <button className="button primary" onClick={() => setPreview(true)}><Icon name="expand" />预览画廊</button></div>
    </header>
    <section className="workspace" aria-label="画廊编辑工作区">
      <section className="canvas-panel">
        <div className="canvas-heading"><div><span className="eyebrow">你的图片，你的动态</span><h1>{project.title}</h1></div><span className="image-count">{String(project.images.length).padStart(2, "0")} 张图片</span></div>
        <div className="canvas-toolbar"><div className="mode-switch" role="group" aria-label="画廊模式">
          <button aria-pressed={project.settings.mode === "webgl"} onClick={() => setting("mode", "webgl")}>WebGL 特效</button>
          <button aria-pressed={project.settings.mode === "dom"} onClick={() => setting("mode", "dom")}>2D 横向视差</button>
        </div><span className="live-label"><i />实时预览</span></div>
        <HorizontalGallery images={project.images} settings={project.settings} focusId={focusId} onSelect={id => select(id)} />
        <div className="filmstrip" aria-label="图片缩略图">{project.images.map((image, index) =>
          <button key={image.id} className={selected?.id === image.id ? "active" : ""} aria-label={`定位 ${image.name}`}
            aria-pressed={selected?.id === image.id} onClick={() => select(image.id, true)}><img src={image.src} alt="" /><span>{String(index + 1).padStart(2, "0")}</span></button>)}
          <button className="filmstrip-add" aria-label="添加图片" disabled={busy || !ready} onClick={() => uploadRef.current?.click()}><Icon name="plus" /></button></div>
        <footer className="canvas-footer"><span>让静止的画面，多一点呼吸。</span><a href="https://github.com/opc8838-hub/xiaoguo-" target="_blank" rel="noreferrer">项目源码 <Icon name="arrow" /></a></footer>
      </section>
      <aside className="editor-panel" aria-label="编辑面板">
        <div className="panel-heading"><div><span className="eyebrow">EDITOR</span><h2>编辑画廊</h2></div><span className="panel-counter">01 — 03</span></div>
        <div className="editor-tabs" role="tablist" aria-label="编辑分类">{([['images', '图片'], ['effects', '特效'], ['layout', '外观']] as const).map(([value, label]) =>
          <button key={value} id={`tab-${value}`} role="tab" aria-selected={tab === value} aria-controls={`panel-${value}`} onClick={() => setTab(value)}>{label}</button>)}</div>
        <div className="panel-body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {(error || notice) && <div className={`feedback ${error ? "feedback-error" : ""}`} role={error ? "alert" : "status"}><span>{error || notice}</span>
            <button aria-label="关闭提示" onClick={() => { setError(""); setNotice(""); }}><Icon name="close" /></button></div>}
          {tab === "images" && <>
            <label className="text-field">画廊名称<input value={project.title} maxLength={100} disabled={!ready} onChange={event => setProject(previous => ({ ...previous, title: event.target.value }))} /></label>
            <div className={`upload-zone ${dragOver ? "drag-over" : ""}`} onDragOver={event => { event.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)} onDrop={event => { event.preventDefault(); setDragOver(false); if (ready) void upload(event.dataTransfer.files); }}>
              <Icon name="upload" /><strong>把你的图片放进来</strong><span>拖到这里，或点击按钮选择</span>
              <button className="button primary" disabled={busy || !ready} onClick={() => uploadRef.current?.click()}>{busy ? "正在处理…" : "上传图片"}<Icon name="plus" /></button>
              <small>PNG / JPG / WebP / GIF / AVIF · 每张 ≤ 20 MB</small></div>
            <button className="text-button sample-button" disabled={!ready || busy} onClick={addNeonSamples}>添加原版霓虹示例 <Icon name="plus" /></button>
            <div className="section-title"><h3>图片列表</h3><span>{project.images.length} / 100</span></div>
            {!project.images.length && <p className="muted">上传第一张图片，开始编辑。</p>}
            <div className="image-list">{project.images.map((image, index) => <article className={`image-row ${selected?.id === image.id ? "selected" : ""}`} key={image.id}>
              <button className="image-select" aria-label={`编辑 ${image.name}`} onClick={() => select(image.id, true)}><img src={image.src} alt="" /><span><strong>{image.name}</strong><small>{String(index + 1).padStart(2, "0")} / {effects.find(effect => effect.value === image.effect)?.name}</small></span></button>
              <div className="row-actions"><button aria-label={`前移 ${image.name}`} disabled={index === 0} onClick={() => move(image.id, -1)}>↑</button>
                <button aria-label={`后移 ${image.name}`} disabled={index === project.images.length - 1} onClick={() => move(image.id, 1)}>↓</button>
                <button aria-label={`删除 ${image.name}`} onClick={() => remove(image.id)}><Icon name="close" /></button></div></article>)}</div>
            {selected && <div className="selected-image-tools"><span>当前选中：{selected.name}</span><div><button className="button secondary" disabled={busy} onClick={() => replaceRef.current?.click()}>替换这张图片</button>
              <button className="text-button" onClick={() => setTab("effects")}>设置特效 <Icon name="arrow" /></button></div></div>}
          </>}
          {tab === "effects" && <>
            <div className="section-title"><h3>这张图片的悬停效果</h3><span>逐张设置</span></div>
            {selected ? <><div className="effect-selected"><img src={selected.src} alt="" /><span><strong>{selected.name}</strong><small>点击底部缩略图，切换要编辑的图片</small></span></div>
              <div className="effect-grid">{effects.map(effect => <button key={effect.value} className={selected.effect === effect.value ? "active" : ""} aria-pressed={selected.effect === effect.value} onClick={() => updateImage(selected.id, { effect: effect.value })}><span>{effect.value < 0 ? "—" : String(effect.value + 1).padStart(2, "0")}</span>{effect.name}</button>)}</div>
              <p className="effect-description">{effects.find(effect => effect.value === selected.effect)?.detail}</p>
              <button className="text-button apply-all" onClick={() => { setProject(previous => ({ ...previous, images: previous.images.map(image => ({ ...image, effect: selected.effect })) })); setNotice("所有图片已使用当前特效。"); }}>应用到所有图片 <Icon name="arrow" /></button>
            </> : <p className="muted">先上传一张图片，再选择特效。</p>}
            {project.settings.mode === "dom" && <p className="mode-note">2D 模式显示横向视差。切换到 WebGL，即可预览下面的悬停效果。</p>}
            <div className="section-title separated"><h3>横向视差</h3><span>全局参数</span></div>
            {controls.map(control => slider(control.key, control.label, control.hint))}
            <div className="section-title separated"><h3>悬停细节</h3></div>{hoverControls.map(control => slider(control.key, control.label))}
            <button className="text-button reset-parameters" onClick={() => { setProject(previous => ({ ...previous, settings: { ...previous.settings, ...Object.fromEntries([...controls, ...hoverControls].map(({ key }) => [key, defaultSettings[key]])) } })); }}>恢复默认特效参数</button>
          </>}
          {tab === "layout" && <>
            <div className="section-title"><h3>画面布局</h3><span>实时生效</span></div>
            {slider("height", "图片高度", "占预览区域的百分比")}{slider("gap", "图片间距", "单位：像素")}
            <label className="text-field">画框比例<select aria-label="画框比例" value={project.settings.aspect} onChange={event => setting("aspect", Number(event.target.value))}>
              <option value={4 / 3}>4:3 · 经典画廊</option><option value={1}>1:1 · 正方形</option><option value={3 / 4}>3:4 · 竖幅人像</option><option value={16 / 9}>16:9 · 宽屏</option><option value={2 / 3}>2:3 · 竖幅摄影</option>
              {![4 / 3, 1, 3 / 4, 16 / 9, 2 / 3].includes(project.settings.aspect) && <option value={project.settings.aspect}>自定义比例</option>}</select></label>
            <label className="color-field">画廊背景<div><input type="color" aria-label="画廊背景" value={project.settings.background} onChange={event => setting("background", event.target.value)} /><span>{project.settings.background.toUpperCase()}</span></div></label>
            <div className="editor-tip"><span>编辑小提示</span><p>图片会居中裁切填满画框。换成竖幅比例，可以展示更多人像；在「特效」中调整图片缩放，还能改变裁切范围。</p></div>
            <div className="section-title separated"><h3>本机草稿</h3></div><p className="muted">图片和参数自动保存在当前浏览器。换电脑前请导出备份；清除浏览器数据会清除草稿。</p>
            {!confirmReset ? <button className="text-button reset-parameters" onClick={() => setConfirmReset(true)}>恢复示例画廊</button> : <div className="reset-confirm"><p>将替换当前图片和参数。需要保留作品，请先导出备份。</p><button className="button secondary" onClick={() => setConfirmReset(false)}>取消</button><button className="button danger" onClick={() => { setProject(createProject(basePath)); setSelectedId("sample-0"); setConfirmReset(false); setNotice("已恢复示例画廊。"); }}>确认恢复</button></div>}
          </>}
        </div>
        <div className="panel-footer"><span className="save-dot" /><span>修改后自动保存 · 无需改代码</span></div>
      </aside>
    </section>
    {preview && <><button className="exit-preview button secondary" onClick={() => setPreview(false)}><Icon name="close" />返回编辑<span>Esc</span></button><div className="preview-title">{project.title}</div></>}
    <input className="visually-hidden" tabIndex={-1} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" multiple ref={uploadRef} aria-label="上传画廊图片" onChange={event => fileChange(event)} />
    <input className="visually-hidden" tabIndex={-1} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" ref={replaceRef} aria-label="替换选中图片" onChange={event => fileChange(event, selected?.id)} />
    <input className="visually-hidden" tabIndex={-1} type="file" accept="application/json,.json" ref={importRef} aria-label="导入画廊备份" onChange={event => void importBackup(event)} />
  </main>;
}
