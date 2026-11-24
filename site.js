const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const config = window.CLARORA_SITE || {};
const isHttps = (value) => {
  try {
    return typeof value === "string" && new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};
const repo = isHttps(config.repository)
  ? config.repository.replace(/\/$/, "")
  : "https://github.com/a49a/clarora";
$$(".repo-link").forEach((link) => {
  link.href = repo;
});
$("#platform-docs").href = `${repo}/blob/HEAD/clarora-gpui/README.md`;
$("#year").textContent = new Date().getFullYear();

function activateDemo(name) {
  $$("[data-demo]").forEach((button) => {
    const active = button.dataset.demo === name;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    const panel = $(`#panel-${button.dataset.demo}`);
    if (!active) panel.querySelector("video").pause();
    panel.hidden = !active;
  });
}
$$("[data-demo]").forEach((button) =>
  button.addEventListener("click", () => activateDemo(button.dataset.demo)),
);
function activateTutorial(name) {
  $$("[data-tutorial]").forEach((button) => {
    const active = button.dataset.tutorial === name;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    $(`#tut-panel-${button.dataset.tutorial}`).hidden = !active;
  });
}
$$("[data-tutorial]").forEach((button) =>
  button.addEventListener("click", () => activateTutorial(button.dataset.tutorial)),
);
// guides 的 macOS 项与 index.html #build-panel 中无 JS 的默认文案保持同步。
const guides = {
  macos: {
    requirements:
      "需要 Rust 1.93.1、Xcode Command Line Tools 和 Homebrew。克隆源码后，在仓库根目录构建桌面主版本：",
    command: "brew install mpv ffmpeg yt-dlp\nsh clarora-gpui/scripts/package-macos.sh\npython3 clarora-gpui/scripts/install-pdfium.py clarora-gpui/target/Clarora.app/Contents/MacOS\ncodesign --force --deep --sign - clarora-gpui/target/Clarora.app\nopen clarora-gpui/target/Clarora.app",
  },
  windows: {
    requirements:
      "需要 Rust 1.93.1 MSVC、Visual Studio 2022 C++、Windows SDK、Python 3、CMake、7-Zip 和 Inno Setup 6。在 x64 开发者 PowerShell 中构建桌面主版本：",
    command:
      "cd clarora-gpui\n./scripts/prepare-windows-runtime.ps1\n./scripts/build-windows.ps1 -Distribution -RuntimeDir ./target/windows-runtime -Installer",
  },
  android: {
    requirements:
      "RN 移动端需要 Node.js 24、Android Studio、Android SDK、JDK 17 和模拟器或真机。克隆源码后执行：",
    command: "npm run setup\nnpm start\n# 另开一个终端\nnpm run android",
  },
  ios: {
    requirements:
      "RN 移动端需要 macOS、Node.js 24、Xcode 的 iOS 平台组件和 CocoaPods。克隆源码后执行：",
    command:
      "npm run setup\ncd clarora-app\nLC_ALL=en_US.UTF-8 npm run ios:pods\nnpm start\n# 另开终端，在 clarora-app 目录执行\nnpm run ios",
  },
};
function selectPlatform(name) {
  if (!guides[name]) return;
  $("#platform-docs").href = `${repo}/blob/HEAD/${name === "android" || name === "ios" ? "docs/platform-builds.md" : "clarora-gpui/README.md"}`;
  $$("[data-platform]").forEach((button) => {
    const active = button.dataset.platform === name;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  $("#build-panel").setAttribute("aria-labelledby", `build-tab-${name}`);
  $("#build-requirements").textContent = guides[name].requirements;
  $("#build-command").textContent = guides[name].command;
  $("#copy-command").textContent = "复制命令";
  $("#copy-status").textContent = "";
}
$$("[data-platform]").forEach((button) =>
  button.addEventListener("click", () =>
    selectPlatform(button.dataset.platform),
  ),
);
// Standard keyboard navigation for both tab groups.
$$('[role="tablist"]').forEach((list) =>
  list.addEventListener("keydown", (event) => {
    const buttons = [...list.querySelectorAll('[role="tab"]')];
    let index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    if (event.key === "ArrowRight") index = (index + 1) % buttons.length;
    else if (event.key === "ArrowLeft")
      index = (index + buttons.length - 1) % buttons.length;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = buttons.length - 1;
    else return;
    event.preventDefault();
    buttons[index].click();
    buttons[index].focus();
  }),
);
$$("[data-download]").forEach((link) => {
  const platform = link.dataset.download;
  const release = config.downloads?.[platform];
  if (isHttps(release?.url)) {
    link.href = release.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  } else {
    link.addEventListener("click", () => {
      selectPlatform(platform);
      $(`#build-tab-${platform}`).focus({ preventScroll: true });
    });
  }
});
$("#copy-command").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("#build-command").textContent);
    $("#copy-command").textContent = "已复制 ✓";
    $("#copy-status").textContent = "构建命令已复制";
  } catch {
    const range = document.createRange();
    range.selectNodeContents($("#build-command"));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    $("#copy-command").textContent = "请手动复制";
    $("#copy-status").textContent = "自动复制不可用，已选中命令，请手动复制";
  }
});
