// 浏览器交互检查(Playwright):手机布局、键盘导航、教程切换、下载交互。
// 用法:npm run build && npm run check:browser
// 本地需要 npx playwright install chromium;CI 在 pages.yml 中安装。
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "dist");
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };
const allowed = new Set(["/index.html", "/styles.css", "/site.js", "/config.js", "/favicon.svg", "/favicon.png", "/apple-touch-icon.png"]);

const server = createServer(async (req, res) => {
  const url = req.url === "/" ? "/index.html" : req.url.split("?")[0];
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

const browser = await chromium.launch();
try {
  const page = await browser.newPage();

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

  if (failures > 0) { console.error(`\n${failures} 项浏览器检查未通过`); process.exit(1); }
  console.log("\n浏览器交互检查全部通过");
} finally {
  await browser.close();
  server.close();
}
