// ═══════════════════════════════════════════════════════
// FF14 每日纷争前线 — iOS Scriptable 小组件（7.5版）
// ═══════════════════════════════════════════════════════
// 🖼️ 背景图功能:
//   在 Scriptable 里直接运行此脚本 → 弹出菜单：
//   「选择背景图」从相册选一张图
//   「恢复默认」删除背景图，回到纯色渐变
//   「预览小组件」仅预览，不改背景
//   选好后小组件会自动使用这张图做背景
//
// ⚠️ 校准: 如地图不一致，修改 KNOWN_DATE 和 KNOWN_MAP（详见说明）
// ═══════════════════════════════════════════════════════

// ── 校准设置 ──
// KNOWN_DATE：填你打这张图的日期（白天打的是什么图就填当天）
// KNOWN_MAP：对照轮换表填 1-8
// 例如：5月8日白天打的是昂萨哈凯尔，就填 "2026-05-08" 和 3
const KNOWN_DATE = "2026-05-08";
const KNOWN_MAP = 3;

const RESET_HOUR_UTC = 15; // 北京时间 23:00

// 背景图遮罩透明度（0-1，越大越暗，文字越清晰）
const OVERLAY_OPACITY = 0.65;
// 背景图模糊程度（0=不模糊，1-10 越大越模糊，推荐3-5）
const BLUR_LEVEL = 3;

const MAPS = [
  { name: "尘封秘岩", mode: "争夺战", en: "Borderland Ruins",   icon: "⚔️", color: new Color("#c97d3c"), accent: new Color("#ffd080") },
  { name: "荣誉野",   mode: "碎冰战", en: "Fields of Glory",    icon: "❄️", color: new Color("#3cc9a3"), accent: new Color("#80ffd8") },
  { name: "昂萨哈凯尔", mode: "竞争战", en: "Onsal Hakair",      icon: "🏴", color: new Color("#c93c6e"), accent: new Color("#ff80b0") },
  { name: "沃刻其特",  mode: "演习战", en: "Worqor Chirteh",     icon: "🐉", color: new Color("#8b5cf6"), accent: new Color("#c4b5fd") },
  { name: "尘封秘岩", mode: "争夺战", en: "Borderland Ruins",   icon: "⚔️", color: new Color("#c97d3c"), accent: new Color("#ffd080") },
  { name: "周边遗迹群", mode: "阵地战", en: "Seal Rock",          icon: "🪨", color: new Color("#3c8cc9"), accent: new Color("#80d0ff") },
  { name: "昂萨哈凯尔", mode: "竞争战", en: "Onsal Hakair",      icon: "🏴", color: new Color("#c93c6e"), accent: new Color("#ff80b0") },
  { name: "沃刻其特",  mode: "演习战", en: "Worqor Chirteh",     icon: "🐉", color: new Color("#8b5cf6"), accent: new Color("#c4b5fd") },
];

// ── 背景图管理 ──
const fm = FileManager.local();
const bgPath = fm.joinPath(fm.documentsDirectory(), "ff14_frontline_bg.jpg");

async function pickBackground() {
  const imgs = await Photos.fromLibrary();
  fm.writeImage(bgPath, imgs);
}

function removeBackground() {
  if (fm.fileExists(bgPath)) fm.remove(bgPath);
}

function hasBackground() {
  return fm.fileExists(bgPath);
}

function loadBackground() {
  return fm.readImage(bgPath);
}

// 等比裁切：居中填满目标尺寸，不变形（类似 CSS cover）
function cropToFill(img, width, height) {
  const imgW = img.size.width;
  const imgH = img.size.height;
  // 计算缩放比例，取大值确保填满
  const scale = Math.max(width / imgW, height / imgH);
  const drawW = Math.round(imgW * scale);
  const drawH = Math.round(imgH * scale);
  // 居中偏移（溢出部分被裁掉）
  const x = Math.round((width - drawW) / 2);
  const y = Math.round((height - drawH) / 2);
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.respectScreenScale = true;
  ctx.drawImageInRect(img, new Rect(x, y, drawW, drawH));
  return ctx.getImage();
}

// 给背景图加模糊 + 暗色遮罩
function createOverlayImage(img, width, height) {
  // 先等比裁切，不变形
  let processed = cropToFill(img, width, height);

  // 模糊处理：通过缩小再放大实现（BLUR_LEVEL越大越模糊）
  if (BLUR_LEVEL > 0) {
    const scale = Math.max(0.02, 1 / (1 + BLUR_LEVEL * 1.5));
    const smallW = Math.round(width * scale);
    const smallH = Math.round(height * scale);
    const ctxSmall = new DrawContext();
    ctxSmall.size = new Size(smallW, smallH);
    ctxSmall.respectScreenScale = false;
    ctxSmall.drawImageInRect(processed, new Rect(0, 0, smallW, smallH));
    const smallImg = ctxSmall.getImage();
    const ctxBig = new DrawContext();
    ctxBig.size = new Size(width, height);
    ctxBig.respectScreenScale = false;
    ctxBig.drawImageInRect(smallImg, new Rect(0, 0, width, height));
    processed = ctxBig.getImage();
  }

  // 叠加暗色遮罩
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.respectScreenScale = true;
  ctx.drawImageInRect(processed, new Rect(0, 0, width, height));
  ctx.setFillColor(new Color("#0c0a14", OVERLAY_OPACITY));
  ctx.fillRect(new Rect(0, 0, width, height));
  return ctx.getImage();
}

// ── 计算逻辑 ──
function getResetTime(date) {
  let d = new Date(date);
  d.setUTCHours(RESET_HOUR_UTC, 0, 0, 0);
  if (date < d) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

function getMapIndex(now) {
  // 用白天12:00解析，对应的就是当天在打的地图
  const knownReset = getResetTime(new Date(KNOWN_DATE + "T12:00:00+08:00"));
  const todayReset = getResetTime(now);
  const daysDiff = Math.round((todayReset - knownReset) / 86400000);
  return (((KNOWN_MAP - 1 + daysDiff) % 8) + 8) % 8;
}

function getMapForDay(offset) {
  const d = new Date(Date.now() + offset * 86400000);
  return MAPS[getMapIndex(d)];
}

function formatCountdown(ms) {
  if (ms <= 0) return "已刷新";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}时${m}分`;
}

function formatDate(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const wk = ["日", "一", "二", "三", "四", "五", "六"];
  return `${d.getMonth() + 1}/${d.getDate()} 周${wk[d.getDay()]}`;
}

// ── 构建小组件 ──
function buildWidget() {
  const now = new Date();
  const todayMap = MAPS[getMapIndex(now)];
  const nextReset = new Date(getResetTime(now).getTime() + 86400000);
  const countdown = nextReset - now;
  const widgetFamily = config.widgetFamily || "medium";

  const w = new ListWidget();

  // 背景处理
  if (hasBackground()) {
    const rawImg = loadBackground();
    // 小组件尺寸（近似值，实际会自动裁切）
    const sizes = {
      small: { w: 370, h: 370 },
      medium: { w: 370 * 2 + 36, h: 370 },
      large: { w: 370 * 2 + 36, h: 370 * 2 + 36 },
    };
    const s = sizes[widgetFamily] || sizes.medium;
    w.backgroundImage = createOverlayImage(rawImg, s.w, s.h);
  } else {
    const bg = new LinearGradient();
    bg.locations = [0, 1];
    bg.colors = [new Color("#0c0a14"), new Color("#12101e")];
    w.backgroundGradient = bg;
  }

  w.setPadding(14, 16, 14, 16);
  w.refreshAfterDate = nextReset;

  if (widgetFamily === "small") {
    // ── Small ──
    const t = w.addText("每日纷争前线");
    t.font = Font.boldSystemFont(11);
    t.textColor = new Color("#ffffff", 0.35);

    w.addSpacer(6);

    const icon = w.addText(todayMap.icon);
    icon.font = Font.systemFont(32);

    w.addSpacer(4);

    const name = w.addText(todayMap.name);
    name.font = Font.boldSystemFont(18);
    name.textColor = Color.white();

    const mode = w.addText(todayMap.mode);
    mode.font = Font.boldSystemFont(12);
    mode.textColor = todayMap.accent;

    const en = w.addText(todayMap.en);
    en.font = Font.systemFont(10);
    en.textColor = new Color("#ffffff", 0.3);

    w.addSpacer();

    const cd = w.addText(`⏱ ${formatCountdown(countdown)}`);
    cd.font = Font.mediumSystemFont(11);
    cd.textColor = new Color("#ffffff", 0.4);

  } else {
    // ── Medium ──
    const header = w.addStack();
    header.layoutHorizontally();
    header.centerAlignContent();

    const title = header.addText("FF14 每日纷争前线 · 7.5");
    title.font = Font.boldSystemFont(11);
    title.textColor = new Color("#ffffff", 0.35);

    header.addSpacer();

    const cdTxt = header.addText(`⏱ ${formatCountdown(countdown)}`);
    cdTxt.font = Font.mediumSystemFont(11);
    cdTxt.textColor = todayMap.accent;

    w.addSpacer(8);

    // Today card
    const card = w.addStack();
    card.layoutHorizontally();
    card.centerAlignContent();
    card.setPadding(10, 12, 10, 12);
    card.cornerRadius = 12;
    card.backgroundColor = new Color(todayMap.color.hex, 0.15);
    card.borderColor = new Color(todayMap.color.hex, 0.3);
    card.borderWidth = 1;

    const iconEl = card.addText(todayMap.icon);
    iconEl.font = Font.systemFont(28);
    card.addSpacer(10);

    const info = card.addStack();
    info.layoutVertically();

    const label = info.addText("今日地图");
    label.font = Font.boldSystemFont(9);
    label.textColor = todayMap.accent;

    const nameRow = info.addStack();
    nameRow.layoutHorizontally();
    nameRow.centerAlignContent();
    nameRow.spacing = 6;

    const nameEl = nameRow.addText(todayMap.name);
    nameEl.font = Font.boldSystemFont(17);
    nameEl.textColor = Color.white();

    const modeEl = nameRow.addText(todayMap.mode);
    modeEl.font = Font.boldSystemFont(12);
    modeEl.textColor = todayMap.accent;

    const enEl = info.addText(todayMap.en);
    enEl.font = Font.systemFont(10);
    enEl.textColor = new Color("#ffffff", 0.35);

    card.addSpacer();

    w.addSpacer(6);

    // Upcoming 3 days
    const row = w.addStack();
    row.layoutHorizontally();
    row.spacing = 0;

    for (let i = 1; i <= 3; i++) {
      const mp = getMapForDay(i);
      const col = row.addStack();
      col.layoutVertically();
      col.centerAlignContent();

      row.addSpacer();

      const dateEl = col.addText(formatDate(i));
      dateEl.font = Font.systemFont(9);
      dateEl.textColor = new Color("#ffffff", 0.3);

      const fIcon = col.addText(mp.icon);
      fIcon.font = Font.systemFont(16);

      const fName = col.addText(mp.name);
      fName.font = Font.boldSystemFont(10);
      fName.textColor = new Color("#ffffff", 0.7);

      const fMode = col.addText(mp.mode);
      fMode.font = Font.systemFont(8);
      fMode.textColor = new Color("#ffffff", 0.3);
    }
  }

  return w;
}

// ── 主流程 ──
if (config.runsInWidget) {
  // 小组件模式：直接渲染
  const widget = buildWidget();
  Script.setWidget(widget);
} else {
  // App内运行：弹出设置菜单
  const alert = new Alert();
  alert.title = "FF14 纷争前线小组件";
  alert.message = hasBackground()
    ? "当前已设置自定义背景图"
    : "当前使用默认渐变背景";
  alert.addAction("🖼️ 选择背景图");
  alert.addAction("🗑️ 恢复默认背景");
  alert.addAction("👁️ 预览小组件");
  alert.addCancelAction("取消");

  const choice = await alert.presentSheet();

  if (choice === 0) {
    // 选择背景图
    await pickBackground();
    const a2 = new Alert();
    a2.title = "✅ 背景图已保存";
    a2.message = "小组件会在下次刷新时使用新背景。\n可修改代码顶部：\nOVERLAY_OPACITY 调亮暗（默认0.65）\nBLUR_LEVEL 调模糊（0-10，默认3）";
    a2.addAction("预览效果");
    a2.addCancelAction("好的");
    const c2 = await a2.presentAlert();
    if (c2 === 0) {
      const widget = buildWidget();
      const sf = config.widgetFamily || "medium";
      sf === "small" ? await widget.presentSmall() : await widget.presentMedium();
    }
  } else if (choice === 1) {
    // 恢复默认
    removeBackground();
    const a3 = new Alert();
    a3.title = "✅ 已恢复默认背景";
    a3.message = "小组件将使用纯色渐变背景。";
    a3.addAction("好的");
    await a3.presentAlert();
  } else if (choice === 2) {
    // 仅预览
    const widget = buildWidget();
    const sf = config.widgetFamily || "medium";
    sf === "small" ? await widget.presentSmall() : await widget.presentMedium();
  }
}

Script.complete();
