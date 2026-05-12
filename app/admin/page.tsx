"use client";

import { useState, useEffect } from "react";

type Links = Record<string, string>;

export default function AdminPage() {
  const [authed,   setAuthed]   = useState(false);
  const [password, setPassword] = useState("");
  const [links,    setLinks]    = useState<Links>({});
  const [newKey,   setNewKey]   = useState("");
  const [newVal,   setNewVal]   = useState("");
  const [status,   setStatus]   = useState("");
  const [loading,  setLoading]  = useState(false);

  async function login() {
    setLoading(true);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      setAuthed(true);
      loadLinks();
    } else {
      setStatus("Wrong password.");
    }
  }

  async function loadLinks() {
    const res = await fetch("/api/admin/affiliates");
    if (res.ok) setLinks(await res.json());
  }

  async function save(updated: Links) {
    setStatus("Saving...");
    const res = await fetch("/api/admin/affiliates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    setStatus(res.ok ? "Saved ✓" : "Save failed.");
    setTimeout(() => setStatus(""), 2000);
  }

  function addLink() {
    const k = newKey.trim().toLowerCase();
    const v = newVal.trim();
    if (!k || !v) return;
    const updated = { ...links, [k]: v };
    setLinks(updated);
    setNewKey("");
    setNewVal("");
    save(updated);
  }

  function removeLink(key: string) {
    const updated = { ...links };
    delete updated[key];
    setLinks(updated);
    save(updated);
  }

  function updateVal(key: string, val: string) {
    setLinks(prev => ({ ...prev, [key]: val }));
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    setAuthed(false);
    setLinks({});
  }

  if (!authed) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0f0e0c", display: "flex",
        alignItems: "center", justifyContent: "center", fontFamily: "system-ui",
      }}>
        <div style={{ background: "#1a1813", border: "1px solid #2a2520", borderRadius: 12, padding: 40, width: 360 }}>
          <div style={{ color: "#DA7756", fontWeight: 700, fontSize: 20, marginBottom: 6 }}>AI Cursor</div>
          <div style={{ color: "#6b6460", fontSize: 13, marginBottom: 28 }}>Admin — Affiliate Links</div>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && login()}
            style={{
              width: "100%", padding: "10px 14px", background: "#2a2520",
              border: "1px solid #38332a", borderRadius: 8, color: "#f0ead8",
              fontSize: 14, outline: "none", boxSizing: "border-box",
            }}
          />
          {status && <div style={{ color: "#e05c5c", fontSize: 13, marginTop: 8 }}>{status}</div>}
          <button
            onClick={login}
            disabled={loading}
            style={{
              marginTop: 16, width: "100%", padding: "10px 0",
              background: "#DA7756", color: "#fff", border: "none",
              borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}
          >
            {loading ? "..." : "Login"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f0e0c", fontFamily: "system-ui", padding: "40px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <div style={{ color: "#DA7756", fontWeight: 700, fontSize: 22 }}>Affiliate Links</div>
            <div style={{ color: "#6b6460", fontSize: 13, marginTop: 4 }}>
              Keyword matches are case-insensitive. Use <code style={{ color: "#DA7756" }}>{"{term}"}</code> for dynamic search URLs.
            </div>
          </div>
          <button onClick={logout} style={{
            background: "none", border: "1px solid #38332a", color: "#6b6460",
            borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13,
          }}>Logout</button>
        </div>

        {/* Existing links */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
          {Object.entries(links).map(([key, val]) => (
            <div key={key} style={{
              display: "flex", gap: 8, alignItems: "center",
              background: "#1a1813", border: "1px solid #2a2520",
              borderRadius: 8, padding: "10px 14px",
            }}>
              <div style={{
                color: "#DA7756", fontSize: 13, fontWeight: 600,
                width: 140, flexShrink: 0, fontFamily: "monospace",
              }}>{key}</div>
              <input
                value={val}
                onChange={e => updateVal(key, e.target.value)}
                onBlur={() => save(links)}
                style={{
                  flex: 1, background: "#2a2520", border: "1px solid #38332a",
                  borderRadius: 6, padding: "6px 10px", color: "#c8beb0",
                  fontSize: 13, outline: "none", fontFamily: "monospace",
                }}
              />
              <button
                onClick={() => removeLink(key)}
                style={{
                  background: "none", border: "none", color: "#e05c5c",
                  cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px",
                }}
              >×</button>
            </div>
          ))}
        </div>

        {/* Add new */}
        <div style={{
          background: "#1a1813", border: "1px solid #38332a",
          borderRadius: 8, padding: 16,
        }}>
          <div style={{ color: "#c8beb0", fontSize: 13, marginBottom: 10, fontWeight: 600 }}>Add link</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              placeholder="keyword (e.g. notion)"
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              style={{
                width: 160, background: "#2a2520", border: "1px solid #38332a",
                borderRadius: 6, padding: "8px 10px", color: "#f0ead8",
                fontSize: 13, outline: "none", fontFamily: "monospace",
              }}
            />
            <input
              placeholder="https://notion.so/?ref=yourcode"
              value={newVal}
              onChange={e => setNewVal(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addLink()}
              style={{
                flex: 1, background: "#2a2520", border: "1px solid #38332a",
                borderRadius: 6, padding: "8px 10px", color: "#f0ead8",
                fontSize: 13, outline: "none", fontFamily: "monospace",
              }}
            />
            <button onClick={addLink} style={{
              background: "#DA7756", color: "#fff", border: "none",
              borderRadius: 6, padding: "8px 18px", fontWeight: 700,
              fontSize: 13, cursor: "pointer",
            }}>Add</button>
          </div>
        </div>

        {status && (
          <div style={{ marginTop: 16, color: status.includes("✓") ? "#6baa7a" : "#e05c5c", fontSize: 13 }}>
            {status}
          </div>
        )}

        <div style={{ marginTop: 32, color: "#38332a", fontSize: 12 }}>
          Public endpoint: <code style={{ color: "#6b6460" }}>/api/affiliates</code>
        </div>
      </div>
    </div>
  );
}
