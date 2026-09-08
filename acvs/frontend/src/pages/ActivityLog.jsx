import React, { useEffect, useState } from "react";
import { getActivityLogs } from "../api/audit";
import AppShell from "../components/AppShell.jsx";

// manage initials that were sent in our serializer (actor_email)
function getInitials(email = "") {
  if (!email) return "SA";
  const name = email.split("@")[0];
  const parts = name.replace(/[._-]/g, " ").split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

// format for the agent label based on actor email and actor role
function formatAgentLabel(row) {
  if (!row.actor_email) return "System Admin (Auto)";
  if (row.actor_role) {
    return `${row.actor_email} (${row.actor_role})`;
  }
  return row.actor_email;
}

// Robust helper to extract certificate ID regardless of backend field naming
function getCertificateId(row) {
  console.log("Ligne d'audit reçue :", row); // 
  // 1. Si l'API renvoie directement l'ID
  if (row.certificate_id && typeof row.certificate_id === "string") {
    return row.certificate_id;
  }

  // 2. Si l'ID est dans un objet imbriqué `certificate`
  if (row.certificate) {
    if (typeof row.certificate === "string") return row.certificate;
    if (row.certificate.certificate_id) return row.certificate.certificate_id;
  }

  // 3. Si c'est un lot JSON stocké dans 'detail'
  if (row.detail && typeof row.detail === "string") {
    try {
      const parsed = JSON.parse(row.detail);
      if (parsed.certificate_ids && Array.isArray(parsed.certificate_ids)) {
        const ids = parsed.certificate_ids;
        if (ids.length === 1) return ids[0];
        if (ids.length > 1) return `${ids[0]} (+${ids.length - 1})`;
      }
    } catch (e) {
      // Pas du JSON valide
    }
  }

  return "not available";
}

const renderStatusBadge = (status, action) => {
  let normalized = status?.toLowerCase()?.replace("_", " ");
  if (!normalized && action) {
    if (action.includes("anchor")) normalized = "anchored";
    else if (action.includes("disable") || action.includes("revoke")) normalized = "disabled";
    else if (action.includes("register") || action.includes("edit") || action.includes("pending")) normalized = "pending";
  }

  const baseStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 10px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: "700",
    fontFamily: "monospace",
    textTransform: "capitalize",
  };

  if (normalized === "anchored") {
    return (
      <span style={{ ...baseStyle, backgroundColor: "#e6f4ea", color: "#137333" }}>
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#137333" }}></span>
        Anchored
      </span>
    );
  }
  if (normalized === "grace period" || normalized === "pending") {
    return (
      <span style={{ ...baseStyle, backgroundColor: "#fef7e0", color: "#b06000" }}>
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#b06000" }}></span>
        {normalized === "pending" ? "Pending" : "Grace Period"}
      </span>
    );
  }
  if (normalized === "disabled" || normalized === "revoked") {
    return (
      <span style={{ ...baseStyle, backgroundColor: "#fce8e6", color: "#c5221f" }}>
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#c5221f" }}></span>
        Disabled
      </span>
    );
  }

  return <span style={{ ...baseStyle, backgroundColor: "#f1f3f4", color: "#5f6368" }}>{status || "—"}</span>;
};

const renderActionBadge = (action) => {
  const norm = action?.toLowerCase() || "";

  const actionStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 8px",
    borderRadius: "4px",
    border: "1px solid #dadce0",
    backgroundColor: "#f8f9fa",
    fontSize: "11px",
    fontFamily: "monospace",
    color: "#3c4043",
  };

  if (norm.includes("anchor")) return <span style={actionStyle}>🔒 Anchoring</span>;
  if (norm.includes("edit")) return <span style={actionStyle}>📄 Data Edit</span>;
  if (norm.includes("register")) return <span style={actionStyle}>📋 Registration</span>;
  if (norm.includes("disable") || norm.includes("revoke")) {
    return (
      <span style={{ ...actionStyle, backgroundColor: "#fce8e6", borderColor: "#f2b2b2", color: "#c5221f" }}>
        ⊘ Revocation
      </span>
    );
  }

  return <span style={actionStyle}>{action}</span>;
};

export default function ActivityLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);

  // Filtres
  const [selectedAction, setSelectedAction] = useState("");
  const [certificateSearch, setCertificateSearch] = useState("");

  useEffect(() => {
    loadLogs();
  }, [page, selectedAction, certificateSearch]);

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getActivityLogs({
        page,
        action: selectedAction,
        certificate: certificateSearch,
      });

      if (data && Array.isArray(data.results)) {
        setLogs(data.results);
        setTotalCount(data.count ?? 0);
        setHasNext(Boolean(data.next));
        setHasPrevious(Boolean(data.previous));
      } else if (Array.isArray(data)) {
        setLogs(data);
        setTotalCount(data.length);
        setHasNext(false);
        setHasPrevious(false);
      } else {
        setLogs([]);
        setTotalCount(0);
        setHasNext(false);
        setHasPrevious(false);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setError("Impossible de charger les données du journal.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div style={{ padding: "40px 60px", maxWidth: "1200px", margin: "0 auto", fontFamily: "sans-serif" }}>
        
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "20px", marginBottom: "30px" }}>
          <div style={{
            width: "70px",
            height: "70px",
            borderRadius: "50%",
            border: "1px solid #d1d5db",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            backgroundColor: "#fff"
          }}>
            <div style={{ textAlign: "center", fontSize: "10px", fontWeight: "bold", color: "#4b5563" }}>
                <img
                src="/logo.png"
                alt="Sceau du Ministère de l'Éducation Nationale"
                className="h-20 w-20 object-contain"
              />
            </div>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "6px", height: "32px", display: "flex", flexDirection: "column", borderRadius: "2px", overflow: "hidden" }}>
                <div style={{ height: "40%", backgroundColor: "#007fff" }}></div>
                <div style={{ height: "20%", backgroundColor: "#f7d618" }}></div>
                <div style={{ height: "40%", backgroundColor: "#ce1021" }}></div>
              </div>
              <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#111827", margin: 0 }}>
                Activity Log
              </h1>
            </div>
            <p style={{ color: "#4b5563", fontSize: "14px", marginTop: "8px", maxWidth: "750px", lineHeight: "1.4" }}>
              Chronological and immutable record of system actions. This log guarantees the Ministry's mandate for institutional transparency by ensuring full traceability of the official document lifecycle.
            </p>
          </div>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", marginBottom: "25px" }} />

        {/* FILTRES */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
          <select
            value={selectedAction}
            onChange={(e) => { setPage(1); setSelectedAction(e.target.value); }}
            style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", backgroundColor: "#fff" }}
          >
            <option value="">Toutes les actions</option>
            <option value="cert_registered">Registration</option>
            <option value="cert_edited">Data Edit</option>
            <option value="cert_anchored">Anchoring</option>
            <option value="cert_disabled">Revocation</option>
          </select>

          <input
            type="text"
            placeholder="Filtrer par ID Certificat..."
            value={certificateSearch}
            onChange={(e) => { setPage(1); setCertificateSearch(e.target.value); }}
            style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", width: "240px", fontFamily: "monospace" }}
          />
        </div>

        {/* Table */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", backgroundColor: "#fff", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "12px 16px", color: "#6b7280", fontWeight: "600", fontSize: "11px", letterSpacing: "0.05em", fontFamily: "monospace" }}>TIMESTAMP (UTC)</th>
                <th style={{ padding: "12px 16px", color: "#6b7280", fontWeight: "600", fontSize: "11px", letterSpacing: "0.05em", fontFamily: "monospace" }}>AUTHORIZED AGENT</th>
                <th style={{ padding: "12px 16px", color: "#6b7280", fontWeight: "600", fontSize: "11px", letterSpacing: "0.05em", fontFamily: "monospace" }}>INSTITUTION</th>
                <th style={{ padding: "12px 16px", color: "#6b7280", fontWeight: "600", fontSize: "11px", letterSpacing: "0.05em", fontFamily: "monospace" }}>ACTION TYPE</th>
                <th style={{ padding: "12px 16px", color: "#6b7280", fontWeight: "600", fontSize: "11px", letterSpacing: "0.05em", fontFamily: "monospace" }}>CERTIFICATE ID</th>
                <th style={{ padding: "12px 16px", color: "#6b7280", fontWeight: "600", fontSize: "11px", letterSpacing: "0.05em", fontFamily: "monospace" }}>RESULTING STATUS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" style={{ padding: "40px", textAlign: "center", color: "#9ca3af", fontFamily: "monospace" }}>
                    loading all the activities...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan="6" style={{ padding: "40px", textAlign: "center", color: "#dc2626", fontFamily: "monospace" }}>
                    {error}
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: "40px", textAlign: "center", color: "#9ca3af", fontFamily: "monospace" }}>
                    No action is saved.
                  </td>
                </tr>
              ) : (
                logs.map((row, idx) => {
                  const dateObj = row.created_at ? new Date(row.created_at) : null;
                  const dateStr = dateObj ? dateObj.toISOString().split("T")[0] : "—";
                  const timeStr = dateObj ? dateObj.toISOString().split("T")[1].substring(0, 8) : "";

                  const agentLabel = formatAgentLabel(row);
                  const initials = getInitials(row.actor_email);
                  const institutionName = row.institution_name || "—";
                  const certId = getCertificateId(row);

                  return (
                    <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      {/* TIMESTAMP */}
                      <td style={{ padding: "14px 16px", fontFamily: "monospace", color: "#374151", whiteSpace: "nowrap" }}>
                        <div>{dateStr}</div>
                        <div style={{ color: "#9ca3af", fontSize: "11px" }}>{timeStr}</div>
                      </td>

                      {/* AGENT */}
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "50%",
                            backgroundColor: "#e5e7eb",
                            color: "#374151",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "11px",
                            fontWeight: "bold",
                            fontFamily: "monospace"
                          }}>
                            {initials}
                          </span>
                          <span style={{ fontWeight: "500", color: "#111827" }}>{agentLabel}</span>
                        </div>
                      </td>

                      {/* INSTITUTION */}
                      <td style={{ padding: "14px 16px", color: "#4b5563", fontWeight: "500" }}>
                        {institutionName}
                      </td>

                      {/* ACTION TYPE */}
                      <td style={{ padding: "14px 16px" }}>
                        {renderActionBadge(row.action)}
                      </td>

                      {/* CERTIFICATE ID */}
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{
                          backgroundColor: "#f3f4f6",
                          border: "1px solid #e5e7eb",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontFamily: "monospace",
                          fontSize: "12px",
                          color: "#1f2937"
                        }}>
                          {certId}
                        </span>
                      </td>

                      {/* RESULTING STATUS */}
                      <td style={{ padding: "14px 16px" }}>
                        {renderStatusBadge(row.status, row.action)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* PAGINATION */}
          <div style={{
            padding: "12px 16px",
            backgroundColor: "#f9fafb",
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "12px",
            color: "#6b7280",
            fontFamily: "monospace"
          }}>
            <div>
              Showing last {logs.length} actions of {totalCount.toLocaleString()}
            </div>
            <div style={{ display: "flex", gap: "4px" }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading || !hasPrevious}
                style={{
                  padding: "6px 12px",
                  border: "1px solid #d1d5db",
                  backgroundColor: "#fff",
                  borderRadius: "4px",
                  cursor: page === 1 || !hasPrevious ? "not-allowed" : "pointer",
                  opacity: page === 1 || !hasPrevious ? 0.5 : 1
                }}
              >
                ‹
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={loading || !hasNext}
                style={{
                  padding: "6px 12px",
                  border: "1px solid #d1d5db",
                  backgroundColor: "#fff",
                  borderRadius: "4px",
                  cursor: !hasNext ? "not-allowed" : "pointer",
                  opacity: !hasNext ? 0.5 : 1
                }}
              >
                ›
              </button>
            </div>
          </div>

        </div>
      </div>
    </AppShell>
  );
}