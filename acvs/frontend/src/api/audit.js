
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const ACCESS_KEY = "acvs.access";

export async function getActivityLogs(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.append(key, value);
    }
  });

  // Récupération propre du token
  let accessToken = localStorage.getItem(ACCESS_KEY);
  if (accessToken) {
    // Supprime d'éventuels guillemets superflus
    accessToken = accessToken.replace(/^"|"$/g, "").trim();
  }

  const queryString = query.toString();
  const url = `${API_BASE}/api/audit/${queryString ? `?${queryString}` : ""}`;

  const headers = {
    "Accept": "application/json",
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.detail ||
      error.message ||
      `Failed to load activity log (${response.status})`
    );
  }

  return response.json();
}
