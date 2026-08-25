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
const pd = s => { const [a, b, c] = s.split("-").map(Number); return new Date(a, b - 1, c); };
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ds(d); };
const todayStr = () => ds(new Date());
const fmtBRL = v => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDateLong = s => { const d = pd(s); return `${d.getDate()} de ${MONTHS_S[d.getMonth()]}. de ${d.getFullYear()}`; };
const fmtDateShort = s => { const d = pd(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const hoursOf = (a, b) => {
  if (!a || !b) return 0;
  const m = t => { const [h, mi] = t.split(":").map(Number); return h * 60 + mi; };
  let d = m(b) - m(a); if (d <= 0) d += 1440; return d / 60;
};
const fmtH = h => (h % 1 === 0 ? `${h} h` : `${h.toFixed(1).replace(".", ",")} h`);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const daysBetween = (a, b) => Math.round((pd(b) - pd(a)) / 86400000);

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

function genDates(startStr, rep) {
  if (!rep || rep.type === "none") return [startStr];
  const out = [];
  const until = rep.until || addDays(startStr, 90);
  const start = pd(startStr), lim = pd(until);
  let d = new Date(start), guard = 0;
  const dayDiff = x => Math.round((x - start) / 86400000);
  while (d <= lim && guard < 500) {
    const dd = dayDiff(d), wd = d.getDay(); let ok = false;
    if (rep.type === "daily") ok = true;
    else if (rep.type === "weekly") ok = (rep.weekdays || []).includes(wd);
    else if (rep.type === "biweekly") { const w = Math.floor((dd + start.getDay()) / 7); ok = (rep.weekdays || []).includes(wd) && w % 2 === 0; }
    else if (rep.type === "monthlyDay") ok = d.getDate() === start.getDate();
    else if (rep.type === "monthlyPos") { const pos = Math.floor((d.getDate() - 1) / 7); const bpos = Math.floor((start.getDate() - 1) / 7); ok = wd === start.getDay() && pos === bpos; }
    else if (rep.type === "custom") ok = dd % Math.max(1, Number(rep.every) || 2) === 0;
    if (ok) out.push(ds(d));
    d.setDate(d.getDate() + 1); guard++;
  }
  if (!out.includes(startStr)) out.unshift(startStr);
  return out.slice(0, 200);
}

const repLabel = rep => {
  if (!rep || rep.type === "none") return "Nunca";
  const dias = (rep.weekdays || []).map(w => WD[w]).join(", ");
  if (rep.type === "daily") return "Todos os dias";
  if (rep.type === "weekly") return `Toda semana · ${dias}`;
  if (rep.type === "biweekly") return `A cada 2 semanas · ${dias}`;
  if (rep.type === "monthlyDay") return "Todo mês, no mesmo dia";
  if (rep.type === "monthlyPos") return "Todo mês, na mesma semana";
  if (rep.type === "custom") return `A cada ${rep.every || 2} dias`;
  return "Nunca";
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px 8px" }}>
        <button onClick={onClose} aria-label="Fechar" style={{ width: 36, height: 36, borderRadius: 999, border: "none", background: T.chip, color: T.text, cursor: "pointer", display: "grid", placeItems: "center" }}><Ic path={P.x} size={17} /></button>
        <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: 17, color: T.text }}>{title}</div>
        <div style={{ width: 36 }}>{footer}</div>
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
function ShiftForm({ T, data, initial, mode, onSave, onDelete, onDuplicate, onClose }) {
  const [f, setF] = useState(initial);
  const [showColors, setShowColors] = useState(false);
  const [showLoc, setShowLoc] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);
  const [valTxt, setValTxt] = useState(initial.value ? initial.value.toFixed(2).replace(".", ",") : "");
  const set = p => setF(x => ({ ...x, ...p }));
  const loc = data.locations.find(l => l.id === f.locationId);
  const dur = hoursOf(f.startTime, f.endTime);
  const crossesMidnight = f.startTime && f.endTime && (() => { const m = t => { const [h, mi] = t.split(":").map(Number); return h * 60 + mi; }; return m(f.endTime) <= m(f.startTime); })();
  const suggested = autoPay(loc, f.date);

  const parseVal = t => { const n = parseFloat(String(t).replace(/\./g, "").replace(",", ".")); return isNaN(n) ? 0 : n; };

  const pickLocation = id => {
    const l = data.locations.find(x => x.id === id);
    const patch = { locationId: id || null };
    if (l) {
      patch.color = l.color;
      if (!parseVal(valTxt) && l.defaultValue) { patch.value = l.defaultValue; setValTxt(l.defaultValue.toFixed(2).replace(".", ",")); }
      if (l.defaultStart && l.defaultEnd && (!initial.id)) { patch.startTime = l.defaultStart; patch.endTime = l.defaultEnd; }
      const ap = autoPay(l, f.date);
      if (ap) patch.paymentDate = ap;
    }
    set(patch); setShowLoc(false);
  };

  const save = () => {
    const value = parseVal(valTxt);
    if (!f.title.trim()) { set({ _err: true }); return; }
    onSave({ ...f, value, title: f.title.trim() });
  };

  const label = { fontSize: 12.5, fontWeight: 700, color: T.sub, letterSpacing: .5, textTransform: "uppercase", margin: "18px 4px 8px" };

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
      <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${T.line}` }}>
        <Row T={T} first label="Cor" onClick={() => setShowColors(v => !v)} right={<span style={{ width: 22, height: 22, borderRadius: 999, background: f.color, display: "inline-block" }} />} />
        {showColors && <div style={{ padding: 16, background: T.card, borderBottom: `1px solid ${T.line}` }}><ColorGrid T={T} value={f.color} onChange={c => { set({ color: c }); }} /></div>}
        <Row T={T} last label="Local" onClick={() => setShowLoc(true)}
          right={loc ? <span style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ width: 10, height: 10, borderRadius: 99, background: loc.color }} />{loc.name}</span> : <span style={{ color: T.accent, fontWeight: 600 }}>Associar</span>} />
      </div>
      {loc && <div style={{ fontSize: 12.5, color: T.sub, margin: "7px 6px 0" }}>Cor e sugestões vêm do local. Você pode ajustar o que quiser.</div>}

      <div style={label}>Valor e pagamento</div>
      <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${T.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: T.card, borderBottom: `1px solid ${T.line}` }}>
          <span style={{ fontSize: 15.5, fontWeight: 500, color: T.text, flex: 1 }}>Valor</span>
          <span style={{ color: T.sub, fontWeight: 600 }}>R$</span>
          <input value={valTxt} onChange={e => setValTxt(e.target.value)} onBlur={() => { const v = parseVal(valTxt); setValTxt(v ? v.toFixed(2).replace(".", ",") : ""); }}
            inputMode="decimal" placeholder="0,00" style={{ ...inputStyle(T), width: 120, textAlign: "right", padding: "10px 12px", fontVariantNumeric: "tabular-nums" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: T.card, borderBottom: `1px solid ${T.line}` }}>
          <span style={{ fontSize: 15.5, fontWeight: 500, color: T.text, flex: 1 }}>Recebe em</span>
          <input type="date" value={f.paymentDate || ""} onChange={e => set({ paymentDate: e.target.value })} style={{ ...inputStyle(T), width: 165, padding: "9px 10px" }} />
        </div>
        {suggested && suggested !== f.paymentDate && (
          <button onClick={() => set({ paymentDate: suggested })} style={{ width: "100%", border: "none", background: T.card, color: T.accent, fontWeight: 600, fontSize: 13.5, padding: "10px 16px", textAlign: "left", cursor: "pointer", borderBottom: `1px solid ${T.line}`, fontFamily: "inherit" }}>
            Usar prazo de {loc.name}: {fmtDateShort(suggested)}
          </button>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: T.card }}>
          <span style={{ fontSize: 15.5, fontWeight: 500, color: T.text }}>Já foi pago</span>
          <Toggle T={T} on={!!f.paid} onChange={v => set({ paid: v })} />
        </div>
      </div>

      <div style={label}>Horário</div>
      <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${T.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: T.card, borderBottom: `1px solid ${T.line}` }}>
          <span style={{ fontSize: 15.5, fontWeight: 500, color: T.text, flex: 1 }}>Começa</span>
          <input type="date" value={f.date} onChange={e => { const d = e.target.value; const patch = { date: d }; const ap = autoPay(loc, d); if (ap) patch.paymentDate = ap; set(patch); }} style={{ ...inputStyle(T), width: 150, padding: "9px 10px" }} />
          <input type="time" value={f.startTime} onChange={e => set({ startTime: e.target.value })} style={{ ...inputStyle(T), width: 92, padding: "9px 10px" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: T.card }}>
          <span style={{ fontSize: 15.5, fontWeight: 500, color: T.text, flex: 1 }}>Termina</span>
          {crossesMidnight && <span style={{ fontSize: 12, color: T.sub }}>dia seguinte</span>}
          <input type="time" value={f.endTime} onChange={e => set({ endTime: e.target.value })} style={{ ...inputStyle(T), width: 92, padding: "9px 10px" }} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "8px 6px 0", color: T.sub, fontSize: 13 }}>
        <Ic path={P.clock} size={14} /> Duração: <b style={{ color: T.text }}>{fmtH(dur)}</b>
        {parseVal(valTxt) > 0 && dur > 0 && <span>· {fmtBRL(parseVal(valTxt) / dur)}/h</span>}
      </div>

      {mode === "create" && (<>
        <div style={label}>Repetição</div>
        <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${T.line}` }}>
          <Row T={T} first last label="Repetir" onClick={() => setShowRepeat(true)} right={<span>{repLabel(f.repeat)}</span>} />
        </div>
        {f.repeat && f.repeat.type !== "none" && (
          <div style={{ fontSize: 12.5, color: T.sub, margin: "7px 6px 0" }}>
            Serão criados {genDates(f.date, f.repeat).length} plantões até {fmtDateShort(f.repeat.until || addDays(f.date, 90))}.
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
          <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${T.line}` }}>
            <Row T={T} first last={data.locations.length === 0} label="Nenhum local" onClick={() => pickLocation(null)} right={!f.locationId && <Ic path={P.check} size={16} color={T.accent} />} />
            {data.locations.map((l, i) => (
              <Row key={l.id} T={T} last={i === data.locations.length - 1}
                label={<span style={{ display: "flex", alignItems: "center", gap: 9 }}><span style={{ width: 11, height: 11, borderRadius: 99, background: l.color }} />{l.name}</span>}
                onClick={() => pickLocation(l.id)} right={f.locationId === l.id && <Ic path={P.check} size={16} color={T.accent} />} />
            ))}
          </div>
          {data.locations.length === 0 && <div style={{ color: T.sub, fontSize: 13.5, textAlign: "center", marginTop: 14 }}>Cadastre locais na aba "Locais" para associar plantões e herdar cor, valor e prazo de pagamento.</div>}
        </Sheet>
      )}

      {showRepeat && (
        <RepeatSheet T={T} value={f.repeat || { type: "none" }} baseDate={f.date}
          onChange={rep => set({ repeat: rep })} onClose={() => setShowRepeat(false)} />
      )}
    </Sheet>
  );
}

function RepeatSheet({ T, value, baseDate, onChange, onClose }) {
  const [r, setR] = useState({ weekdays: [pd(baseDate).getDay()], every: 2, until: value.until || addDays(baseDate, 90), ...value });
  const opts = [
    ["none", "Nunca"], ["daily", "Todos os dias"], ["weekly", "Toda semana"], ["biweekly", "A cada 2 semanas"],
    ["monthlyDay", "Todo mês · mesmo dia"], ["monthlyPos", `Todo mês · ${["1º", "2º", "3º", "4º", "5º"][Math.floor((pd(baseDate).getDate() - 1) / 7)]} ${WD_FULL[pd(baseDate).getDay()]}`], ["custom", "Personalizado"],
  ];
  const needsWd = r.type === "weekly" || r.type === "biweekly";
  const apply = () => { onChange(r.type === "none" ? { type: "none" } : r); onClose(); };
  return (
    <Sheet T={T} title="Repetir" onClose={onClose}
      footer={<button onClick={apply} style={{ border: "none", background: T.accent, color: T.onAccent, fontWeight: 700, fontSize: 14, padding: "8px 8px", borderRadius: 999, cursor: "pointer", width: 60, fontFamily: "inherit" }}>OK</button>}>
      <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${T.line}` }}>
        {opts.map(([k, lab], i) => (
          <Row key={k} T={T} first={i === 0} last={i === opts.length - 1} label={lab}
            onClick={() => setR(x => ({ ...x, type: k }))} right={r.type === k && <Ic path={P.check} size={16} color={T.accent} />} />
        ))}
      </div>
      {needsWd && (<>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.sub, letterSpacing: .5, textTransform: "uppercase", margin: "18px 4px 8px" }}>Dias da semana</div>
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
      {r.type !== "none" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
          <span style={{ color: T.text, fontSize: 15, fontWeight: 500 }}>Repetir até</span>
          <input type="date" value={r.until} min={baseDate} onChange={e => setR(x => ({ ...x, until: e.target.value }))} style={{ ...inputStyle(T), width: 165, padding: "9px 10px" }} />
        </div>
      )}
    </Sheet>
  );
}

/* ═══════════════ CARD DE PLANTÃO ═══════════════ */
function ShiftCard({ T, s, data, onOpen, onTogglePaid, showDate, showPayInfo }) {
  const loc = data.locations.find(l => l.id === s.locationId);
  const h = hoursOf(s.startTime, s.endTime);
  const overdue = !s.paid && s.paymentDate && s.paymentDate < todayStr();
  const daysToPay = s.paymentDate ? daysBetween(todayStr(), s.paymentDate) : null;
  return (
    <button onClick={onOpen} style={{ width: "100%", textAlign: "left", display: "flex", gap: 12, padding: "13px 14px", background: T.card, border: `1px solid ${T.line}`, borderRadius: 18, cursor: "pointer", fontFamily: "inherit" }}>
      <div style={{ width: 4.5, alignSelf: "stretch", borderRadius: 99, background: s.color }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 15.5, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
          {s.seriesId && <Ic path={P.repeat} size={13} color={T.sub} />}
        </div>
        {loc && <div style={{ fontSize: 13, color: T.sub, marginTop: 2 }}>{loc.name}</div>}
        <div style={{ fontSize: 13, color: T.sub, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
          {showDate && <>{fmtDateLong(s.date)} · </>}{s.startTime}–{s.endTime} · {fmtH(h)}
        </div>
        {showPayInfo && s.paymentDate && !s.paid && (
          <div style={{ fontSize: 12.5, color: overdue ? T.red : T.sub, marginTop: 3, fontWeight: overdue ? 600 : 400 }}>
            {overdue ? `Venceu há ${-daysToPay} ${-daysToPay === 1 ? "dia" : "dias"} · ${fmtDateShort(s.paymentDate)}` : daysToPay === 0 ? "Pagamento hoje" : `Recebe em ${daysToPay} ${daysToPay === 1 ? "dia" : "dias"} · ${fmtDateShort(s.paymentDate)}`}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, justifyContent: "center" }}>
        <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: 15.5, color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(s.value)}</span>
        <span onClick={e => { e.stopPropagation(); onTogglePaid(); }} role="button" aria-label="Alternar pago" style={{ cursor: "pointer" }}>
          <Badge T={T} paid={s.paid} overdue={overdue} />
        </span>
      </div>
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
  const byDay = useMemo(() => {
    const map = {};
    for (const s of data.shifts) (map[s.date] = map[s.date] || []).push(s);
    return map;
  }, [data.shifts]);
  const monthShifts = data.shifts.filter(s => { const d = pd(s.date); return d.getFullYear() === y && d.getMonth() === m; });
  const monthTotal = monthShifts.reduce((a, s) => a + (s.value || 0), 0);
  const dayShifts = (byDay[sel] || []).slice().sort((a, b) => a.startTime.localeCompare(b.startTime));
  const today = todayStr();
  const selD = pd(sel);

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
          {monthShifts.length} {monthShifts.length === 1 ? "plantão" : "plantões"} · <b style={{ color: T.text }}>{fmtBRL(monthTotal)}</b>
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
                {shifts.slice(0, 3).map((s, j) => <span key={j} style={{ width: 5, height: 5, borderRadius: 99, background: s.color, opacity: c.out ? .4 : 1 }} />)}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 14, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: 16, color: T.text }}>
          {WD_FULL[selD.getDay()].charAt(0).toUpperCase() + WD_FULL[selD.getDay()].slice(1)}, {fmtDateLong(sel)}
        </div>
        {dayShifts.length > 0 && <div style={{ fontSize: 13.5, color: T.sub, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(dayShifts.reduce((a, s) => a + (s.value || 0), 0))}</div>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
        {dayShifts.length === 0 ? (
          <button onClick={() => openCreate(sel)} style={{ border: `1.5px dashed ${T.line}`, background: "transparent", borderRadius: 18, padding: "22px 16px", color: T.sub, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Nenhum plantão neste dia. <span style={{ color: T.accent, fontWeight: 700 }}>Toque para criar.</span>
          </button>
        ) : dayShifts.map(s => (
          <ShiftCard key={s.id} T={T} s={s} data={data} onOpen={() => openEdit(s)} onTogglePaid={() => togglePaid(s.id)} showPayInfo />
        ))}
      </div>
    </div>
  );
}

/* ═══════════════ PAGAMENTOS ═══════════════ */
function PaymentsView({ T, data, cursor, setCursor, openEdit, togglePaid }) {
  const [tab, setTab] = useState("done"); // done = realizados | pay = a receber
  const [byLoc, setByLoc] = useState(false);
  const y = cursor.getFullYear(), m = cursor.getMonth();
  const inMonth = s => { const key = tab === "done" ? s.date : (s.paymentDate || s.date); const d = pd(key); return d.getFullYear() === y && d.getMonth() === m; };
  const shifts = data.shifts.filter(inMonth);
  const total = shifts.reduce((a, s) => a + (s.value || 0), 0);
  const paidV = shifts.filter(s => s.paid).reduce((a, s) => a + (s.value || 0), 0);
  const overdueV = shifts.filter(s => !s.paid && s.paymentDate && s.paymentDate < todayStr()).reduce((a, s) => a + (s.value || 0), 0);
  const pct = total ? Math.round(paidV / total * 100) : 0;

  const keyOf = s => tab === "done" ? s.date : (s.paymentDate || s.date);
  const groups = useMemo(() => {
    if (byLoc) {
      const g = {};
      for (const s of shifts) { const k = s.locationId || "_none"; (g[k] = g[k] || []).push(s); }
      return Object.entries(g).map(([k, arr]) => ({ k, arr: arr.sort((a, b) => keyOf(a).localeCompare(keyOf(b))) }));
    }
    const g = {};
    for (const s of shifts) { const k = keyOf(s); (g[k] = g[k] || []).push(s); }
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0])).map(([k, arr]) => ({ k, arr }));
  }, [data.shifts, tab, byLoc, y, m]);

  const stripe = `repeating-linear-gradient(45deg, ${T.amber} 0 4px, ${T.amberSoft} 4px 8px)`;

  return (
    <div style={{ padding: "14px 16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", background: T.card, borderRadius: 999, padding: 3, boxShadow: `inset 0 0 0 1px ${T.line}` }}>
          {[["done", "Realizados"], ["pay", "A receber"]].map(([k, lab]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13.5, padding: "8px 14px", borderRadius: 999, fontFamily: "inherit",
              background: tab === k ? T.accent : "transparent", color: tab === k ? T.onAccent : T.sub,
            }}>{lab}</button>
          ))}
        </div>
        <button onClick={() => setByLoc(v => !v)} aria-label="Agrupar por local" style={{
          width: 38, height: 38, borderRadius: 999, border: "none", cursor: "pointer", display: "grid", placeItems: "center",
          background: byLoc ? T.accent : T.card, color: byLoc ? T.onAccent : T.text, boxShadow: byLoc ? "none" : `inset 0 0 0 1px ${T.line}`,
        }}><Ic path={P.filter} size={18} /></button>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
        <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 21, color: T.text }}>{MONTHS[m]} <span style={{ color: T.sub, fontWeight: 600 }}>{y}</span></div>
        <div style={{ display: "flex", gap: 2 }}>
          <button onClick={() => setCursor(new Date(y, m - 1, 1))} aria-label="Mês anterior" style={{ border: "none", background: "transparent", color: T.text, cursor: "pointer", padding: 6 }}><Ic path={P.chevL} size={20} /></button>
          <button onClick={() => setCursor(new Date(y, m + 1, 1))} aria-label="Próximo mês" style={{ border: "none", background: "transparent", color: T.text, cursor: "pointer", padding: 6 }}><Ic path={P.chevR} size={20} /></button>
        </div>
      </div>

      <Card T={T} style={{ marginTop: 12, boxShadow: T.shadow }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: T.sub }}>{tab === "done" ? "Plantões realizados no mês" : "Recebimentos previstos no mês"}</span>
          <span style={{ fontSize: 12.5, color: T.sub, fontVariantNumeric: "tabular-nums" }}>{pct}% pago</span>
        </div>
        <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 30, color: T.text, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(total)}</div>
        {shifts.length > 0 && (
          <div style={{ display: "flex", gap: 2, height: 12, borderRadius: 8, overflow: "hidden", marginTop: 12 }}>
            {shifts.slice().sort((a, b) => keyOf(a).localeCompare(keyOf(b))).map(s => (
              <div key={s.id} title={s.title} style={{ flex: Math.max(s.value, 1), background: s.paid ? T.accent : stripe, minWidth: 4 }} />
            ))}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14, fontSize: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: T.sub, display: "flex", alignItems: "center", gap: 7 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: T.accent }} />Pago</span><b style={{ color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(paidV)}</b></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: T.sub, display: "flex", alignItems: "center", gap: 7 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: stripe }} />A receber</span><b style={{ color: T.amber, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(total - paidV)}</b></div>
          {overdueV > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: T.red, display: "flex", alignItems: "center", gap: 7 }}><Ic path={P.alert} size={13} color={T.red} />Atrasado</span><b style={{ color: T.red, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(overdueV)}</b></div>}
        </div>
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        {shifts.length === 0 && <div style={{ textAlign: "center", color: T.sub, fontSize: 14, padding: "34px 0" }}>Nenhum plantão neste período.</div>}
        {groups.map(({ k, arr }) => {
          const sub = arr.reduce((a, s) => a + (s.value || 0), 0);
          const subPaid = arr.filter(s => s.paid).reduce((a, s) => a + (s.value || 0), 0);
          const loc = byLoc ? data.locations.find(l => l.id === k) : null;
          const header = byLoc
            ? (loc ? loc.name : "Sem local associado")
            : (tab === "done" ? fmtDateLong(k) : `Pagamento em ${fmtDateLong(k)}`);
          return (
            <div key={k}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 4px 6px" }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: T.text, display: "flex", alignItems: "center", gap: 7 }}>
                  {byLoc && <span style={{ width: 10, height: 10, borderRadius: 99, background: loc ? loc.color : T.sub }} />}
                  {header}
                </span>
                <span style={{ fontSize: 12.5, color: T.sub, fontVariantNumeric: "tabular-nums" }}>{byLoc ? `${fmtBRL(subPaid)} pago · ${fmtBRL(sub - subPaid)} a receber` : fmtBRL(sub)}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {arr.map(s => <ShiftCard key={s.id} T={T} s={s} data={data} onOpen={() => openEdit(s)} onTogglePaid={() => togglePaid(s.id)} showDate={byLoc || tab === "pay"} showPayInfo={tab !== "pay"} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════ RESUMO ═══════════════ */
function SummaryView({ T, data, goToMonth }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [selM, setSelM] = useState(now.getMonth());
  const months = useMemo(() => {
    const arr = Array.from({ length: 12 }, () => ({ total: 0, paid: 0, hours: 0, count: 0 }));
    for (const s of data.shifts) {
      const d = pd(s.date);
      if (d.getFullYear() !== year) continue;
      const b = arr[d.getMonth()];
      b.total += s.value || 0; b.count++; b.hours += hoursOf(s.startTime, s.endTime);
      if (s.paid) b.paid += s.value || 0;
    }
    return arr;
  }, [data.shifts, year]);
  const yTotal = months.reduce((a, b) => a + b.total, 0);
  const yHours = months.reduce((a, b) => a + b.hours, 0);
  const yCount = months.reduce((a, b) => a + b.count, 0);
  const max = Math.max(...months.map(b => b.total), 1);
  const mSel = months[selM];
  const goal = data.settings.monthlyGoal || 0;
  const locStats = useMemo(() => {
    const g = {};
    for (const s of data.shifts) {
      const d = pd(s.date); if (d.getFullYear() !== year) continue;
      const k = s.locationId || "_none";
      g[k] = g[k] || { total: 0, hours: 0, count: 0 };
      g[k].total += s.value || 0; g[k].hours += hoursOf(s.startTime, s.endTime); g[k].count++;
    }
    return Object.entries(g).sort((a, b) => b[1].total - a[1].total);
  }, [data.shifts, year]);

  const Stat = ({ label, value }) => (
    <div style={{ background: T.card, borderRadius: 16, border: `1px solid ${T.line}`, padding: "12px 14px" }}>
      <div style={{ fontSize: 12, color: T.sub, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 18, color: T.text, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );

  return (
    <div style={{ padding: "14px 16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 21, color: T.text }}>Resumo <span style={{ color: T.sub, fontWeight: 600 }}>{year}</span></div>
        <div style={{ display: "flex", gap: 2 }}>
          <button onClick={() => setYear(y => y - 1)} aria-label="Ano anterior" style={{ border: "none", background: "transparent", color: T.text, cursor: "pointer", padding: 6 }}><Ic path={P.chevL} size={20} /></button>
          <button onClick={() => setYear(y => y + 1)} aria-label="Próximo ano" style={{ border: "none", background: "transparent", color: T.text, cursor: "pointer", padding: 6 }}><Ic path={P.chevR} size={20} /></button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        <Stat label="Total no ano" value={fmtBRL(yTotal)} />
        <Stat label="Plantões" value={yCount} />
        <Stat label="Horas trabalhadas" value={fmtH(Math.round(yHours * 10) / 10)} />
        <Stat label="Média por hora" value={yHours ? fmtBRL(yTotal / yHours) : "—"} />
      </div>

      <Card T={T} style={{ marginTop: 14 }}>
        <div style={{ fontSize: 13, color: T.sub, fontWeight: 600, marginBottom: 12 }}>Ganhos por mês</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 110 }}>
          {months.map((b, i) => (
            <button key={i} onClick={() => setSelM(i)} aria-label={MONTHS[i]} style={{ flex: 1, border: "none", background: "transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: 0, height: "100%", justifyContent: "flex-end", fontFamily: "inherit" }}>
              <div style={{
                width: "100%", borderRadius: 6, minHeight: b.total ? 6 : 3, height: `${(b.total / max) * 82}%`,
                background: i === selM ? T.accent : b.total ? T.accentSoft : T.chip,
                boxShadow: i === selM ? "none" : b.total ? `inset 0 0 0 1px ${T.line}` : "none",
                transition: "height .25s ease",
              }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: i === selM ? T.accent : T.sub }}>{MONTHS_S[i][0].toUpperCase()}</span>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.line}` }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700, color: T.text, fontSize: 15 }}>{MONTHS[selM]}</span>
            <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 18, color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(mSel.total)}</span>
          </div>
          <div style={{ fontSize: 13, color: T.sub, marginTop: 4 }}>
            {mSel.count} {mSel.count === 1 ? "plantão" : "plantões"} · {fmtH(Math.round(mSel.hours * 10) / 10)}{mSel.hours ? ` · ${fmtBRL(mSel.total / mSel.hours)}/h` : ""}
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
            Ver plantões de {MONTHS_S[selM]}.
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
                  <div style={{ fontSize: 12.5, color: T.sub }}>{v.count} {v.count === 1 ? "plantão" : "plantões"} · {fmtH(Math.round(v.hours * 10) / 10)}</div>
                </div>
                <b style={{ color: T.text, fontSize: 14.5, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(v.total)}</b>
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
  const [f, setF] = useState(initial);
  const [valTxt, setValTxt] = useState(initial.defaultValue ? initial.defaultValue.toFixed(2).replace(".", ",") : "");
  const set = p => setF(x => ({ ...x, ...p }));
  const parseVal = t => { const n = parseFloat(String(t).replace(/\./g, "").replace(",", ".")); return isNaN(n) ? 0 : n; };
  const label = { fontSize: 12.5, fontWeight: 700, color: T.sub, letterSpacing: .5, textTransform: "uppercase", margin: "18px 4px 8px" };
  const save = () => { if (!f.name.trim()) { set({ _err: true }); return; } onSave({ ...f, name: f.name.trim(), defaultValue: parseVal(valTxt), payValue: Number(f.payValue) || 0 }); };
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
      <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${T.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: T.card, borderBottom: `1px solid ${T.line}` }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: T.text, flex: 1 }}>Valor padrão</span>
          <span style={{ color: T.sub, fontWeight: 600 }}>R$</span>
          <input value={valTxt} onChange={e => setValTxt(e.target.value)} onBlur={() => { const v = parseVal(valTxt); setValTxt(v ? v.toFixed(2).replace(".", ",") : ""); }}
            inputMode="decimal" placeholder="0,00" style={{ ...inputStyle(T), width: 110, textAlign: "right", padding: "9px 10px" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: T.card }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: T.text, flex: 1 }}>Horário padrão</span>
          <input type="time" value={f.defaultStart || ""} onChange={e => set({ defaultStart: e.target.value })} style={{ ...inputStyle(T), width: 90, padding: "9px 8px" }} />
          <span style={{ color: T.sub }}>–</span>
          <input type="time" value={f.defaultEnd || ""} onChange={e => set({ defaultEnd: e.target.value })} style={{ ...inputStyle(T), width: 90, padding: "9px 8px" }} />
        </div>
      </div>

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
  const [goalTxt, setGoalTxt] = useState(data.settings.monthlyGoal ? data.settings.monthlyGoal.toFixed(2).replace(".", ",") : "");
  const [showImport, setShowImport] = useState(false);
  const [importTxt, setImportTxt] = useState("");
  const parseVal = t => { const n = parseFloat(String(t).replace(/\./g, "").replace(",", ".")); return isNaN(n) ? 0 : n; };
  const label = { fontSize: 12.5, fontWeight: 700, color: T.sub, letterSpacing: .5, textTransform: "uppercase", margin: "20px 4px 8px" };

  const download = (name, content, type) => {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const exportCSV = () => {
    const rows = [["data", "titulo", "local", "inicio", "fim", "horas", "valor", "pago", "data_pagamento", "observacoes"]];
    for (const s of data.shifts.slice().sort((a, b) => a.date.localeCompare(b.date))) {
      const loc = data.locations.find(l => l.id === s.locationId);
      rows.push([s.date, s.title, loc ? loc.name : "", s.startTime, s.endTime, hoursOf(s.startTime, s.endTime), String(s.value || 0).replace(".", ","), s.paid ? "sim" : "não", s.paymentDate || "", (s.notes || "").replace(/\n/g, " ")]);
    }
    download("plantoes.csv", "\uFEFF" + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n"), "text/csv;charset=utf-8");
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", background: T.card }}>
          <span style={{ fontSize: 15.5, fontWeight: 500, color: T.text, flex: 1 }}>Meta mensal</span>
          <span style={{ color: T.sub, fontWeight: 600 }}>R$</span>
          <input value={goalTxt} inputMode="decimal" placeholder="0,00"
            onChange={e => setGoalTxt(e.target.value)}
            onBlur={() => { const v = parseVal(goalTxt); setGoalTxt(v ? v.toFixed(2).replace(".", ",") : ""); setData(d => ({ ...d, settings: { ...d.settings, monthlyGoal: v } })); }}
            style={{ ...inputStyle(T), width: 130, textAlign: "right", padding: "10px 12px" }} />
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: T.sub, margin: "7px 4px 0" }}>A meta aparece como barra de progresso na aba Resumo.</div>

      <div style={label}>Seus dados</div>
      <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${T.line}` }}>
        <Row T={T} first label="Exportar plantões (CSV)" onClick={exportCSV} right={<Ic path={P.down} size={16} color={T.sub} />} />
        <Row T={T} label="Exportar backup completo" onClick={() => download("escala-backup.json", JSON.stringify(data, null, 2), "application/json")} right={<Ic path={P.down} size={16} color={T.sub} />} />
        <Row T={T} last label="Importar backup" onClick={() => setShowImport(true)} />
      </div>
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
      setDataRaw({ ...DEFAULT_DATA, ...j, settings: { ...DEFAULT_DATA.settings, ...(j.settings || {}) } });
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

  const openCreate = dateStr => setEditor({
    mode: "create",
    initial: { id: null, seriesId: null, title: "", color: PALETTE[0], locationId: null, value: 0, date: dateStr || todayStr(), startTime: "19:00", endTime: "07:00", paymentDate: dateStr || todayStr(), paid: false, notes: "", repeat: { type: "none" } },
  });
  const openEdit = s => setEditor({ mode: "edit", initial: { ...s } });

  const togglePaid = id => setData(d => ({ ...d, shifts: d.shifts.map(s => s.id === id ? { ...s, paid: !s.paid } : s) }));

  const persistShift = f => {
    const { repeat, _err, ...clean } = f;
    if (editor.mode === "create") {
      const dates = genDates(f.date, repeat);
      const seriesId = dates.length > 1 ? uid() : null;
      const loc = data.locations.find(l => l.id === f.locationId);
      const delta = f.paymentDate ? daysBetween(f.date, f.paymentDate) : 0;
      const shifts = dates.map(dt => ({
        ...clean, id: uid(), seriesId, date: dt,
        paymentDate: autoPay(loc, dt) || (f.paymentDate ? addDays(dt, delta) : dt),
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
            return { ...s, title: clean.title, color: clean.color, locationId: clean.locationId, value: clean.value, startTime: clean.startTime, endTime: clean.endTime, notes: clean.notes, paymentDate: autoPay(loc, s.date) || s.paymentDate };
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
    setEditor({ mode: "create", initial: { ...s, id: null, seriesId: null, paid: false, repeat: { type: "none" } } });
  };

  const saveLoc = l => {
    if (l.id) setData(d => ({ ...d, locations: d.locations.map(x => x.id === l.id ? l : x) }));
    else setData(d => ({ ...d, locations: [...d.locations, { ...l, id: uid() }] }));
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
        {tab === "pay" && <PaymentsView T={T} data={data} cursor={cursor} setCursor={setCursor} openEdit={openEdit} togglePaid={togglePaid} />}
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
          onSave={persistShift} onClose={() => setEditor(null)} onDelete={deleteShift} onDuplicate={duplicateShift} />
      )}
      {dialog && <Dialog T={T} {...dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}


createRoot(document.getElementById("root")).render(<App />);
