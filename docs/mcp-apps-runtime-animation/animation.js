const DURATION = 92;
const scenes = [
  { start: 0, end: 6, label: "SYSTEM MAP", title: "一张卡片，如何获得安全的应用能力", sub: "完整运行过程 · 从模型入口到 App 局部更新", active: ["model","tools","host","server","card","bridge","app"], camera: [0, 12, .72], location: "运行位置：DSH Host + Browser" },
  { start: 6, end: 14, label: "ENTRY TOOL", title: "入口工具只由模型调用一次", sub: "model-visible · show-trending · CallToolResult", active: ["model","tools","host","server"], camera: [0, 28, .82], location: "运行位置：DSH Host → MCP Server" },
  { start: 14, end: 22, label: "RETAIN RESULT", title: "插件把结果变成短期能力", sub: "保留原始结果 · 绑定服务器 · 签发 callToken", active: ["host"], camera: [-435, -48, 1.08], location: "运行位置：插件 AppHost（Node.js）" },
  { start: 22, end: 31, label: "OPEN APP", title: "工具卡片用 callToken 打开 App", sub: "apps/open · resources/read · independent sessionId", active: ["host","card","server"], camera: [-560, -112, .98], location: "运行位置：浏览器父页面 ↔ 插件 AppHost" },
  { start: 31, end: 41, label: "DOUBLE SANDBOX", title: "不可信 HTML 被装入双层沙箱", sub: "outer proxy → inner MCP App · opaque origin", active: ["card","bridge","app"], camera: [-660, -122, .9], location: "运行位置：浏览器双层 iframe" },
  { start: 41, end: 50, label: "APPBRIDGE", title: "AppBridge 完成 Host 与 App 的握手", sub: "PostMessageTransport · toolInput · toolResult", active: ["bridge","app"], camera: [-760, -135, .94], location: "运行位置：可信父页面 ↔ 内层 MCP App" },
  { start: 50, end: 60, label: "APP PROCESS", title: "卡片交互直接调用 App 可见工具", sub: "Today → callServerTool(refresh-trending)", active: ["bridge","app"], camera: [-770, -138, .94], location: "运行位置：MCP App → AppBridge" },
  { start: 60, end: 69, label: "VALIDATE & CALL", title: "Host 校验后回到同一个 MCP Server", sub: "session · same server · app visibility · resource match", active: ["host","bridge","app","server"], camera: [-420, -70, .82], location: "运行位置：AppHost → 原 MCP Server" },
  { start: 69, end: 78, label: "STATE UPDATE", title: "新结果只更新 App，不重写模型消息", sub: "structuredContent rerender · session transcript unchanged", active: ["app"], camera: [-770, -138, .94], location: "运行位置：内层 MCP App" },
  { start: 78, end: 86, label: "HOST SURFACE", title: "插件承载连接、隔离、渲染与回调", sub: "能力覆盖与当前边界", active: ["host","server","card","bridge","app"], camera: [-65, 8, .74], location: "运行位置：插件的 Node 与 Browser 两个执行面" },
  { start: 86, end: 92, label: "COMPLETE", title: "宿主提供运行时，Server 提供业务与界面", sub: "新增 MCP App 不需要修改 DSH 核心", active: ["model","tools","host","server","card","bridge","app"], camera: [0, 12, .72], location: "运行位置：完整 MCP Apps runtime" }
];

const stage = document.querySelector("#stage");
const world = document.querySelector("#world");
const title = document.querySelector("#scene-title");
const subtitle = document.querySelector("#scene-subtitle");
const phaseNumber = document.querySelector("#phase-number");
const phaseLabel = document.querySelector("#phase-label");
const runningLocation = document.querySelector("#running-location");
const packet = document.querySelector("#packet");
const entryRoute = document.querySelector("#entry-route");
const appRoute = document.querySelector("#app-route");
const nodes = [...document.querySelectorAll(".node")];
const details = [...document.querySelectorAll(".detail")];
const splitResult = document.querySelector(".split-result");
const callToken = document.querySelector(".token-call");
const sessionToken = document.querySelector(".token-session");
const sandboxHero = document.querySelector("#sandbox-hero");
const bridgeTrace = document.querySelector("#bridge-trace");
const uiHero = document.querySelector("#ui-hero");
const cursor = document.querySelector(".cursor");
const clickRing = document.querySelector(".click-ring");
const playButton = document.querySelector("#play");
const scrubber = document.querySelector("#scrubber");
const timecode = document.querySelector("#timecode");
const chapters = document.querySelector("#chapters");

const query = new URLSearchParams(location.search);
let currentTime = Number(query.get("t") ?? localStorage.getItem("mcp-apps-animation-time") ?? 0);
if (!Number.isFinite(currentTime) || currentTime < 0 || currentTime >= DURATION) currentTime = 0;
let playing = query.get("paused") !== "1";
let lastTick = null;
let lastScene = -1;

const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const lerp = (a, b, p) => a + (b - a) * p;
const expoOut = p => p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
const easeInOut = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const sceneAt = t => Math.max(0, scenes.findIndex(scene => t >= scene.start && t < scene.end));
const localProgress = (scene, t) => clamp((t - scene.start) / (scene.end - scene.start));
const visibilityWindow = (t, start, end, edge = .8) => clamp((t - start + edge) / edge) * clamp((end + edge - t) / edge);

function mixCamera(index, t) {
  const scene = scenes[index];
  const previous = scenes[Math.max(0, index - 1)];
  const blend = expoOut(clamp((t - scene.start) / 1.1));
  return scene.camera.map((value, i) => lerp(previous.camera[i], value, blend));
}

function pointOn(path, progress) {
  const length = path.getTotalLength();
  return path.getPointAtLength(length * clamp(progress));
}

function setPacket(path, progress, color, opacity = 1) {
  const point = pointOn(path, progress);
  packet.setAttribute("cx", point.x.toFixed(2));
  packet.setAttribute("cy", point.y.toFixed(2));
  packet.style.fill = color;
  packet.style.opacity = opacity;
}

function renderRoutes(index, t, local) {
  let entryDraw = 0;
  let appDraw = 0;
  entryRoute.style.opacity = 0;
  appRoute.style.opacity = 0;
  if (index === 0) {
    entryDraw = expoOut(clamp(t / 3));
    appDraw = expoOut(clamp((t - 1.6) / 3.5));
    entryRoute.style.opacity = .72;
    appRoute.style.opacity = .72;
    setPacket(entryRoute, 0, "#ef8d32", clamp(t / .8));
  } else if (index === 1) {
    entryDraw = 1;
    entryRoute.style.opacity = 1;
    const forward = clamp((t - 6.4) / 4.4);
    const backward = clamp((t - 11.2) / 2.3);
    const progress = backward > 0 ? lerp(1, .38, easeInOut(backward)) : easeInOut(forward);
    setPacket(entryRoute, progress, "#ef8d32");
  } else if (index === 2) {
    entryDraw = 1;
    entryRoute.style.opacity = .4;
    setPacket(entryRoute, .38, "#ef8d32", .85);
  } else if (index >= 3 && index <= 8) {
    appDraw = 1;
    appRoute.style.opacity = 1;
    let progress = .15;
    if (index === 3) progress = lerp(0, .24, easeInOut(local));
    if (index === 4) progress = lerp(.24, .70, easeInOut(local));
    if (index === 5) progress = .55 + Math.sin(local * Math.PI * 3) * .10;
    if (index === 6) progress = lerp(.72, 0, easeInOut(clamp((local - .55) / .45)));
    if (index === 7) progress = local < .62 ? lerp(0, 1, easeInOut(local / .62)) : lerp(1, .72, easeInOut((local - .62) / .38));
    if (index === 8) progress = .72;
    setPacket(appRoute, progress, "#1657d8");
  } else if (index === 9) {
    entryDraw = appDraw = 1;
    entryRoute.style.opacity = .38;
    appRoute.style.opacity = .6;
    setPacket(appRoute, .72, "#1657d8", .65);
  } else {
    entryDraw = appDraw = 1;
    entryRoute.style.opacity = .9;
    appRoute.style.opacity = .9;
    setPacket(appRoute, expoOut(local), "#1657d8");
  }
  entryRoute.style.strokeDashoffset = String(1 - entryDraw);
  appRoute.style.strokeDashoffset = String(1 - appDraw);
}

function renderDetails(t) {
  details.forEach((detail, i) => {
    const scene = scenes[i];
    const opacity = visibilityWindow(t, scene.start, scene.end, .55);
    detail.style.opacity = opacity.toFixed(3);
    detail.style.transform = `translateY(${(1 - opacity) * 22}px)`;
    detail.style.pointerEvents = opacity > .8 ? "auto" : "none";
  });
}

function renderNodes(scene, index, local) {
  const active = new Set(scene.active);
  nodes.forEach((node, nodeIndex) => {
    const isActive = active.has(node.dataset.node);
    const delay = Math.max(0, local - nodeIndex * .045);
    const settle = expoOut(clamp(delay / .22));
    node.style.opacity = isActive ? String(lerp(.72, 1, settle)) : ".25";
    node.style.filter = isActive ? "none" : "brightness(.86) blur(1.35px)";
    node.style.transform = `scale(${isActive ? lerp(.97, 1.045, settle) : .97})`;
  });
  if (index === 0 || index === 10) {
    nodes.forEach((node, i) => {
      const reveal = expoOut(clamp((local - i * .055) / .28));
      node.style.opacity = String(reveal);
      node.style.transform = `translateY(${(1 - reveal) * 18}px)`;
      node.style.filter = "none";
    });
  }
}

function renderSpecials(index, t, local) {
  const splitOpacity = visibilityWindow(t, 15, 21.5, .6);
  splitResult.style.opacity = splitOpacity;
  splitResult.style.transform = `translateY(${(1 - splitOpacity) * 16}px)`;
  const callOpacity = visibilityWindow(t, 19, 27.5, .55);
  callToken.style.opacity = callOpacity;
  callToken.style.transform = `translate(${lerp(-40, 270, easeInOut(clamp((t - 20.5) / 5.2)))}px,${lerp(0, 74, easeInOut(clamp((t - 20.5) / 5.2)))}px) rotate(${lerp(-3, 2, local)}deg)`;
  const sessionOpacity = visibilityWindow(t, 26, 34, .55);
  sessionToken.style.opacity = sessionOpacity;
  sessionToken.style.transform = `translateY(${lerp(22, 0, expoOut(clamp((t - 26) / 1.2)))}px)`;

  const sandboxOpacity = visibilityWindow(t, 31.4, 40.6, .8);
  sandboxHero.style.opacity = sandboxOpacity;
  sandboxHero.style.transform = `rotate(${lerp(1.5, -.4, expoOut(local))}deg) scale(${lerp(.9, 1, expoOut(local))})`;

  const bridgeOpacity = visibilityWindow(t, 41.2, 49.7, .75);
  bridgeTrace.style.opacity = bridgeOpacity;
  bridgeTrace.style.transform = `translateY(${(1 - bridgeOpacity) * 24}px) scale(${lerp(.96, 1, expoOut(local))})`;
  const messageSpans = [...document.querySelectorAll(".bridge-messages span")];
  messageSpans.forEach((span, i) => {
    const on = clamp((t - 42.2 - i * 1.4) / .55);
    span.style.color = on > .7 ? "#1657d8" : "#476054";
    span.style.transform = `translateY(${(1 - expoOut(on)) * 8}px)`;
    span.style.opacity = on;
  });

  const uiOpacity = Math.max(visibilityWindow(t, 50.2, 59.8, .8), visibilityWindow(t, 69.2, 77.7, .8));
  uiHero.style.opacity = uiOpacity;
  uiHero.style.transform = `rotate(${lerp(-1.3, 0, expoOut(local))}deg) scale(${lerp(.93, 1, expoOut(local))})`;
  if (index === 6) {
    const move = easeInOut(clamp((t - 52.3) / 3.8));
    cursor.style.left = `${lerp(89, 12, move)}%`;
    cursor.style.top = `${lerp(12, 34, move)}%`;
    const click = clamp(1 - Math.abs(t - 56.5) / .7);
    clickRing.style.opacity = click;
    clickRing.style.transform = `scale(${lerp(.45, 1.7, 1 - click)})`;
  } else {
    cursor.style.left = "12%";
    cursor.style.top = "34%";
    clickRing.style.opacity = 0;
  }
}

function render(t) {
  currentTime = clamp(t, 0, DURATION - .001);
  const index = sceneAt(currentTime);
  const scene = scenes[index];
  const local = localProgress(scene, currentTime);
  const [x, y, scale] = mixCamera(index, currentTime);
  world.style.transform = `translate(${x}px,${y}px) scale(${scale})`;

  if (index !== lastScene) {
    title.textContent = scene.title;
    subtitle.textContent = scene.sub;
    phaseNumber.textContent = String(index).padStart(2, "0");
    phaseLabel.textContent = scene.label;
    runningLocation.textContent = scene.location;
    [...chapters.children].forEach((button, i) => button.classList.toggle("active", i === index));
    lastScene = index;
  }
  const titleReveal = expoOut(clamp(local / .12));
  document.querySelector(".title-block").style.opacity = titleReveal;
  document.querySelector(".title-block").style.transform = `translateY(${(1 - titleReveal) * 13}px)`;
  renderRoutes(index, currentTime, local);
  renderNodes(scene, index, local);
  renderDetails(currentTime);
  renderSpecials(index, currentTime, local);
  scrubber.value = currentTime.toFixed(2);
  timecode.textContent = `${formatTime(currentTime)} / 01:32`;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function fitStage() {
  const availableWidth = window.innerWidth - 32;
  const availableHeight = Math.max(520, window.innerHeight - 132);
  const fit = Math.min(1, availableWidth / 1600, availableHeight / 900);
  document.documentElement.style.setProperty("--fit", fit.toFixed(4));
  document.querySelector(".controls").style.top = `${18 + 900 * fit + 12}px`;
  document.querySelector(".shell").style.height = `${900 * fit + 128}px`;
}

scenes.forEach((scene, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = `${String(index).padStart(2,"0")} ${scene.label}`;
  button.addEventListener("click", () => {
    playing = false;
    playButton.textContent = "播放";
    render(scene.start + .02);
  });
  chapters.append(button);
});

playButton.addEventListener("click", () => {
  playing = !playing;
  lastTick = null;
  playButton.textContent = playing ? "暂停" : "播放";
});
scrubber.addEventListener("input", event => {
  playing = false;
  playButton.textContent = "播放";
  render(Number(event.target.value));
});
window.addEventListener("resize", fitStage);
window.addEventListener("beforeunload", () => localStorage.setItem("mcp-apps-animation-time", currentTime.toFixed(2)));
window.addEventListener("keydown", event => {
  if (event.code === "Space") { event.preventDefault(); playButton.click(); }
  if (event.code === "ArrowRight") { playing = false; playButton.textContent = "播放"; render(currentTime + 2); }
  if (event.code === "ArrowLeft") { playing = false; playButton.textContent = "播放"; render(currentTime - 2); }
});

window.__seek = value => { playing = false; render(Number(value)); };
window.__setTime = window.__seek;

function tick(now) {
  if (lastTick === null) {
    lastTick = now;
    render(currentTime);
    window.__ready = true;
    requestAnimationFrame(tick);
    return;
  }
  const delta = Math.min(.05, (now - lastTick) / 1000);
  lastTick = now;
  if (playing) {
    let next = currentTime + delta;
    if (next >= DURATION) {
      next = window.__recording ? DURATION - .001 : 0;
      if (window.__recording) playing = false;
    }
    render(next);
  }
  requestAnimationFrame(tick);
}

document.fonts.ready.then(() => {
  entryRoute.setAttribute("pathLength", "1");
  appRoute.setAttribute("pathLength", "1");
  fitStage();
  playButton.textContent = playing ? "暂停" : "播放";
  render(currentTime);
  requestAnimationFrame(tick);
});
