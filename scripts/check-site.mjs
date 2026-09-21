// 官网静态检查:元数据 schema、源码令牌、锚点、凭证表述与(构建后的)
// dist 渲染结果。npm run check 检查源码;构建后再跑可同时校验 dist 渲染。
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
let failures = 0;
const fail = (message) => { console.error(`✗ ${message}`); failures += 1; };
const pass = (message) => console.log(`✓ ${message}`);
const read = file => fs.readFileSync(path.join(root, file), "utf8");

// 0) 交互脚本语法检查(保留原有 node --check)
for (const script of ["site.js"]) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, script)], { encoding: "utf8" });
  if (result.status !== 0) fail(`${script} 语法错误:${result.stderr}`);
  else pass(`${script} 语法正常`);
}

// 1) 发布元数据:唯一下载信息来源
const metadata = JSON.parse(read("release-metadata.json"));
if (!/^\d+\.\d+\.\d+$/.test(metadata.version)) fail(`元数据版本非法:${metadata.version}`);
if (metadata.tag !== `v${metadata.version}`) fail(`tag(${metadata.tag}) 与 version(${metadata.version}) 不一致`);
if (!/^[0-9a-f]{7,40}$/.test(metadata.source_sha ?? "")) fail("source_sha 缺失或非法");
const releasedPlatforms = Object.entries(metadata.platforms).filter(([, p]) => p.status === "released");
for (const [name, p] of Object.entries(metadata.platforms)) {
  if (p.status !== "released") continue;
  if (!p.asset_name?.startsWith("Clarora-")) fail(`${name} asset_name 非法:${p.asset_name}`);
  if (metadata.assets_base !== `https://github.com/a49a/clarora/releases/download/v${metadata.version}`) {
    fail("assets_base 必须指向与版本一致的固定下载目录");
  }
}
releasedPlatforms.length && pass(`元数据版本 ${metadata.tag},released 平台:${releasedPlatforms.map(([n]) => n).join(", ")}`);

// 2) 源码令牌:下载卡片必须使用构建期令牌(而非手写链接或状态)
const html = read("index.html");
for (const name of ["macos", "windows", "android", "ios"]) {
  const released = metadata.platforms[name]?.status === "released";
  if (!html.includes(`__${name.toUpperCase()}_BADGE__`)) fail(`${name} 卡片缺少 BADGE 令牌`);
  if (released) {
    // released 平台渲染为固定版本下载链接;未发布平台保留构建指南入口。
    if (!html.includes(`__${name.toUpperCase()}_HREF__`)) fail(`${name} 卡片缺少 HREF 令牌`);
    if (!html.includes(`__${name.toUpperCase()}_LABEL__`)) fail(`${name} 卡片缺少 LABEL 令牌`);
  }
}
if (!html.includes("__SITE_VERSION__") || !html.includes("__LATEST_URL__")) fail("缺少版本或最新导航令牌");
pass("下载卡片已全部令牌化(由发布元数据生成)");

// 3) 锚点:站内 href="#..." 必须可解析
const anchors = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
let internalLinks = 0;
for (const match of html.matchAll(/href="#([^"]+)"/g)) {
  internalLinks += 1;
  if (!anchors.has(match[1])) fail(`站内锚点失效:#${match[1]}`);
}
internalLinks && pass(`站内锚点 ${internalLinks} 个全部可解析`);

// 4) 凭证表述:不得再声称凭证只存应用数据库
if (/凭证只存本机应用数据库|凭证仅保存在本机应用数据库/.test(html)) {
  fail("凭证表述过时:仍声称只存应用数据库(桌面端已使用系统凭证保险库)");
}
pass("凭证表述与实现一致");

// 5) 构建产物渲染校验(--dist 时):无 JS 状态、固定链接、版本一致
const checkDist = process.argv.includes("--dist");
const distIndex = path.join(root, "dist", "index.html");
if (checkDist && fs.existsSync(distIndex)) {
  const rendered = read(path.join("dist", "index.html"));
  for (const name of ["macos", "windows", "android", "ios"]) {
    if (rendered.includes(`__${name.toUpperCase()}_BADGE__`)) fail(`dist 中残留未填充令牌:${name}`);
  }
  if (rendered.includes("__SITE_VERSION__")) fail("dist 中残留版本令牌");
  if (metadata.platforms.macos.status === "released") {
    if (!rendered.includes(`${metadata.version} 可下载`)) fail("macOS 卡片未显示可下载版本");
    if (!rendered.includes(`${metadata.assets_base}/${metadata.platforms.macos.asset_name}`)) fail("macOS 下载链接与元数据不一致");
  }
  if (/releases\/latest\/download\//.test(rendered)) fail("下载链接不得使用 latest(固定版本链接才负责下载)");
  pass("dist 渲染校验通过(令牌已全部填充)");
} else if (!checkDist) {
  console.log("ℹ 本次仅检查源码;构建产物渲染校验用 --dist 运行");
} else {
  console.log("ℹ dist 尚未构建");
}

if (failures > 0) {
  console.error(`\n${failures} 项检查未通过`);
  process.exit(1);
}
console.log("\n官网静态检查全部通过");
