import React, { useEffect, useMemo, useState } from "react";
import { getStationSamples } from "../services/api";
import Sparkline from "./Sparkline";

const PREFERRED_CHAR = ["Iron", "pH", "Manganese", "Acidity, (H+)"];

const SEVERITY_BG = {
  extreme: "#7a1e10",
  high: "#b9341e",
  medium: "#b9341e",
  low: "#fda4af",
};
const SEVERITY_FG = {
  extreme: "#ffffff",
  high: "#ffffff",
  medium: "#ffffff",
  low: "#7a1e10",
};

function normalizeMetalToMgL(value, unit, fraction) {
  if (value == null) return null;
  if (fraction !== "Dissolved" && fraction !== "") return null;
  const u = (unit || "").trim().toLowerCase();
  if (["mg/l", "mg/l caco3", "mg/l as caco3"].includes(u)) return value;
  if (["ug/l", "ug/l caco3"].includes(u)) return value / 1000;
  if (["ug/g", "mg/kg", "%", "ng/l"].includes(u)) return null;
  if (u === "") return value > 100 ? value / 1000 : value;
  return null;
}

function getChartUnit(characteristic) {
  if (["Iron", "Manganese", "Aluminum"].includes(characteristic)) return "mg/L";
  if (characteristic.startsWith("Acidity") || characteristic.startsWith("Alkalinity")) return "mg/L CaCO₃";
  if (characteristic === "pH") return "";
  return "";
}

function MetaRow({ label, value }) {
  return (
    <>
      <span className="font-mono" style={{ fontSize: 9, color: "var(--ink-4)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500, alignSelf: "center" }}>
        {label}
      </span>
      <span className="font-mono" style={{ fontSize: 10.5, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </>
  );
}

function StationPanel({ station, onHarmSelect }) {
  const linkedHarms = station?.linked_harms || [];
  const availableChars = station?.available_characteristics || [];

  const defaultChar = useMemo(() => {
    const names = new Set(availableChars.map((c) => c.name));
    for (const p of PREFERRED_CHAR) if (names.has(p)) return p;
    return availableChars[0]?.name || null;
  }, [availableChars]);

  const [characteristic, setCharacteristic] = useState(defaultChar);
  useEffect(() => setCharacteristic(defaultChar), [defaultChar]);

  const [samples, setSamples] = useState([]);
  useEffect(() => {
    if (!station?.id || !characteristic) { setSamples([]); return; }
    let cancelled = false;
    const opts = { characteristic };
    if (["Iron", "Manganese", "Aluminum"].includes(characteristic)) opts.fraction = "Dissolved";
    getStationSamples(station.id, opts)
      .then((rows) => {
        if (cancelled) return;
        const cleaned = rows
          .map((r) => {
            let v = r.value;
            if (["Iron", "Manganese", "Aluminum"].includes(characteristic)) {
              v = normalizeMetalToMgL(v, r.unit, r.fraction);
            }
            return { ...r, value: v };
          })
          .filter((r) => r.value != null);
        setSamples(cleaned);
      })
      .catch(() => !cancelled && setSamples([]));
    return () => { cancelled = true; };
  }, [station?.id, characteristic]);

  return (
    <div style={{ padding: 14, fontSize: 11.5 }}>
      <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 500, color: "var(--ink)", lineHeight: 1.4 }}>
        {station?.name || "—"}
      </h2>
      <p className="font-mono" style={{ margin: "5px 0 0", fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.04em" }}>
        {station?.id}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "8px 12px",
          fontSize: 11,
          marginTop: 14,
          alignItems: "baseline",
        }}
      >
        <MetaRow label="Type" value={station?.type || "—"} />
        <MetaRow label="Agency" value={station?.agency || "—"} />
        <MetaRow label="HUC8" value={station?.huc || "—"} />
        {station?.drainage_area_sq_mi != null && (
          <MetaRow label="Drainage" value={`${station.drainage_area_sq_mi.toFixed(1)} sq mi`} />
        )}
        {station?.altitude_ft != null && (
          <MetaRow label="Altitude" value={`${station.altitude_ft.toFixed(0)} ft`} />
        )}
        {Array.isArray(station?.sources) && (
          <MetaRow label="Sources" value={station.sources.join(" + ")} />
        )}
      </div>

      {availableChars.length > 0 ? (
        <div style={{ marginTop: 20 }}>
          <div
            className="font-mono"
            style={{
              fontSize: 9,
              fontWeight: 500,
              color: "var(--ink-3)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>Time series</span>
            <select
              value={characteristic || ""}
              onChange={(e) => setCharacteristic(e.target.value)}
              style={{
                fontSize: 10,
                padding: "2px 7px",
                borderRadius: 999,
                border: "1px solid var(--hairline-strong)",
                background: "var(--surface-strong)",
                fontFamily: "var(--font-mono)",
                fontWeight: 500,
                color: "var(--ink)",
                letterSpacing: "0",
                textTransform: "none",
                cursor: "pointer",
              }}
            >
              {availableChars.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
            <span style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
          </div>
          <div style={{ marginBottom: 22 }}>
            <Sparkline
              samples={samples}
              width={232}
              height={62}
              unitLabel={getChartUnit(characteristic || "")}
            />
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 20 }}>
        <div
          className="font-mono"
          style={{
            fontSize: 9,
            fontWeight: 500,
            color: "var(--ink-3)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginBottom: 8,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>Linked AMD harms</span>
          <span className="pill-badge" style={{ fontSize: 8, padding: "1px 6px", lineHeight: 1.6 }}>
            {linkedHarms.length}
          </span>
          <span style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
        </div>

        {linkedHarms.length === 0 ? (
          <p style={{ color: "var(--ink-4)", fontSize: 11, marginTop: 8, lineHeight: 1.55 }}>
            This station is not on any AMD harm's downstream chain.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
            {linkedHarms.map((h) => {
              const sev = h.severity || "low";
              return (
                <li key={h.id} style={{ marginBottom: 6 }}>
                  <button
                    type="button"
                    onClick={() => onHarmSelect(h.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      background: "var(--surface-quiet)",
                      border: "1px solid var(--hairline)",
                      borderRadius: "var(--radius-md)",
                      padding: "7px 10px",
                      cursor: "pointer",
                      fontSize: 11,
                      textAlign: "left",
                      fontFamily: "inherit",
                      transition: "background 160ms var(--ease-out), border-color 160ms var(--ease-out)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg)"; e.currentTarget.style.borderColor = "var(--hairline-strong)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface-quiet)"; e.currentTarget.style.borderColor = "var(--hairline)"; }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        background: SEVERITY_BG[sev] || "var(--ink-4)",
                        color: SEVERITY_FG[sev] || "#ffffff",
                        padding: "2px 7px",
                        borderRadius: 999,
                        fontSize: 8.5,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        flex: "none",
                      }}
                    >
                      {sev}
                    </span>
                    <span style={{ color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                      {h.name || h.id}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default StationPanel;
