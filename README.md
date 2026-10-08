# 视差工坊 · Parallax Studio

可直接上传图片的中文画廊编辑网站，基于 Xian Horizontal Parallax Gallery 改造。

在线编辑：https://opc8838-hub.github.io/xiaoguo-/

## 使用

1. 在「图片」面板点击 **上传图片**，也可以一次选多张或拖入图片。
2. 点击缩略图选中图片；列表右侧调整顺序或删除，下面的按钮替换图片。
3. 在「特效」中逐张选择噪声扰动、RGB 色散、波纹、柔和扭曲、胶片颗粒、马赛克和放大镜。
4. 切换 **WebGL 特效 / 2D 横向视差**，滚轮、拖动或左右方向键浏览；鼠标移到图片上查看悬停效果。
5. 在「外观」调整间距、高度、比例和背景。点击 **预览画廊** 隐藏面板，按 Esc 返回编辑。
6. 可点击 **添加原版霓虹示例** 加入 Codrops 原版图片。

图片和参数自动保存到当前浏览器的 IndexedDB。等待页顶显示「已自动保存到本机」后再关闭。网站不会将你上传的照片发送到服务器。不同浏览器、电脑、本地网址和线上网址的草稿互相独立；清除浏览器数据会清除草稿。

**导出备份**会下载一个包含全部图片和参数的 JSON 文件。另一台电脑打开网站，**导入备份**即可继续编辑。导入会替换当前草稿。恢复示例前会再次确认。

支持 PNG、JPG、WebP、GIF、AVIF，每张不超过 20 MB，一个画廊最多 100 张。WebGL 对 GIF 使用静态纹理；系统开启减少动态效果时关闭悬停动画。WebGL 不可用时可继续使用 2D 画廊。图片本身的光影属于原图，编辑器处理视差与悬停效果。

## 本地运行

需要 Node.js 22.13 或更新版本。Windows、macOS、Linux 使用相同命令：

```sh
npm install
npm run dev
```

打开终端显示的地址，默认 `http://localhost:3000/`。

## 构建与验证

```sh
npm test
npx tsc --noEmit
npm run build
```

`npm test` 校验备份数据、构建静态网站并检查发布子路径及资源。
`npm run build` 保留现有 vinext 服务端构建。
`npm run build:pages` 生成 `dist-pages`，推送 main 后 GitHub Actions 自动发布 GitHub Pages。

浏览器流程测试（需运行中的网站）：

```sh
python -m pip install playwright Pillow
python -m playwright install chromium
python tests/editor-browser.py http://localhost:3000/
```

测试截图和备份写入忽略的 `outputs/`，不会上传到仓库。

## 来源与许可

- [Xian Horizontal Parallax Gallery](https://github.com/xianxie6/xian-horizontal-parallax-gallery)：原项目、七张人像习作与七种悬停着色器。人像作品 © 2026 Xian。
- [David Faure / Codrops](https://github.com/davidfaure/horizontal-parallax-gallery-codrops)：2D 与 WebGL 横向视差技术、霓虹示例图（原仓库注明由 Midjourney 生成）。
- [Codrops 教程](https://tympanus.net/codrops/2026/02/19/creating-a-smooth-horizontal-parallax-gallery-from-dom-to-webgl/)。

原 MIT 许可和版权声明保留在 LICENSE 中。
