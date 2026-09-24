// 官网构建场景矩阵:在隔离副本中以受控 fixture 驱动真实构建管线,
// 覆盖发布元数据文件、GitHub API、缺包降级、资产改名、自定义 URL、
// 联网失败回退与开发预览。用法:npm run test:build
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputs = ["index.html", "styles.css", "site.js", "favicon.svg", "favicon.png", "apple-touch-icon.png", "release-metadata.json", "package.json", "scripts"];

let failures = 0;
const pass = name => console.log(`✓ ${name}`);
const fail = (name, detail) => { failures += 1; console.error(`✗ ${name}${detail ? `:${detail}` : ""}`); };

async function makeWorkspace() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "clarora-site-"));
  for (const item of inputs) await cp(path.join(repo, item), path.join(dir, item), { recursive: true });
  return dir;
}

function buildMetadataFile(dir, platforms) {
  const file = path.join(dir, "scenario-metadata.json");
  const metadata = {
    version: "9.9.9",
    tag: "v9.9.9",
    source_sha: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
    repository: "https://github.com/a49a/clarora",
    assets_base: "https://github.com/a49a/clarora/releases/download/v9.9.9",
    latest_url: "https://github.com/a49a/clarora/releases/tag/v9.9.9",
    platforms,
  };
  fs.writeFileSync(file, JSON.stringify(metadata));
  return file;
}

const MACOS_RELEASE = { status: "released", arch: "arm64", asset_name: "Clarora-macos-arm64.dmg", url: "https://github.com/a49a/clarora/releases/download/v9.9.9/Clarora-macos-arm64.dmg" };

async function buildWithMetadataFile(dir, platforms) {
  const file = buildMetadataFile(dir, platforms);
  return spawnSync(process.execPath, ["scripts/build.mjs"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, CLARORA_RELEASE_METADATA: file },
  });
}

// GitHub API fixture:子进程内先替换全局 fetch 再调用 buildSite。
const FIXTURE_RUNNER = `
const ALL = [
  { name: "Clarora-macos-arm64.dmg", browser_download_url: "https://github.com/a49a/clarora/releases/download/v9.9.9/Clarora-macos-arm64.dmg" },
  { name: "Clarora-windows-x64.zip", browser_download_url: "https://github.com/a49a/clarora/releases/download/v9.9.9/Clarora-windows-x64.zip" },
];
const mode = process.env.FIX_ASSETS;
const assets = mode === "macos-only" ? ALL.slice(0, 1) : mode === "windows-only" ? ALL.slice(1) : mode === "none" ? [] : ALL;
const commitsFail = process.env.FIX_COMMITS_FAIL === "1";
globalThis.fetch = async url => {
  const u = String(url);
  if (u.includes("/releases/latest")) return { ok: true, status: 200, json: async () => ({
    tag_name: "v9.9.9", html_url: "https://github.com/a49a/clarora/releases/tag/v9.9.9",
    draft: false, prerelease: false, assets,
  }) };
  if (u.includes("/commits/v9.9.9") && !commitsFail) return { ok: true, status: 200, json: async () => ({ sha: "9f8e7d6c5b4a3210fedcba9876543210fedcba98" }) };
  return { ok: false, status: 404, json: async () => ({}) };
};
delete process.env.CLARORA_RELEASE_METADATA;
process.env.CLARORA_FETCH_RELEASE = "1";
const { buildSite } = await import("./scripts/build.mjs");
await buildSite();
`;
const ALL_ASSETS = [
  { name: "Clarora-macos-arm64.dmg", browser_download_url: "https://github.com/a49a/clarora/releases/download/v9.9.9/Clarora-macos-arm64.dmg" },
  { name: "Clarora-windows-x64.zip", browser_download_url: "https://github.com/a49a/clarora/releases/download/v9.9.9/Clarora-windows-x64.zip" },
];

function buildWithApiFixture(dir, mode, commitsFail = false) {
  const assets = mode === "macos-only" ? ALL_ASSETS.slice(0, 1) : mode === "windows-only" ? ALL_ASSETS.slice(1) : mode === "none" ? [] : ALL_ASSETS;
  fs.writeFileSync(path.join(dir, "fixture-runner.mjs"), FIXTURE_RUNNER);
  return spawnSync(process.execPath, ["fixture-runner.mjs"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, FIX_ASSETS: mode, FIX_COMMITS_FAIL: commitsFail ? "1" : "0" },
  });
}

function checkDist(dir) {
  return spawnSync(process.execPath, ["scripts/check-site.mjs", "--dist"], { cwd: dir, encoding: "utf8" });
}

const distMetadata = dir => JSON.parse(fs.readFileSync(path.join(dir, "dist", "release-metadata.json"), "utf8"));
const distIndex = dir => fs.readFileSync(path.join(dir, "dist", "index.html"), "utf8");

// ── 场景执行 ──
async function main() {
  // 1. 发布元数据文件:双平台
  {
    const dir = await makeWorkspace();
    const build = await buildWithMetadataFile(dir, { macos: MACOS_RELEASE, windows: { status: "released", arch: "x64", asset_name: "Clarora-windows-x64.zip", url: "https://github.com/a49a/clarora/releases/download/v9.9.9/Clarora-windows-x64.zip" } });
    const check = checkDist(dir);
    build.status === 0 && check.status === 0
      ? pass("发布元数据文件:双平台构建 + postbuild 通过")
      : fail("发布元数据文件:双平台", `build=${build.status} check=${check.status} ${build.stderr}${check.stderr}`);
    await rm(dir, { recursive: true, force: true });
  }

  // 2. 发布元数据文件:远端缺 windows 平台
  {
    const dir = await makeWorkspace();
    const build = await buildWithMetadataFile(dir, { macos: MACOS_RELEASE });
    const check = checkDist(dir);
    const windows = distMetadata(dir).platforms.windows;
    const index = distIndex(dir);
    build.status === 0 && check.status === 0 && windows.status === "planned" && !index.includes("Clarora-windows-x64.zip")
      ? pass("发布元数据文件:缺平台降级为待发布,无伪造链接")
      : fail("发布元数据文件:缺平台", `build=${build.status} windows=${windows.status}`);
    await rm(dir, { recursive: true, force: true });
  }

  // 3. 发布元数据文件:released 但缺 URL
  {
    const dir = await makeWorkspace();
    const build = await buildWithMetadataFile(dir, { macos: MACOS_RELEASE, windows: { status: "released", arch: "x64", asset_name: "Clarora-windows-x64.zip" } });
    const check = checkDist(dir);
    distMetadata(dir).platforms.windows.status === "planned" && check.status === 0
      ? pass("发布元数据文件:缺 URL 降级为待发布")
      : fail("发布元数据文件:缺 URL", `status=${distMetadata(dir).platforms.windows.status}`);
    await rm(dir, { recursive: true, force: true });
  }

  // 4. 发布元数据文件:资产改名 + 自定义 HTTPS URL
  {
    const dir = await makeWorkspace();
    const custom = "https://cdn.example.com/v9.9.9/Clarora-macos-arm64.dmg";
    const build = await buildWithMetadataFile(dir, {
      macos: { ...MACOS_RELEASE, url: custom },
      windows: { status: "released", arch: "x64", asset_name: "Clarora-windows-x64-v2.zip", url: "https://github.com/a49a/clarora/releases/download/v9.9.9/Clarora-windows-x64-v2.zip" },
    });
    const check = checkDist(dir);
    const index = distIndex(dir);
    index.includes(custom) && index.includes("Clarora-windows-x64-v2.zip") && check.status === 0
      ? pass("发布元数据文件:自定义 URL 与改名资产按远端渲染")
      : fail("发布元数据文件:自定义 URL/改名", `check=${check.status}`);
    await rm(dir, { recursive: true, force: true });
  }

  // 5. 发布元数据文件:全部缺包 → 明确失败
  {
    const dir = await makeWorkspace();
    const build = await buildWithMetadataFile(dir, {});
    build.status !== 0
      ? pass("发布元数据文件:零 released 平台明确失败")
      : fail("发布元数据文件:零平台应失败");
    await rm(dir, { recursive: true, force: true });
  }

  // 6~9. GitHub API 路径:双平台/仅 macOS/仅 Windows/联网失败回退
  for (const mode of ["both", "macos-only", "windows-only"]) {
    const dir = await makeWorkspace();
    const build = buildWithApiFixture(dir, mode);
    const check = checkDist(dir);
    const meta = distMetadata(dir);
    const windowsReleased = meta.platforms.windows.status === "released";
    const macosPlanned = meta.platforms.macos.status !== "released";
    const ok = build.status === 0 && check.status === 0
      && (mode === "windows-only" ? macosPlanned && windowsReleased
        : mode === "macos-only" ? meta.platforms.windows.status === "planned"
        : meta.platforms.windows.status === "released");
    ok ? pass(`GitHub API: ${mode} 构建 + postbuild 通过`)
      : fail(`GitHub API: ${mode}`, `build=${build.status} check=${check.status}`);
    await rm(dir, { recursive: true, force: true });
  }
  {
    const dir = await makeWorkspace();
    const build = buildWithApiFixture(dir, "none", true);
    const meta = distMetadata(dir);
    build.status === 0 && meta.version === "0.1.0" && meta.source_sha === "da3b312"
      ? pass("GitHub API: 拉取失败回退本地元数据(v0.1.0)")
      : fail("GitHub API: 回退", `build=${build.status} version=${meta.version}`);
    await rm(dir, { recursive: true, force: true });
  }

  // 10. 开发预览:serve.mjs 走正式渲染,页面无令牌残留
  {
    const dir = await makeWorkspace();
    // 用子进程启动 serve,轮询就绪(100ms 间隔,不固定长 sleep);端口随进程派生避免冲突。
    // 显式脱离 CI/联网拉取环境:预览必须确定性使用本地 release-metadata.json,
    // 否则 CI=true 会拉真实最新版本,断言随远端发布漂移。
    const { spawn } = await import("node:child_process");
    const port = 4100 + (process.pid % 800);
    const previewEnv = { ...process.env, PORT: String(port) };
    delete previewEnv.CI;
    delete previewEnv.CLARORA_FETCH_RELEASE;
    delete previewEnv.CLARORA_RELEASE_METADATA;
    const proc = spawn(process.execPath, ["scripts/serve.mjs"], { cwd: dir, stdio: "ignore", env: previewEnv });
    let ready = false;
    for (let i = 0; i < 30 && !ready; i += 1) {
      try { const res = await fetch(`http://127.0.0.1:${port}/`); ready = res.status === 200; } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    if (!ready) {
      fail("开发预览:服务未就绪");
    } else {
      const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
      const expectedVersion = JSON.parse(fs.readFileSync(path.join(dir, "release-metadata.json"), "utf8")).version;
      const noTokens = !html.includes("__MACOS_BADGE__") && !html.includes("__SITE_VERSION__");
      noTokens && html.includes(`${expectedVersion} 可下载`)
        ? pass(`开发预览:正式渲染无令牌残留(本地版本 ${expectedVersion})`)
        : fail("开发预览:页面内容异常");
    }
    proc.kill();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  if (failures > 0) {
    console.error(`\n${failures} 个场景未通过`);
    process.exit(1);
  }
  console.log("\n官网构建场景矩阵全部通过");
}

main();
