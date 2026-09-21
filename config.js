// Set verified release URLs here when client installers are published.
// 首个 GitHub Release 发布后，按 docs/releases.md 的模板填写（固定产物名 + releases/latest/download 永久链接）。
window.CLARORA_SITE = {
  repository: "https://github.com/a49a/clarora",
  downloads: {
    macos: { url: "https://github.com/a49a/clarora/releases/download/v0.1.0/Clarora-macos-arm64.dmg", version: "0.1.0" },
    windows: { url: "https://github.com/a49a/clarora/releases/download/v0.1.0/Clarora-windows-x64.zip", version: "0.1.0" },
    android: null,
    ios: null,
  },
};
