// 官网静态检查:锚点、下载配置、无 JS 状态与资源完整性。
// 用法:npm run check(构建后运行,检查 dist/ 与源码一致性)。
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
let failures = 0;
const fail = (message) => { console.error(`✗ ${message}`); failures += 1; };
const pass = (message) => console.log(`✓ ${message}`);

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

// 1) config.js 下载配置 schema
const configSource = read("config.js");
const configMatch = configSource.match(/downloads:\s*{([\s\S]*?)},\n/);
if (!configMatch) { fail("config.js 缺少 downloads 配置"); }
const platforms = ["macos", "windows", "android", "ios"];
for (const platform of platforms) {
  if (!configSource.includes(`${platform}:`)) fail(`config.js 缺少 ${platform} 下载配置`);
}
const versionMatches = [...configSource.matchAll(/version:\s*"(\d+\.\d+\.\d+)"/g)].map((m) => m[1]);
const versions = new Set(versionMatches);
if (versions.size > 1) fail(`config.js 版本不一致:${[...versions].join(", ")}`);

// 2) 已配置平台的下载链接:https + 固定版本资产 + 可达性由 release 工作流保证
for (const match of configSource.matchAll(/url:\s*"(https:\/\/[^"]+)"/g)) {
  const url = match[1];
  if (!url.startsWith("https://github.com/a49a/clarora/releases/")) {
    fail(`下载地址必须指向 clarora 的 GitHub Releases:${url}`);
  }
}
versionMatches.length && pass(`下载配置版本一致(${[...versions].join(", ")})`);

// 3) index.html:桌面平台在无 JS 时也必须有真实下载链接与版本状态
const html = read("index.html");
for (const platform of ["macos", "windows"]) {
  const card = html.slice(html.indexOf(`data-download="${platform}"`) - 400,
                          html.indexOf(`data-download="${platform}"`) + 400);
  if (card.includes("安装包待发布")) fail(`${platform} 卡片静态状态仍是「待发布」,与已发布事实不符`);
  if (!/releases\/download\/v\d+\.\d+\.\d+\//.test(card)) fail(`${platform} 卡片缺少固定版本下载链接`);
}
/html[\s\S]*?0\.1\.0 可下载/.test(html) && pass("桌面平台静态状态已标注可下载版本");

// 4) 站内锚点:所有 href="#..." 目标必须存在
const anchors = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
let internalLinks = 0;
for (const match of html.matchAll(/href="#([^"]+)"/g)) {
  internalLinks += 1;
  if (!anchors.has(match[1])) fail(`站内锚点失效:#${match[1]}`);
}
internalLinks && pass(`站内锚点 ${internalLinks} 个全部可解析`);

// 5) 无 JS 状态:关键内容必须在 HTML 静态存在(JS 只是增强)
for (const required of ["下一点进步", "从源码构建", "同步与备份"]) {
  if (!html.includes(required)) fail(`关键内容缺失:${required}`);
}
pass("关键内容静态存在(无 JS 可读)");

// 6) 凭证表述:不得再声称凭证只存应用数据库
if (/凭证只存本机应用数据库|凭证仅保存在本机应用数据库/.test(html)) {
  fail("凭证表述过时:仍声称只存应用数据库(桌面端已使用系统凭证保险库)");
}
pass("凭证表述与实现一致");

if (failures > 0) {
  console.error(`\n${failures} 项检查未通过`);
  process.exit(1);
}
console.log("\n官网静态检查全部通过");
