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

/* dinheiro */
const fmtBRL = v => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = v => (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtBRLk = v => { const n = Math.abs(v || 0); return n >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k` : fmtBRL(v); };

/* datas por extenso */
const fmtDateLong = s => { const d = pd(s); return `${d.getDate()} de ${MONTHS_S[d.getMonth()]}. de ${d.getFullYear()}`; };
const fmtDateShort = s => { const d = pd(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const fmtDayMon = s => { const d = pd(s); return `${d.getDate()} ${MONTHS_S[d.getMonth()]}`; };
const fmtWdDay = s => { const d = pd(s); return `${WD[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
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
    bg: "#EEF2F0", card: "#FFFFFF", card2: "#F5F8F6", text: "#13201A", sub: "#63736B",
    line: "#E2E8E4", accent: "#0E7A5F", onAccent: "#FFFFFF", accentSoft: "#DDEEE7",
    amber: "#A66508", amberSoft: "#F6ECDA", red: "#C0392B", redSoft: "#F7E4E0",
    nav: "rgba(255,255,255,.9)", shadow: "0 10px 30px rgba(19,32,26,.10)", chip: "#EDF1EF",
  },
  dark: {
    bg: "#0B100E", card: "#161D19", card2: "#1C2621", text: "#E9F0EC", sub: "#8FA098",
    line: "#26332C", accent: "#3ECDA0", onAccent: "#07281E", accentSoft: "#153228",
    amber: "#E3A63C", amberSoft: "#33280F", red: "#E9705C", redSoft: "#3A1B15",
    nav: "rgba(18,24,21,.88)", shadow: "0 10px 30px rgba(0,0,0,.45)", chip: "#212B26",
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
};

/* ── primitivos de UI ── */
const Card = ({ T, children, style, onClick }) => (
  <div onClick={onClick} style={{ background: T.card, borderRadius: 20, border: `1px solid ${T.line}`, padding: 16, ...style }}>{children}</div>
);

const Toggle = ({ T, on, onChange }) => (
  <button onClick={() => onChange(!on)} aria-pressed={on} style={{
    width: 50, height: 30, borderRadius: 999, border: "none", cursor: "pointer", padding: 3,
    background: on ? T.accent : T.chip, transition: "background .2s", flexShrink: 0,
  }}>
    <div style={{ width: 24, height: 24, borderRadius: 999, background: "#fff", transform: `translateX(${on ? 20 : 0}px)`, transition: "transform .2s", boxShadow: "0 1px 4px rgba(0,0,0,.25)" }} />
  </button>
);

const Badge = ({ T, paid, overdue }) => (
  <span style={{
    fontSize: 11, fontWeight: 700, letterSpacing: .4, padding: "4px 9px", borderRadius: 8, whiteSpace: "nowrap",
    background: paid ? T.accentSoft : overdue ? T.redSoft : T.amberSoft,
    color: paid ? T.accent : overdue ? T.red : T.amber,
  }}>{paid ? "PAGO" : overdue ? "ATRASADO" : "A RECEBER"}</span>
);

const Sheet = ({ T, title, onClose, children, footer }) => (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(5,10,8,.5)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn .18s ease" }}>
    <div onClick={e => e.stopPropagation()} style={{
      width: "100%", maxWidth: 430, maxHeight: "92dvh", background: T.bg, borderRadius: "26px 26px 0 0",
      display: "flex", flexDirection: "column", animation: "slideUp .24s cubic-bezier(.2,.9,.3,1)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "16px 16px 8px" }}>
        <div style={{ width: 62, display: "flex" }}>
          <button onClick={onClose} aria-label="Fechar" style={{ width: 36, height: 36, borderRadius: 999, border: "none", background: T.chip, color: T.text, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}><Ic path={P.x} size={17} /></button>
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: "center", fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: 17, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ width: 62, display: "flex", justifyContent: "flex-end" }}>{footer}</div>
      </div>
      <div style={{ overflowY: "auto", padding: "8px 16px 30px", WebkitOverflowScrolling: "touch" }}>{children}</div>
    </div>
  </div>
);

const Dialog = ({ T, title, msg, options, onClose }) => (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(5,10,8,.55)", zIndex: 80, display: "grid", placeItems: "center", padding: 24, animation: "fadeIn .15s ease" }}>
    <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 320, background: T.card, borderRadius: 22, padding: 20, boxShadow: T.shadow }}>
      <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: 17, color: T.text, textAlign: "center" }}>{title}</div>
      {msg && <div style={{ fontSize: 13.5, color: T.sub, textAlign: "center", marginTop: 8, lineHeight: 1.45 }}>{msg}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
        {options.map((o, i) => (
          <button key={i} onClick={() => { o.fn && o.fn(); onClose(); }} style={{
            padding: "12px 14px", borderRadius: 14, border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600, fontFamily: "inherit",
            background: o.danger ? T.redSoft : o.primary ? T.accent : T.chip,
            color: o.danger ? T.red : o.primary ? T.onAccent : T.text,
          }}>{o.label}</button>
        ))}
        <button onClick={onClose} style={{ padding: "12px 14px", borderRadius: 14, border: "none", cursor: "pointer", fontSize: 15, fontWeight: 500, background: "transparent", color: T.sub, fontFamily: "inherit" }}>Cancelar</button>
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
    <span style={{ display: "flex", alignItems: "center", gap: 8, color: T.sub, fontSize: 15 }}>{right}{onClick && <Ic path={P.chev} size={16} color={T.sub} />}</span>
  </button>
);

const inputStyle = T => ({
  width: "100%", padding: "13px 14px", borderRadius: 14, border: `1px solid ${T.line}`, background: T.card,
  color: T.text, fontSize: 15.5, fontFamily: "inherit", outline: "none",
});


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
    <div style={{
      display: "flex", alignItems: "center", gap: 6, width, borderRadius: 14,
      border: `1px solid ${T.line}`, background: T.card, padding: big ? "8px 10px" : "6px 10px",
    }}>
      <span style={{ color: T.sub, fontWeight: 700, fontSize: big ? 15 : 14 }}>R$</span>
      <input
        value={txt} onChange={onType} onFocus={e => e.target.select()}
        inputMode="numeric" enterKeyHint="done" placeholder={placeholder} autoFocus={autoFocus}
        style={{
          flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: T.text,
          textAlign: "right", fontFamily: "'Bricolage Grotesque', inherit", fontWeight: 700,
          fontSize: big ? 22 : 17, padding: "4px 0", fontVariantNumeric: "tabular-nums",
        }} />
      {c > 0 && (
        <button onClick={() => onChange(0)} aria-label="Limpar valor" style={{ border: "none", background: "transparent", color: T.sub, cursor: "pointer", padding: 2, display: "grid", placeItems: "center" }}>
          <Ic path={P.x} size={14} />
        </button>
      )}
    </div>
  );
};

const Chip = ({ T, on, onClick, children, small, danger }) => (
  <button onClick={onClick} style={{
    padding: small ? "7px 11px" : "9px 12px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit",
    fontWeight: 700, fontSize: small ? 12.5 : 13.5, whiteSpace: "nowrap",
    background: on ? (danger ? T.redSoft : T.accent) : T.card,
    color: on ? (danger ? T.red : T.onAccent) : T.text,
    boxShadow: on ? "none" : `inset 0 0 0 1px ${T.line}`,
  }}>{children}</button>
);

const Segmented = ({ T, value, onChange, options, style }) => (
  <div style={{ display: "flex", background: T.card, borderRadius: 999, padding: 3, boxShadow: `inset 0 0 0 1px ${T.line}`, ...style }}>
    {options.map(([k, lab]) => (
      <button key={k} onClick={() => onChange(k)} style={{
        flex: 1, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, padding: "8px 8px", borderRadius: 999,
        fontFamily: "inherit", whiteSpace: "nowrap",
        background: value === k ? T.accent : "transparent", color: value === k ? T.onAccent : T.sub,
      }}>{lab}</button>
    ))}
  </div>
);

/* linha de formulário: rótulo à esquerda, controle à direita */
const FieldRow = ({ T, label, children, last }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: T.card, borderBottom: last ? "none" : `1px solid ${T.line}` }}>
    <span style={{ fontSize: 15.5, fontWeight: 500, color: T.text, flex: 1, minWidth: 0 }}>{label}</span>
    {children}
  </div>
);

const dateStyle = T => ({ ...inputStyle(T), width: 148, padding: "9px 10px", fontVariantNumeric: "tabular-nums" });
const timeStyle = T => ({ ...inputStyle(T), width: 92, padding: "9px 10px", fontVariantNumeric: "tabular-nums" });
const sectionLabel = T => ({ fontSize: 12.5, fontWeight: 700, color: T.sub, letterSpacing: .5, textTransform: "uppercase", margin: "18px 4px 8px" });
const groupBox = T => ({ borderRadius: 16, overflow: "hidden", border: `1px solid ${T.line}` });

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
  const [f, setF] = useState(() => ({ ...initial, endDate: initial.endDate || endDateOf(initial), value: Number(initial.value) || 0 }));
  /* qualquer mudança limpa o aviso de horário inválido */
  const [showColors, setShowColors] = useState(false);
  const [showLoc, setShowLoc] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);
  const [newLoc, setNewLoc] = useState(null);
  const set = p => setF(x => ({ ...x, _errTime: false, ...p }));
  const loc = data.locations.find(l => l.id === f.locationId);
  const mins = spanMin(f.date, f.startTime, f.endDate, f.endTime);
  const multiDay = f.endDate !== f.date;
  const suggested = autoPay(loc, f.date);
  const label = sectionLabel(T);

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
      footer={<button onClick={save} style={{ border: "none", background: T.accent, color: T.onAccent, fontWeight: 700, fontSize: 14, padding: "8px 8px", borderRadius: 999, cursor: "pointer", width: 60, fontFamily: "inherit" }}>Salvar</button>}>

      <input value={f.title} onChange={e => set({ title: e.target.value, _err: false })} placeholder="Título · ex: Plantão noturno"
        style={{ ...inputStyle(T), fontSize: 17, fontWeight: 600, border: `1.5px solid ${f._err ? T.red : T.line}` }} />
      {f._err && <div style={{ color: T.red, fontSize: 12.5, margin: "6px 4px 0" }}>Dê um título ao plantão para salvar.</div>}

      {mode === "edit" && f.seriesId && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, color: T.sub, fontSize: 13 }}>
          <Ic path={P.repeat} size={14} /> Faz parte de uma série recorrente
        </div>
      )}

      <div style={label}>Identificação</div>
      <div style={groupBox(T)}>
        <Row T={T} first label="Cor" onClick={() => setShowColors(v => !v)} right={<span style={{ width: 22, height: 22, borderRadius: 999, background: f.color, display: "inline-block" }} />} />
        {showColors && <div style={{ padding: 16, background: T.card, borderBottom: `1px solid ${T.line}` }}><ColorGrid T={T} value={f.color} onChange={c => set({ color: c })} /></div>}
        <Row T={T} last label="Local" onClick={() => setShowLoc(true)}
          right={loc ? <span style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ width: 10, height: 10, borderRadius: 99, background: loc.color }} />{loc.name}</span> : <span style={{ color: T.accent, fontWeight: 600 }}>Associar</span>} />
      </div>
      {loc && <div style={{ fontSize: 12.5, color: T.sub, margin: "7px 6px 0" }}>Cor e sugestões vêm do local. Você pode ajustar o que quiser.</div>}

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
        <span style={{ fontSize: 12.5, fontWeight: 700, color: T.sub, letterSpacing: .3, flexShrink: 0 }}>Duração</span>
        {DUR_PRESETS.map(h => <Chip key={h} T={T} small on={mins === h * 60} onClick={() => setDur(h)}>{h}h</Chip>)}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "9px 6px 0", color: T.sub, fontSize: 13, flexWrap: "wrap" }}>
        <Ic path={P.clock} size={14} />
        {mins > 0 ? (<>
          <b style={{ color: T.text }}>{fmtDur(mins)}</b>
          <span>· termina {multiDay ? `${fmtWdDay(f.endDate)} às ${f.endTime}` : `às ${f.endTime}, no mesmo dia`}</span>
          {f.value > 0 && <span>· <b style={{ color: T.text }}>{fmtBRL(f.value / (mins / 60))}</b>/h</span>}
        </>) : <span style={{ color: T.red, fontWeight: 600 }}>O fim precisa ser depois do início{f._errTime ? " para salvar" : ""}.</span>}
        {mins > 72 * 60 && <span style={{ color: T.amber, fontWeight: 600 }}>· confira: mais de 3 dias seguidos</span>}
      </div>

      <div style={label}>Valor e pagamento</div>
      <div style={groupBox(T)}>
        <FieldRow T={T} label="Valor do plantão">
          <MoneyInput T={T} value={f.value} onChange={v => set({ value: v })} width={168} big />
        </FieldRow>
        {loc && loc.defaultValue > 0 && loc.defaultValue !== f.value && (
          <button onClick={() => set({ value: loc.defaultValue })} style={{ width: "100%", border: "none", background: T.card, color: T.accent, fontWeight: 600, fontSize: 13.5, padding: "10px 14px", textAlign: "left", cursor: "pointer", borderBottom: `1px solid ${T.line}`, fontFamily: "inherit" }}>
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
        {!f.paymentDate && <div style={{ background: T.card, borderBottom: `1px solid ${T.line}`, padding: "0 14px 12px", fontSize: 12.5, color: T.sub }}>Sem data de recebimento este plantão não entra na previsão de caixa.</div>}
        <FieldRow T={T} label="Já foi pago" last={!f.paid}>
          <Toggle T={T} on={!!f.paid} onChange={v => set({ paid: v, paidAt: v ? (f.paidAt || (f.paymentDate && f.paymentDate <= todayStr() ? f.paymentDate : todayStr())) : null })} />
        </FieldRow>
        {f.paid && (
          <FieldRow T={T} label="Recebido em" last>
            <input type="date" value={f.paidAt || todayStr()} onChange={e => set({ paidAt: e.target.value })} style={dateStyle(T)} />
          </FieldRow>
        )}
      </div>

      {mode === "create" && (<>
        <div style={label}>Repetição</div>
        <div style={groupBox(T)}>
          <Row T={T} first last label="Repetir" onClick={() => setShowRepeat(true)} right={<span style={{ maxWidth: 190, textAlign: "right" }}>{repLabel(f.repeat)}</span>} />
        </div>
        {repDates.length > 1 && (
          <div style={{ fontSize: 12.5, color: T.sub, margin: "7px 6px 0", lineHeight: 1.5 }}>
            Serão criados <b style={{ color: T.text }}>{repDates.length} plantões</b> · de {fmtDateShort(repDates[0])} até {fmtDateShort(repDates[repDates.length - 1])}.
            {repDates.length >= MAX_OCC && <> Limite de {MAX_OCC} por vez — depois é só criar de novo a partir do último.</>}
          </div>
        )}
      </>)}

      <div style={label}>Observações</div>
      <textarea value={f.notes || ""} onChange={e => set({ notes: e.target.value })} placeholder="Comentários, contato, setor…" rows={3}
        style={{ ...inputStyle(T), resize: "vertical", minHeight: 70 }} />

      {mode === "edit" && (
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button onClick={onDuplicate} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px", borderRadius: 14, border: `1px solid ${T.line}`, background: T.card, color: T.text, fontWeight: 600, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit" }}>
            <Ic path={P.copy} size={16} /> Duplicar
          </button>
          <button onClick={onDelete} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px", borderRadius: 14, border: "none", background: T.redSoft, color: T.red, fontWeight: 600, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit" }}>
            <Ic path={P.trash} size={16} /> Apagar
          </button>
        </div>
      )}

      {showLoc && (
        <Sheet T={T} title="Associar local" onClose={() => setShowLoc(false)}>
          <div style={groupBox(T)}>
            <Row T={T} first label="Nenhum local" onClick={() => pickLocation(null)} right={!f.locationId && <Ic path={P.check} size={16} color={T.accent} />} />
            {data.locations.map(l => (
              <Row key={l.id} T={T}
                label={<span style={{ display: "flex", alignItems: "center", gap: 9 }}><span style={{ width: 11, height: 11, borderRadius: 99, background: l.color }} />{l.name}</span>}
                onClick={() => pickLocation(l.id)} right={f.locationId === l.id && <Ic path={P.check} size={16} color={T.accent} />} />
            ))}
            <button onClick={() => setNewLoc({ id: null, name: "", address: "", color: PALETTE[(data.locations.length + 1) % PALETTE.length], payType: "none", payValue: 30, defaultValue: 0, defaultStart: "", defaultEnd: "" })}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: T.card, border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: T.accent, fontWeight: 700, fontSize: 15.5 }}>
              <span style={{ width: 22, height: 22, borderRadius: 99, background: T.accentSoft, display: "grid", placeItems: "center" }}><Ic path={P.plus} size={14} color={T.accent} /></span>
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
        <RepeatSheet T={T} value={f.repeat || { type: "none" }} baseDate={f.date}
          onChange={rep => set({ repeat: rep })} onClose={() => setShowRepeat(false)} />
      )}
    </Sheet>
  );
}

function RepeatSheet({ T, value, baseDate, onChange, onClose }) {
  const [r, setR] = useState({ weekdays: [pd(baseDate).getDay()], every: 2, endMode: "until", until: addMonths(baseDate, 3), count: 12, ...value });
  const opts = [
    ["none", "Nunca"], ["daily", "Todos os dias"], ["weekly", "Toda semana"], ["biweekly", "A cada 2 semanas"],
    ["monthlyDay", "Todo mês · mesmo dia"], ["monthlyPos", `Todo mês · ${["1º", "2º", "3º", "4º", "5º"][Math.floor((pd(baseDate).getDate() - 1) / 7)]} ${WD_FULL[pd(baseDate).getDay()]}`], ["custom", "Personalizado"],
  ];
  const needsWd = r.type === "weekly" || r.type === "biweekly";
  const preview = useMemo(() => (r.type === "none" ? [] : genDates(baseDate, r)), [r, baseDate]);
  const apply = () => { onChange(r.type === "none" ? { type: "none" } : r); onClose(); };
  const setEnd = p => setR(x => ({ ...x, ...p }));
  return (
    <Sheet T={T} title="Repetir" onClose={onClose}
      footer={<button onClick={apply} style={{ border: "none", background: T.accent, color: T.onAccent, fontWeight: 700, fontSize: 14, padding: "8px 8px", borderRadius: 999, cursor: "pointer", width: 60, fontFamily: "inherit" }}>OK</button>}>
      <div style={groupBox(T)}>
        {opts.map(([k, lab], i) => (
          <Row key={k} T={T} first={i === 0} last={i === opts.length - 1} label={lab}
            onClick={() => setR(x => ({ ...x, type: k }))} right={r.type === k && <Ic path={P.check} size={16} color={T.accent} />} />
        ))}
      </div>

      {needsWd && (<>
        <div style={sectionLabel(T)}>Dias da semana</div>
        <div style={{ display: "flex", gap: 6 }}>
          {WD.map((w, i) => {
            const on = (r.weekdays || []).includes(i);
            return <button key={i} onClick={() => setR(x => ({ ...x, weekdays: on ? x.weekdays.filter(d => d !== i) : [...(x.weekdays || []), i] }))}
              style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit", background: on ? T.accent : T.card, color: on ? T.onAccent : T.text, boxShadow: on ? "none" : `inset 0 0 0 1px ${T.line}` }}>{w}</button>;
          })}
        </div>
      </>)}

      {r.type === "custom" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
          <span style={{ color: T.text, fontSize: 15 }}>A cada</span>
          <input type="number" min={1} value={r.every} onChange={e => setR(x => ({ ...x, every: e.target.value }))} style={{ ...inputStyle(T), width: 80, textAlign: "center" }} />
          <span style={{ color: T.text, fontSize: 15 }}>dias</span>
        </div>
      )}

      {r.type !== "none" && (<>
        <div style={sectionLabel(T)}>Termina</div>
        <Segmented T={T} value={repEnd(r)} onChange={k => setEnd({ endMode: k })}
          options={[["until", "Em uma data"], ["count", "Após X vezes"], ["never", "Nunca"]]} />

        {repEnd(r) === "until" && (<>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
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
          <div style={{ marginTop: 12 }}>
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
          <div style={{ fontSize: 13, color: T.sub, margin: "12px 4px 0", lineHeight: 1.5 }}>
            Sem data para acabar. O app já deixa criados os próximos <b style={{ color: T.text }}>{OPEN_MONTHS} meses</b> (até {MAX_OCC} plantões) — quando chegar perto do fim, é só abrir o último e repetir de novo.
          </div>
        )}

        <div style={{ marginTop: 16, background: T.card, border: `1px solid ${T.line}`, borderRadius: 16, padding: 14 }}>
          <div style={{ fontSize: 13, color: T.sub }}>Resultado</div>
          <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 19, color: T.text, marginTop: 2 }}>
            {preview.length} {preview.length === 1 ? "plantão" : "plantões"}
          </div>
          {preview.length > 0 && (
            <div style={{ fontSize: 13, color: T.sub, marginTop: 4, lineHeight: 1.5 }}>
              {preview.slice(0, 3).map(d => fmtWdDay(d)).join(" · ")}{preview.length > 3 ? ` … último em ${fmtDateShort(preview[preview.length - 1])}` : ""}
            </div>
          )}
        </div>
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
    <div style={{ width: "100%", display: "flex", gap: 12, padding: "13px 14px", background: T.card, border: `1px solid ${T.line}`, borderRadius: 18, fontFamily: "inherit", opacity: cont ? .82 : 1 }}>
      <button onClick={onOpen} style={{ flex: 1, minWidth: 0, display: "flex", gap: 12, alignItems: "stretch", background: "transparent", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
      <div style={{ width: 4.5, alignSelf: "stretch", borderRadius: 99, background: s.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 15.5, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
          {s.seriesId && <Ic path={P.repeat} size={13} color={T.sub} />}
          {cont && <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: .3, color: T.accent, background: T.accentSoft, padding: "2px 6px", borderRadius: 6, whiteSpace: "nowrap" }}>EM ANDAMENTO</span>}
        </div>
        {loc && <div style={{ fontSize: 13, color: T.sub, marginTop: 2 }}>{loc.name}</div>}
        <div style={{ fontSize: 13, color: T.sub, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
          {multi
            ? <>{fmtDayMon(s.date)} {s.startTime} → {fmtDayMon(end)} {s.endTime} · <b style={{ color: T.text }}>{fmtDur(mins)}</b></>
            : <>{showDate && <>{fmtDateLong(s.date)} · </>}{s.startTime}–{s.endTime} · {fmtDur(mins)}</>}
        </div>
        {showPayInfo && (
          <div style={{ fontSize: 12.5, color: overdue ? T.red : T.sub, marginTop: 3, fontWeight: overdue ? 600 : 400 }}>{payLine}</div>
        )}
      </div>
      </button>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, justifyContent: "center", flexShrink: 0 }}>
        <button onClick={onOpen} style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: 15.5, color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(s.value)}</button>
        <button onClick={onTogglePaid} aria-label={s.paid ? "Marcar como não recebido" : "Marcar como recebido"}
          style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
          <Badge T={T} paid={s.paid} overdue={overdue} />
        </button>
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
  const d = pd(s.date);
  return (
    <button onClick={onOpen} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: T.card, border: `1px solid ${T.line}`, borderRadius: 16, cursor: "pointer", fontFamily: "inherit" }}>
      <div style={{ width: 46, flexShrink: 0, borderRadius: 12, background: s.color + "1F", padding: "6px 0", textAlign: "center", boxShadow: `inset 0 0 0 1px ${s.color}33` }}>
        <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 18, color: s.color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{d.getDate()}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: s.color, textTransform: "uppercase", letterSpacing: .4, marginTop: 2 }}>{MONTHS_S[d.getMonth()]}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 14.5, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
          {s.seriesId && <Ic path={P.repeat} size={12} color={T.sub} />}
        </div>
        <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span style={{ color: running ? T.accent : T.sub, fontWeight: running ? 700 : 600 }}>{running ? "em andamento" : relDay(s.date)}</span>
          {" · "}{s.startTime}–{s.endTime}{multi ? `+${daysBetween(s.date, end)}d` : ""} · {fmtDur(shiftMin(s))}
          {loc ? ` · ${loc.name}` : ""}
        </div>
      </div>
      <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: 14.5, color: T.text, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtBRL(s.value)}</span>
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
  const monthTotal = monthShifts.reduce((a, s) => a + (s.value || 0), 0);
  const monthHours = monthShifts.reduce((a, s) => a + shiftHours(s), 0);
  const dayShifts = (byDay[sel] || []).slice().sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const today = todayStr();
  const selD = pd(sel);

  const upcoming = useMemo(() => data.shifts
    .filter(s => endDateOf(s) >= today)
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    .slice(0, 6), [data.shifts, today]);
  const next30 = useMemo(() => {
    const lim = addDays(today, 30);
    const arr = data.shifts.filter(s => s.date >= today && s.date <= lim);
    return { n: arr.length, v: arr.reduce((a, s) => a + (s.value || 0), 0) };
  }, [data.shifts, today]);

  return (
    <div style={{ padding: "14px 16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <button onClick={() => { const t = new Date(); setCursor(new Date(t.getFullYear(), t.getMonth(), 1)); setSel(todayStr()); }}
          style={{ border: "none", background: T.card, color: T.accent, fontWeight: 700, fontSize: 13.5, padding: "9px 14px", borderRadius: 999, cursor: "pointer", boxShadow: `inset 0 0 0 1px ${T.line}`, fontFamily: "inherit" }}>Hoje</button>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button onClick={() => setCursor(new Date(y, m - 1, 1))} aria-label="Mês anterior" style={{ border: "none", background: "transparent", color: T.text, cursor: "pointer", padding: 6 }}><Ic path={P.chevL} size={20} /></button>
          <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 19, color: T.text, minWidth: 150, textAlign: "center", letterSpacing: .3 }}>
            {MONTHS[m]} <span style={{ color: T.sub, fontWeight: 600 }}>{y}</span>
          </div>
          <button onClick={() => setCursor(new Date(y, m + 1, 1))} aria-label="Próximo mês" style={{ border: "none", background: "transparent", color: T.text, cursor: "pointer", padding: 6 }}><Ic path={P.chevR} size={20} /></button>
        </div>
        <button onClick={() => openCreate(sel)} aria-label="Novo plantão" style={{ border: "none", background: T.accent, color: T.onAccent, width: 38, height: 38, borderRadius: 999, cursor: "pointer", display: "grid", placeItems: "center", boxShadow: T.shadow }}><Ic path={P.plus} size={18} /></button>
      </div>

      {monthShifts.length > 0 && (
        <div style={{ fontSize: 13, color: T.sub, textAlign: "center", marginTop: 8 }}>
          {monthShifts.length} {monthShifts.length === 1 ? "plantão" : "plantões"} · {fmtH(monthHours)} · <b style={{ color: T.text }}>{fmtBRL(monthTotal)}</b>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginTop: 12 }}>
        {WD.map(w => <div key={w} style={{ textAlign: "center", fontSize: 11.5, fontWeight: 700, color: T.sub, letterSpacing: .5, padding: "4px 0" }}>{w}</div>)}
        {cells.map((c, i) => {
          const shifts = byDay[c.str] || [];
          const isSel = c.str === sel, isToday = c.str === today;
          return (
            <button key={i} onClick={() => { setSel(c.str); if (c.out) setCursor(pd(c.str.slice(0, 8) + "01")); }} style={{
              border: "none", background: "transparent", cursor: "pointer", padding: "3px 0 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minHeight: 48, fontFamily: "inherit",
            }}>
              <span style={{
                width: 32, height: 32, borderRadius: 999, display: "grid", placeItems: "center", fontSize: 15, fontVariantNumeric: "tabular-nums",
                fontWeight: isToday || isSel ? 700 : 500,
                color: isSel ? T.onAccent : c.out ? T.sub + "80" : isToday ? T.accent : T.text,
                background: isSel ? T.accent : "transparent",
                boxShadow: isToday && !isSel ? `inset 0 0 0 1.5px ${T.accent}` : "none",
              }}>{c.n}</span>
              <span style={{ display: "flex", gap: 3, height: 5 }}>
                {shifts.slice(0, 3).map((s, j) => (
                  <span key={j} style={{
                    width: s.date === c.str ? 5 : 4, height: s.date === c.str ? 5 : 4, borderRadius: 99, background: s.color,
                    opacity: (c.out ? .4 : 1) * (s.date === c.str ? 1 : .5), alignSelf: "center",
                  }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 14, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: 16, color: T.text }}>
          {WD_FULL[selD.getDay()].charAt(0).toUpperCase() + WD_FULL[selD.getDay()].slice(1)}, {fmtDateLong(sel)}
        </div>
        {dayShifts.length > 0 && <div style={{ fontSize: 13.5, color: T.sub, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(dayShifts.filter(s => s.date === sel).reduce((a, s) => a + (s.value || 0), 0))}</div>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
        {dayShifts.length === 0 ? (
          <button onClick={() => openCreate(sel)} style={{ border: `1.5px dashed ${T.line}`, background: "transparent", borderRadius: 18, padding: "22px 16px", color: T.sub, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Nenhum plantão neste dia. <span style={{ color: T.accent, fontWeight: 700 }}>Toque para criar.</span>
          </button>
        ) : dayShifts.map(s => (
          <ShiftCard key={s.id} T={T} s={s} data={data} onOpen={() => openEdit(s)} onTogglePaid={() => togglePaid(s.id)} cont={s.date !== sel} showPayInfo />
        ))}
      </div>

      {upcoming.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: 16, color: T.text }}>Próximos plantões</div>
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
   Duas contas diferentes, que antes se misturavam:
   · TRABALHO  (competência) → pela data do plantão: quanto você produziu no mês.
   · CAIXA     (financeiro)  → recebido = data em que o dinheiro entrou (paidAt);
                               a receber = data prevista (paymentDate) dos não pagos.
   "Atrasado" é sempre não pago com data prevista já vencida.                      */
function PaymentsView({ T, data, cursor, setCursor, openEdit, togglePaid, markPaid, setDialog }) {
  const [tab, setTab] = useState("pay");        // pay = a receber · got = recebidos · work = trabalhados
  const [byLoc, setByLoc] = useState(false);
  const [info, setInfo] = useState(false);
  const [openNoDate, setOpenNoDate] = useState(false);
  const y = cursor.getFullYear(), m = cursor.getMonth();
  const mk = `${y}-${pad(m + 1)}`;
  const today = todayStr();
  const S = data.shifts;
  const sum = arr => arr.reduce((a, s) => a + (s.value || 0), 0);
  const isCurrent = mk === mKey(today);

  const worked = useMemo(() => S.filter(s => mKey(s.date) === mk), [S, mk]);
  const got = useMemo(() => S.filter(s => s.paid && mKey(paidAtOf(s)) === mk), [S, mk]);
  const due = useMemo(() => S.filter(s => !s.paid && s.paymentDate && mKey(s.paymentDate) === mk), [S, mk]);
  const overdueAll = useMemo(() => S.filter(s => isOverdue(s, today)), [S, today]);
  const oldOverdue = useMemo(() => overdueAll.filter(s => mKey(s.paymentDate) < mk), [overdueAll, mk]);
  const noDate = useMemo(() => S.filter(s => !s.paid && !s.paymentDate), [S]);

  const gotV = sum(got);
  const dueV = sum(due);
  const lateM = due.filter(s => s.paymentDate < today), lateMV = sum(lateM);
  const openV = dueV - lateMV;                        // ainda vai vencer neste mês
  const expected = gotV + dueV;                       // caixa previsto do mês
  const pct = expected > 0 ? (gotV >= expected ? 100 : Math.min(99, Math.floor(gotV / expected * 100))) : 0;
  const workedV = sum(worked);
  const workedH = worked.reduce((a, s) => a + shiftHours(s), 0);
  const workedPaidV = sum(worked.filter(s => s.paid));
  const overdueV = sum(overdueAll);
  const pendingV = sum(S.filter(s => !s.paid));

  const forecast = useMemo(() => [1, 2, 3].map(k => {
    const d = new Date(y, m + k, 1), key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    const arr = S.filter(s => !s.paid && mKey(s.paymentDate) === key);
    return { d, key, v: sum(arr), n: arr.length };
  }), [S, y, m]);

  const items = tab === "pay" ? due : tab === "got" ? got : worked;
  const keyOf = s => tab === "pay" ? s.paymentDate : tab === "got" ? paidAtOf(s) : s.date;
  const groups = useMemo(() => {
    if (byLoc) {
      const g = {};
      for (const s of items) { const k = s.locationId || "_none"; (g[k] = g[k] || []).push(s); }
      return Object.entries(g)
        .map(([k, arr]) => ({ k, arr: arr.slice().sort((a, b) => keyOf(a).localeCompare(keyOf(b))) }))
        .sort((a, b) => sum(b.arr) - sum(a.arr));
    }
    const g = {};
    for (const s of items) { const k = keyOf(s); (g[k] = g[k] || []).push(s); }
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0])).map(([k, arr]) => ({ k, arr }));
  }, [items, byLoc, tab]);

  const receiveGroup = (arr, label) => setDialog({
    title: "Marcar como recebido?",
    msg: `${arr.length} ${arr.length === 1 ? "plantão" : "plantões"} · ${fmtBRL(sum(arr))}${label ? ` — ${label}` : ""}`,
    options: [{ label: "Sim, recebi", primary: true, fn: () => markPaid(arr.map(s => s.id), true) }],
  });

  const bigLabel = tab === "pay" ? "A receber em" : tab === "got" ? "Recebido em" : "Trabalhado em";
  const bigValue = tab === "pay" ? dueV : tab === "got" ? gotV : workedV;
  const emptyMsg = tab === "pay"
    ? "Nada previsto para receber neste mês."
    : tab === "got" ? "Nenhum recebimento registrado neste mês." : "Nenhum plantão realizado neste mês.";

  const LegendRow = ({ color, stripe, label, value, strong, icon }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <span style={{ color: strong || T.sub, display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
        {icon ? icon : <span style={{ width: 10, height: 10, borderRadius: 3, background: stripe || color, flexShrink: 0 }} />}
        {label}
      </span>
      <b style={{ color: strong || T.text, fontSize: 14.5, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(value)}</b>
    </div>
  );

  const stripe = `repeating-linear-gradient(45deg, ${T.amber} 0 4px, ${T.amberSoft} 4px 8px)`;
  const bar = expected > 0
    ? [{ w: gotV / expected, bg: T.accent }, { w: openV / expected, bg: stripe }, { w: lateMV / expected, bg: T.red }]
    : [];

  return (
    <div style={{ padding: "14px 16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Segmented T={T} value={tab} onChange={setTab} style={{ flex: 1 }}
          options={[["pay", "A receber"], ["got", "Recebidos"], ["work", "Trabalhados"]]} />
        <button onClick={() => setByLoc(v => !v)} aria-label="Agrupar por local" style={{
          width: 38, height: 38, borderRadius: 999, border: "none", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0,
          background: byLoc ? T.accent : T.card, color: byLoc ? T.onAccent : T.text, boxShadow: byLoc ? "none" : `inset 0 0 0 1px ${T.line}`,
        }}><Ic path={P.filter} size={18} /></button>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
        <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 21, color: T.text }}>{MONTHS[m]} <span style={{ color: T.sub, fontWeight: 600 }}>{y}</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {!isCurrent && <button onClick={() => { const t = new Date(); setCursor(new Date(t.getFullYear(), t.getMonth(), 1)); }} style={{ border: "none", background: "transparent", color: T.accent, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: "6px 8px" }}>Hoje</button>}
          <button onClick={() => setCursor(new Date(y, m - 1, 1))} aria-label="Mês anterior" style={{ border: "none", background: "transparent", color: T.text, cursor: "pointer", padding: 6 }}><Ic path={P.chevL} size={20} /></button>
          <button onClick={() => setCursor(new Date(y, m + 1, 1))} aria-label="Próximo mês" style={{ border: "none", background: "transparent", color: T.text, cursor: "pointer", padding: 6 }}><Ic path={P.chevR} size={20} /></button>
        </div>
      </div>

      {/* ── caixa do mês ── */}
      <Card T={T} style={{ marginTop: 12, boxShadow: T.shadow }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: T.sub }}>{bigLabel} {MONTHS_S[m]}.</span>
          <button onClick={() => setInfo(true)} aria-label="Como as contas são feitas" style={{ border: "none", background: T.chip, color: T.sub, width: 24, height: 24, borderRadius: 999, cursor: "pointer", fontWeight: 800, fontSize: 12, fontFamily: "inherit" }}>?</button>
        </div>
        <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 32, color: T.text, marginTop: 2, fontVariantNumeric: "tabular-nums", letterSpacing: -.5 }}>{fmtBRL(bigValue)}</div>
        {tab !== "work" && (
          <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2 }}>
            {expected > 0 ? <>de {fmtBRL(expected)} previstos no mês · <b style={{ color: T.text }}>{pct}%</b> já recebido</> : "Sem movimento financeiro previsto neste mês."}
          </div>
        )}
        {tab === "work" && (
          <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2 }}>
            {worked.length} {worked.length === 1 ? "plantão" : "plantões"} · {fmtH(workedH)}{workedH > 0 ? ` · ${fmtBRL(workedV / workedH)}/h` : ""}
          </div>
        )}

        {expected > 0 && (
          <div style={{ display: "flex", gap: 2, height: 12, borderRadius: 8, overflow: "hidden", marginTop: 14, background: T.chip }}>
            {bar.filter(b => b.w > 0).map((b, i) => <div key={i} style={{ width: `${b.w * 100}%`, background: b.bg }} />)}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 14 }}>
          <LegendRow color={T.accent} label="Recebido no mês" value={gotV} />
          <LegendRow stripe={stripe} label="A receber (ainda vence)" value={openV} />
          {lateMV > 0 && <LegendRow strong={T.red} icon={<Ic path={P.alert} size={13} color={T.red} />} label="Vencido neste mês" value={lateMV} />}
        </div>

        {tab !== "work" && workedV > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.line}`, fontSize: 12.5, color: T.sub, lineHeight: 1.5 }}>
            Trabalho de {MONTHS_S[m]}.: <b style={{ color: T.text }}>{fmtBRL(workedV)}</b> em {worked.length} {worked.length === 1 ? "plantão" : "plantões"} · {fmtH(workedH)}
            {workedH > 0 ? ` · ${fmtBRL(workedV / workedH)}/h` : ""}
            {workedV > 0 && <> · {Math.floor(workedPaidV / workedV * 100)}% já recebido</>}
          </div>
        )}
      </Card>

      {/* ── atrasados (todos os meses) ── */}
      {overdueV > 0 && (
        <button onClick={() => { setTab("pay"); if (oldOverdue.length) setCursor(new Date(pd(oldOverdue[0].paymentDate).getFullYear(), pd(oldOverdue[0].paymentDate).getMonth(), 1)); }}
          style={{ width: "100%", textAlign: "left", marginTop: 12, background: T.redSoft, border: "none", borderRadius: 18, padding: "13px 15px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 11 }}>
          <Ic path={P.alert} size={19} color={T.red} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: T.red, fontSize: 15, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(overdueV)} atrasado</div>
            <div style={{ fontSize: 12.5, color: T.red, opacity: .85 }}>{overdueAll.length} {overdueAll.length === 1 ? "plantão vencido e não pago" : "plantões vencidos e não pagos"}</div>
          </div>
          <Ic path={P.chev} size={16} color={T.red} />
        </button>
      )}

      {/* ── pendente total + previsão ── */}
      {(pendingV > 0 || forecast.some(f => f.v > 0)) && (
        <Card T={T} style={{ marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: T.sub }}>Pendente no total</span>
            <b style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 17, color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(pendingV)}</b>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {forecast.map(fc => (
              <button key={fc.key} onClick={() => setCursor(new Date(fc.d.getFullYear(), fc.d.getMonth(), 1))} style={{
                flex: 1, border: "none", background: T.card2, borderRadius: 14, padding: "10px 8px", cursor: "pointer", fontFamily: "inherit", textAlign: "center",
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, textTransform: "uppercase", letterSpacing: .4 }}>{MONTHS_S[fc.d.getMonth()]}</div>
                <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 14, color: fc.v ? T.text : T.sub, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{fc.v ? fmtBRLk(fc.v) : "—"}</div>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: T.sub, marginTop: 8 }}>Previsão dos próximos meses, pelo que ainda não foi pago.</div>
        </Card>
      )}

      {/* ── lista ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
        {tab === "pay" && oldOverdue.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 4px 6px" }}>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: T.red, display: "flex", alignItems: "center", gap: 7 }}>
                <Ic path={P.alert} size={14} color={T.red} /> Atrasados de meses anteriores
              </span>
              <span style={{ fontSize: 12.5, color: T.red, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(sum(oldOverdue))}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {oldOverdue.slice().sort((a, b) => a.paymentDate.localeCompare(b.paymentDate)).map(s => (
                <ShiftCard key={s.id} T={T} s={s} data={data} onOpen={() => openEdit(s)} onTogglePaid={() => togglePaid(s.id)} showDate showPayInfo />
              ))}
            </div>
          </div>
        )}

        {items.length === 0 && <div style={{ textAlign: "center", color: T.sub, fontSize: 14, padding: "30px 0" }}>{emptyMsg}</div>}

        {groups.map(({ k, arr }) => {
          const sub = sum(arr);
          const loc = byLoc ? data.locations.find(l => l.id === k) : null;
          const header = byLoc
            ? (loc ? loc.name : "Sem local associado")
            : tab === "pay" ? `Recebe em ${fmtDateLong(k)}`
            : tab === "got" ? `Recebido em ${fmtDateLong(k)}`
            : fmtDateLong(k);
          const openArr = arr.filter(s => !s.paid);
          return (
            <div key={k}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 4px 6px" }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: T.text, display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                  {byLoc && <span style={{ width: 10, height: 10, borderRadius: 99, background: loc ? loc.color : T.sub, flexShrink: 0 }} />}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{header}</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 12.5, color: T.sub, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(sub)}</span>
                  {tab === "pay" && openArr.length > 0 && (
                    <button onClick={() => receiveGroup(openArr, header)} style={{ border: "none", background: T.accentSoft, color: T.accent, fontWeight: 700, fontSize: 12, padding: "5px 10px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit" }}>Recebi</button>
                  )}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {arr.map(s => <ShiftCard key={s.id} T={T} s={s} data={data} onOpen={() => openEdit(s)} onTogglePaid={() => togglePaid(s.id)} showDate={byLoc || tab !== "work"} showPayInfo />)}
              </div>
            </div>
          );
        })}

        {tab === "pay" && isCurrent && noDate.length > 0 && (
          <div>
            <button onClick={() => setOpenNoDate(v => !v)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
              background: T.amberSoft, border: "none", borderRadius: 16, padding: "12px 14px", marginTop: 6,
            }}>
              <Ic path={P.alert} size={17} color={T.amber} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: T.amber }}>{noDate.length} sem data de recebimento</div>
                <div style={{ fontSize: 12, color: T.amber, opacity: .85 }}>{fmtBRL(sum(noDate))} fora da previsão de caixa</div>
              </div>
              <span style={{ transform: openNoDate ? "rotate(90deg)" : "none", display: "grid", placeItems: "center" }}><Ic path={P.chev} size={16} color={T.amber} /></span>
            </button>
            {openNoDate && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                {noDate.slice().sort((a, b) => a.date.localeCompare(b.date)).map(s => (
                  <ShiftCard key={s.id} T={T} s={s} data={data} onOpen={() => openEdit(s)} onTogglePaid={() => togglePaid(s.id)} showDate showPayInfo />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {info && (
        <Sheet T={T} title="Como as contas são feitas" onClose={() => setInfo(false)}>
          {[
            ["Trabalhados", "Soma dos plantões pela data em que foram feitos. É o quanto você produziu no mês, tenha recebido ou não."],
            ["Recebidos", "Plantões marcados como pagos, contados no mês em que o dinheiro entrou (o campo “Recebido em”). É o seu caixa de verdade."],
            ["A receber", "Plantões ainda não pagos, contados no mês da data prevista de recebimento."],
            ["Atrasado", "Não pago e com a data prevista já vencida. Aparece somado de todos os meses, não só do mês aberto."],
            ["Previsto no mês", "Recebido + a receber do mês. É a base da barra e do percentual."],
            ["Pendente no total", "Tudo que ainda não foi pago, de qualquer mês."],
          ].map(([t, d]) => (
            <div key={t} style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, color: T.text, fontSize: 15 }}>{t}</div>
              <div style={{ fontSize: 13.5, color: T.sub, marginTop: 3, lineHeight: 1.5 }}>{d}</div>
            </div>
          ))}
          <div style={{ fontSize: 13, color: T.sub, background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 13, lineHeight: 1.5 }}>
            Um plantão nunca é contado duas vezes na mesma conta: ou ele está em “recebidos”, ou em “a receber”.
          </div>
        </Sheet>
      )}
    </div>
  );
}

/* ═══════════════ RESUMO ═══════════════ */
function SummaryView({ T, data, goToMonth }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [selM, setSelM] = useState(now.getMonth());
  const yStr = String(year);

  const months = useMemo(() => {
    const arr = Array.from({ length: 12 }, () => ({ total: 0, paid: 0, hours: 0, count: 0, got: 0 }));
    for (const s of data.shifts) {
      if (s.date.slice(0, 4) === yStr) {
        const b = arr[pd(s.date).getMonth()];
        b.total += s.value || 0; b.count++; b.hours += shiftHours(s);
        if (s.paid) b.paid += s.value || 0;
      }
      if (s.paid && paidAtOf(s).slice(0, 4) === yStr) arr[pd(paidAtOf(s)).getMonth()].got += s.value || 0;
    }
    return arr;
  }, [data.shifts, yStr]);

  const yTotal = months.reduce((a, b) => a + b.total, 0);
  const yHours = months.reduce((a, b) => a + b.hours, 0);
  const yCount = months.reduce((a, b) => a + b.count, 0);
  const yGot = months.reduce((a, b) => a + b.got, 0);
  const yPending = useMemo(() => data.shifts.filter(s => !s.paid && s.date.slice(0, 4) === yStr).reduce((a, s) => a + (s.value || 0), 0), [data.shifts, yStr]);
  const max = Math.max(...months.map(b => b.total), 1);
  const mSel = months[selM];
  const goal = data.settings.monthlyGoal || 0;

  const locStats = useMemo(() => {
    const g = {};
    for (const s of data.shifts) {
      if (s.date.slice(0, 4) !== yStr) continue;
      const k = s.locationId || "_none";
      g[k] = g[k] || { total: 0, hours: 0, count: 0, paid: 0 };
      g[k].total += s.value || 0; g[k].hours += shiftHours(s); g[k].count++;
      if (s.paid) g[k].paid += s.value || 0;
    }
    return Object.entries(g).sort((a, b) => b[1].total - a[1].total);
  }, [data.shifts, yStr]);

  const Stat = ({ label, value, tone }) => (
    <div style={{ background: T.card, borderRadius: 16, border: `1px solid ${T.line}`, padding: "12px 14px" }}>
      <div style={{ fontSize: 12, color: T.sub, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 18, color: tone || T.text, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );

  return (
    <div style={{ padding: "14px 16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 21, color: T.text }}>Resumo <span style={{ color: T.sub, fontWeight: 600 }}>{year}</span></div>
        <div style={{ display: "flex", gap: 2 }}>
          <button onClick={() => setYear(v => v - 1)} aria-label="Ano anterior" style={{ border: "none", background: "transparent", color: T.text, cursor: "pointer", padding: 6 }}><Ic path={P.chevL} size={20} /></button>
          <button onClick={() => setYear(v => v + 1)} aria-label="Próximo ano" style={{ border: "none", background: "transparent", color: T.text, cursor: "pointer", padding: 6 }}><Ic path={P.chevR} size={20} /></button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        <Stat label="Trabalhado no ano" value={fmtBRL(yTotal)} />
        <Stat label="Plantões" value={yCount} />
        <Stat label="Horas trabalhadas" value={fmtH(yHours)} />
        <Stat label="Média por hora" value={yHours ? fmtBRL(yTotal / yHours) : "—"} />
        <Stat label="Recebido no ano" value={fmtBRL(yGot)} tone={T.accent} />
        <Stat label="A receber" value={fmtBRL(yPending)} tone={yPending ? T.amber : T.text} />
      </div>

      <Card T={T} style={{ marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: T.sub, fontWeight: 600 }}>Ganhos por mês</span>
          <span style={{ fontSize: 11.5, color: T.sub, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: T.accent }} />pago</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: T.accentSoft, boxShadow: `inset 0 0 0 1px ${T.line}` }} />a receber</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 110 }}>
          {months.map((b, i) => {
            const hPct = (b.total / max) * 82;
            const paidPct = b.total ? (b.paid / b.total) * 100 : 0;
            return (
              <button key={i} onClick={() => setSelM(i)} aria-label={MONTHS[i]} style={{ flex: 1, border: "none", background: "transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: 0, height: "100%", justifyContent: "flex-end", fontFamily: "inherit" }}>
                <div style={{
                  width: "100%", borderRadius: 6, minHeight: b.total ? 6 : 3, height: `${hPct}%`, overflow: "hidden",
                  background: b.total ? T.accentSoft : T.chip,
                  boxShadow: i === selM ? `inset 0 0 0 2px ${T.accent}` : b.total ? `inset 0 0 0 1px ${T.line}` : "none",
                  display: "flex", flexDirection: "column", justifyContent: "flex-end", transition: "height .25s ease",
                }}>
                  <div style={{ width: "100%", height: `${paidPct}%`, background: T.accent }} />
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: i === selM ? T.accent : T.sub }}>{MONTHS_S[i][0].toUpperCase()}</span>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.line}` }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700, color: T.text, fontSize: 15 }}>{MONTHS[selM]}</span>
            <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 18, color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(mSel.total)}</span>
          </div>
          <div style={{ fontSize: 13, color: T.sub, marginTop: 4 }}>
            {mSel.count} {mSel.count === 1 ? "plantão" : "plantões"} · {fmtH(mSel.hours)}{mSel.hours ? ` · ${fmtBRL(mSel.total / mSel.hours)}/h` : ""}
          </div>
          <div style={{ fontSize: 13, color: T.sub, marginTop: 3 }}>
            Caixa do mês: <b style={{ color: T.accent }}>{fmtBRL(mSel.got)}</b> recebidos
            {mSel.total - mSel.paid > 0 && <> · <b style={{ color: T.amber }}>{fmtBRL(mSel.total - mSel.paid)}</b> a receber destes plantões</>}
          </div>
          {goal > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: T.sub, marginBottom: 5 }}>
                <span>Meta mensal</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{Math.min(100, Math.round(mSel.total / goal * 100))}% de {fmtBRL(goal)}</span>
              </div>
              <div style={{ height: 9, borderRadius: 99, background: T.chip, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, mSel.total / goal * 100)}%`, height: "100%", borderRadius: 99, background: mSel.total >= goal ? T.accent : T.amber, transition: "width .3s" }} />
              </div>
            </div>
          )}
          <button onClick={() => goToMonth(new Date(year, selM, 1))} style={{ marginTop: 12, border: "none", background: T.chip, color: T.text, fontWeight: 600, fontSize: 13.5, padding: "9px 14px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit" }}>
            Ver pagamentos de {MONTHS_S[selM]}.
          </button>
        </div>
      </Card>

      {locStats.length > 0 && (
        <Card T={T} style={{ marginTop: 14, marginBottom: 8 }}>
          <div style={{ fontSize: 13, color: T.sub, fontWeight: 600, marginBottom: 4 }}>Por local · {year}</div>
          {locStats.map(([k, v], i) => {
            const loc = data.locations.find(l => l.id === k);
            return (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: i === locStats.length - 1 ? "none" : `1px solid ${T.line}` }}>
                <span style={{ width: 11, height: 11, borderRadius: 99, background: loc ? loc.color : T.sub, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{loc ? loc.name : "Sem local"}</div>
                  <div style={{ fontSize: 12.5, color: T.sub }}>
                    {v.count} {v.count === 1 ? "plantão" : "plantões"} · {fmtH(v.hours)}{v.hours ? ` · ${fmtBRL(v.total / v.hours)}/h` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <b style={{ color: T.text, fontSize: 14.5, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(v.total)}</b>
                  {v.total - v.paid > 0 && <div style={{ fontSize: 11.5, color: T.amber, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(v.total - v.paid)} a receber</div>}
                </div>
              </div>
            );
          })}
        </Card>
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
    <div style={{ padding: "14px 16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 21, color: T.text }}>Locais</div>
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
          <button key={l.id} onClick={() => setEditing({ ...l })} style={{ width: "100%", textAlign: "left", display: "flex", gap: 12, padding: "14px", background: T.card, border: `1px solid ${T.line}`, borderRadius: 18, cursor: "pointer", fontFamily: "inherit" }}>
            <div style={{ width: 4.5, alignSelf: "stretch", borderRadius: 99, background: l.color }} />
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
        style={{ ...inputStyle(T), fontSize: 17, fontWeight: 600, border: `1.5px solid ${f._err ? T.red : T.line}` }} />
      {f._err && <div style={{ color: T.red, fontSize: 12.5, margin: "6px 4px 0" }}>Dê um nome ao local para salvar.</div>}
      <div style={{ marginTop: 10 }}>
        <input value={f.address} onChange={e => set({ address: e.target.value })} placeholder="Endereço (opcional)" style={inputStyle(T)} />
      </div>

      <div style={label}>Cor do local</div>
      <ColorGrid T={T} value={f.color} onChange={c => set({ color: c })} />

      <div style={label}>Prazo de pagamento</div>
      <div style={{ display: "flex", background: T.card, borderRadius: 14, padding: 3, boxShadow: `inset 0 0 0 1px ${T.line}` }}>
        {[["none", "Sem prazo"], ["days", "Dias após"], ["fixedDay", "Dia fixo"]].map(([k, lab]) => (
          <button key={k} onClick={() => set({ payType: k })} style={{ flex: 1, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, padding: "9px 0", borderRadius: 11, fontFamily: "inherit", background: f.payType === k ? T.accent : "transparent", color: f.payType === k ? T.onAccent : T.sub }}>{lab}</button>
        ))}
      </div>
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
    <div style={{ padding: "14px 16px 0" }}>
      <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 21, color: T.text }}>Ajustes</div>

      <div style={label}>Aparência</div>
      <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${T.line}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", background: T.card }}>
          <span style={{ fontSize: 15.5, fontWeight: 500, color: T.text }}>Modo noturno</span>
          <Toggle T={T} on={!!data.settings.dark} onChange={v => setData(d => ({ ...d, settings: { ...d.settings, dark: v } }))} />
        </div>
      </div>

      <div style={label}>Meta de ganhos</div>
      <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${T.line}` }}>
        <FieldRow T={T} label="Meta mensal" last>
          <MoneyInput T={T} value={data.settings.monthlyGoal || 0} onChange={v => setData(d => ({ ...d, settings: { ...d.settings, monthlyGoal: v } }))} width={168} big />
        </FieldRow>
      </div>
      <div style={{ fontSize: 12.5, color: T.sub, margin: "7px 4px 0" }}>A meta aparece como barra de progresso na aba Resumo.</div>

      <div style={label}>Seus dados</div>
      <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${T.line}` }}>
        <Row T={T} first label="Exportar plantões (CSV)" onClick={exportCSV} right={<Ic path={P.down} size={16} color={T.sub} />} />
        <Row T={T} label="Exportar backup completo" onClick={() => download("escala-backup.json", JSON.stringify(data, null, 2), "application/json")} right={<Ic path={P.down} size={16} color={T.sub} />} />
        <Row T={T} label="Importar backup" onClick={() => setShowImport(true)} />
        <Row T={T} last label="Recalcular datas de recebimento" onClick={fixPayDates} right={<Ic path={P.repeat} size={16} color={T.sub} />} />
      </div>
      <div style={{ fontSize: 12.5, color: T.sub, margin: "7px 4px 0", lineHeight: 1.45 }}>Use o recálculo se você mudou o prazo de um local ou se as previsões de pagamento ficaram erradas.</div>
      <div style={{ fontSize: 12.5, color: T.sub, margin: "7px 4px 0", lineHeight: 1.45 }}>Tudo fica salvo automaticamente neste dispositivo. Exporte um backup de vez em quando por segurança.</div>

      <div style={label}>Zona de risco</div>
      <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${T.line}` }}>
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
          <textarea value={importTxt} onChange={e => setImportTxt(e.target.value)} rows={8} placeholder='{"shifts":[…],"locations":[…]}' style={{ ...inputStyle(T), fontFamily: "monospace", fontSize: 12.5 }} />
        </Sheet>
      )}
    </div>
  );
}

/* ═══════════════ APP ═══════════════ */
const DEFAULT_DATA = { shifts: [], locations: [], settings: { dark: false, monthlyGoal: 0 } };

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
    setEditor({ mode: "create", initial: { ...s, id: null, seriesId: null, paid: false, paidAt: null, repeat: { type: "none" } } });
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

  const goToMonth = d => { setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); setTab("pay"); };

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
        {tab === "pay" && <PaymentsView T={T} data={data} cursor={cursor} setCursor={setCursor} openEdit={openEdit} togglePaid={togglePaid} markPaid={markPaid} setDialog={setDialog} />}
        {tab === "sum" && <SummaryView T={T} data={data} goToMonth={goToMonth} />}
        {tab === "loc" && <LocationsView T={T} data={data} saveLoc={saveLoc} deleteLoc={deleteLoc} />}
        {tab === "set" && <SettingsView T={T} data={data} setData={setData} setDialog={setDialog} />}
      </div>

      <nav style={{
        position: "fixed", bottom: "calc(14px + env(safe-area-inset-bottom))", left: "50%", transform: "translateX(-50%)", width: "calc(100% - 28px)", maxWidth: 402,
        display: "flex", background: T.nav, backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        borderRadius: 999, padding: "8px 6px", boxShadow: T.shadow, border: `1px solid ${T.line}`, zIndex: 40,
      }}>
        {NAV.map(([k, lab, icon]) => (
          <button key={k} onClick={() => setTab(k)} aria-label={lab} style={{
            flex: 1, border: "none", background: "transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 0", fontFamily: "inherit",
            color: tab === k ? T.accent : T.sub,
          }}>
            <Ic path={icon} size={21} sw={tab === k ? 2.2 : 1.7} />
            <span style={{ fontSize: 10, fontWeight: tab === k ? 800 : 600, letterSpacing: .2 }}>{lab}</span>
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
