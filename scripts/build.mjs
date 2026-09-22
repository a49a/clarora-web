import { mkdir, copyFile, rm, readFile, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const out = new URL("dist/", root);

// ── 发布元数据:优先从 GitHub Releases API 拉取最新版本,失败时回退到本地 ──
// 本地无网络或 API 不可用时,回退到手工维护的 release-metadata.json,
// 保证本地预览和 CI 构建产出一致的下载区。
async function loadMetadata() {
  const localText = await readFile(new URL("release-metadata.json", root), "utf8");
  const local = JSON.parse(localText);
  if (!process.env.CLARORA_FETCH_RELEASE && !process.env.CI) return local;
  try {
    const res = await fetch("https://api.github.com/repos/a49a/clarora/releases/latest", {
      headers: { "User-Agent": "clarora-web-build" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error("GitHub API " + res.status);
    const release = await res.json();
    if (release.draft || release.prerelease) throw new Error("最新 Release 是草稿或预发布,跳过");
    const assets = release.assets ?? [];
    // 更新 assets_base 和 latest_url 到新版本,保持链接与版本一致
    const assetsBase = "https://github.com/a49a/clarora/releases/download/" + release.tag_name;
    const latestUrl = "https://github.com/a49a/clarora/releases/" + release.tag_name;
    const findAsset = name => {
      const asset = assets.find(a => a.name === name);
      return asset ? asset.browser_download_url : assetsBase + "/" + name;
    };
    const platforms = {};
    for (const [name, conf] of Object.entries(local.platforms)) {
      if (conf.status === "released") {
        platforms[name] = { ...conf, url: findAsset(conf.asset_name) };
      } else {
        platforms[name] = conf;
      }
    }
    // 不从 API 的 target_commitish 覆盖 source_sha——它返回的是分支名而非 SHA
    return {
      ...local,
      version: release.tag_name.replace(/^v/, ""),
      tag: release.tag_name,
      assets_base: assetsBase,
      latest_url: latestUrl,
      platforms,
    };
  } catch (err) {
    console.warn("GitHub Releases 拉取失败,使用本地 release-metadata.json: " + err.message);
    return local;
  }
}

const metadata = await loadMetadata();
if (!/^\d+\.\d+\.\d+$/.test(metadata.version)) {
  throw new Error("release-metadata.json 版本非法:" + metadata.version);
}
if (metadata.tag !== "v" + metadata.version) {
  throw new Error("tag(" + metadata.tag + ") 必须为 v<版本> 且与 version(" + metadata.version + ") 一致");
}
if (!/^[0-9a-f]{7,40}$/.test(metadata.source_sha)) throw new Error("source_sha 缺失或非法");

const released = Object.entries(metadata.platforms)
  .filter(([, p]) => p.status === "released")
  .map(([name, p]) => ({ name, ...p }));
if (released.length === 0) throw new Error("没有任何 released 平台,请核对 release-metadata.json");
for (const p of released) {
  if (!p.asset_name) throw new Error("released 平台 " + p.name + " 缺少 asset_name");
}

// 每个平台的下载卡片令牌:released 出固定版本链接,其余指向构建指南。
const tokenFor = (name) => {
  const p = metadata.platforms[name];
  const released = p.status === "released";
  const label = name === "windows" ? "下载安装包" : "下载客户端";
  return {
    badge: released ? metadata.version + " 可下载" : "安装包待发布",
    href: released ? metadata.assets_base + "/" + p.asset_name : "#build-guide",
    label: released ? label : "查看构建指南",
  };
};

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of ["styles.css", "site.js", "favicon.svg", "favicon.png", "apple-touch-icon.png"]) {
  await copyFile(new URL(file, root), new URL(file, out));
}

// dist/config.js:运行时增强读取同一元数据来源
const platformEntries = Object.entries(metadata.platforms)
  .map(([name, p]) => p.status === "released"
    ? '    ' + name + ': { url: "' + metadata.assets_base + '/' + p.asset_name + '", version: "' + metadata.version + '" },'
    : '    ' + name + ': null,')
  .join("\n");
const configJs = "window.CLARORA_SITE = {\n" +
  '  repository: "' + metadata.repository + '",\n' +
  '  latestUrl: "' + metadata.latest_url + '",\n' +
  '  version: "' + metadata.version + '",\n' +
  "  downloads: {\n" + platformEntries + "\n  },\n};\n";
await writeFile(new URL("config.js", out), configJs);

// dist/index.html:填充下载卡片令牌;无 JS 也呈现准确版本与链接
let html = await readFile(new URL("index.html", root), "utf8");
for (const name of ["macos", "windows", "android", "ios"]) {
  const t = tokenFor(name);
  html = html.replaceAll("__" + name.toUpperCase() + "_BADGE__", t.badge);
  html = html.replaceAll("__" + name.toUpperCase() + "_HREF__", t.href);
  html = html.replaceAll("__" + name.toUpperCase() + "_LABEL__", t.label);
}
html = html.replaceAll("__SITE_VERSION__", metadata.version);
html = html.replaceAll("__LATEST_URL__", metadata.latest_url);
await writeFile(new URL("index.html", out), html);

console.log("Static website built in dist/ (release " + metadata.tag + ", source " + (metadata.source_sha || "local") + ")");
