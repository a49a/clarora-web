// 浏览器交互检查(Playwright):手机布局、键盘导航、教程切换、下载交互。
// 用法:npm run build && npm run check:browser
// 本地需要 npx playwright install chromium;CI 在 pages.yml 中安装。
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "dist");
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };
const allowed = new Set(["/index.html", "/guide.html", "/guide.css", "/guide.js", "/styles.css", "/site.js", "/config.js", "/favicon.svg", "/favicon.png", "/apple-touch-icon.png"]);

const server = createServer(async (req, res) => {
  const requested = req.url.split("?")[0].replace(/^\/preview\/clarora-web(?=\/)/, "");
  const url = requested === "/" ? "/index.html" : requested;
  try {
    if (!allowed.has(url)) { res.writeHead(404); res.end(); return; }
    const body = await readFile(path.join(root, url));
    res.writeHead(200, { "Content-Type": types[path.extname(url)] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});

await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

let failures = 0;
const fail = message => { console.error(`✗ ${message}`); failures += 1; };
const pass = message => console.log(`✓ ${message}`);

// 构建元数据:逐平台区分"已发布"与"待发布"的期望,缺失说明 dist 过旧。
let metadata;
try {
  metadata = JSON.parse(await readFile(path.join(root, "release-metadata.json"), "utf8"));
} catch {
  console.error("✗ dist/release-metadata.json 缺失或非法,请先 npm run build");
  process.exit(1);
}
const releasedNames = Object.entries(metadata.platforms)
  .filter(([, p]) => p.status === "released")
  .map(([name]) => name);
const evidence = process.env.CLARORA_BROWSER_EVIDENCE;
const downloads = [];
const handbookChecks = [];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  // Verify the actual new-tab target without downloading large installers.
  await page.context().route("https://github.com/a49a/clarora/releases/download/**", route => route.fulfill({ status: 200, contentType: "text/html", body: "Verified download target" }));

  // 1) 下载交互:已发布平台使用元数据解析出的下载地址并新标签打开;
  //    待发布平台指向构建指南。
  await page.goto(base, { waitUntil: "networkidle" });
  for (const [name, p] of Object.entries(metadata.platforms)) {
    const link = page.locator(`a[data-download="${name}"]`);
    if (p.status === "released") {
      const expected = p.url ?? `https://github.com/a49a/clarora/releases/download/v${metadata.version}/${p.asset_name}`;
      const href = await link.getAttribute("href");
      if (href !== expected) fail(`${name} 下载链接与元数据不一致:${href}`);
      else pass(`${name} 下载链接指向 ${expected.slice(0, 48)}…`);
      if ((await link.getAttribute("target")) !== "_blank") fail(`${name} 下载链接应在新标签页打开`);
      const badge = await page.locator(`[data-status="${name}"]`).innerText();
      if (!badge.includes(p.version) || (p.family === "rn") !== badge.includes("RN") || badge.includes("GPUI")) fail(`${name} 版本或客户端标记不一致:${badge}`);
      const [popup] = await Promise.all([page.waitForEvent("popup"), link.click()]);
      await popup.waitForLoadState();
      if (popup.url() !== expected) fail(`${name} 实际点击未打开固定来源:${popup.url()}`);
      downloads.push({platform: name, url: popup.url(), version: p.version, tag: p.tag, family: p.family, badge});
      await popup.close();
    } else {
      const href = await link.getAttribute("href");
      if (href?.includes("releases/download/")) fail(`${name} 未发布却渲染了安装包链接`);
      else if (href !== "#build-guide") fail(`${name} 待发布但未指向构建指南:${href}`);
      else pass(`${name} 按待发布渲染(指向构建指南)`);
    }
  }

  // 2) 教程切换:构建指南平台标签
  await page.locator("#build-guide").scrollIntoViewIfNeeded();
  const windowsTab = page.locator('[role="tab"][data-platform="windows"]');
  await windowsTab.click();
  await page.waitForTimeout(200);
  const activeTab = await windowsTab.getAttribute("aria-selected");
  if (activeTab !== "true") fail("教程平台切换未更新选中状态");
  else pass("教程平台标签切换正常");

  // 3) 键盘导航:Tab 能把焦点带到下载链接,且焦点可见(从首个已发布平台出发)
  const navPlatform = releasedNames[0] ?? "macos";
  await page.locator(`a[data-download="${navPlatform}"]`).focus();
  await page.keyboard.press("Tab");
  const focusedLabel = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
  if (!focusedLabel) fail("键盘 Tab 后无聚焦元素(检查平台下载链接序列)");
  else pass(`键盘导航可达:${focusedLabel.slice(0, 20)}`);

  // 4) 手机布局:375px 视口无横向溢出
  const mobile = await browser.newPage({ viewport: { width: 375, height: 720 } });
  await mobile.goto(base, { waitUntil: "networkidle" });
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 1) fail(`手机布局存在 ${overflow}px 横向溢出`);
  else pass("手机布局无横向溢出");

  // Actual handbook navigation, filtering, clipboard, narrow layouts and no-JS.
  const guideErrors = [];
  page.on("pageerror", error => guideErrors.push(error.message));
  page.on("response", response => { if (response.url().startsWith(base) && response.status() >= 400) guideErrors.push(`${response.status()} ${response.url()}`); });
  await page.goto(base);
  await page.locator("[data-guide-entry]").first().click();
  await page.waitForURL("**/guide.html");
  if (!(await page.locator("#quick-start").isVisible()) || !(await page.locator("#writing").isVisible())) fail("完整手册入口或正文不可用");
  else handbookChecks.push("首页入口到完整静态手册");
  await page.locator("#guide-search").fill("重复三次");
  if (!(await page.locator("#video").isVisible()) || !(await page.locator("#writing").isHidden())) fail("手册搜索未定位到视频重复操作");
  await page.locator('#guide-contents a[href="#reading"]').click();
  if (await page.locator("#guide-search").inputValue() || !(await page.locator("#reading").isVisible())) fail("搜索后的目录跳转未恢复隐藏章节");
  else handbookChecks.push("搜索与目录跳转恢复正文");
  await page.locator("#guide-search").fill("没有这个操作_xyz");
  if (!(await page.locator("#guide-no-results").isVisible())) fail("无搜索结果未反馈");
  await page.locator("#guide-search").press("Escape");
  if (!(await page.locator("#guide-no-results").isHidden()) || await page.locator("#guide-clear").isEnabled()) fail("Escape 未清除搜索");
  else handbookChecks.push("空结果反馈与键盘清除");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator('[data-copy-code="subtitle-example"]').click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  if (!copied.includes("00:00:00,000 --> 00:00:03,000") || !copied.includes("Small steps make a difference.")) fail("SRT 示例复制内容不完整");
  else handbookChecks.push("SRT 示例实际复制");
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error("clipboard unavailable fixture"); }; });
  await page.locator('[data-copy-code="cards-example"]').click();
  if (!(await page.locator("#guide-copy-status").textContent()).includes("请手动复制") || !(await page.evaluate(() => getSelection().toString())).includes("clear - 清晰的")) fail("复制失败未提供真实手动选择回退");
  else handbookChecks.push("剪贴板不可用的选择回退");
  await mobile.goto(`${base}/guide.html`);
  if (await mobile.locator("#guide-contents").getAttribute("open") !== null) fail("手机目录没有默认收起");
  if (evidence) { await mkdir(evidence, {recursive:true}); await mobile.screenshot({path:path.join(evidence,"guide-mobile-top.png")}); }
  await mobile.locator("#guide-contents summary").click();
  await mobile.locator('#guide-contents a[href="#video"]').click();
  if (!mobile.url().endsWith("#video") || await mobile.locator("#guide-contents").getAttribute("open") !== null) fail("手机目录选择后未进入章节并收起");
  else handbookChecks.push("手机目录展开、选择与收起");
  for (const width of [320, 375, 768, 1440]) {
    await mobile.setViewportSize({width, height:800});
    const extra = await mobile.evaluate(() => document.documentElement.scrollWidth-document.documentElement.clientWidth);
    if (extra > 1) fail(`手册 ${width}px 布局横向溢出 ${extra}px`);
  }
  handbookChecks.push("320/375/768/1440px 响应布局");
  const nested = await browser.newPage();
  await nested.goto(`${base}/preview/clarora-web/guide.html#backup`);
  if (!(await nested.locator("#backup").isVisible()) || await nested.locator("#guide-search").isHidden()) fail("子路径下手册正文或脚本不可用");
  await nested.locator('header a[href="./index.html#download"]').click();
  if (!nested.url().includes("/preview/clarora-web/index.html#download")) fail("手册返回下载区的相对路径错误");
  else handbookChecks.push("项目子路径的手册资源与跨页导航");
  await nested.close();
  const guideNoJs = await browser.newPage({javaScriptEnabled:false,reducedMotion:"reduce",viewport:{width:375,height:800}});
  await guideNoJs.goto(`${base}/guide.html#writing`);
  if (!(await guideNoJs.locator("#writing").isVisible()) || !(await guideNoJs.locator("#reading").isVisible()) || !(await guideNoJs.locator(".guide-search-tools").isHidden())) fail("无JS手册正文或渐进增强失效");
  else handbookChecks.push("无JS正文、目录与深链接可用");
  if (guideErrors.length) fail(`手册脚本／资源错误:${guideErrors.join("; ")}`);
  else handbookChecks.push("无脚本错误或本地资源404");
  if (evidence) {
    await page.goto(`${base}/guide.html`); await page.screenshot({path:path.join(evidence,"guide-desktop.png")});
    await page.locator("#video").screenshot({path:path.join(evidence,"guide-video.png")});
    await mobile.setViewportSize({width:375,height:800}); await mobile.locator("#video").screenshot({path:path.join(evidence,"guide-mobile-video.png")});
    await guideNoJs.locator("#writing").screenshot({path:path.join(evidence,"guide-no-js-writing.png")});
  }
  await guideNoJs.close();
  // Restore the original homepage for the existing download screenshots.
  await page.goto(base); await mobile.goto(base);
  pass(`完整手册 ${handbookChecks.length} 组浏览器检查完成`);
  const noJs = await browser.newPage({javaScriptEnabled: false});
  await noJs.goto(base);
  for (const download of downloads) {
    const href = await noJs.locator(`a[data-download="${download.platform}"]`).getAttribute("href");
    const badge = await noJs.locator(`[data-status="${download.platform}"]`).innerText();
    if (href !== download.url || !badge.includes(download.version) || (download.family === "rn") !== badge.includes("RN")) fail(`${download.platform} 无JS版本或来源不一致`);
  }
  const expectedDocs = `${metadata.repository}/blob/HEAD/clarora-gpui/README.md`;
  const docsHref = await noJs.locator("#platform-docs").getAttribute("href");
  if (docsHref !== expectedDocs) fail(`无JS默认桌面说明指向错误文档:${docsHref}`);
  else pass("无JS默认桌面说明指向主版本文档");
  if (evidence) {
    await mkdir(evidence, { recursive: true });
    await page.locator("#download").screenshot({ path: path.join(evidence, "downloads-desktop.png") });
    await mobile.locator("#download").screenshot({ path: path.join(evidence, "downloads-mobile.png") });
    await noJs.locator("#download").screenshot({path: path.join(evidence, "downloads-no-js.png")});
    await writeFile(path.join(evidence, "browser-report.json"), JSON.stringify({passed: failures === 0, scope: "local built site; remote downloads intercepted", downloads, handbook_checks:handbookChecks, handbook_errors:guideErrors, no_js_desktop_docs: docsHref, mobile_overflow: overflow}, null, 2) + "\n");
  }
  await noJs.close();

  if (failures > 0) { console.error(`\n${failures} 项浏览器检查未通过`); process.exit(1); }
  console.log("\n浏览器交互检查全部通过");
} finally {
  await browser.close();
  server.close();
}
