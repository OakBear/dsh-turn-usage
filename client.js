window.__ModuleLoader__.load({id:'dsh-turn-usage',factory:(require)=>{var module={exports:{}};var exports=module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// client-src/index.js
var index_exports = {};
__export(index_exports, {
  TurnUsagePanel: () => TurnUsagePanel,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var React = __toESM(require("react"), 1);
var h = React.createElement;
var name = "turn-usage-client";
var inject = ["connection", "betterSidebar"];
var TAB_ID = "turn-usage";
var fmt = (n) => {
  if (n == null) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
};
var fmtTime = (ts) => {
  const d = new Date(ts);
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
var hitColor = (pct) => {
  if (pct == null) return "var(--dsh-text-muted, #888)";
  if (pct >= 80) return "var(--dsh-green, #22a06b)";
  if (pct >= 40) return "var(--dsh-yellow, #d97706)";
  return "var(--dsh-red, #dc2626)";
};
function TurnRow({ t }) {
  return h(
    "tr",
    { style: { borderBottom: "1px solid var(--dsh-border, #e5e7eb)" } },
    h("td", { style: tdStyle, title: `turn ${t.turn} · step ${t.step}
${new Date(t.ts).toLocaleString()}` }, fmtTime(t.ts)),
    h("td", { style: { ...tdStyle, textAlign: "right" } }, fmt(t.inputTokens)),
    h("td", { style: { ...tdStyle, textAlign: "right" } }, fmt(t.cacheReadTokens)),
    h(
      "td",
      { style: { ...tdStyle, textAlign: "right", color: hitColor(t.cacheHitPct), fontWeight: 600 } },
      t.cacheHitPct == null ? "—" : `${t.cacheHitPct}%`
    ),
    h("td", { style: { ...tdStyle, textAlign: "right" } }, fmt(t.outputTokens))
  );
}
var tdStyle = { padding: "3px 8px", whiteSpace: "nowrap", fontSize: 12 };
function TurnUsagePanel({ rpcCall, visible }) {
  const [rows, setRows] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [auto, setAuto] = React.useState(true);
  const load = React.useCallback(async () => {
    try {
      const value = await rpcCall("usage.list", { limit: 400 });
      setRows(value.sessions ?? []);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [rpcCall]);
  React.useEffect(() => {
    if (visible === false) return;
    load();
    if (!auto) return;
    const timer = setInterval(load, 5e3);
    return () => clearInterval(timer);
  }, [load, auto, visible]);
  if (!visible) return null;
  const latest = rows?.[0];
  return h(
    "div",
    { style: { padding: 12, overflow: "auto", height: "100%", boxSizing: "border-box" } },
    // 最新一轮摘要
    latest && h(
      "div",
      { style: { marginBottom: 10, padding: "8px 10px", borderRadius: 8, background: "var(--dsh-bg-secondary, #f6f7f9)" } },
      h("div", { style: { fontSize: 12, opacity: 0.7, marginBottom: 2 } }, "最新一轮"),
      h(
        "div",
        { style: { display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap" } },
        h(
          "span",
          { style: { fontSize: 22, fontWeight: 700, color: hitColor(latest.cacheHitPct) } },
          latest.cacheHitPct == null ? "—" : `${latest.cacheHitPct}%`
        ),
        h("span", { style: { fontSize: 12 } }, "缓存命中率"),
        h("span", { style: { fontSize: 12, opacity: 0.8 } }, `输入 ${fmt(latest.inputTokens)} · 输出 ${fmt(latest.outputTokens)}`)
      )
    ),
    // 工具条
    h(
      "div",
      { style: { display: "flex", gap: 8, marginBottom: 6, alignItems: "center" } },
      h("button", { onClick: load, style: btnStyle }, "刷新"),
      h(
        "button",
        { onClick: () => setAuto((a) => !a), style: btnStyle },
        auto ? "自动刷新: 开" : "自动刷新: 关"
      ),
      h("button", {
        onClick: async () => {
          await rpcCall("usage.clear", {});
          load();
        },
        style: btnStyle
      }, "清空")
    ),
    error && h("div", { style: { color: "var(--dsh-red, #dc2626)", fontSize: 12, margin: "6px 0" } }, `读取失败: ${error}`),
    // 明细表
    h(
      "table",
      { style: { borderCollapse: "collapse", width: "100%" } },
      h("thead", null, h(
        "tr",
        null,
        ["时间", "输入", "命中数", "命中", "输出"].map((title, i) => h("th", {
          key: title,
          style: { ...tdStyle, textAlign: i === 0 ? "left" : "right", fontWeight: 600, opacity: 0.6, position: "sticky", top: 0, background: "var(--dsh-bg, #fff)" }
        }, title))
      )),
      h("tbody", null, (rows ?? []).map((t, i) => h(TurnRow, { key: `${t.sessionId}-${t.turn}-${t.step}`, t })))
    ),
    rows != null && rows.length === 0 && h(
      "div",
      { style: { opacity: 0.6, padding: "12px 0" } },
      "还没有数据 — 发一条消息后这里会出现每一轮的用量。"
    )
  );
}
var btnStyle = {
  fontSize: 12,
  padding: "3px 10px",
  borderRadius: 6,
  cursor: "pointer",
  border: "1px solid var(--dsh-border, #d1d5db)",
  background: "var(--dsh-bg, #fff)",
  color: "var(--dsh-text, inherit)"
};
function apply(ctx) {
  const rpcCall = async (method, payload) => {
    const result = await ctx.connection.rpc.call("/api", "turn-usage", { method, payload });
    if (!result?.ok) throw new Error(result?.error?.message || "无法读取每轮用量");
    return result.value;
  };
  ctx.inject(["betterSidebar"], (scope) => {
    scope.effect(() => scope.betterSidebar.registerTab({
      id: TAB_ID,
      title: "每轮用量",
      description: "每一轮请求的输入、缓存命中率、输出与时间",
      order: 31,
      single: true,
      component: (props) => h(TurnUsagePanel, {
        rpcCall,
        visible: props.visible !== false
      })
    }), "turn-usage: sidebar tab");
  });
}

return module.exports;}});
