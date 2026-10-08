"""Run against a running editor: python tests/editor-browser.py [URL]."""
import io
import json
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright, expect

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000/"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "outputs"
OUT.mkdir(exist_ok=True)


def saved(page):
    expect(page.get_by_role("status").filter(has_text="已自动保存到本机")).to_be_visible(timeout=15000)


def ready(page):
    page.locator('.gallery-stage[data-ready="true"]').wait_for(timeout=20000)


def range_value(page, name, value):
    page.get_by_role("slider", name=name, exact=True).evaluate("""(el, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
        el.dispatchEvent(new Event('input', {bubbles:true}));
        el.dispatchEvent(new Event('change', {bubbles:true}));
    }""", str(value))


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--enable-unsafe-swiftshader"])
    context = browser.new_context(viewport={"width": 1440, "height": 960}, accept_downloads=True)
    page = context.new_page()
    page.set_default_timeout(60000)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(URL, wait_until="networkidle")
    ready(page)
    expect(page.locator(".gallery-frame")).to_have_count(7)
    assert page.locator(".gallery-stage").get_attribute("data-renderer") == "webgl"
    assert page.evaluate("document.documentElement.scrollHeight <= innerHeight")
    page.screenshot(path=str(OUT / "editor-desktop.png"), full_page=True)
    print("PASS initial WebGL render and desktop layout", flush=True)

    page.get_by_label("画廊名称", exact=True).fill("我的测试作品")
    saved(page)
    page.reload(wait_until="networkidle")
    expect(page.get_by_label("画廊名称", exact=True)).to_have_value("我的测试作品")
    page.get_by_label("上传画廊图片", exact=True).set_input_files(str(ROOT / "public/gallery/neon-2.webp"))
    expect(page.locator(".image-row")).to_have_count(8)
    saved(page)
    page.get_by_role("button", name="前移 neon-2.webp", exact=True).click()
    expect(page.locator(".image-row").nth(6)).to_contain_text("neon-2.webp")
    page.get_by_label("替换选中图片", exact=True).set_input_files(str(ROOT / "public/gallery/neon-3.webp"))
    expect(page.locator(".image-row").nth(6)).to_contain_text("neon-3.webp")
    saved(page)
    page.reload(wait_until="networkidle")
    expect(page.locator(".image-row")).to_have_count(8)
    expect(page.locator(".image-row").nth(6)).to_contain_text("neon-3.webp")
    page.get_by_role("button", name="删除 neon-3.webp", exact=True).click()
    expect(page.locator(".image-row")).to_have_count(7)
    print("PASS upload, replace, reorder, delete and reload persistence", flush=True)

    page.get_by_role("button", name="添加原版霓虹示例", exact=True).click()
    expect(page.locator(".image-row")).to_have_count(17)
    page.get_by_role("button", name="定位 霓虹人像 01", exact=True).click()
    page.get_by_role("tab", name="特效", exact=True).click()
    ready(page)
    range_value(page, "扭曲强度", 0.16)
    range_value(page, "颗粒强度", 0.12)
    page.wait_for_timeout(1300)
    stage = page.locator(".gallery-stage").bounding_box()
    cx, cy = stage["x"] + stage["width"] / 2, stage["y"] + stage["height"] / 2
    clip = {"x": cx - 100, "y": cy - 100, "width": 200, "height": 200}
    deltas = {}
    for name in ["噪声扰动", "RGB 色散", "波纹", "柔和扭曲", "胶片颗粒", "马赛克", "放大镜"]:
        page.locator(".effect-grid").get_by_role("button", name="无悬停效果").click()
        page.mouse.move(cx, cy)
        page.wait_for_timeout(350)
        baseline = page.screenshot(clip=clip)
        page.locator(".effect-grid").get_by_role("button", name=name).click()
        page.mouse.move(cx, cy)
        page.wait_for_timeout(500)
        effect = page.screenshot(clip=clip)
        diff = ImageChops.difference(Image.open(io.BytesIO(baseline)).convert("RGB"), Image.open(io.BytesIO(effect)).convert("RGB"))
        delta = sum(ImageStat.Stat(diff).mean)
        assert delta > 0.08, f"{name} did not visibly change pixels: {delta}"
        deltas[name] = round(delta, 3)
    page.screenshot(path=str(OUT / "editor-effects.png"), full_page=True)
    page.get_by_role("button", name="应用到所有图片", exact=True).click()
    expect(page.locator(".image-row")).to_have_count(0)  # image tab is unmounted
    saved(page)
    print("PASS seven shader effects produce visible changes: " + json.dumps(deltas, ensure_ascii=True), flush=True)

    page.get_by_role("button", name="2D 横向视差", exact=True).click()
    ready(page)
    assert page.locator(".gallery-stage").get_attribute("data-renderer") == "dom"
    stage = page.locator(".gallery-stage").bounding_box()
    page.mouse.move(stage["x"] + 150, stage["y"] + 120)
    before = page.locator(".gallery-track").evaluate("el => getComputedStyle(el).transform")
    page.mouse.wheel(0, 600)
    page.wait_for_timeout(500)
    assert before != page.locator(".gallery-track").evaluate("el => getComputedStyle(el).transform")
    assert "scale(" in page.locator(".gallery-frame img").first.get_attribute("style")
    # Scrolling the editor controls must not move the gallery.
    settled = page.locator(".gallery-track").evaluate("el => new DOMMatrix(getComputedStyle(el).transform).m41")
    page.locator(".panel-body").hover()
    page.mouse.wheel(0, 350)
    page.wait_for_timeout(1200)
    after = page.locator(".gallery-track").evaluate("el => new DOMMatrix(getComputedStyle(el).transform).m41")
    # The remaining inertia may finish, but it cannot advance by another wheel delta.
    assert abs(settled - after) < 100
    page.get_by_role("button", name="WebGL 特效", exact=True).click()
    ready(page)
    print("PASS DOM parallax and isolated wheel controls", flush=True)

    page.get_by_role("tab", name="外观", exact=True).click()
    range_value(page, "图片间距", 40)
    page.get_by_label("画框比例", exact=True).select_option("0.75")
    saved(page)
    page.get_by_role("button", name="预览画廊", exact=True).click()
    expect(page.locator(".editor-panel")).not_to_be_visible()
    page.keyboard.press("Escape")
    expect(page.locator(".editor-panel")).to_be_visible()
    with page.expect_download() as download:
        page.get_by_role("button", name="导出备份", exact=True).click()
    backup = OUT / "test-backup.json"
    download.value.save_as(str(backup))
    payload = json.loads(backup.read_text(encoding="utf-8"))
    assert len(payload["images"]) == 17
    assert all(image["src"].startswith("data:image/") for image in payload["images"])
    assert all(image["effect"] == 6 for image in payload["images"])
    print("PASS appearance, full-screen preview and portable backup", flush=True)

    # Restore the same portable backup in a new browser context.
    imported_context = browser.new_context(viewport={"width": 1440, "height": 960})
    imported = imported_context.new_page()
    imported.goto(URL, wait_until="networkidle")
    saved(imported)
    imported.get_by_label("导入画廊备份", exact=True).set_input_files(str(backup))
    expect(imported.locator(".image-row")).to_have_count(17)
    expect(imported.get_by_label("画廊名称", exact=True)).to_have_value("我的测试作品")
    saved(imported)
    bad = OUT / "invalid-backup.json"
    bad.write_text('{"version": 100}', encoding="utf-8")
    imported.get_by_label("导入画廊备份", exact=True).set_input_files(str(bad))
    expect(imported.get_by_role("alert")).to_be_visible()
    expect(imported.locator(".image-row")).to_have_count(17)
    invalid_image = OUT / "invalid-image.txt"
    invalid_image.write_text("not an image")
    imported.get_by_label("上传画廊图片", exact=True).set_input_files(str(invalid_image))
    expect(imported.get_by_role("alert")).to_contain_text("请选择")
    expect(imported.locator(".image-row")).to_have_count(17)
    imported_context.close()
    print("PASS fresh-browser import and rejected invalid files", flush=True)

    mobile_context = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    mobile = mobile_context.new_page()
    mobile.goto(URL, wait_until="networkidle")
    ready(mobile)
    assert mobile.evaluate("document.documentElement.scrollWidth <= innerWidth")
    mobile.screenshot(path=str(OUT / "editor-mobile.png"), full_page=True)
    box = mobile.locator(".gallery-stage").bounding_box()
    mobile.mouse.move(box["x"] + box["width"] * .8, box["y"] + box["height"] / 2)
    mobile.mouse.down()
    mobile.mouse.move(box["x"] + box["width"] * .2, box["y"] + box["height"] / 2, steps=10)
    mobile.mouse.up()
    mobile.wait_for_timeout(500)
    assert mobile.locator(".gallery-track").evaluate("el => getComputedStyle(el).transform") != "matrix(1, 0, 0, 1, 0, 0)"
    mobile_context.close()
    print("PASS mobile layout and drag navigation", flush=True)
    assert not errors, errors
    context.close()
    browser.close()
    print("All browser checks passed.", flush=True)
