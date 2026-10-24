// Real isolated site builds for the main desktop / pinned RN mobile release split.
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidence = process.env.CLARORA_TEST_EVIDENCE;
const source = "206b2d4e1ec9a734910a774d25147ac39065dc2c";
const mainSource = "a123456789012345678901234567890123456789";
const repoUrl = "https://github.com/a49a/clarora";
const asset = (tag, name) => ({ name, browser_download_url: `${repoUrl}/releases/download/${tag}/${name}` });
const results = [];

for (const mode of ["split", "main-apk-only", "rn-draft", "rn-bad-source", "rn-channel", "rn-ipa", "latest-rn", "future-rn", "metadata-file", "offline"]) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "clarora-routing-"));
  try {
    for (const name of ["scripts", "package.json", "release-metadata.json", "index.html", "styles.css", "site.js", "favicon.svg", "favicon.png", "apple-touch-icon.png"]) {
      await cp(path.join(repo, name), path.join(dir, name), { recursive: true });
    }
    const local = JSON.parse(await readFile(path.join(dir, "release-metadata.json"), "utf8"));
    const rnVersion = mode === "future-rn" ? "0.2.3" : "0.2.1";
    const rnTag = mode === "future-rn" ? "rn-v0.2.3" : "v0.2.1";
    local.mobile_release = { version: rnVersion, tag: rnTag, source_sha: source, platforms: {
      android: { status: "released", asset_name: "Clarora-android.apk", url: asset(rnTag, "Clarora-android.apk").browser_download_url },
      ios: { status: "planned" },
    } };
    await writeFile(path.join(dir, "release-metadata.json"), JSON.stringify(local));
    const mainTag = "v0.2.2";
    const main = { tag_name: mainTag, name: mode === "latest-rn" ? "Clarora RN v0.2.2" : "Clarora v0.2.2", html_url: `${repoUrl}/releases/tag/${mainTag}`, draft: false, prerelease: false,
      assets: [asset(mainTag, "Clarora-macos-arm64.dmg"), asset(mainTag, "Clarora-windows-x64.zip"), ...(mode === "main-apk-only" ? [asset(mainTag, "Clarora-android.apk")] : [])] };
    const mobile = { tag_name: rnTag, name: `Clarora RN v${rnVersion}`, html_url: `${repoUrl}/releases/tag/${rnTag}`, draft: mode === "rn-draft", prerelease: false,
      assets: [...(mode === "main-apk-only" ? [] : [asset(rnTag, "Clarora-android.apk")]), asset(rnTag, "release-metadata.json")] };
    const ios = mode === "rn-channel" ? { status: "released", channel: "testflight", url: "https://testflight.apple.com/join/AbCd1234" }
      : mode === "rn-ipa" ? { status: "released", url: asset(rnTag, "Clarora-ios-unsigned.ipa").browser_download_url } : { status: "planned" };
    const declared = { version: rnVersion, tag: rnTag, source_sha: source, platforms: { ios } };
    const responses = {
      "https://api.github.com/repos/a49a/clarora/releases/latest": main,
      [`https://api.github.com/repos/a49a/clarora/commits/${mainTag}`]: { sha: mainSource },
      [`https://api.github.com/repos/a49a/clarora/releases/tags/${rnTag}`]: mobile,
      [`https://api.github.com/repos/a49a/clarora/commits/${rnTag}`]: { sha: mode === "rn-bad-source" ? mainSource : source },
      [`${repoUrl}/releases/download/${rnTag}/release-metadata.json`]: declared,
    };
    const runner = `globalThis.fetch = async input => { const data = ${JSON.stringify(responses)}[String(input)]; return {ok: !!data, status: data ? 200 : 404, json: async () => data}; }; const {buildSite} = await import('./scripts/build.mjs'); await buildSite();`;
    await writeFile(path.join(dir, "fixture.mjs"), runner);
    const env = { ...process.env, CLARORA_FETCH_RELEASE: "1" };
    delete env.CLARORA_RELEASE_METADATA;
    if (mode === "metadata-file") {
      const metadata = { version: "0.2.2", tag: mainTag, source_sha: mainSource, platforms: {
        macos: { status: "released", asset_name: "Clarora-macos-arm64.dmg", url: asset(mainTag, "Clarora-macos-arm64.dmg").browser_download_url },
        windows: { status: "released", asset_name: "Clarora-windows-x64.zip", url: asset(mainTag, "Clarora-windows-x64.zip").browser_download_url },
      }, mobile_release: local.mobile_release };
      env.CLARORA_RELEASE_METADATA = path.join(dir, "explicit.json");
      await writeFile(env.CLARORA_RELEASE_METADATA, JSON.stringify(metadata));
    }
    if (mode === "offline") { delete env.CI; delete env.CLARORA_FETCH_RELEASE; }
    const run = spawnSync(process.execPath, [mode === "offline" ? "scripts/build.mjs" : "fixture.mjs"], { cwd: dir, env, encoding: "utf8" });
    const mustFail = ["rn-bad-source", "latest-rn"].includes(mode);
    if (mustFail) {
      if (run.status === 0) throw new Error("untrusted release was accepted");
      if (!run.stderr.includes(mode === "latest-rn" ? "主版本" : "来源")) throw new Error(run.stderr);
    } else {
      if (run.status !== 0) throw new Error(run.stderr);
      const metadata = JSON.parse(await readFile(path.join(dir, "dist/release-metadata.json"), "utf8"));
      const android = metadata.platforms.android;
      const expectedAndroid = ["main-apk-only", "rn-draft"].includes(mode) ? "planned" : "released";
      if (android.status !== expectedAndroid || android.family !== "rn" || android.version !== rnVersion || android.tag !== rnTag || android.source_sha !== source) throw new Error("RN identity/status was replaced by main release");
      if (android.status === "released" && android.url !== asset(rnTag, "Clarora-android.apk").browser_download_url) throw new Error("Android did not use pinned RN tag");
      if (metadata.platforms.ios.status !== (mode === "rn-channel" ? "released" : "planned")) throw new Error("iOS channel mismatch");
      if (mode !== "offline" && (metadata.platforms.macos.version !== "0.2.2" || metadata.platforms.macos.family !== "main")) throw new Error("main desktop identity missing");
      const html = await readFile(path.join(dir, "dist/index.html"), "utf8");
      if (!html.includes(`${rnVersion} RN`) || html.includes("GPUI")) throw new Error("incorrect public family/version label");
      const check = spawnSync(process.execPath, ["scripts/check-site.mjs", "--dist"], {cwd: dir, encoding: "utf8"});
      if (check.status !== 0) throw new Error(check.stdout + check.stderr);
      if (evidence) {
        await mkdir(path.join(evidence, mode), { recursive: true });
        await cp(path.join(dir, "dist"), path.join(evidence, mode, "dist"), { recursive: true });
      }
    }
    results.push({ mode, passed: true, expected_failure: mustFail });
    console.log(`✓ Release routing: ${mode}`);
  } catch (error) {
    results.push({ mode, passed: false, error: error.message });
    console.error(`✗ Release routing: ${mode}: ${error.message}`);
  } finally { await rm(dir, { recursive: true, force: true }); }
}
if (evidence) { await mkdir(evidence, {recursive: true}); await writeFile(path.join(evidence, "release-routing-report.json"), JSON.stringify({passed: results.every(x => x.passed), results}, null, 2) + "\n"); }
process.exitCode = results.every(x => x.passed) ? 0 : 1;
