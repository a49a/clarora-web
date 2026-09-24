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
$("#platform-docs").href = `${repo}/blob/HEAD/docs/platform-builds.md`;
$("#year").textContent = new Date().getFullYear();

// All demo content is local and illustrative; no AI calls or learner data.
let playing = false;
let elapsed = 0;
let timer;
const stopPlayback = () => {
  clearInterval(timer);
  playing = false;
  $("#play-demo").textContent = "▶";
  $("#play-demo").setAttribute("aria-pressed", "false");
  $("#play-demo").setAttribute("aria-label", "播放字幕进度演示（无音频）");
};
function activateDemo(name) {
  stopPlayback();
  $$("[data-demo]").forEach((button) => {
    const active = button.dataset.demo === name;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    $(`#panel-${button.dataset.demo}`).hidden = !active;
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
$("#reveal").addEventListener("click", () => {
  const answer = $("#word-answer");
  answer.hidden = !answer.hidden;
  $("#reveal").setAttribute("aria-expanded", String(!answer.hidden));
  $("#reveal").textContent = answer.hidden
    ? "想一想，再看释义 ↗"
    : "收起释义 ↑";
});
$("#favorite").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const active = button.getAttribute("aria-pressed") !== "true";
  button.setAttribute("aria-pressed", String(active));
  button.setAttribute(
    "aria-label",
    active ? "取消收藏示例单词" : "收藏示例单词",
  );
  button.textContent = active ? "♥" : "♡";
});
for (const [selector, count] of [
  [".waveform", 40],
  [".audio-bars", 35],
]) {
  const container = $(selector);
  for (let n = 0; n < count; n++) {
    const bar = document.createElement("i");
    bar.style.height = `${8 + Math.abs(Math.sin(n * 1.13) * Math.cos(n * 0.24)) * 32}px`;
    container.append(bar);
  }
}
const reduceMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;
$("#play-demo").addEventListener("click", () => {
  if (playing) return stopPlayback();
  if (elapsed >= 8) elapsed = 0;
  if (reduceMotion) {
    elapsed = 8;
    $("#demo-progress").style.width = "100%";
    $("#demo-time").textContent = "0:08";
    stopPlayback();
    return;
  }
  playing = true;
  $("#play-demo").textContent = "Ⅱ";
  $("#play-demo").setAttribute("aria-pressed", "true");
  $("#play-demo").setAttribute("aria-label", "暂停字幕进度演示");
  timer = setInterval(() => {
    elapsed = Math.min(8, elapsed + 0.1);
    $("#demo-progress").style.width = `${(elapsed / 8) * 100}%`;
    $("#demo-time").textContent = `0:0${Math.floor(elapsed)}`;
    if (elapsed >= 8) stopPlayback();
  }, 100);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopPlayback();
});

// guides 的 macOS 项与 index.html #build-panel 中无 JS 的默认文案保持同步。
const guides = {
  macos: {
    requirements:
      "需要 Node.js 24、Xcode、CocoaPods 和 libmpv。克隆源码后，在仓库根目录执行：",
    command: "npm run setup\nnpm start\n# 另开一个终端\nnpm run macos",
  },
  windows: {
    requirements:
      "需要 Node.js 24、Visual Studio 2022、Windows SDK 和 .NET 8。在 Windows 上克隆源码后执行：",
    command:
      "npm run setup\nnpm start\n# 另开一个终端\nnpm run windows\n# 生成未签名 Release 包\nnpm run windows:build",
  },
  android: {
    requirements:
      "需要 Node.js 24、Android Studio、Android SDK、JDK 17 和模拟器或真机。克隆源码后执行：",
    command: "npm run setup\nnpm start\n# 另开一个终端\nnpm run android",
  },
  ios: {
    requirements:
      "需要 macOS、Node.js 24、Xcode 的 iOS 平台组件和 CocoaPods。克隆源码后执行：",
    command:
      "npm run setup\ncd clarora-app\nLC_ALL=en_US.UTF-8 npm run ios:pods\nnpm start\n# 另开终端，在 clarora-app 目录执行\nnpm run ios",
  },
};
function selectPlatform(name) {
  if (!guides[name]) return;
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
    link.textContent = platform === "ios" ? (release.channel === "testflight" ? "加入 TestFlight ↗" : "前往 App Store ↗") : "下载客户端 ↗";
    $(`[data-status="${platform}"]`).textContent =
      release.version || "安装包已发布";
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
