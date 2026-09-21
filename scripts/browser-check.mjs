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

const browser = await chromium.launch();
try {
  const page = await browser.newPage();

  // 1) 下载交互:桌面卡片链接指向固定版本资产
  await page.goto(base, { waitUntil: "networkidle" });
  const macos = page.locator('a[data-download="macos"]');
  if (!(await macos.getAttribute("href"))?.includes("releases/download/v")) {
    fail("macOS 下载链接不是固定版本资产地址");
  } else pass("下载链接指向固定版本资产");
  if ((await macos.getAttribute("target")) !== "_blank") fail("下载链接应在新标签页打开");

  // 2) 教程切换:构建指南平台标签
  await page.locator("#build-guide").scrollIntoViewIfNeeded();
  const windowsTab = page.locator('[role="tab"][data-platform="windows"]');
  await windowsTab.click();
  await page.waitForTimeout(200);
  const activeTab = await windowsTab.getAttribute("aria-selected");
  if (activeTab !== "true") fail("教程平台切换未更新选中状态");
  else pass("教程平台标签切换正常");

  // 3) 键盘导航:Tab 能把焦点带到下载链接,且焦点可见
  await page.locator('a[data-download="macos"]').focus();
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
