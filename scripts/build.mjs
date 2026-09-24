import { mkdir, copyFile, rm, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const root = new URL("../", import.meta.url);
const out = new URL("dist/", root);

// ── 发布元数据:本地 release-metadata.json 是基础,可选两种远端来源 ──
// 1. CLARORA_RELEASE_METADATA=<文件>:消费发布流水线产出的同 schema 元数据
//    (Release 工作流随包发布的 release-metadata.json),用于固定发布或本地 fixture;
// 2. CLARORA_FETCH_RELEASE / CI:从 GitHub Releases API 拉取最新版本。
// 无网络且未指定文件时回退到本地文件,保证本地预览和 CI 构建产出一致。
async function loadLocalMetadata() {
  return JSON.parse(await readFile(new URL("release-metadata.json", root), "utf8"));
}

// 统一 schema 合并:版本/tag/来源/资产目录以远端为准。平台条目以远端实际
// 发布为准:只有远端明确 released 且带可用下载地址的平台才渲染下载,
// 资产名/URL/架构用远端值(资产改名后不再拼旧文件名);远端缺失或无效的
// 平台一律降级为待发布,本地 released 状态不能凭空保留。
class ReleaseMetadataError extends Error {}
function validUrl(value) {
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; }
}
function iosChannel(entry) {
  if (!validUrl(entry?.url)) return false;
  const u = new URL(entry.url);
  return (entry.channel === "testflight" && u.hostname === "testflight.apple.com" && /^\/join\/[A-Za-z0-9]+$/.test(u.pathname))
    || (entry.channel === "app-store" && u.hostname === "apps.apple.com" && /\/id[0-9]+$/.test(u.pathname));
}
function mergeRemote(local, remote) {
  if (!/^\d+\.\d+\.\d+$/.test(remote.version ?? "")) throw new Error("远端元数据 version 非法:" + remote.version);
  if (remote.tag !== "v" + remote.version) throw new Error("远端元数据 tag(" + remote.tag + ") 与 version(" + remote.version + ") 不一致");
  if (!/^[0-9a-f]{7,40}$/.test(remote.source_sha ?? "")) throw new Error("远端元数据 source_sha 缺失或非法");
  const platforms = {};
  for (const [name, conf] of Object.entries(local.platforms)) {
    const entry = remote.platforms?.[name];
    const url = typeof entry?.url === "string" ? entry.url : "";
    if (entry?.status === "released" && validUrl(url) && (name !== "ios" || iosChannel(entry))) {
      const assetName = typeof entry.asset_name === "string" && entry.asset_name ? entry.asset_name : url.split("/").pop();
      platforms[name] = { ...conf, ...entry, status: "released", url, asset_name: assetName };
    } else {
      if (conf.status === "released") {
        console.warn(`平台 ${name} 在远端元数据中${entry ? "没有可用的下载地址" : "缺失"},按待发布渲染`);
      }
      platforms[name] = { ...conf, status: "planned", url: undefined, channel: undefined };
    }
  }
  return {
    ...local,
    version: remote.version,
    tag: remote.tag,
    source_sha: remote.source_sha,
    assets_base: remote.assets_base ?? "https://github.com/a49a/clarora/releases/download/" + remote.tag,
    latest_url: remote.latest_url ?? "https://github.com/a49a/clarora/releases/tag/" + remote.tag,
    platforms,
  };
}

async function fetchLatestMetadata(local) {
  const res = await fetch("https://api.github.com/repos/a49a/clarora/releases/latest", {
    headers: { "User-Agent": "clarora-web-build" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error("GitHub API " + res.status);
  const release = await res.json();
  if (release.draft || release.prerelease) throw new Error("最新 Release 是草稿或预发布,跳过");
  const assets = release.assets ?? [];
  // 版本详情直接采用 API 的 html_url(tag_name 拼出的 /releases/<tag> 少了 /tag/ 段)
  if (typeof release.html_url !== "string" || !release.html_url.startsWith("https://github.com/")) {
    throw new Error("Release html_url 缺失或非法");
  }
  // target_commitish 返回分支名不能当 SHA;改用 commits API 按 tag 解析真实提交,
  // 与新版本同步更新 source_sha,避免"新版本配旧来源"的溯源失真。
  const shaRes = await fetch("https://api.github.com/repos/a49a/clarora/commits/" + release.tag_name, {
    headers: { "User-Agent": "clarora-web-build" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!shaRes.ok) throw new Error("按 tag 解析提交失败: GitHub API " + shaRes.status);
  const commit = await shaRes.json();
  const sourceSha = commit.sha;
  if (!/^[0-9a-f]{7,40}$/.test(sourceSha ?? "")) throw new Error("tag 提交 SHA 非法:" + String(sourceSha));
  const assetsBase = "https://github.com/a49a/clarora/releases/download/" + release.tag_name;
  // 平台状态以最新 Release 的实际资产为准(降级与告警统一由 mergeRemote 处理)。
  const platforms = {};
  for (const [name, conf] of Object.entries(local.platforms)) {
    const asset = name !== "ios" && conf.asset_name ? assets.find(a => a.name === conf.asset_name) : null;
    if (asset) {
      platforms[name] = { ...conf, status: "released", url: asset.browser_download_url };
    } else {
      platforms[name] = { ...conf, status: "planned", url: undefined, channel: undefined };
    }
  }
  // iOS is a channel, not a universally installable IPA asset. Read only
  // metadata attached to this release and bound to its resolved source.
  const metadataAsset = assets.find(a => a.name === "release-metadata.json");
  if (metadataAsset) {
    const expected = assetsBase + "/release-metadata.json";
    if (metadataAsset.browser_download_url !== expected) throw new ReleaseMetadataError("发布元数据资产 URL 不匹配");
    const response = await fetch(expected, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("发布元数据读取失败");
    const declared = await response.json();
    if (declared.tag !== release.tag_name || declared.version !== release.tag_name.replace(/^v/, "") || declared.source_sha !== sourceSha) {
      throw new ReleaseMetadataError("发布元数据版本或来源不匹配");
    }
    if (declared.platforms?.ios?.status === "released" && iosChannel(declared.platforms.ios)) {
      platforms.ios = declared.platforms.ios;
    }
  }
  return {
    version: release.tag_name.replace(/^v/, ""),
    tag: release.tag_name,
    source_sha: sourceSha,
    assets_base: assetsBase,
    latest_url: release.html_url,
    platforms,
  };
}

async function loadMetadata() {
  const local = await loadLocalMetadata();
  const metadataFile = process.env.CLARORA_RELEASE_METADATA;
  if (metadataFile) {
    const remote = JSON.parse(await readFile(pathToFileURL(metadataFile), "utf8"));
    return mergeRemote(local, remote);
  }
  if (!process.env.CLARORA_FETCH_RELEASE && !process.env.CI) return local;
  try {
    return mergeRemote(local, await fetchLatestMetadata(local));
  } catch (err) {
    if (err instanceof ReleaseMetadataError) throw err;
    console.warn("GitHub Releases 拉取失败,使用本地 release-metadata.json: " + err.message);
    return local;
  }
}

// 每个平台的下载卡片令牌:released 出固定版本链接,其余指向构建指南。
const tokenFor = (metadata, name) => {
  const p = metadata.platforms[name];
  const released = p.status === "released";
  const label = name === "ios" ? (p.channel === "testflight" ? "加入 TestFlight" : "前往 App Store") : name === "windows" ? "下载安装包" : "下载客户端";
  return {
    badge: released ? metadata.version + (name === "ios" ? " 渠道已开放" : " 可下载") : "安装包待发布",
    href: released ? p.url : "#build-guide",
    label: released ? label : "查看构建指南",
  };
};

export async function buildSite() {
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
    if (p.name !== "ios" && !p.asset_name) throw new Error("released 平台 " + p.name + " 缺少 asset_name");
  }
  // 渲染一律使用解析后的平台 URL:元数据可提供自定义 HTTPS 下载地址;
  // 未提供时才按固定版本目录拼接,两种来源最终走同一条渲染路径。
  for (const p of Object.values(metadata.platforms)) {
    if (p.status === "released") {
      p.url ??= metadata.assets_base + "/" + p.asset_name;
      if (!validUrl(p.url)) throw new Error("下载 URL 非法");
      if (p === metadata.platforms.ios && !iosChannel(p)) throw new Error("iOS 分发渠道非法");
    }
  }

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const file of ["styles.css", "site.js", "favicon.svg", "favicon.png", "apple-touch-icon.png"]) {
    await copyFile(new URL(file, root), new URL(file, out));
  }

  // dist/config.js:运行时增强读取同一元数据来源
  const downloads = Object.fromEntries(Object.entries(metadata.platforms).map(([name, p]) => [name,
    p.status === "released" ? {url: p.url, version: metadata.version, channel: p.channel} : null]));
  const configJs = "window.CLARORA_SITE = " + JSON.stringify({repository: metadata.repository,
    latestUrl: metadata.latest_url, version: metadata.version, downloads}, null, 2) + ";\n";
  await writeFile(new URL("config.js", out), configJs);

  // dist/index.html:填充下载卡片令牌;无 JS 也呈现准确版本与链接
  const escapeHtml = value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  let html = await readFile(new URL("index.html", root), "utf8");
  for (const name of ["macos", "windows", "android", "ios"]) {
    const t = tokenFor(metadata, name);
    html = html.replaceAll("__" + name.toUpperCase() + "_BADGE__", t.badge);
    html = html.replaceAll("__" + name.toUpperCase() + "_HREF__", escapeHtml(t.href));
    html = html.replaceAll("__" + name.toUpperCase() + "_LABEL__", t.label);
  }
  html = html.replaceAll("__SITE_VERSION__", metadata.version);
  html = html.replaceAll("__LATEST_URL__", escapeHtml(metadata.latest_url));
  await writeFile(new URL("index.html", out), html);

  // dist/release-metadata.json:构建实际使用的解析结果,postbuild 的 --dist
  // 校验以这份为准,避免"构建用新版本、检查读本地旧元数据"的错位。
  await writeFile(new URL("release-metadata.json", out), JSON.stringify(metadata, null, 2) + "\n");

  console.log("Static website built in dist/ (release " + metadata.tag + ", source " + (metadata.source_sha || "local") + ")");
  return metadata;
}

// 直接执行时构建;被 serve.mjs 等导入时只提供 buildSite()。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildSite();
}
