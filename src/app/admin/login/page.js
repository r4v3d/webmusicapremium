"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CONFIG } from "../../../data/config";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error al iniciar sesión.");
      }

      router.push("/admin");
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-bg-glow"></div>
      
      <div className="container login-container animate-fade-in">
        <Link href="/" className="login-logo-brand">
          <span className="brand-dot"></span>
          <span>{CONFIG.appName}</span>
        </Link>

        <main className="login-card glass-panel">
          <h2>Panel de Control</h2>
          <p className="login-subtitle">Ingresa la contraseña de administrador para gestionar el stock y tus pedidos.</p>

          {error && <div className="error-alert">{error}</div>}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="password-field" className="form-label">Contraseña de Acceso</label>
              <input
                id="password-field"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                autoFocus
              />
            </div>

            <button
              type="submit"
              className={`btn btn-primary login-btn ${loading ? "btn-disabled" : ""}`}
              disabled={loading}
            >
              {loading ? "Verificando..." : "Ingresar al Panel"}
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}
