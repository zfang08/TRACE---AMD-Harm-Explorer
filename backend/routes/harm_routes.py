import os

from flask import Blueprint, jsonify, request

from services.harm_service import (
    build_harm_evidence,
    harms_for_segment,
    load_harms,
    related_ids_for,
)

harm_routes = Blueprint("harm_routes", __name__, url_prefix="/api/harms")


@harm_routes.get("")
def list_harms():
    """返回所有 Harm 列表（用于 Sidebar 或调试）。"""
    return jsonify(load_harms())


@harm_routes.get("/<harm_id>")
def get_harm(harm_id: str):
    """返回单个 Harm 的完整 evidence（煤矿、监测站、受影响河段）。"""
    evidence = build_harm_evidence(harm_id)
    if not evidence:
        return jsonify({"error": "Not found"}), 404
    return jsonify(evidence)


@harm_routes.get("/by-segment/<segment_id>")
def list_harms_by_segment(segment_id: str):
    """返回所有"流过"该 stream segment 的 harm 摘要列表（id / name / severity）。"""
    return jsonify(harms_for_segment(segment_id))


@harm_routes.get("/related/<kind>/<entity_id>")
def get_related(kind: str, entity_id: str):
    """
    返回与给定 entity 相关的所有 entity id 集合，前端用来做 "highlight 关联 + dim 不相关"。
    kind ∈ {colliery, station, pollution_source, segment}
    Response: {harm_ids, pollution_source_ids, station_ids, segment_ids, colliery_ids}
    """
    if kind not in ("colliery", "station", "pollution_source", "segment"):
        return jsonify({"error": f"unknown kind: {kind!r}"}), 400
    return jsonify(related_ids_for(kind, entity_id))


def _generate_narrative(evidence: dict) -> str:
    import anthropic  # lazy import — keeps blueprint loadable without the package

    km = evidence.get("key_metrics", {})
    stations = evidence.get("stations", [])
    ph_vals = [s["ph"] for s in stations if s.get("ph") is not None]

    lines = [
        f"Harm: {evidence['name']} | Severity: {evidence['severity']}",
        f"Affected: {km.get('n_reaches', 0)} stream reaches, {km.get('total_reach_length_km', 0):.1f} km",
        f"Flow: {km.get('flow_gpm', '?')} gpm | Collieries: {km.get('n_collieries', 0)} sources",
    ]
    if ph_vals:
        lines.append(f"pH range: {min(ph_vals):.2f}–{max(ph_vals):.2f} (PA threshold 6.0)")

    client = anthropic.Anthropic()
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        system=(
            "You are an environmental briefing assistant. "
            "Write 2–3 concise sentences summarizing this AMD (acid mine drainage) harm "
            "for a water quality review. Focus on severity, affected waterway length, and pH impact. "
            "No bullet points. Plain prose only."
        ),
        messages=[{"role": "user", "content": "\n".join(lines)}],
    )
    return msg.content[0].text


def _check_api_key():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return jsonify({"error": "ANTHROPIC_API_KEY not set. In your terminal: $env:ANTHROPIC_API_KEY='sk-ant-...' then restart Flask."}), 503
    return None


@harm_routes.get("/<harm_id>/narrative")
def get_harm_narrative(harm_id: str):
    """返回 AI 生成的 harm 摘要（2–3 句英文）。"""
    err = _check_api_key()
    if err:
        return err
    evidence = build_harm_evidence(harm_id)
    if not evidence:
        return jsonify({"error": "Not found"}), 404
    try:
        narrative = _generate_narrative(evidence)
        return jsonify({"narrative": narrative})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


def _build_context(evidence: dict) -> str:
    km = evidence.get("key_metrics", {})
    stations = evidence.get("stations", [])
    ph_vals = [s["ph"] for s in stations if s.get("ph") is not None]
    lines = [
        f"Harm: {evidence['name']} | Severity: {evidence['severity']}",
        f"Affected: {km.get('n_reaches', 0)} stream reaches, {km.get('total_reach_length_km', 0):.1f} km",
        f"Flow: {km.get('flow_gpm', '?')} gpm | Collieries: {km.get('n_collieries', 0)} sources",
        f"Stations monitored: {km.get('n_stations', 0)}",
    ]
    if ph_vals:
        lines.append(f"pH range: {min(ph_vals):.2f}–{max(ph_vals):.2f} (PA threshold 6.0)")
    return "\n".join(lines)


@harm_routes.post("/<harm_id>/ask")
def ask_harm(harm_id: str):
    """接受用户的自然语言问题，返回 AI 回答。"""
    err = _check_api_key()
    if err:
        return err
    import anthropic
    question = (request.json or {}).get("question", "").strip()
    if not question:
        return jsonify({"error": "empty question"}), 400
    evidence = build_harm_evidence(harm_id)
    if not evidence:
        return jsonify({"error": "Not found"}), 404
    try:
        context = _build_context(evidence)
        client = anthropic.Anthropic()
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            system=(
                "You are an environmental data analyst. "
                "Answer the user's question about this AMD harm concisely, "
                "using only the data provided. If the data is insufficient, say so briefly."
            ),
            messages=[{"role": "user", "content": f"Data:\n{context}\n\nQuestion: {question}"}],
        )
        return jsonify({"answer": msg.content[0].text})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

