import React, { useEffect, useMemo, useState } from "react";
import { getStationSamples } from "../services/api";
import Sparkline from "./Sparkline";

const PREFERRED_CHAR = ["Iron", "pH", "Manganese", "Acidity, (H+)"];

const SEVERITY_BG = {
  extreme: "#7f1d1d",
  high: "#b91c1c",
  medium: "#dc2626",
  low: "#fda4af",
};
const SEVERITY_FG = {
  extreme: "#ffffff",
  high: "#ffffff",
  medium: "#ffffff",
  low: "#7f1d1d",
};

// Match build_harms.py unit normalization: pull metals to mg/L, drop solid units.
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
  if (
    characteristic === "Iron" ||
    characteristic === "Manganese" ||
    characteristic === "Aluminum"
  )
    return "mg/L";
  if (
    characteristic.startsWith("Acidity") ||
    characteristic.startsWith("Alkalinity")
  )
    return "mg/L CaCO₃";
  if (characteristic === "pH") return "";
  return "";
}

function StationPanel({ station, onHarmSelect }) {
  const linkedHarms = station?.linked_harms || [];
  const availableChars = station?.available_characteristics || [];

  // Default: first preferred characteristic the station actually has, else
  // first available.
  const defaultChar = useMemo(() => {
    const names = new Set(availableChars.map((c) => c.name));
    for (const p of PREFERRED_CHAR) if (names.has(p)) return p;
    return availableChars[0]?.name || null;
  }, [availableChars]);

  const [characteristic, setCharacteristic] = useState(defaultChar);
  useEffect(() => setCharacteristic(defaultChar), [defaultChar]);

  const [samples, setSamples] = useState([]);
  useEffect(() => {
    if (!station?.id || !characteristic) {
      setSamples([]);
      return;
    }
    let cancelled = false;
    // For metals, force Dissolved fraction if it exists
    const opts = { characteristic };
    if (["Iron", "Manganese", "Aluminum"].includes(characteristic)) {
      opts.fraction = "Dissolved";
    }
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
    return () => {
      cancelled = true;
    };
  }, [station?.id, characteristic]);

  return (
    <div style={{ padding: 14, fontSize: 11.5 }}>
      <h2
        style={{
          margin: 0,
          fontSize: 13.5,
          fontWeight: 500,
          color: "#0f172a",
          lineHeight: 1.4,
          letterSpacing: "0.01em",
        }}
      >
        {station?.name || "—"}
      </h2>
      <p
        style={{
          margin: "5px 0 0",
          fontSize: 10,
          fontStyle: "italic",
          color: "#94a3b8",
        }}
      >
        {station?.id}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "6px 12px",
          fontSize: 11,
          marginTop: 14,
        }}
      >
        <strong style={{ color: "#475569" }}>Type</strong>
        <span style={{ color: "#0f172a" }}>{station?.type || "—"}</span>
        <strong style={{ color: "#475569" }}>Agency</strong>
        <span style={{ color: "#0f172a" }}>{station?.agency || "—"}</span>
        <strong style={{ color: "#475569" }}>HUC8</strong>
        <span style={{ color: "#0f172a" }}>{station?.huc || "—"}</span>
        {station?.drainage_area_sq_mi != null ? (
          <>
            <strong style={{ color: "#475569" }}>Drainage</strong>
            <span style={{ color: "#0f172a" }}>
              {station.drainage_area_sq_mi.toFixed(1)} sq mi
            </span>
          </>
        ) : null}
        {station?.altitude_ft != null ? (
          <>
            <strong style={{ color: "#475569" }}>Altitude</strong>
            <span style={{ color: "#0f172a" }}>
              {station.altitude_ft.toFixed(0)} ft
            </span>
          </>
        ) : null}
        {Array.isArray(station?.sources) ? (
          <>
            <strong style={{ color: "#475569" }}>Sources</strong>
            <span style={{ color: "#0f172a" }}>
              {station.sources.join(" + ")}
            </span>
          </>
        ) : null}
      </div>

      {availableChars.length > 0 ? (
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              color: "#475569",
              letterSpacing: "0.08em",
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
                padding: "2px 6px",
                borderRadius: 4,
                border: "1px solid rgba(15,23,42,0.2)",
                background: "rgba(255,255,255,0.7)",
                fontFamily: "inherit",
                fontWeight: 500,
                color: "#0f172a",
                textTransform: "none",
                letterSpacing: "0",
              }}
            >
              {availableChars.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
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

      <div
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          color: "#475569",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          marginTop: 16,
        }}
      >
        Linked AMD harms{" "}
        <span style={{ color: "#cbd5e1", fontWeight: 500 }}>
          ({linkedHarms.length})
        </span>
      </div>
      {linkedHarms.length === 0 ? (
        <p
          style={{
            color: "#94a3b8",
            fontSize: 11,
            fontStyle: "italic",
            marginTop: 8,
            lineHeight: 1.55,
          }}
        >
          This station is not on any AMD harm’s downstream chain.
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
                    background: "transparent",
                    border: "1px solid rgba(15,23,42,0.12)",
                    borderRadius: 6,
                    padding: "6px 9px",
                    cursor: "pointer",
                    fontSize: 11,
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      background: SEVERITY_BG[sev] || "#94a3b8",
                      color: SEVERITY_FG[sev] || "#ffffff",
                      padding: "2px 6px",
                      borderRadius: 3,
                      fontSize: 8.5,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      flex: "none",
                    }}
                  >
                    {sev}
                  </span>
                  <span
                    style={{
                      color: "#0f172a",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                    }}
                  >
                    {h.name || h.id}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default StationPanel;
