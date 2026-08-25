import { useState, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";

/* ═══════════════ ESCALA — gestor de plantões ═══════════════ */

const KEY = "escala-plantao-v1";
const PALETTE = ["#0E7A5F","#2563EB","#7C3AED","#DB2777","#DC2626","#EA580C","#B98207","#65A30D","#0D9488","#0891B2","#8B5E34","#475569"];
const WD = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const WD_FULL = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"];
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MONTHS_S = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

/* ── utils ── */
const pad = n => String(n).padStart(2, "0");
const ds = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pd = s => { const [a, b, c] = String(s).split("-").map(Number); return new Date(a, b - 1, c); };
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ds(d); };
const addMonths = (s, n) => { const d = pd(s), day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return ds(d); };
const todayStr = () => ds(new Date());
const mKey = s => String(s || "").slice(0, 7);
const daysBetween = (a, b) => Math.round((pd(b) - pd(a)) / 86400000);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* dinheiro — MASK liga o modo "ocultar valores" (definido pelo App a cada render) */
let MASK = false;
const setMask = v => { MASK = !!v; };
const fmtBRL = v => (MASK ? "R$ ••••" : (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const fmtNum = v => (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtBRLk = v => { if (MASK) return "R$ ••"; const n = Math.abs(v || 0); return n >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k` : fmtBRL(v); };

/* datas por extenso */
const fmtDateLong = s => { const d = pd(s); return `${d.getDate()} de ${MONTHS_S[d.getMonth()]}. de ${d.getFullYear()}`; };
const fmtDateShort = s => { const d = pd(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const fmtDayMon = s => { const d = pd(s); return `${d.getDate()} ${MONTHS_S[d.getMonth()]}`; };
const fmtWdDay = s => { const d = pd(s); return `${WD[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
const fmtDayMonY = s => { const d = pd(s); const y = new Date().getFullYear(); return `${d.getDate()} de ${MONTHS_S[d.getMonth()]}.${d.getFullYear() === y ? "" : ` de ${d.getFullYear()}`}`; };
const relDay = s => { const n = daysBetween(todayStr(), s); return n === 0 ? "hoje" : n === 1 ? "amanhã" : n === -1 ? "ontem" : n > 1 ? `em ${n} dias` : `há ${-n} dias`; };

/* horas e duração (plantões podem passar de 24 h) */
const toMin = t => { const [h, mi] = String(t || "0:0").split(":").map(Number); return (h || 0) * 60 + (mi || 0); };
const fromMin = m => { const x = ((m % 1440) + 1440) % 1440; return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; };
const plusMin = (dateStr, timeStr, mins) => { const tot = toMin(timeStr) + mins; return { date: addDays(dateStr, Math.floor(tot / 1440)), time: fromMin(tot) }; };
const durOfTimes = (t1, t2) => { const v = toMin(t2) - toMin(t1); return v > 0 ? v : v + 1440; };
const spanMin = (d1, t1, d2, t2) => { if (!d1 || !d2 || !t1 || !t2) return 0; const v = daysBetween(d1, d2) * 1440 + toMin(t2) - toMin(t1); return v > 0 ? v : 0; };
/* compatível com plantões antigos, que só tinham hora de fim */
const endDateOf = s => s.endDate || (toMin(s.endTime) <= toMin(s.startTime) ? addDays(s.date, 1) : s.date);
const shiftMin = s => spanMin(s.date, s.startTime, endDateOf(s), s.endTime);
const shiftHours = s => shiftMin(s) / 60;
const spanDays = s => { const n = Math.min(Math.max(0, daysBetween(s.date, endDateOf(s))), 14); const out = []; for (let i = 0; i <= n; i++) out.push(addDays(s.date, i)); return out; };
const fmtDur = mins => { const h = Math.floor(mins / 60), mi = Math.round(mins % 60); return mi ? `${h}h${pad(mi)}` : `${h}h`; };
const fmtH = h => fmtDur(Math.round((h || 0) * 60));
const DUR_PRESETS = [6, 12, 24, 36, 48];

/* plantão não realizado (folga, troca, falta) — fica no calendário, sai das contas */
const REASONS = [["folga", "Folga"], ["troca", "Troca"], ["falta", "Falta"], ["outro", "Outro"]];
const reasonLabel = r => (REASONS.find(x => x[0] === r) || [null, "Não realizado"])[1];
const isOn = s => !s.notDone;

/* pagamento */
const paidAtOf = s => s.paidAt || s.paymentDate || s.date;
const isOverdue = (s, today) => !s.paid && !!s.paymentDate && s.paymentDate < (today || todayStr());
const autoPay = (loc, dateStr) => {
  if (!loc || !dateStr) return null;
  if (loc.payType === "days") return addDays(dateStr, Number(loc.payValue) || 0);
  if (loc.payType === "fixedDay") {
    const d = pd(dateStr); let y = d.getFullYear(), m = d.getMonth() + 1;
    if (m > 11) { m = 0; y++; }
    const last = new Date(y, m + 1, 0).getDate();
    return ds(new Date(y, m, Math.min(Number(loc.payValue) || 1, last)));
  }
  return null;
};

/* ── repetição ── */
const MAX_OCC = 400;            // teto de plantões criados de uma vez
const OPEN_MONTHS = 24;         // "sem data final" gera 2 anos e pode ser estendido depois

function repEnd(rep) { return rep.endMode || (rep.count ? "count" : rep.until ? "until" : "until"); }

function genDates(startStr, rep) {
  if (!rep || rep.type === "none") return [startStr];
  const mode = repEnd(rep);
  const limit = mode === "until" ? (rep.until || addDays(startStr, 90)) : addMonths(startStr, OPEN_MONTHS);
  const maxN = mode === "count" ? Math.max(1, Math.min(MAX_OCC, Number(rep.count) || 12)) : MAX_OCC;
  const start = pd(startStr);
  const out = [];
  const push = v => { if (v >= startStr && v <= limit && !out.includes(v)) out.push(v); };

  if (rep.type === "monthlyDay" || rep.type === "monthlyPos") {
    const bDay = start.getDate(), bWd = start.getDay(), bPos = Math.floor((bDay - 1) / 7);
    for (let i = 0; i < 12 * OPEN_MONTHS + 24 && out.length < maxN; i++) {
      const ref = new Date(start.getFullYear(), start.getMonth() + i, 1);
      let cand = null;
      if (rep.type === "monthlyDay") {
        const last = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
        cand = ds(new Date(ref.getFullYear(), ref.getMonth(), Math.min(bDay, last)));
      } else {
        const firstWd = ref.getDay();
        const day = 1 + ((bWd - firstWd + 7) % 7) + bPos * 7;
        const last = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
        cand = day <= last ? ds(new Date(ref.getFullYear(), ref.getMonth(), day)) : null;
      }
      if (!cand) continue;
      if (cand > limit) break;
      push(cand);
    }
  } else {
    const step = Math.max(1, Number(rep.every) || 2);
    let d = new Date(start), guard = 0;
    while (ds(d) <= limit && out.length < maxN && guard < 4000) {
      const dd = Math.round((d - start) / 86400000), wd = d.getDay();
      let ok = false;
      if (rep.type === "daily") ok = true;
      else if (rep.type === "weekly") ok = (rep.weekdays || []).includes(wd);
      else if (rep.type === "biweekly") { const w = Math.floor((dd + start.getDay()) / 7); ok = (rep.weekdays || []).includes(wd) && w % 2 === 0; }
      else if (rep.type === "custom") ok = dd % step === 0;
      if (ok) push(ds(d));
      d.setDate(d.getDate() + 1); guard++;
    }
  }
  if (!out.includes(startStr)) out.unshift(startStr);
  return out.slice(0, maxN);
}

/* escalas usadas na prática: horas de plantão × horas de descanso */
const SCALES = [
  { k: "12×36", h: 12, every: 2, desc: "12 h de plantão, 36 h de folga" },
  { k: "24×48", h: 24, every: 3, desc: "24 h de plantão, 48 h de folga" },
  { k: "12×60", h: 12, every: 3, desc: "12 h de plantão, 60 h de folga" },
  { k: "24×72", h: 24, every: 4, desc: "24 h de plantão, 72 h de folga" },
];

const repEndLabel = rep => {
  const mode = repEnd(rep);
  if (mode === "never") return "sem data final";
  if (mode === "count") return `${Math.max(1, Number(rep.count) || 12)} vezes`;
  return `até ${fmtDateShort(rep.until)}`;
};

const repLabel = rep => {
  if (!rep || rep.type === "none") return "Nunca";
  const dias = (rep.weekdays || []).map(w => WD[w]).join(", ");
  const base =
    rep.scale ? `Escala ${rep.scale}` :
    rep.type === "daily" ? "Todos os dias" :
    rep.type === "weekly" ? `Toda semana · ${dias}` :
    rep.type === "biweekly" ? `A cada 2 semanas · ${dias}` :
    rep.type === "monthlyDay" ? "Todo mês, no mesmo dia" :
    rep.type === "monthlyPos" ? "Todo mês, na mesma semana" :
    rep.type === "custom" ? `A cada ${rep.every || 2} dias` : "Nunca";
  return `${base} · ${repEndLabel(rep)}`;
};

/* ── temas ── */
const THEMES = {
  light: {
    bg: "#F4F6F5", card: "#FFFFFF", card2: "#F1F4F2", text: "#0F1A15", sub: "#6C7A73",
    line: "#ECF0EE", line2: "#F3F6F4", accent: "#0E7A5F", onAccent: "#FFFFFF", accentSoft: "#E3F0EA",
    amber: "#96620A", amberSoft: "#FBF1E0", red: "#C33B2C", redSoft: "#FBE7E3",
    nav: "rgba(255,255,255,.84)", shadow: "0 8px 28px rgba(15,26,21,.07)", chip: "#F0F3F1",
  },
  dark: {
    bg: "#0A0F0D", card: "#151B18", card2: "#1C2420", text: "#EAF1ED", sub: "#93A39B",
    line: "#222C27", line2: "#1B2320", accent: "#3ECDA0", onAccent: "#06251C", accentSoft: "#123028",
    amber: "#E8AE4B", amberSoft: "#332810", red: "#EC7663", redSoft: "#391A15",
    nav: "rgba(14,19,17,.84)", shadow: "0 8px 28px rgba(0,0,0,.5)", chip: "#1E2723",
  },
};

/* ── ícones ── */
const Ic = ({ path, size = 22, sw = 1.8, color = "currentColor", fill = "none" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {path.split("|").map((p, i) => <path key={i} d={p} />)}
  </svg>
);
const P = {
  cal: "M8 2v4|M16 2v4|M3 9.5h18|M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  money: "M3 7h18v12H3z|M12 15.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z|M6 7v0|M6.5 19v-2|M17.5 19v-2",
  chart: "M4 20V11|M10 20V5|M16 20v-7|M2 20h20",
  pin: "M12 21c-4-3.6-7-7-7-10.5A7 7 0 0 1 19 10.5C19 14 16 17.4 12 21z|M12 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  gear: "M4 7h9|M17 7h3|M15 5v4|M4 17h3|M11 17h9|M9 15v4",
  plus: "M12 5v14|M5 12h14",
  chevL: "M14.5 6 8.5 12l6 6",
  chevR: "M9.5 6l6 6-6 6",
  chev: "M9 6l6 6-6 6",
  x: "M6 6l12 12|M18 6 6 18",
  check: "M4.5 12.5 10 18 19.5 7",
  repeat: "M17 2l3 3-3 3|M20 5H8a4 4 0 0 0-4 4v1|M7 22l-3-3 3-3|M4 19h12a4 4 0 0 0 4-4v-1",
  trash: "M4 7h16|M9 7V4h6v3|M6.5 7l1 13h9l1-13|M10 11v5.5|M14 11v5.5",
  copy: "M9 9h10v12H9z|M5 15V3h10",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z|M12 7v5l3.5 2",
  edit: "M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z|M13.5 6.5l3 3",
  filter: "M4 6h16|M7 12h10|M10 18h4",
  down: "M12 4v12|M6 10.5 12 16.5l6-6|M5 20h14",
  alert: "M12 3 2.5 20h19z|M12 9.5v4.5|M12 17.2v.3",
  eye: "M2 12s3.7-6.5 10-6.5S22 12 22 12s-3.7 6.5-10 6.5S2 12 2 12z|M12 14.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z",
  eyeOff: "M3 3l18 18|M10.2 10.2a2.6 2.6 0 0 0 3.6 3.6|M9.8 5.7A9.7 9.7 0 0 1 12 5.5c6.3 0 10 6.5 10 6.5a17 17 0 0 1-3.3 4.1|M6.5 6.7A16.6 16.6 0 0 0 2 12s3.7 6.5 10 6.5c1 0 1.9-.1 2.7-.4",
  off: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z|M5.6 5.6l12.8 12.8",
  sort: "M7 4v16|M4 17l3 3 3-3|M17 20V4|M14 7l3-3 3 3",
  scale: "M4 6h16|M4 12h10|M4 18h6",
};

/* ── primitivos de UI ── */
const Card = ({ T, children, style, onClick }) => (
  <div onClick={onClick} style={{ background: T.card, borderRadius: 22, padding: 16, boxShadow: T.shadow, ...style }}>{children}</div>
);

const Toggle = ({ T, on, onChange }) => (
  <button onClick={() => onChange(!on)} aria-pressed={on} style={{
    width: 50, height: 30, borderRadius: 999, border: "none", cursor: "pointer", padding: 3,
    background: on ? T.accent : T.chip, transition: "background .2s", flexShrink: 0,
  }}>
    <div style={{ width: 24, height: 24, borderRadius: 999, background: "#fff", transform: `translateX(${on ? 20 : 0}px)`, transition: "transform .2s", boxShadow: "0 1px 4px rgba(0,0,0,.25)" }} />
  </button>
);

const Badge = ({ T, paid, overdue, off }) => {
  const [bg, fg, txt] = off ? [T.chip, T.sub, "NÃO FEITO"]
    : paid ? [T.accentSoft, T.accent, "PAGO"]
    : overdue ? [T.redSoft, T.red, "ATRASADO"] : [T.amberSoft, T.amber, "A RECEBER"];
  return (
    <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: .4, padding: "4px 8px", borderRadius: 7, whiteSpace: "nowrap", background: bg, color: fg }}>{txt}</span>
  );
};

const Sheet = ({ T, title, onClose, children, footer }) => (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(5,10,8,.45)", backdropFilter: "blur(2px)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn .18s ease" }}>
    <div onClick={e => e.stopPropagation()} style={{
      width: "100%", maxWidth: 430, maxHeight: "93dvh", background: T.bg, borderRadius: "28px 28px 0 0",
      display: "flex", flexDirection: "column", animation: "slideUp .26s cubic-bezier(.2,.9,.3,1)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 16px 10px" }}>
        <div style={{ width: 62, display: "flex" }}>
          <button onClick={onClose} aria-label="Fechar" style={{ width: 34, height: 34, borderRadius: 999, border: "none", background: T.chip, color: T.text, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}><Ic path={P.x} size={16} /></button>
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: "center", fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: 16.5, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ width: 62, display: "flex", justifyContent: "flex-end" }}>{footer}</div>
      </div>
      <div style={{ overflowY: "auto", padding: "6px 16px 34px", WebkitOverflowScrolling: "touch" }}>{children}</div>
    </div>
  </div>
);

const Dialog = ({ T, title, msg, options, onClose }) => (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(5,10,8,.5)", zIndex: 80, display: "grid", placeItems: "center", padding: 24, animation: "fadeIn .15s ease" }}>
    <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 320, background: T.card, borderRadius: 24, padding: 20, boxShadow: T.shadow }}>
      <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: 17, color: T.text, textAlign: "center" }}>{title}</div>
      {msg && <div style={{ fontSize: 13.5, color: T.sub, textAlign: "center", marginTop: 8, lineHeight: 1.45 }}>{msg}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
        {options.map((o, i) => (
          <button key={i} onClick={() => { o.fn && o.fn(); onClose(); }} style={{
            padding: "13px 14px", borderRadius: 15, border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600, fontFamily: "inherit",
            background: o.danger ? T.redSoft : o.primary ? T.accent : T.chip,
            color: o.danger ? T.red : o.primary ? T.onAccent : T.text,
          }}>{o.label}</button>
        ))}
        <button onClick={onClose} style={{ padding: "12px 14px", borderRadius: 15, border: "none", cursor: "pointer", fontSize: 15, fontWeight: 500, background: "transparent", color: T.sub, fontFamily: "inherit" }}>Cancelar</button>
      </div>
    </div>
  </div>
);

const Row = ({ T, label, right, onClick, first, last }) => (
  <button onClick={onClick} style={{
    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
    padding: "14px 16px", background: T.card, border: "none", borderBottom: last ? "none" : `1px solid ${T.line}`,
    cursor: onClick ? "pointer" : "default", textAlign: "left", fontFamily: "inherit",
  }}>
    <span style={{ fontSize: 15.5, color: T.text, fontWeight: 500 }}>{label}</span>
    <span style={{ display: "flex", alignItems: "center", gap: 8, color: T.sub, fontSize: 15, minWidth: 0 }}>{right}{onClick && <Ic path={P.chev} size={15} color={T.sub} />}</span>
  </button>
);

/* campos: sem contorno, fundo suave — menos ruído na tela */
const inputStyle = T => ({
  width: "100%", padding: "13px 14px", borderRadius: 15, border: "none", background: T.chip,
  color: T.text, fontSize: 15.5, fontFamily: "inherit", outline: "none",
});
const pillStyle = T => ({
  border: "none", background: T.chip, color: T.text, borderRadius: 12, padding: "9px 10px",
  fontSize: 14.5, fontFamily: "inherit", fontVariantNumeric: "tabular-nums", outline: "none", textAlign: "center",
});
const dateStyle = T => ({ ...pillStyle(T), width: 150 });
const timeStyle = T => ({ ...pillStyle(T), width: 88 });
const sectionLabel = T => ({ fontSize: 13, fontWeight: 600, color: T.sub, margin: "20px 6px 8px" });
const groupBox = T => ({ borderRadius: 20, overflow: "hidden", background: T.card, boxShadow: T.shadow });

/* ── campo de dinheiro (máscara de centavos: digita da direita para a esquerda) ── */
const centsOf = v => Math.round((Number(v) || 0) * 100);
const MoneyInput = ({ T, value, onChange, width = 150, big, placeholder = "0,00", autoFocus }) => {
  const c = centsOf(value);
  const txt = c ? fmtNum(c / 100) : "";
  const onType = e => {
    const digits = String(e.target.value).replace(/\D/g, "").slice(0, 11);
    onChange(digits ? Number(digits) / 100 : 0);
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, width, borderRadius: 14, background: T.chip, padding: big ? "7px 10px" : "5px 10px" }}>
      <span style={{ color: T.sub, fontWeight: 700, fontSize: big ? 14.5 : 13.5 }}>R$</span>
      <input
        value={txt} onChange={onType} onFocus={e => e.target.select()}
        inputMode="numeric" enterKeyHint="done" placeholder={placeholder} autoFocus={autoFocus}
        style={{
          flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: T.text,
          textAlign: "right", fontFamily: "'Bricolage Grotesque', inherit", fontWeight: 700,
          fontSize: big ? 21 : 16.5, padding: "4px 0", fontVariantNumeric: "tabular-nums",
        }} />
      {c > 0 && (
        <button onClick={() => onChange(0)} aria-label="Limpar valor" style={{ border: "none", background: "transparent", color: T.sub, cursor: "pointer", padding: 2, display: "grid", placeItems: "center" }}>
          <Ic path={P.x} size={13} />
        </button>
      )}
    </div>
  );
};

const Chip = ({ T, on, onClick, children, small, danger }) => (
  <button onClick={onClick} style={{
    padding: small ? "7px 11px" : "9px 13px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit",
    fontWeight: 700, fontSize: small ? 12.5 : 13.5, whiteSpace: "nowrap", flexShrink: 0,
    background: on ? (danger ? T.redSoft : T.accent) : T.chip,
    color: on ? (danger ? T.red : T.onAccent) : T.sub,
  }}>{children}</button>
);

const Segmented = ({ T, value, onChange, options, style }) => (
  <div style={{ display: "flex", background: T.chip, borderRadius: 999, padding: 3, ...style }}>
    {options.map(([k, lab]) => (
      <button key={k} onClick={() => onChange(k)} style={{
        flex: 1, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, padding: "8px 8px", borderRadius: 999,
        fontFamily: "inherit", whiteSpace: "nowrap", transition: "background .15s",
        background: value === k ? T.card : "transparent", color: value === k ? T.text : T.sub,
        boxShadow: value === k ? "0 1px 3px rgba(0,0,0,.10)" : "none",
      }}>{lab}</button>
    ))}
  </div>
);

/* linha de formulário: rótulo à esquerda, controle à direita */
const FieldRow = ({ T, label, children, last }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", background: T.card, borderBottom: last ? "none" : `1px solid ${T.line}`, minHeight: 52 }}>
    <span style={{ fontSize: 15.5, fontWeight: 500, color: T.text, flex: 1, minWidth: 0 }}>{label}</span>
    {children}
  </div>
);

/* botão de ícone redondo, usado nos cabeçalhos */
const IconBtn = ({ T, icon, onClick, label, on, size = 36 }) => (
  <button onClick={onClick} aria-label={label} style={{
    width: size, height: size, borderRadius: 999, border: "none", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0,
    background: on ? T.accent : T.card, color: on ? T.onAccent : T.text, boxShadow: on ? "none" : T.shadow,
  }}><Ic path={icon} size={17} /></button>
);

/* ── seletor de cor ── */
const ColorGrid = ({ T, value, onChange }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
    {PALETTE.map(c => (
      <button key={c} onClick={() => onChange(c)} aria-label={`Cor ${c}`} style={{
        width: 34, height: 34, borderRadius: 999, background: c, border: "none", cursor: "pointer",
        outline: value === c ? `3px solid ${T.text}` : "none", outlineOffset: 2,
      }} />
    ))}
    <label style={{ width: 34, height: 34, borderRadius: 999, border: `2px dashed ${T.sub}`, display: "grid", placeItems: "center", cursor: "pointer", color: T.sub, position: "relative", overflow: "hidden" }}>
      <Ic path={P.plus} size={15} />
      <input type="color" value={value} onChange={e => onChange(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
    </label>
  </div>
);

/* ═══════════════ FORMULÁRIO DE PLANTÃO ═══════════════ */
function ShiftForm({ T, data, initial, mode, onSave, onDelete, onDuplicate, onClose, onCreateLocation }) {
  const [f, setF] = useState(() => ({ ...initial, endDate: initial.endDate || endDateOf(initial), value: Number(initial.value) || 0, rateType: initial.rateType || "shift", rate: Number(initial.rate) || 0 }));
  const [showColors, setShowColors] = useState(false);
  const [showLoc, setShowLoc] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);
  const [newLoc, setNewLoc] = useState(null);
  const set = p => setF(x => ({ ...x, _errTime: false, ...p }));
  const loc = data.locations.find(l => l.id === f.locationId);
  const mins = spanMin(f.date, f.startTime, f.endDate, f.endTime);
  const hours = mins / 60;
  const multiDay = f.endDate !== f.date;
  const suggested = autoPay(loc, f.date);
  const off = !!f.notDone;
  const label = sectionLabel(T);

  /* valor por hora acompanha a duração */
  useEffect(() => {
    if (f.rateType !== "hour") return;
    const v = Math.round((Number(f.rate) || 0) * hours * 100) / 100;
    if (v !== f.value) setF(x => ({ ...x, value: v }));
  }, [f.rateType, f.rate, hours]);

  /* mexer no início arrasta o fim junto, preservando a duração */
  const setStartDate = v => {
    if (!v) return;
    const e = mins > 0 ? plusMin(v, f.startTime, mins) : null;
    const p = { date: v, ...(e ? { endDate: e.date, endTime: e.time } : { endDate: v }) };
    const ap = autoPay(loc, v); if (ap) p.paymentDate = ap;
    set(p);
  };
  const setStartTime = v => {
    if (!v) return;
    const e = mins > 0 ? plusMin(f.date, v, mins) : null;
    set({ startTime: v, ...(e ? { endDate: e.date, endTime: e.time } : {}) });
  };
  const setEndTime = v => {
    if (!v) return;
    const p = { endTime: v };
    if (spanMin(f.date, f.startTime, f.endDate, v) <= 0) p.endDate = toMin(v) <= toMin(f.startTime) ? addDays(f.date, 1) : f.date;
    set(p);
  };
  const setDur = h => { const e = plusMin(f.date, f.startTime, h * 60); set({ endDate: e.date, endTime: e.time }); };

  const pickLocation = (id, injected) => {
    const l = injected || data.locations.find(x => x.id === id);
    const patch = { locationId: id || null };
    if (l) {
      patch.color = l.color;
      if (!f.value && l.defaultValue) patch.value = l.defaultValue;
      if (l.defaultStart && l.defaultEnd && !initial.id) {
        patch.startTime = l.defaultStart;
        const e = plusMin(f.date, l.defaultStart, durOfTimes(l.defaultStart, l.defaultEnd));
        patch.endDate = e.date; patch.endTime = e.time;
      }
      const ap = autoPay(l, f.date);
      if (ap) patch.paymentDate = ap;
    }
    set(patch); setShowLoc(false);
  };

  const save = () => {
    if (!f.title.trim()) { set({ _err: true }); return; }
    if (mins <= 0) { set({ _errTime: true }); return; }
    onSave({ ...f, value: Number(f.value) || 0, title: f.title.trim() });
  };

  const repDates = useMemo(() => (mode === "create" && f.repeat && f.repeat.type !== "none" ? genDates(f.date, f.repeat) : []), [mode, f.date, f.repeat]);

  return (
    <Sheet T={T} title={mode === "edit" ? "Editar plantão" : "Novo plantão"} onClose={onClose}
      footer={<button onClick={save} style={{ border: "none", background: T.accent, color: T.onAccent, fontWeight: 700, fontSize: 14, padding: "9px 8px", borderRadius: 999, cursor: "pointer", width: 62, fontFamily: "inherit" }}>Salvar</button>}>

      <input value={f.title} onChange={e => set({ title: e.target.value, _err: false })} placeholder="Título · ex: Plantão noturno"
        style={{ ...inputStyle(T), fontSize: 17, fontWeight: 600, background: T.card, boxShadow: f._err ? `inset 0 0 0 1.5px ${T.red}` : T.shadow }} />
      {f._err && <div style={{ color: T.red, fontSize: 12.5, margin: "6px 6px 0" }}>Dê um título ao plantão para salvar.</div>}

      {mode === "edit" && f.seriesId && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, color: T.sub, fontSize: 13 }}>
          <Ic path={P.repeat} size={14} /> Faz parte de uma série recorrente
        </div>
      )}

      <div style={label}>Identificação</div>
      <div style={groupBox(T)}>
        <Row T={T} label="Cor" onClick={() => setShowColors(v => !v)} right={<span style={{ width: 20, height: 20, borderRadius: 999, background: f.color, display: "inline-block" }} />} />
        {showColors && <div style={{ padding: 16, background: T.card, borderBottom: `1px solid ${T.line}` }}><ColorGrid T={T} value={f.color} onChange={c => set({ color: c })} /></div>}
        <Row T={T} last label="Local" onClick={() => setShowLoc(true)}
          right={loc ? <span style={{ display: "flex", alignItems: "center", gap: 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><span style={{ width: 9, height: 9, borderRadius: 99, background: loc.color, flexShrink: 0 }} />{loc.name}</span> : <span style={{ color: T.accent, fontWeight: 600 }}>Associar</span>} />
      </div>

      <div style={label}>Horário</div>
      <div style={groupBox(T)}>
        <FieldRow T={T} label="Começa">
          <input type="date" value={f.date} onChange={e => setStartDate(e.target.value)} style={dateStyle(T)} />
          <input type="time" value={f.startTime} onChange={e => setStartTime(e.target.value)} style={timeStyle(T)} />
        </FieldRow>
        <FieldRow T={T} label={<span>Termina{multiDay && <span style={{ color: T.accent, fontWeight: 700, fontSize: 12, marginLeft: 6 }}>+{daysBetween(f.date, f.endDate)}d</span>}</span>} last>
          <input type="date" value={f.endDate} min={f.date} onChange={e => e.target.value && set({ endDate: e.target.value })} style={dateStyle(T)} />
          <input type="time" value={f.endTime} onChange={e => setEndTime(e.target.value)} style={timeStyle(T)} />
        </FieldRow>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, overflowX: "auto", paddingBottom: 2 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.sub, flexShrink: 0 }}>Duração</span>
        {DUR_PRESETS.map(h => <Chip key={h} T={T} small on={mins === h * 60} onClick={() => setDur(h)}>{h}h</Chip>)}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "9px 6px 0", color: T.sub, fontSize: 12.5, flexWrap: "wrap" }}>
        <Ic path={P.clock} size={13} />
        {mins > 0 ? (<>
          <b style={{ color: T.text }}>{fmtDur(mins)}</b>
          <span>· termina {multiDay ? `${fmtWdDay(f.endDate)} às ${f.endTime}` : `às ${f.endTime}, no mesmo dia`}</span>
        </>) : <span style={{ color: T.red, fontWeight: 600 }}>O fim precisa ser depois do início{f._errTime ? " para salvar" : ""}.</span>}
        {mins > 72 * 60 && <span style={{ color: T.amber, fontWeight: 600 }}>· confira: mais de 3 dias seguidos</span>}
      </div>

      <div style={label}>Valor e pagamento</div>
      <div style={groupBox(T)}>
        <div style={{ padding: "12px 14px 4px", background: T.card }}>
          <Segmented T={T} value={f.rateType} onChange={k => set({ rateType: k, ...(k === "hour" && !f.rate && f.value && hours ? { rate: Math.round(f.value / hours * 100) / 100 } : {}) })}
            options={[["shift", "Valor do plantão"], ["hour", "Valor por hora"]]} />
        </div>
        <FieldRow T={T} label={f.rateType === "hour" ? "Por hora" : "Total"}>
          {f.rateType === "hour"
            ? <MoneyInput T={T} value={f.rate} onChange={v => set({ rate: v })} width={168} big />
            : <MoneyInput T={T} value={f.value} onChange={v => set({ value: v })} width={168} big />}
        </FieldRow>
        <div style={{ background: T.card, padding: "0 14px 12px", fontSize: 12.5, color: T.sub, borderBottom: `1px solid ${T.line}` }}>
          {f.rateType === "hour"
            ? <>Total do plantão: <b style={{ color: T.text }}>{fmtBRL(f.value)}</b>{hours > 0 ? ` · ${fmtDur(mins)}` : ""}</>
            : hours > 0 && f.value > 0 ? <>Equivale a <b style={{ color: T.text }}>{fmtBRL(f.value / hours)}</b> por hora</> : "Informe o valor combinado deste plantão."}
        </div>
        {loc && loc.defaultValue > 0 && loc.defaultValue !== f.value && f.rateType === "shift" && (
          <button onClick={() => set({ value: loc.defaultValue })} style={{ width: "100%", border: "none", background: T.card, color: T.accent, fontWeight: 600, fontSize: 13.5, padding: "11px 14px", textAlign: "left", cursor: "pointer", borderBottom: `1px solid ${T.line}`, fontFamily: "inherit" }}>
            Usar valor padrão de {loc.name}: {fmtBRL(loc.defaultValue)}
          </button>
        )}
        <FieldRow T={T} label="Recebe em">
          <input type="date" value={f.paymentDate || ""} onChange={e => set({ paymentDate: e.target.value })} style={dateStyle(T)} />
        </FieldRow>
        <div style={{ display: "flex", gap: 7, padding: "0 14px 12px", background: T.card, borderBottom: `1px solid ${T.line}`, overflowX: "auto" }}>
          {suggested && <Chip T={T} small on={f.paymentDate === suggested} onClick={() => set({ paymentDate: suggested })}>Prazo do local · {fmtDateShort(suggested)}</Chip>}
          <Chip T={T} small on={f.paymentDate === todayStr()} onClick={() => set({ paymentDate: todayStr() })}>Hoje</Chip>
          <Chip T={T} small on={f.paymentDate === addDays(f.date, 30)} onClick={() => set({ paymentDate: addDays(f.date, 30) })}>+30 dias</Chip>
          {f.paymentDate && <Chip T={T} small onClick={() => set({ paymentDate: "" })}>Sem data</Chip>}
        </div>
        <FieldRow T={T} label="Já foi pago" last={!f.paid}>
          <Toggle T={T} on={!!f.paid} onChange={v => set({ paid: v, paidAt: v ? (f.paidAt || (f.paymentDate && f.paymentDate <= todayStr() ? f.paymentDate : todayStr())) : null })} />
        </FieldRow>
        {f.paid && (
          <FieldRow T={T} label="Recebido em" last>
            <input type="date" value={f.paidAt || todayStr()} onChange={e => set({ paidAt: e.target.value })} style={dateStyle(T)} />
          </FieldRow>
        )}
      </div>

      <div style={label}>Situação</div>
      <div style={groupBox(T)}>
        <FieldRow T={T} label="Não realizado" last={!off}>
          <Toggle T={T} on={off} onChange={v => set({ notDone: v, reason: v ? (f.reason || "troca") : null })} />
        </FieldRow>
        {off && (
          <div style={{ background: T.card, padding: "2px 14px 14px" }}>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
              {REASONS.map(([k, lab]) => <Chip key={k} T={T} small on={f.reason === k} onClick={() => set({ reason: k })}>{lab}</Chip>)}
            </div>
            <div style={{ fontSize: 12.5, color: T.sub, lineHeight: 1.45 }}>Continua no calendário como lembrete, mas não entra em nenhuma conta de horas nem de dinheiro.</div>
          </div>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: T.sub, margin: "7px 6px 0" }}>Trocou o plantão, pegou folga ou faltou? Marque aqui.</div>

      {mode === "create" && (<>
        <div style={label}>Escala e repetição</div>
        <div style={groupBox(T)}>
          <Row T={T} last label="Repetir" onClick={() => setShowRepeat(true)} right={<span style={{ maxWidth: 190, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{repLabel(f.repeat)}</span>} />
        </div>
        {repDates.length > 1 && (
          <div style={{ fontSize: 12.5, color: T.sub, margin: "7px 6px 0", lineHeight: 1.5 }}>
            Serão criados <b style={{ color: T.text }}>{repDates.length} plantões</b> · de {fmtDateShort(repDates[0])} até {fmtDateShort(repDates[repDates.length - 1])}.
            {repDates.length >= MAX_OCC && <> Limite de {MAX_OCC} por vez — depois é só criar de novo a partir do último.</>}
          </div>
        )}
      </>)}

      <div style={label}>Observações</div>
      <textarea value={f.notes || ""} onChange={e => set({ notes: e.target.value })} placeholder={off ? "Ex: troquei com a Ana" : "Comentários, contato, setor…"} rows={3}
        style={{ ...inputStyle(T), background: T.card, boxShadow: T.shadow, resize: "vertical", minHeight: 70 }} />

      {mode === "edit" && (
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button onClick={onDuplicate} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px", borderRadius: 15, border: "none", background: T.card, color: T.text, fontWeight: 600, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit", boxShadow: T.shadow }}>
            <Ic path={P.copy} size={16} /> Duplicar
          </button>
          <button onClick={onDelete} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px", borderRadius: 15, border: "none", background: T.redSoft, color: T.red, fontWeight: 600, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit" }}>
            <Ic path={P.trash} size={16} /> Apagar
          </button>
        </div>
      )}

      {showLoc && (
        <Sheet T={T} title="Associar local" onClose={() => setShowLoc(false)}>
          <div style={groupBox(T)}>
            <Row T={T} label="Nenhum local" onClick={() => pickLocation(null)} right={!f.locationId && <Ic path={P.check} size={16} color={T.accent} />} />
            {data.locations.map(l => (
              <Row key={l.id} T={T}
                label={<span style={{ display: "flex", alignItems: "center", gap: 9 }}><span style={{ width: 10, height: 10, borderRadius: 99, background: l.color }} />{l.name}</span>}
                onClick={() => pickLocation(l.id)} right={f.locationId === l.id && <Ic path={P.check} size={16} color={T.accent} />} />
            ))}
            <button onClick={() => setNewLoc({ id: null, name: "", address: "", color: PALETTE[(data.locations.length + 1) % PALETTE.length], payType: "none", payValue: 30, defaultValue: 0, defaultStart: "", defaultEnd: "" })}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: T.card, border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: T.accent, fontWeight: 700, fontSize: 15.5 }}>
              <span style={{ width: 21, height: 21, borderRadius: 99, background: T.accentSoft, display: "grid", placeItems: "center" }}><Ic path={P.plus} size={13} color={T.accent} /></span>
              Novo local
            </button>
          </div>
          <div style={{ color: T.sub, fontSize: 13, textAlign: "center", marginTop: 14, lineHeight: 1.5 }}>
            O local guarda cor, valor padrão, horário padrão e prazo de pagamento — e preenche o plantão sozinho.
          </div>
        </Sheet>
      )}

      {newLoc && (
        <LocationForm T={T} initial={newLoc} onClose={() => setNewLoc(null)} onDelete={null}
          onSave={l => { const id = onCreateLocation(l); setNewLoc(null); pickLocation(id, { ...l, id }); }} />
      )}

      {showRepeat && (
        <RepeatSheet T={T} value={f.repeat || { type: "none" }} baseDate={f.date} durMin={mins}
          onChange={(rep, durH) => set({ repeat: rep, ...(durH ? (() => { const e = plusMin(f.date, f.startTime, durH * 60); return { endDate: e.date, endTime: e.time }; })() : {}) })}
          onClose={() => setShowRepeat(false)} />
      )}
    </Sheet>
  );
}

function RepeatSheet({ T, value, baseDate, durMin, onChange, onClose }) {
  const [r, setR] = useState({ weekdays: [pd(baseDate).getDay()], every: 2, endMode: "until", until: addMonths(baseDate, 3), count: 12, ...value });
  const [durH, setDurH] = useState(null);
  const opts = [
    ["none", "Nunca"], ["daily", "Todos os dias"], ["weekly", "Toda semana"], ["biweekly", "A cada 2 semanas"],
    ["monthlyDay", "Todo mês · mesmo dia"], ["monthlyPos", `Todo mês · ${["1º", "2º", "3º", "4º", "5º"][Math.floor((pd(baseDate).getDate() - 1) / 7)]} ${WD_FULL[pd(baseDate).getDay()]}`], ["custom", "Personalizado"],
  ];
  const needsWd = r.type === "weekly" || r.type === "biweekly";
  const preview = useMemo(() => (r.type === "none" ? [] : genDates(baseDate, r)), [r, baseDate]);
  const apply = () => { onChange(r.type === "none" ? { type: "none" } : r, durH); onClose(); };
  const setEnd = p => setR(x => ({ ...x, ...p }));
  const pickScale = sc => {
    setDurH(sc.h);
    setR(x => ({ ...x, type: "custom", every: sc.every, scale: sc.k, endMode: x.endMode === "never" ? "never" : x.endMode || "until" }));
  };
  const activeScale = SCALES.find(sc => r.scale === sc.k && r.type === "custom" && Number(r.every) === sc.every);

  return (
    <Sheet T={T} title="Escala e repetição" onClose={onClose}
      footer={<button onClick={apply} style={{ border: "none", background: T.accent, color: T.onAccent, fontWeight: 700, fontSize: 14, padding: "9px 8px", borderRadius: 999, cursor: "pointer", width: 62, fontFamily: "inherit" }}>OK</button>}>

      <div style={{ ...sectionLabel(T), marginTop: 4 }}>Escalas prontas</div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        {SCALES.map(sc => (
          <button key={sc.k} onClick={() => pickScale(sc)} style={{
            flexShrink: 0, border: "none", cursor: "pointer", fontFamily: "inherit", borderRadius: 16, padding: "11px 14px", textAlign: "left",
            background: activeScale === sc ? T.accent : T.card, color: activeScale === sc ? T.onAccent : T.text, boxShadow: activeScale === sc ? "none" : T.shadow,
          }}>
            <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 16 }}>{sc.k}</div>
            <div style={{ fontSize: 11.5, opacity: .8, marginTop: 1 }}>{sc.desc}</div>
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: T.sub, margin: "8px 6px 0", lineHeight: 1.45 }}>
        A escala ajusta a duração do plantão e o intervalo entre eles de uma vez.
        {durH ? <> Duração ajustada para <b style={{ color: T.text }}>{durH}h</b>.</> : durMin > 0 ? <> Hoje o plantão tem {fmtDur(durMin)}.</> : null}
      </div>

      <div style={sectionLabel(T)}>Ou defina a repetição</div>
      <div style={groupBox(T)}>
        {opts.map(([k, lab], i) => (
          <Row key={k} T={T} last={i === opts.length - 1} label={lab}
            onClick={() => setR(x => ({ ...x, type: k, scale: null }))} right={r.type === k && <Ic path={P.check} size={16} color={T.accent} />} />
        ))}
      </div>

      {needsWd && (<>
        <div style={sectionLabel(T)}>Dias da semana</div>
        <div style={{ display: "flex", gap: 6 }}>
          {WD.map((w, i) => {
            const on = (r.weekdays || []).includes(i);
            return <button key={i} onClick={() => setR(x => ({ ...x, weekdays: on ? x.weekdays.filter(d => d !== i) : [...(x.weekdays || []), i] }))}
              style={{ flex: 1, padding: "11px 0", borderRadius: 13, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit", background: on ? T.accent : T.card, color: on ? T.onAccent : T.sub, boxShadow: on ? "none" : T.shadow }}>{w}</button>;
          })}
        </div>
      </>)}

      {r.type === "custom" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
          <span style={{ color: T.text, fontSize: 15 }}>A cada</span>
          <input type="number" min={1} value={r.every} onChange={e => setR(x => ({ ...x, every: e.target.value, scale: null }))} style={{ ...inputStyle(T), width: 80, textAlign: "center" }} />
          <span style={{ color: T.text, fontSize: 15 }}>dias</span>
        </div>
      )}

      {r.type !== "none" && (<>
        <div style={sectionLabel(T)}>Termina</div>
        <Segmented T={T} value={repEnd(r)} onChange={k => setEnd({ endMode: k })}
          options={[["until", "Em uma data"], ["count", "Após X vezes"], ["never", "Nunca"]]} />

        {repEnd(r) === "until" && (<>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
            <span style={{ color: T.text, fontSize: 15, fontWeight: 500 }}>Repetir até</span>
            <input type="date" value={r.until} min={baseDate} onChange={e => setEnd({ until: e.target.value })} style={dateStyle(T)} />
          </div>
          <div style={{ display: "flex", gap: 7, marginTop: 10, overflowX: "auto", paddingBottom: 2 }}>
            {[[1, "1 mês"], [3, "3 meses"], [6, "6 meses"], [12, "1 ano"]].map(([n, lab]) => (
              <Chip key={n} T={T} small on={r.until === addMonths(baseDate, n)} onClick={() => setEnd({ until: addMonths(baseDate, n) })}>{lab}</Chip>
            ))}
          </div>
        </>)}

        {repEnd(r) === "count" && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: T.text, fontSize: 15 }}>Repetir</span>
              <input type="number" min={1} max={MAX_OCC} value={r.count} onChange={e => setEnd({ count: e.target.value })} style={{ ...inputStyle(T), width: 90, textAlign: "center" }} />
              <span style={{ color: T.text, fontSize: 15 }}>vezes</span>
            </div>
            <div style={{ display: "flex", gap: 7, marginTop: 10, overflowX: "auto", paddingBottom: 2 }}>
              {[4, 8, 12, 24, 52].map(n => <Chip key={n} T={T} small on={Number(r.count) === n} onClick={() => setEnd({ count: n })}>{n}×</Chip>)}
            </div>
          </div>
        )}

        {repEnd(r) === "never" && (
          <div style={{ fontSize: 13, color: T.sub, margin: "12px 6px 0", lineHeight: 1.5 }}>
            Sem data para acabar. O app já deixa criados os próximos <b style={{ color: T.text }}>{OPEN_MONTHS} meses</b> (até {MAX_OCC} plantões) — quando chegar perto do fim, é só abrir o último e repetir de novo.
          </div>
        )}

        <Card T={T} style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12.5, color: T.sub }}>Resultado</div>
          <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 19, color: T.text, marginTop: 2 }}>
            {preview.length} {preview.length === 1 ? "plantão" : "plantões"}
          </div>
          {preview.length > 0 && (
            <div style={{ fontSize: 12.5, color: T.sub, marginTop: 4, lineHeight: 1.5 }}>
              {preview.slice(0, 3).map(d => fmtWdDay(d)).join(" · ")}{preview.length > 3 ? ` … último em ${fmtDateShort(preview[preview.length - 1])}` : ""}
            </div>
          )}
        </Card>
      </>)}
    </Sheet>
  );
}

/* ═══════════════ CARD DE PLANTÃO ═══════════════ */
function ShiftCard({ T, s, data, onOpen, onTogglePaid, showDate, showPayInfo, cont }) {
  const loc = data.locations.find(l => l.id === s.locationId);
  const mins = shiftMin(s);
  const end = endDateOf(s);
  const multi = end !== s.date;
  const today = todayStr();
  const off = !isOn(s);
  const overdue = isOverdue(s, today);
  const daysToPay = s.paymentDate ? daysBetween(today, s.paymentDate) : null;
  const payLine = s.paid
    ? `Recebido em ${fmtDateShort(paidAtOf(s))}`
    : !s.paymentDate ? "Sem data de recebimento"
    : overdue ? `Venceu há ${-daysToPay} ${-daysToPay === 1 ? "dia" : "dias"} · ${fmtDateShort(s.paymentDate)}`
    : daysToPay === 0 ? "Recebe hoje"
    : `Recebe em ${daysToPay} ${daysToPay === 1 ? "dia" : "dias"} · ${fmtDateShort(s.paymentDate)}`;

  /* o selo fica FORA do botão do card: dentro dele o clique é reatribuído ao botão
     e acabava abrindo o editor em vez de marcar como pago */
  return (
    <div style={{ width: "100%", display: "flex", gap: 12, padding: "13px 14px", background: T.card, borderRadius: 20, boxShadow: T.shadow, fontFamily: "inherit", opacity: cont ? .78 : 1 }}>
      <button onClick={onOpen} style={{ flex: 1, minWidth: 0, display: "flex", gap: 12, alignItems: "stretch", background: "transparent", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
        <div style={{ width: 4, alignSelf: "stretch", borderRadius: 99, background: s.color, flexShrink: 0, opacity: off ? .45 : 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 15.5, color: off ? T.sub : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: off ? "line-through" : "none" }}>{s.title}</span>
            {s.seriesId && <Ic path={P.repeat} size={12.5} color={T.sub} />}
            {cont && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: .3, color: T.accent, background: T.accentSoft, padding: "2px 6px", borderRadius: 6, whiteSpace: "nowrap" }}>EM ANDAMENTO</span>}
          </div>
          {(loc || off) && (
            <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
              {loc && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{loc.name}</span>}
              {off && <span style={{ display: "flex", alignItems: "center", gap: 4, color: T.sub, flexShrink: 0 }}><Ic path={P.off} size={11} /> {reasonLabel(s.reason)}</span>}
            </div>
          )}
          <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
            {multi
              ? <>{fmtDayMon(s.date)} {s.startTime} → {fmtDayMon(end)} {s.endTime} · <b style={{ color: off ? T.sub : T.text }}>{fmtDur(mins)}</b></>
              : <>{showDate && <>{fmtDayMon(s.date)} · </>}{s.startTime}–{s.endTime} · {fmtDur(mins)}</>}
          </div>
          {showPayInfo && !off && (
            <div style={{ fontSize: 12, color: overdue ? T.red : T.sub, marginTop: 3, fontWeight: overdue ? 600 : 400 }}>{payLine}</div>
          )}
        </div>
      </button>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, justifyContent: "center", flexShrink: 0 }}>
        <button onClick={onOpen} style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: 15.5, color: off ? T.sub : T.text, fontVariantNumeric: "tabular-nums", textDecoration: off ? "line-through" : "none" }}>{fmtBRL(s.value)}</button>
        {off ? <Badge T={T} off /> : (
          <button onClick={onTogglePaid} aria-label={s.paid ? "Marcar como não recebido" : "Marcar como recebido"}
            style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
            <Badge T={T} paid={s.paid} overdue={overdue} />
          </button>
        )}
      </div>
    </div>
  );
}

/* linha compacta usada na fila de próximos plantões */
function UpcomingRow({ T, s, data, onOpen }) {
  const loc = data.locations.find(l => l.id === s.locationId);
  const end = endDateOf(s), multi = end !== s.date;
  const today = todayStr();
  const running = s.date <= today && end >= today && s.date !== today;
  const off = !isOn(s);
  const d = pd(s.date);
  return (
    <button onClick={onOpen} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: T.card, border: "none", borderRadius: 18, cursor: "pointer", fontFamily: "inherit", boxShadow: T.shadow, opacity: off ? .7 : 1 }}>
      <div style={{ width: 44, flexShrink: 0, borderRadius: 13, background: off ? T.chip : s.color + "1A", padding: "6px 0", textAlign: "center" }}>
        <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 17, color: off ? T.sub : s.color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{d.getDate()}</div>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: off ? T.sub : s.color, textTransform: "uppercase", letterSpacing: .4, marginTop: 2 }}>{MONTHS_S[d.getMonth()]}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 14.5, color: off ? T.sub : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: off ? "line-through" : "none" }}>{s.title}</span>
          {s.seriesId && <Ic path={P.repeat} size={11.5} color={T.sub} />}
        </div>
        <div style={{ fontSize: 12, color: T.sub, marginTop: 2, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span style={{ color: off ? T.sub : running ? T.accent : T.sub, fontWeight: running || off ? 700 : 600 }}>{off ? reasonLabel(s.reason).toLowerCase() : running ? "em andamento" : relDay(s.date)}</span>
          {" · "}{s.startTime}–{s.endTime}{multi ? `+${daysBetween(s.date, end)}d` : ""} · {fmtDur(shiftMin(s))}
          {loc ? ` · ${loc.name}` : ""}
        </div>
      </div>
      <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: 14.5, color: off ? T.sub : T.text, fontVariantNumeric: "tabular-nums", flexShrink: 0, textDecoration: off ? "line-through" : "none" }}>{fmtBRL(s.value)}</span>
    </button>
  );
}

/* ═══════════════ CALENDÁRIO ═══════════════ */
function CalendarView({ T, data, cursor, setCursor, sel, setSel, openCreate, openEdit, togglePaid }) {
  const y = cursor.getFullYear(), m = cursor.getMonth();
  const first = new Date(y, m, 1), startWd = first.getDay(), dim = new Date(y, m + 1, 0).getDate();
  const prevDim = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const dnum = i - startWd + 1;
    let d, out = false;
    if (dnum < 1) { d = new Date(y, m - 1, prevDim + dnum); out = true; }
    else if (dnum > dim) { d = new Date(y, m + 1, dnum - dim); out = true; }
    else d = new Date(y, m, dnum);
    cells.push({ str: ds(d), n: d.getDate(), out });
  }
  /* um plantão de 36 h aparece em todos os dias que ele atravessa */
  const byDay = useMemo(() => {
    const map = {};
    for (const s of data.shifts) for (const day of spanDays(s)) (map[day] = map[day] || []).push(s);
    return map;
  }, [data.shifts]);

  const monthShifts = data.shifts.filter(s => mKey(s.date) === `${y}-${pad(m + 1)}`);
  const monthDone = monthShifts.filter(isOn);
  const monthTotal = monthDone.reduce((a, s) => a + (s.value || 0), 0);
  const monthHours = monthDone.reduce((a, s) => a + shiftHours(s), 0);
  const dayShifts = (byDay[sel] || []).slice().sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const today = todayStr();
  const selD = pd(sel);

  const upcoming = useMemo(() => data.shifts
    .filter(s => endDateOf(s) >= today)
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    .slice(0, 6), [data.shifts, today]);
  const next30 = useMemo(() => {
    const lim = addDays(today, 30);
    const arr = data.shifts.filter(s => isOn(s) && s.date >= today && s.date <= lim);
    return { n: arr.length, v: arr.reduce((a, s) => a + (s.value || 0), 0) };
  }, [data.shifts, today]);

  /* anel colorido no dia, como no calendário de papel: cor do plantão */
  const dayStyle = (c, shifts, isSel, isToday) => {
    const base = {
      width: 34, height: 34, borderRadius: 999, display: "grid", placeItems: "center", fontSize: 15,
      fontVariantNumeric: "tabular-nums", fontWeight: isToday || isSel || shifts.length ? 700 : 500,
      color: isSel ? T.onAccent : c.out ? T.sub + "70" : isToday ? T.accent : T.text,
      background: isSel ? T.accent : isToday && !shifts.length ? T.chip : "transparent",
      border: "1.5px solid transparent", boxSizing: "border-box", transition: "background .15s",
    };
    if (isSel || !shifts.length) return base;
    const starts = shifts.filter(s => s.date === c.str);
    const main = starts[0] || shifts[0];
    const cont = !starts.length;
    const alpha = c.out ? "55" : cont ? "70" : "";
    if (shifts.every(s => !isOn(s))) return { ...base, border: `1.5px dashed ${main.color}${alpha || "99"}`, color: T.sub };
    const rings = [`inset 0 0 0 2px ${main.color}${alpha}`];
    const other = shifts.find(s => s.color !== main.color);
    if (other) rings.push(`0 0 0 2px ${other.color}${alpha}`);
    return { ...base, boxShadow: rings.join(", ") };
  };

  return (
    <div style={{ padding: "10px 16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button onClick={() => setCursor(new Date(y, m - 1, 1))} aria-label="Mês anterior" style={{ border: "none", background: "transparent", color: T.sub, cursor: "pointer", padding: "6px 4px" }}><Ic path={P.chevL} size={19} /></button>
          <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 22, color: T.text, letterSpacing: -.3 }}>
            {MONTHS[m]} <span style={{ color: T.sub, fontWeight: 500 }}>{y}</span>
          </div>
          <button onClick={() => setCursor(new Date(y, m + 1, 1))} aria-label="Próximo mês" style={{ border: "none", background: "transparent", color: T.sub, cursor: "pointer", padding: "6px 4px" }}><Ic path={P.chevR} size={19} /></button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {(sel !== today || mKey(today) !== `${y}-${pad(m + 1)}`) && (
            <button onClick={() => { const t = new Date(); setCursor(new Date(t.getFullYear(), t.getMonth(), 1)); setSel(todayStr()); }}
              style={{ border: "none", background: "transparent", color: T.accent, fontWeight: 700, fontSize: 14, padding: "8px 6px", cursor: "pointer", fontFamily: "inherit" }}>Hoje</button>
          )}
          <button onClick={() => openCreate(sel)} aria-label="Novo plantão" style={{ border: "none", background: T.accent, color: T.onAccent, width: 38, height: 38, borderRadius: 999, cursor: "pointer", display: "grid", placeItems: "center", boxShadow: T.shadow }}><Ic path={P.plus} size={19} /></button>
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: T.sub, marginTop: 6, height: 16 }}>
        {monthDone.length > 0 && <>{monthDone.length} {monthDone.length === 1 ? "plantão" : "plantões"} · {fmtH(monthHours)} · <b style={{ color: T.text }}>{fmtBRL(monthTotal)}</b></>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginTop: 8 }}>
        {WD.map(w => <div key={w} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: T.sub, letterSpacing: .3, padding: "6px 0" }}>{w[0]}</div>)}
        {cells.map((c, i) => {
          const shifts = byDay[c.str] || [];
          const isSel = c.str === sel, isToday = c.str === today;
          return (
            <button key={i} onClick={() => { setSel(c.str); if (c.out) setCursor(pd(c.str.slice(0, 8) + "01")); }} style={{
              border: "none", background: "transparent", cursor: "pointer", padding: "4px 0 5px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minHeight: 46, fontFamily: "inherit",
            }}>
              <span style={dayStyle(c, shifts, isSel, isToday)}>{c.n}</span>
              <span style={{ height: 4, display: "flex", alignItems: "center" }}>
                {shifts.length > 2 && <span style={{ fontSize: 9, fontWeight: 800, color: T.sub }}>{shifts.length}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: 15.5, color: T.text }}>
          {WD_FULL[selD.getDay()].charAt(0).toUpperCase() + WD_FULL[selD.getDay()].slice(1)}, {fmtDayMon(sel)}
        </div>
        {dayShifts.some(s => s.date === sel && isOn(s)) && (
          <div style={{ fontSize: 13, color: T.sub, fontVariantNumeric: "tabular-nums" }}>
            {fmtBRL(dayShifts.filter(s => s.date === sel && isOn(s)).reduce((a, s) => a + (s.value || 0), 0))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 10 }}>
        {dayShifts.length === 0 ? (
          <button onClick={() => openCreate(sel)} style={{ border: `1.5px dashed ${T.line}`, background: "transparent", borderRadius: 20, padding: "20px 16px", color: T.sub, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Nenhum plantão neste dia. <span style={{ color: T.accent, fontWeight: 700 }}>Toque para criar.</span>
          </button>
        ) : dayShifts.map(s => (
          <ShiftCard key={s.id} T={T} s={s} data={data} onOpen={() => openEdit(s)} onTogglePaid={() => togglePaid(s.id)} cont={s.date !== sel} showPayInfo />
        ))}
      </div>

      {upcoming.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: 15.5, color: T.text }}>Próximos plantões</div>
            {next30.n > 0 && <div style={{ fontSize: 12.5, color: T.sub, fontVariantNumeric: "tabular-nums" }}>30 dias · {next30.n} · <b style={{ color: T.text }}>{fmtBRL(next30.v)}</b></div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {upcoming.map(s => (
              <UpcomingRow key={s.id} T={T} s={s} data={data} onOpen={() => { setSel(s.date); setCursor(pd(s.date.slice(0, 8) + "01")); openEdit(s); }} />
            ))}
          </div>
        </div>
      )}

      {upcoming.length === 0 && data.shifts.length > 0 && (
        <div style={{ marginTop: 24, textAlign: "center", color: T.sub, fontSize: 13.5, padding: "18px 0" }}>
          Nenhum plantão marcado daqui para frente.
        </div>
      )}
    </div>
  );
}

/* ═══════════════ PAGAMENTOS ═══════════════
   Duas perguntas, nada além disso:
   · A RECEBER → quanto me devem e quando cai (lista de todos os meses).
   · RECEBIDOS → quanto caiu na conta em cada mês.
   O "quanto eu trabalhei" mora no Resumo.                                  */
function PaymentsView({ T, data, cursor, setCursor, openEdit, togglePaid, markPaid, setDialog, setData }) {
  const [tab, setTab] = useState("pay");
  const [filt, setFilt] = useState(false);
  const y = cursor.getFullYear(), m = cursor.getMonth();
  const mk = `${y}-${pad(m + 1)}`;
  const today = todayStr();
  const sum = arr => arr.reduce((a, s) => a + (s.value || 0), 0);
  const st = data.settings;
  const hidden = st.hiddenLocs || [];
  const S = useMemo(() => data.shifts.filter(s => isOn(s) && !hidden.includes(s.locationId || "_none")), [data.shifts, hidden]);

  /* ── a receber: tudo que ainda não foi pago, de qualquer mês ── */
  const pend = useMemo(() => S.filter(s => !s.paid).sort((a, b) => (a.paymentDate || "9999").localeCompare(b.paymentDate || "9999")), [S]);
  const pendV = sum(pend);
  const late = pend.filter(s => s.paymentDate && s.paymentDate < today);
  const lateV = sum(late);
  const noDate = pend.filter(s => !s.paymentDate);

  const buckets = useMemo(() => {
    const t = new Date();
    return [0, 1, 2].map(k => {
      const d = new Date(t.getFullYear(), t.getMonth() + k, 1), key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      const arr = pend.filter(s => mKey(s.paymentDate) === key && s.paymentDate >= today);
      return { d, key, v: sum(arr) };
    });
  }, [pend, today]);

  /* ── recebidos: o que caiu na conta no mês aberto ── */
  const got = useMemo(() => S.filter(s => s.paid && mKey(paidAtOf(s)) === mk).sort((a, b) => paidAtOf(b).localeCompare(paidAtOf(a))), [S, mk]);
  const gotV = sum(got);
  const gotYear = useMemo(() => sum(S.filter(s => s.paid && paidAtOf(s).slice(0, 4) === String(y))), [S, y]);

  const groupBy = (arr, keyFn) => {
    const g = {};
    for (const s of arr) { const k = keyFn(s) || ""; (g[k] = g[k] || []).push(s); }
    return Object.entries(g);
  };
  const payGroups = useMemo(() => groupBy(pend, s => s.paymentDate).sort((a, b) => (a[0] || "9999").localeCompare(b[0] || "9999")), [pend]);
  const gotGroups = useMemo(() => groupBy(got, s => paidAtOf(s)).sort((a, b) => b[0].localeCompare(a[0])), [got]);

  const receiveGroup = (arr, label) => setDialog({
    title: "Já caiu na conta?",
    msg: `${arr.length} ${arr.length === 1 ? "plantão" : "plantões"} · ${fmtBRL(sum(arr))}${label ? ` — ${label}` : ""}`,
    options: [{ label: "Sim, recebi", primary: true, fn: () => markPaid(arr.map(s => s.id), true) }],
  });

  const eyeBtn = (
    <button onClick={() => setData(d => ({ ...d, settings: { ...d.settings, hideValues: !d.settings.hideValues } }))}
      aria-label={st.hideValues ? "Mostrar valores" : "Ocultar valores"}
      style={{ border: "none", background: "transparent", color: st.hideValues ? T.accent : T.sub, cursor: "pointer", padding: 6, display: "grid", placeItems: "center" }}>
      <Ic path={st.hideValues ? P.eyeOff : P.eye} size={19} />
    </button>
  );

  return (
    <div style={{ padding: "10px 16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Segmented T={T} value={tab} onChange={setTab} style={{ flex: 1 }}
          options={[["pay", "A receber"], ["got", "Já recebi"]]} />
        <div style={{ position: "relative", flexShrink: 0 }}>
          <IconBtn T={T} icon={P.filter} label="Filtros" onClick={() => setFilt(true)} />
          {hidden.length > 0 && <span style={{ position: "absolute", top: 1, right: 1, width: 9, height: 9, borderRadius: 99, background: T.accent, border: `2px solid ${T.bg}` }} />}
        </div>
      </div>

      {tab === "pay" ? (<>
        <Card T={T} style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: T.sub }}>Ainda vão te pagar</span>
            {eyeBtn}
          </div>
          <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 34, color: T.text, marginTop: -2, fontVariantNumeric: "tabular-nums", letterSpacing: -.8 }}>{fmtBRL(pendV)}</div>
          <div style={{ fontSize: 13, color: T.sub, marginTop: 2 }}>
            {pend.length === 0 ? "Tudo em dia — nenhum plantão em aberto." : `em ${pend.length} ${pend.length === 1 ? "plantão" : "plantões"}`}
          </div>

          {lateV > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 13, background: T.redSoft, borderRadius: 14, padding: "10px 12px" }}>
              <Ic path={P.alert} size={17} color={T.red} />
              <div style={{ flex: 1, fontSize: 13.5, color: T.red }}>
                <b>{fmtBRL(lateV)}</b> já passou da data
              </div>
              <span style={{ fontSize: 12, color: T.red, opacity: .8 }}>{late.length} {late.length === 1 ? "plantão" : "plantões"}</span>
            </div>
          )}

          {buckets.some(b => b.v > 0) && (<>
            <div style={{ fontSize: 12.5, color: T.sub, marginTop: 15, marginBottom: 8 }}>Quando cai</div>
            <div style={{ display: "flex", gap: 8 }}>
              {buckets.map(b => (
                <div key={b.key} style={{ flex: 1, background: T.chip, borderRadius: 14, padding: "10px 6px", textAlign: "center" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: T.sub, textTransform: "uppercase", letterSpacing: .4 }}>{MONTHS_S[b.d.getMonth()]}</div>
                  <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 14, color: b.v ? T.text : T.sub, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{b.v ? fmtBRLk(b.v) : "—"}</div>
                </div>
              ))}
            </div>
          </>)}
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
          {pend.length === 0 && (
            <div style={{ textAlign: "center", color: T.sub, fontSize: 14, padding: "34px 0", lineHeight: 1.5 }}>
              Nenhum plantão esperando pagamento.<br />Quando você lançar um plantão novo, ele aparece aqui.
            </div>
          )}
          {payGroups.map(([k, arr]) => {
            const isLate = k && k < today;
            const header = !k ? "Sem data de pagamento" : isLate ? `Atrasado desde ${fmtDayMonY(k)}` : `Cai em ${fmtDayMonY(k)}`;
            return (
              <div key={k || "sem"}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 4px" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: isLate ? T.red : !k ? T.amber : T.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{header}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 12.5, color: T.sub, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(sum(arr))}</span>
                    <button onClick={() => receiveGroup(arr, header)} style={{ border: "none", background: T.accentSoft, color: T.accent, fontWeight: 700, fontSize: 12, padding: "5px 10px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit" }}>Recebi</button>
                  </span>
                </div>
                {!k && <div style={{ fontSize: 12, color: T.sub, padding: "0 4px 8px", lineHeight: 1.45 }}>Abra o plantão e diga quando você recebe, para ele entrar na previsão.</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {arr.map(s => <ShiftCard key={s.id} T={T} s={s} data={data} onOpen={() => openEdit(s)} onTogglePaid={() => togglePaid(s.id)} showDate showPayInfo />)}
                </div>
              </div>
            );
          })}
        </div>
      </>) : (<>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <button onClick={() => setCursor(new Date(y, m - 1, 1))} aria-label="Mês anterior" style={{ border: "none", background: "transparent", color: T.sub, cursor: "pointer", padding: "6px 4px" }}><Ic path={P.chevL} size={19} /></button>
            <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 20, color: T.text, letterSpacing: -.3 }}>{MONTHS[m]} <span style={{ color: T.sub, fontWeight: 500 }}>{y}</span></div>
            <button onClick={() => setCursor(new Date(y, m + 1, 1))} aria-label="Próximo mês" style={{ border: "none", background: "transparent", color: T.sub, cursor: "pointer", padding: "6px 4px" }}><Ic path={P.chevR} size={19} /></button>
          </div>
          {eyeBtn}
        </div>

        <Card T={T} style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13, color: T.sub }}>Caiu na sua conta em {MONTHS_S[m]}.</div>
          <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 34, color: T.text, marginTop: -2, fontVariantNumeric: "tabular-nums", letterSpacing: -.8 }}>{fmtBRL(gotV)}</div>
          <div style={{ fontSize: 13, color: T.sub, marginTop: 2 }}>
            {got.length === 0 ? "Nenhum pagamento marcado neste mês." : `${got.length} ${got.length === 1 ? "plantão pago" : "plantões pagos"} · ${fmtBRL(gotYear)} no ano`}
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
          {got.length === 0 && (
            <div style={{ textAlign: "center", color: T.sub, fontSize: 14, padding: "34px 0", lineHeight: 1.5 }}>
              Quando um plantão for pago, toque no selo <b style={{ color: T.text }}>A RECEBER</b> dele<br />ou use o botão <b style={{ color: T.text }}>Recebi</b> na aba ao lado.
            </div>
          )}
          {gotGroups.map(([k, arr]) => (
            <div key={k}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 4px" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Caiu em {fmtDayMonY(k)}</span>
                <span style={{ fontSize: 12.5, color: T.sub, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(sum(arr))}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {arr.map(s => <ShiftCard key={s.id} T={T} s={s} data={data} onOpen={() => openEdit(s)} onTogglePaid={() => togglePaid(s.id)} showDate showPayInfo />)}
              </div>
            </div>
          ))}
        </div>
      </>)}

      {filt && <FilterSheet T={T} data={data} setData={setData} onClose={() => setFilt(false)} />}
    </div>
  );
}

/* ── filtros ── */
function FilterSheet({ T, data, setData, onClose }) {
  const st = data.settings;
  const [hid, setHid] = useState(st.hiddenLocs || []);
  const list = [...data.locations.map(l => [l.id, l.name, l.color]), ["_none", "Plantões sem local", T.sub]];
  const toggle = id => setHid(h => (h.includes(id) ? h.filter(x => x !== id) : [...h, id]));
  const apply = () => { setData(d => ({ ...d, settings: { ...d.settings, hiddenLocs: hid } })); onClose(); };
  return (
    <Sheet T={T} title="Mostrar quais locais" onClose={onClose}
      footer={<button onClick={apply} style={{ border: "none", background: T.accent, color: T.onAccent, fontWeight: 700, fontSize: 14, padding: "9px 8px", borderRadius: 999, cursor: "pointer", width: 62, fontFamily: "inherit" }}>OK</button>}>
      <div style={{ fontSize: 13.5, color: T.sub, margin: "2px 6px 12px", lineHeight: 1.5 }}>
        Desmarque um local para tirar os plantões dele das contas desta tela.
      </div>
      <div style={groupBox(T)}>
        {list.map(([id, name, color], i) => (
          <Row key={id} T={T} last={i === list.length - 1}
            label={<span style={{ display: "flex", alignItems: "center", gap: 9 }}><span style={{ width: 10, height: 10, borderRadius: 99, background: color }} />{name}</span>}
            onClick={() => toggle(id)}
            right={!hid.includes(id) && <Ic path={P.check} size={16} color={T.accent} />} />
        ))}
      </div>
      {hid.length > 0 && (
        <button onClick={() => setHid([])} style={{ width: "100%", marginTop: 16, border: "none", background: "transparent", color: T.accent, fontWeight: 600, fontSize: 14.5, padding: 12, cursor: "pointer", fontFamily: "inherit" }}>
          Mostrar todos de novo
        </button>
      )}
    </Sheet>
  );
}

/* ═══════════════ RESUMO ═══════════════
   O mês em foco no topo, o ano embaixo. Sem jargão: "você fez",
   "já caiu", "falta cair".                                        */
function SummaryView({ T, data, setData, openEdit, togglePaid }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [selM, setSelM] = useState(now.getMonth());
  const [metric, setMetric] = useState("money");
  const [listOpen, setListOpen] = useState(false);
  const yStr = String(year);
  const st = data.settings;

  const months = useMemo(() => {
    const arr = Array.from({ length: 12 }, () => ({ total: 0, paid: 0, hours: 0, count: 0, shifts: [] }));
    for (const s of data.shifts) {
      if (!isOn(s) || s.date.slice(0, 4) !== yStr) continue;
      const b = arr[pd(s.date).getMonth()];
      b.total += s.value || 0; b.count++; b.hours += shiftHours(s); b.shifts.push(s);
      if (s.paid) b.paid += s.value || 0;
    }
    return arr;
  }, [data.shifts, yStr]);

  const yTotal = months.reduce((a, b) => a + b.total, 0);
  const yHours = months.reduce((a, b) => a + b.hours, 0);
  const yCount = months.reduce((a, b) => a + b.count, 0);
  const maxV = Math.max(...months.map(b => (metric === "money" ? b.total : b.hours)), 1);
  const b = months[selM];
  const pending = b.total - b.paid;
  const pctPaid = b.total > 0 ? Math.round(b.paid / b.total * 100) : 0;
  const goal = st.monthlyGoal || 0;

  const locStats = useMemo(() => {
    const g = {};
    for (const s of data.shifts) {
      if (!isOn(s) || s.date.slice(0, 4) !== yStr) continue;
      const k = s.locationId || "_none";
      g[k] = g[k] || { total: 0, hours: 0, count: 0 };
      g[k].total += s.value || 0; g[k].hours += shiftHours(s); g[k].count++;
    }
    return Object.entries(g).sort((x, z) => z[1].total - x[1].total);
  }, [data.shifts, yStr]);
  const locMax = Math.max(...locStats.map(([, v]) => (metric === "money" ? v.total : v.hours)), 1);

  return (
    <div style={{ padding: "10px 16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button onClick={() => setYear(v => v - 1)} aria-label="Ano anterior" style={{ border: "none", background: "transparent", color: T.sub, cursor: "pointer", padding: "6px 4px" }}><Ic path={P.chevL} size={19} /></button>
          <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 21, color: T.text, letterSpacing: -.3 }}>Resumo <span style={{ color: T.sub, fontWeight: 500 }}>{year}</span></div>
          <button onClick={() => setYear(v => v + 1)} aria-label="Próximo ano" style={{ border: "none", background: "transparent", color: T.sub, cursor: "pointer", padding: "6px 4px" }}><Ic path={P.chevR} size={19} /></button>
        </div>
        <button onClick={() => setData(d => ({ ...d, settings: { ...d.settings, hideValues: !d.settings.hideValues } }))}
          aria-label={st.hideValues ? "Mostrar valores" : "Ocultar valores"}
          style={{ border: "none", background: "transparent", color: st.hideValues ? T.accent : T.sub, cursor: "pointer", padding: 6, display: "grid", placeItems: "center" }}>
          <Ic path={st.hideValues ? P.eyeOff : P.eye} size={19} />
        </button>
      </div>

      {/* ── o mês em foco ── */}
      <Card T={T} style={{ marginTop: 12 }}>
        <div style={{ fontSize: 13, color: T.sub }}>Você fez em {MONTHS[selM].toLowerCase()}</div>
        <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 34, color: T.text, marginTop: -2, fontVariantNumeric: "tabular-nums", letterSpacing: -.8 }}>{fmtBRL(b.total)}</div>
        <div style={{ fontSize: 13, color: T.sub, marginTop: 2 }}>
          {b.count === 0 ? "Nenhum plantão neste mês." : <>{b.count} {b.count === 1 ? "plantão" : "plantões"} · {fmtH(b.hours)}{b.hours ? ` · ${fmtBRL(b.total / b.hours)} por hora` : ""}</>}
        </div>

        {b.total > 0 && (<>
          <div style={{ height: 10, borderRadius: 6, background: T.chip, overflow: "hidden", marginTop: 14 }}>
            <div style={{ width: `${pctPaid}%`, height: "100%", background: T.accent, transition: "width .3s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 9, fontSize: 13.5 }}>
            <span style={{ color: T.sub, display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: T.accent }} />já caiu
            </span>
            <b style={{ color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(b.paid)}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 5, fontSize: 13.5 }}>
            <span style={{ color: T.sub, display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: T.chip, boxShadow: `inset 0 0 0 1px ${T.line}` }} />ainda vai cair
            </span>
            <b style={{ color: pending ? T.amber : T.text, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(pending)}</b>
          </div>
        </>)}

        {goal > 0 && b.total > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: T.sub, marginBottom: 6 }}>
              <span>Sua meta do mês</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: b.total >= goal ? T.accent : T.sub, fontWeight: b.total >= goal ? 700 : 400 }}>
                {Math.round(b.total / goal * 100)}% de {fmtBRL(goal)}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: T.chip, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, b.total / goal * 100)}%`, height: "100%", borderRadius: 99, background: b.total >= goal ? T.accent : T.amber, transition: "width .3s" }} />
            </div>
          </div>
        )}

        {b.count > 0 && (
          <button onClick={() => setListOpen(true)} style={{ marginTop: 14, width: "100%", border: "none", background: T.chip, color: T.text, fontWeight: 600, fontSize: 13.5, padding: "11px 14px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit" }}>
            Ver {b.count === 1 ? "o plantão" : `os ${b.count} plantões`} de {MONTHS_S[selM]}.
          </button>
        )}
      </Card>

      {/* ── o ano ── */}
      <Card T={T} style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: T.sub, fontWeight: 600 }}>Mês a mês · toque para trocar</span>
          <Segmented T={T} value={metric} onChange={setMetric} options={[["money", "R$"], ["hours", "h"]]} style={{ width: 96 }} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 100 }}>
          {months.map((mm, i) => {
            const v = metric === "money" ? mm.total : mm.hours;
            return (
              <button key={i} onClick={() => setSelM(i)} aria-label={MONTHS[i]} style={{ flex: 1, border: "none", background: "transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: 0, height: "100%", justifyContent: "flex-end", fontFamily: "inherit" }}>
                <div style={{
                  width: "100%", borderRadius: 5, minHeight: v ? 5 : 3, height: `${(v / maxV) * 80}%`,
                  background: i === selM ? T.accent : v ? T.accentSoft : T.chip, transition: "height .25s ease, background .2s",
                }} />
                <span style={{ fontSize: 9.5, fontWeight: 700, color: i === selM ? T.accent : T.sub }}>{MONTHS_S[i][0].toUpperCase()}</span>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.line}`, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 13, color: T.sub }}>Total de {year}</span>
          <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 18, color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(yTotal)}</span>
        </div>
        <div style={{ fontSize: 12.5, color: T.sub, marginTop: 3 }}>
          {yCount} {yCount === 1 ? "plantão" : "plantões"} · {fmtH(yHours)}{yHours ? ` · ${fmtBRL(yTotal / yHours)} por hora` : ""}
        </div>
      </Card>

      {/* ── por local ── */}
      {locStats.length > 0 && (
        <Card T={T} style={{ marginTop: 12, marginBottom: 8 }}>
          <div style={{ fontSize: 13, color: T.sub, fontWeight: 600, marginBottom: 10 }}>Onde você mais {metric === "money" ? "ganha" : "trabalha"} · {year}</div>
          {locStats.map(([k, v], i) => {
            const loc = data.locations.find(l => l.id === k);
            const val = metric === "money" ? v.total : v.hours;
            const color = loc ? loc.color : T.sub;
            return (
              <div key={k} style={{ padding: "9px 0", borderBottom: i === locStats.length - 1 ? "none" : `1px solid ${T.line}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 99, background: color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{loc ? loc.name : "Sem local"}</div>
                  <b style={{ color: T.text, fontSize: 14, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{metric === "money" ? fmtBRL(v.total) : fmtH(v.hours)}</b>
                </div>
                <div style={{ height: 5, borderRadius: 99, background: T.chip, overflow: "hidden", margin: "7px 0 5px 18px" }}>
                  <div style={{ width: `${(val / locMax) * 100}%`, height: "100%", borderRadius: 99, background: color, opacity: .85 }} />
                </div>
                <div style={{ fontSize: 11.5, color: T.sub, marginLeft: 18 }}>
                  {v.count} {v.count === 1 ? "plantão" : "plantões"} · {fmtH(v.hours)}{v.hours ? ` · ${fmtBRL(v.total / v.hours)}/h` : ""}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {listOpen && (
        <Sheet T={T} title={`${MONTHS[selM]} de ${year}`} onClose={() => setListOpen(false)}>
          <Card T={T} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, color: T.sub }}>Total do mês</div>
            <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 24, color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(b.total)}</div>
            <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2 }}>{b.count} {b.count === 1 ? "plantão" : "plantões"} · {fmtH(b.hours)}</div>
          </Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {b.shifts.slice().sort((x, z) => x.date.localeCompare(z.date)).map(s => (
              <ShiftCard key={s.id} T={T} s={s} data={data} onOpen={() => { setListOpen(false); openEdit(s); }} onTogglePaid={() => togglePaid(s.id)} showDate showPayInfo />
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

/* ═══════════════ LOCAIS ═══════════════ */
function LocationsView({ T, data, saveLoc, deleteLoc }) {
  const [editing, setEditing] = useState(null);
  const payLabel = l =>
    l.payType === "days" ? `Paga ${l.payValue} dias após o plantão` :
    l.payType === "fixedDay" ? `Paga todo dia ${l.payValue} do mês seguinte` : "Sem prazo definido";
  return (
    <div style={{ padding: "10px 16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 21, color: T.text, letterSpacing: -.3 }}>Locais</div>
        <button onClick={() => setEditing({ id: null, name: "", address: "", color: PALETTE[1], payType: "none", payValue: 30, defaultValue: 0, defaultStart: "", defaultEnd: "" })}
          aria-label="Novo local" style={{ border: "none", background: T.accent, color: T.onAccent, width: 38, height: 38, borderRadius: 999, cursor: "pointer", display: "grid", placeItems: "center", boxShadow: T.shadow }}><Ic path={P.plus} size={18} /></button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
        {data.locations.length === 0 && (
          <div style={{ border: `1.5px dashed ${T.line}`, borderRadius: 18, padding: "26px 18px", textAlign: "center", color: T.sub, fontSize: 14, lineHeight: 1.5 }}>
            Cadastre seus hospitais e clínicas.<br />Cada local guarda <b style={{ color: T.text }}>cor, valor padrão, horário padrão e prazo de pagamento</b> — e preenche tudo sozinho ao criar um plantão.
          </div>
        )}
        {data.locations.map(l => (
          <button key={l.id} onClick={() => setEditing({ ...l })} style={{ width: "100%", textAlign: "left", display: "flex", gap: 12, padding: "14px", background: T.card, border: "none", borderRadius: 20, cursor: "pointer", fontFamily: "inherit", boxShadow: T.shadow }}>
            <div style={{ width: 4, alignSelf: "stretch", borderRadius: 99, background: l.color }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15.5, color: T.text }}>{l.name}</div>
              {l.address && <div style={{ fontSize: 13, color: T.sub, marginTop: 2 }}>{l.address}</div>}
              <div style={{ fontSize: 12.5, color: T.sub, marginTop: 4 }}>
                {payLabel(l)}{l.defaultValue ? ` · Padrão ${fmtBRL(l.defaultValue)}` : ""}{l.defaultStart && l.defaultEnd ? ` · ${l.defaultStart}–${l.defaultEnd}` : ""}
              </div>
            </div>
            <Ic path={P.chev} size={16} color={T.sub} />
          </button>
        ))}
      </div>
      {editing && <LocationForm T={T} initial={editing} onClose={() => setEditing(null)}
        onSave={l => { saveLoc(l); setEditing(null); }} onDelete={editing.id ? () => { deleteLoc(editing.id); setEditing(null); } : null} />}
    </div>
  );
}

function LocationForm({ T, initial, onSave, onDelete, onClose }) {
  const [f, setF] = useState(() => ({ ...initial, defaultValue: Number(initial.defaultValue) || 0 }));
  const set = p => setF(x => ({ ...x, ...p }));
  const label = sectionLabel(T);
  const defDur = f.defaultStart && f.defaultEnd ? durOfTimes(f.defaultStart, f.defaultEnd) : 0;
  const save = () => { if (!f.name.trim()) { set({ _err: true }); return; } onSave({ ...f, name: f.name.trim(), defaultValue: Number(f.defaultValue) || 0, payValue: Number(f.payValue) || 0 }); };
  return (
    <Sheet T={T} title={f.id ? "Editar local" : "Novo local"} onClose={onClose}
      footer={<button onClick={save} style={{ border: "none", background: T.accent, color: T.onAccent, fontWeight: 700, fontSize: 14, padding: "8px 8px", borderRadius: 999, cursor: "pointer", width: 60, fontFamily: "inherit" }}>Salvar</button>}>
      <input value={f.name} onChange={e => set({ name: e.target.value, _err: false })} placeholder="Nome · ex: Hospital das Clínicas"
        style={{ ...inputStyle(T), fontSize: 17, fontWeight: 600, background: T.card, boxShadow: f._err ? `inset 0 0 0 1.5px ${T.red}` : T.shadow }} />
      {f._err && <div style={{ color: T.red, fontSize: 12.5, margin: "6px 4px 0" }}>Dê um nome ao local para salvar.</div>}
      <div style={{ marginTop: 10 }}>
        <input value={f.address} onChange={e => set({ address: e.target.value })} placeholder="Endereço (opcional)" style={{ ...inputStyle(T), background: T.card, boxShadow: T.shadow }} />
      </div>

      <div style={label}>Cor do local</div>
      <ColorGrid T={T} value={f.color} onChange={c => set({ color: c })} />

      <div style={label}>Prazo de pagamento</div>
      <Segmented T={T} value={f.payType} onChange={k => set({ payType: k })}
        options={[["none", "Sem prazo"], ["days", "Dias após"], ["fixedDay", "Dia fixo"]]} />
      {f.payType !== "none" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <span style={{ color: T.text, fontSize: 14.5 }}>{f.payType === "days" ? "Paga" : "Paga todo dia"}</span>
          <input type="number" min={f.payType === "days" ? 0 : 1} max={f.payType === "fixedDay" ? 31 : 365} value={f.payValue}
            onChange={e => set({ payValue: e.target.value })} style={{ ...inputStyle(T), width: 80, textAlign: "center" }} />
          <span style={{ color: T.text, fontSize: 14.5 }}>{f.payType === "days" ? "dias após o plantão" : "do mês seguinte"}</span>
        </div>
      )}
      <div style={{ fontSize: 12.5, color: T.sub, margin: "8px 4px 0", lineHeight: 1.45 }}>Com o prazo definido, a data de recebimento é calculada sozinha em cada plantão deste local.</div>

      <div style={label}>Padrões do plantão (opcional)</div>
      <div style={groupBox(T)}>
        <FieldRow T={T} label="Valor padrão">
          <MoneyInput T={T} value={f.defaultValue} onChange={v => set({ defaultValue: v })} width={160} big />
        </FieldRow>
        <FieldRow T={T} label="Horário padrão" last>
          <input type="time" value={f.defaultStart || ""} onChange={e => set({ defaultStart: e.target.value })} style={{ ...timeStyle(T), width: 90 }} />
          <span style={{ color: T.sub }}>–</span>
          <input type="time" value={f.defaultEnd || ""} onChange={e => set({ defaultEnd: e.target.value })} style={{ ...timeStyle(T), width: 90 }} />
        </FieldRow>
      </div>
      {f.defaultStart && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "9px 6px 0", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: T.sub, display: "flex", alignItems: "center", gap: 5 }}><Ic path={P.clock} size={13} /> {defDur > 0 ? `${fmtDur(defDur)} por plantão` : "duração"}</span>
          {DUR_PRESETS.map(h => (
            <Chip key={h} T={T} small on={defDur === h * 60}
              onClick={() => set({ defaultEnd: fromMin(toMin(f.defaultStart || "07:00") + h * 60), defaultStart: f.defaultStart || "07:00" })}>{h}h</Chip>
          ))}
        </div>
      )}

      {onDelete && (
        <button onClick={onDelete} style={{ width: "100%", marginTop: 22, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px", borderRadius: 14, border: "none", background: T.redSoft, color: T.red, fontWeight: 600, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit" }}>
          <Ic path={P.trash} size={16} /> Apagar local
        </button>
      )}
    </Sheet>
  );
}

/* ═══════════════ AJUSTES ═══════════════ */
function SettingsView({ T, data, setData, setDialog }) {
  const [showImport, setShowImport] = useState(false);
  const [importTxt, setImportTxt] = useState("");
  const label = { ...sectionLabel(T), margin: "20px 4px 8px" };

  const download = (name, content, type) => {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const exportCSV = () => {
    const rows = [["data_inicio", "hora_inicio", "data_fim", "hora_fim", "horas", "titulo", "local", "valor", "valor_hora", "pago", "recebido_em", "previsao_pagamento", "observacoes"]];
    for (const s of data.shifts.slice().sort((a, b) => a.date.localeCompare(b.date))) {
      const loc = data.locations.find(l => l.id === s.locationId);
      const h = shiftHours(s);
      rows.push([s.date, s.startTime, endDateOf(s), s.endTime, String(Math.round(h * 100) / 100).replace(".", ","), s.title, loc ? loc.name : "",
        String(s.value || 0).replace(".", ","), h ? String(Math.round((s.value || 0) / h * 100) / 100).replace(".", ",") : "",
        s.paid ? "sim" : "não", s.paid ? paidAtOf(s) : "", s.paymentDate || "", (s.notes || "").replace(/\n/g, " ")]);
    }
    download("plantoes.csv", "\uFEFF" + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n"), "text/csv;charset=utf-8");
  };
  /* recalcula a previsão de recebimento pelo prazo de cada local (não mexe no que já foi pago) */
  const fixPayDates = () => {
    const targets = data.shifts.filter(s => {
      if (s.paid) return false;
      const ap = autoPay(data.locations.find(l => l.id === s.locationId), s.date);
      return ap && ap !== s.paymentDate;
    });
    if (!targets.length) {
      setDialog({ title: "Está tudo certo", msg: "Nenhuma data de recebimento para ajustar. Lembre-se: só entram plantões não pagos, de locais com prazo definido.", options: [] });
      return;
    }
    setDialog({
      title: `Ajustar ${targets.length} ${targets.length === 1 ? "plantão" : "plantões"}?`,
      msg: "A data prevista de recebimento será recalculada pelo prazo de cada local. Plantões já pagos não mudam.",
      options: [{ label: "Recalcular", primary: true, fn: () => setData(d => ({
        ...d,
        shifts: d.shifts.map(s => {
          if (s.paid) return s;
          const ap = autoPay(d.locations.find(l => l.id === s.locationId), s.date);
          return ap ? { ...s, paymentDate: ap } : s;
        }),
      })) }],
    });
  };

  const doImport = () => {
    try {
      const j = JSON.parse(importTxt);
      if (!j.shifts || !j.locations) throw 0;
      setDialog({
        title: "Substituir dados?", msg: "O backup importado vai substituir todos os plantões e locais atuais.",
        options: [{ label: "Importar e substituir", danger: true, fn: () => { setData({ shifts: j.shifts, locations: j.locations, settings: { ...data.settings, ...(j.settings || {}) } }); setShowImport(false); setImportTxt(""); } }],
      });
    } catch { setDialog({ title: "Arquivo inválido", msg: "Cole o conteúdo de um backup JSON exportado pelo app.", options: [] }); }
  };

  return (
    <div style={{ padding: "10px 16px 0" }}>
      <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 21, color: T.text, letterSpacing: -.3 }}>Ajustes</div>

      <div style={label}>Aparência</div>
      <div style={groupBox(T)}>
        <FieldRow T={T} label="Modo noturno">
          <Toggle T={T} on={!!data.settings.dark} onChange={v => setData(d => ({ ...d, settings: { ...d.settings, dark: v } }))} />
        </FieldRow>
        <FieldRow T={T} label="Ocultar valores" last>
          <Toggle T={T} on={!!data.settings.hideValues} onChange={v => setData(d => ({ ...d, settings: { ...d.settings, hideValues: v } }))} />
        </FieldRow>
      </div>
      <div style={{ fontSize: 12.5, color: T.sub, margin: "7px 6px 0" }}>Com os valores ocultos o app mostra R$ •••• em todas as telas.</div>

      <div style={label}>Meta de ganhos</div>
      <div style={groupBox(T)}>
        <FieldRow T={T} label="Meta mensal" last>
          <MoneyInput T={T} value={data.settings.monthlyGoal || 0} onChange={v => setData(d => ({ ...d, settings: { ...d.settings, monthlyGoal: v } }))} width={168} big />
        </FieldRow>
      </div>
      <div style={{ fontSize: 12.5, color: T.sub, margin: "7px 4px 0" }}>A meta aparece como barra de progresso na aba Resumo.</div>

      <div style={label}>Seus dados</div>
      <div style={groupBox(T)}>
        <Row T={T} first label="Exportar plantões (CSV)" onClick={exportCSV} right={<Ic path={P.down} size={16} color={T.sub} />} />
        <Row T={T} label="Exportar backup completo" onClick={() => download("escala-backup.json", JSON.stringify(data, null, 2), "application/json")} right={<Ic path={P.down} size={16} color={T.sub} />} />
        <Row T={T} label="Importar backup" onClick={() => setShowImport(true)} />
        <Row T={T} last label="Recalcular datas de recebimento" onClick={fixPayDates} right={<Ic path={P.repeat} size={16} color={T.sub} />} />
      </div>
      <div style={{ fontSize: 12.5, color: T.sub, margin: "7px 4px 0", lineHeight: 1.45 }}>Use o recálculo se você mudou o prazo de um local ou se as previsões de pagamento ficaram erradas.</div>
      <div style={{ fontSize: 12.5, color: T.sub, margin: "7px 4px 0", lineHeight: 1.45 }}>Tudo fica salvo automaticamente neste dispositivo. Exporte um backup de vez em quando por segurança.</div>

      <div style={label}>Zona de risco</div>
      <div style={groupBox(T)}>
        <button onClick={() => setDialog({
          title: "Apagar tudo?", msg: "Todos os plantões, locais e ajustes serão removidos. Essa ação não pode ser desfeita.",
          options: [{ label: "Apagar tudo", danger: true, fn: () => setData({ shifts: [], locations: [], settings: { dark: data.settings.dark, monthlyGoal: 0 } }) }],
        })} style={{ width: "100%", padding: "14px 16px", border: "none", background: T.card, color: T.red, fontWeight: 600, fontSize: 15, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>Apagar todos os dados</button>
      </div>

      <div style={{ textAlign: "center", color: T.sub, fontSize: 12.5, margin: "28px 0 8px" }}>
        <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, color: T.text }}>Escala</span> · feito para quem vive de plantão
      </div>

      {showImport && (
        <Sheet T={T} title="Importar backup" onClose={() => setShowImport(false)}
          footer={<button onClick={doImport} style={{ border: "none", background: T.accent, color: T.onAccent, fontWeight: 700, fontSize: 14, padding: "8px 8px", borderRadius: 999, cursor: "pointer", width: 60, fontFamily: "inherit" }}>OK</button>}>
          <div style={{ fontSize: 13.5, color: T.sub, marginBottom: 10, lineHeight: 1.5 }}>Abra o arquivo <b>escala-backup.json</b>, copie todo o conteúdo e cole abaixo.</div>
          <textarea value={importTxt} onChange={e => setImportTxt(e.target.value)} rows={8} placeholder='{"shifts":[…],"locations":[…]}' style={{ ...inputStyle(T), background: T.card, boxShadow: T.shadow, fontFamily: "monospace", fontSize: 12.5 }} />
        </Sheet>
      )}
    </div>
  );
}

/* ═══════════════ APP ═══════════════ */
const DEFAULT_DATA = { shifts: [], locations: [], settings: { dark: false, monthlyGoal: 0, hideValues: false, groupByLoc: false, sortDesc: false, hiddenLocs: [] } };

/* plantões antigos só tinham hora de fim e não guardavam quando o dinheiro entrou */
const migrate = j => ({
  ...DEFAULT_DATA, ...j,
  settings: { ...DEFAULT_DATA.settings, ...(j.settings || {}) },
  locations: (j.locations || []).map(l => ({ ...l, defaultValue: Number(l.defaultValue) || 0 })),
  shifts: (j.shifts || []).map(s => ({
    ...s,
    value: Number(s.value) || 0,
    endDate: s.endDate || endDateOf(s),
    paymentDate: s.paymentDate || "",
    paidAt: s.paid ? (s.paidAt || s.paymentDate || s.date) : null,
  })),
});

function App() {
  const [data, setDataRaw] = useState(null);
  const [tab, setTab] = useState("cal");
  const [cursor, setCursor] = useState(() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1); });
  const [sel, setSel] = useState(todayStr());
  const [editor, setEditor] = useState(null); // {mode, initial}
  const [dialog, setDialog] = useState(null);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const r = localStorage.getItem(KEY);
      const j = r ? JSON.parse(r) : DEFAULT_DATA;
      setDataRaw(migrate(j));
    } catch { setDataRaw(DEFAULT_DATA); }
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!data || !loaded.current) return;
    const t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }, 300);
    return () => clearTimeout(t);
  }, [data]);

  const setData = setDataRaw;
  const T = THEMES[data?.settings?.dark ? "dark" : "light"];
  setMask(data && data.settings.hideValues);

  if (!data) return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#EEF2F0", fontFamily: "sans-serif", color: "#63736B" }}>Carregando sua escala…</div>
  );

  const openCreate = dateStr => {
    const d = dateStr || todayStr();
    setEditor({
      mode: "create",
      initial: {
        id: null, seriesId: null, title: "", color: PALETTE[0], locationId: null, value: 0,
        date: d, startTime: "19:00", endTime: "07:00", endDate: addDays(d, 1),
        paymentDate: "", paid: false, paidAt: null, notes: "", repeat: { type: "none" },
        rateType: "shift", rate: 0, notDone: false, reason: null,
      },
    });
  };
  const openEdit = s => setEditor({ mode: "edit", initial: { ...s } });

  const payDateFor = s => (s.paymentDate && s.paymentDate <= todayStr() ? s.paymentDate : todayStr());
  const markPaid = (ids, on) => setData(d => ({
    ...d,
    shifts: d.shifts.map(s => (ids.includes(s.id) ? { ...s, paid: on, paidAt: on ? (s.paidAt || payDateFor(s)) : null } : s)),
  }));
  const togglePaid = id => setData(d => ({
    ...d,
    shifts: d.shifts.map(s => (s.id === id ? { ...s, paid: !s.paid, paidAt: !s.paid ? (s.paidAt || payDateFor(s)) : null } : s)),
  }));

  const persistShift = f => {
    const { repeat, _err, ...clean } = f;
    clean.value = Number(clean.value) || 0;
    clean.endDate = clean.endDate || endDateOf(clean);
    clean.paymentDate = clean.paymentDate || "";
    if (clean.notDone) { clean.paid = false; clean.paidAt = null; } else clean.reason = null;
    clean.paidAt = clean.paid ? (clean.paidAt || payDateFor(clean)) : null;
    const endShift = daysBetween(clean.date, clean.endDate);      // quantos dias o plantão atravessa
    if (editor.mode === "create") {
      const dates = genDates(f.date, repeat);
      const seriesId = dates.length > 1 ? uid() : null;
      const loc = data.locations.find(l => l.id === f.locationId);
      const payDelta = f.paymentDate ? daysBetween(f.date, f.paymentDate) : null;
      const shifts = dates.map(dt => ({
        ...clean, id: uid(), seriesId, date: dt, endDate: addDays(dt, endShift),
        paymentDate: autoPay(loc, dt) || (payDelta !== null ? addDays(dt, payDelta) : ""),
        paidAt: clean.paid ? (dt === f.date ? clean.paidAt : dt) : null,
      }));
      setData(d => ({ ...d, shifts: [...d.shifts, ...shifts] }));
      setSel(f.date); setCursor(pd(f.date.slice(0, 8) + "01"));
      setEditor(null);
      return;
    }
    // edição
    const apply = scope => {
      setData(d => ({
        ...d,
        shifts: d.shifts.map(s => {
          if (s.id === clean.id) return { ...clean };
          if (scope === "series" && clean.seriesId && s.seriesId === clean.seriesId) {
            const loc = data.locations.find(l => l.id === clean.locationId);
            const payDelta = clean.paymentDate ? daysBetween(clean.date, clean.paymentDate) : null;
            return {
              ...s, title: clean.title, color: clean.color, locationId: clean.locationId, value: clean.value,
              startTime: clean.startTime, endTime: clean.endTime, endDate: addDays(s.date, endShift), notes: clean.notes,
              paymentDate: autoPay(loc, s.date) || (payDelta !== null ? addDays(s.date, payDelta) : ""),
            };
          }
          return s;
        }),
      }));
      setEditor(null);
    };
    if (clean.seriesId) {
      setDialog({
        title: "Plantão recorrente", msg: "Aplicar as alterações a:",
        options: [
          { label: "Somente este plantão", primary: true, fn: () => apply("one") },
          { label: "Toda a série", fn: () => apply("series") },
        ],
      });
    } else apply("one");
  };

  const deleteShift = () => {
    const s = editor.initial;
    const doDel = scope => {
      setData(d => ({ ...d, shifts: d.shifts.filter(x => scope === "series" && s.seriesId ? x.seriesId !== s.seriesId : x.id !== s.id) }));
      setEditor(null);
    };
    if (s.seriesId) {
      setDialog({
        title: "Apagar plantão recorrente", msg: "O que você quer apagar?",
        options: [
          { label: "Somente este plantão", danger: true, fn: () => doDel("one") },
          { label: "Toda a série", danger: true, fn: () => doDel("series") },
        ],
      });
    } else {
      setDialog({ title: "Apagar plantão?", msg: `"${s.title}" será removido.`, options: [{ label: "Apagar", danger: true, fn: () => doDel("one") }] });
    }
  };

  const duplicateShift = () => {
    const s = editor.initial;
    setEditor({ mode: "create", initial: { ...s, id: null, seriesId: null, paid: false, paidAt: null, notDone: false, reason: null, repeat: { type: "none" } } });
  };

  const saveLoc = l => {
    if (l.id) { setData(d => ({ ...d, locations: d.locations.map(x => x.id === l.id ? l : x) })); return l.id; }
    const id = uid();
    setData(d => ({ ...d, locations: [...d.locations, { ...l, id }] }));
    return id;
  };
  const deleteLoc = id => setDialog({
    title: "Apagar local?", msg: "Os plantões deste local serão mantidos, apenas sem o vínculo.",
    options: [{ label: "Apagar local", danger: true, fn: () => setData(d => ({ ...d, locations: d.locations.filter(l => l.id !== id), shifts: d.shifts.map(s => s.locationId === id ? { ...s, locationId: null } : s) })) }],
  });

  const NAV = [
    ["cal", "Calendário", P.cal],
    ["pay", "Pagamentos", P.money],
    ["sum", "Resumo", P.chart],
    ["loc", "Locais", P.pin],
    ["set", "Ajustes", P.gear],
  ];

  return (
    <div style={{ minHeight: "100dvh", background: T.bg, fontFamily: "'Instrument Sans', system-ui, sans-serif", transition: "background .25s", colorScheme: data.settings.dark ? "dark" : "light" }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        body{margin:0}
        input,textarea,select,button{font-family:inherit}
        button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2.5px solid ${T.accent};outline-offset:2px}
        ::-webkit-scrollbar{width:0;height:0}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideUp{from{transform:translateY(40px);opacity:.6}to{transform:translateY(0);opacity:1}}
        @media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}
      `}</style>

      <div style={{ maxWidth: 430, margin: "0 auto", paddingBottom: "calc(122px + env(safe-area-inset-bottom))" }}>
        {tab === "cal" && <CalendarView T={T} data={data} cursor={cursor} setCursor={setCursor} sel={sel} setSel={setSel} openCreate={openCreate} openEdit={openEdit} togglePaid={togglePaid} />}
        {tab === "pay" && <PaymentsView T={T} data={data} cursor={cursor} setCursor={setCursor} openEdit={openEdit} togglePaid={togglePaid} markPaid={markPaid} setDialog={setDialog} setData={setData} />}
        {tab === "sum" && <SummaryView T={T} data={data} setData={setData} openEdit={openEdit} togglePaid={togglePaid} />}
        {tab === "loc" && <LocationsView T={T} data={data} saveLoc={saveLoc} deleteLoc={deleteLoc} />}
        {tab === "set" && <SettingsView T={T} data={data} setData={setData} setDialog={setDialog} />}
      </div>

      <nav style={{
        position: "fixed", bottom: "calc(12px + env(safe-area-inset-bottom))", left: "50%", transform: "translateX(-50%)", width: "calc(100% - 24px)", maxWidth: 406,
        display: "flex", background: T.nav, backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderRadius: 999, padding: "7px 6px", boxShadow: T.shadow, border: "none", zIndex: 40,
      }}>
        {NAV.map(([k, lab, icon]) => (
          <button key={k} onClick={() => setTab(k)} aria-label={lab} style={{
            flex: 1, border: "none", background: "transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "3px 0", fontFamily: "inherit",
            color: tab === k ? T.accent : T.sub,
          }}>
            <span style={{ display: "grid", placeItems: "center", width: 46, height: 26, borderRadius: 999, background: tab === k ? T.accentSoft : "transparent", transition: "background .2s" }}>
              <Ic path={icon} size={19} sw={tab === k ? 2.1 : 1.7} />
            </span>
            <span style={{ fontSize: 9.5, fontWeight: tab === k ? 800 : 600, letterSpacing: .2 }}>{lab}</span>
          </button>
        ))}
      </nav>

      {editor && (
        <ShiftForm key={editor.initial.id || "new" + editor.initial.date} T={T} data={data} mode={editor.mode} initial={editor.initial}
          onSave={persistShift} onClose={() => setEditor(null)} onDelete={deleteShift} onDuplicate={duplicateShift} onCreateLocation={saveLoc} />
      )}
      {dialog && <Dialog T={T} {...dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}


createRoot(document.getElementById("root")).render(<App />);
