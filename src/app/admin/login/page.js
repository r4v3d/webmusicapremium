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

      <style jsx>{`
        .login-wrapper {
          min-height: 100vh;
          background: var(--bg-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          padding: 24px;
        }

        .login-bg-glow {
          position: absolute;
          width: 400px;
          height: 400px;
          background: var(--accent-gold);
          border-radius: 50%;
          filter: blur(140px);
          opacity: 0.05;
          pointer-events: none;
          z-index: 0;
        }

        .login-container {
          max-width: 420px;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
          z-index: 10;
        }

        .login-logo-brand {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-title);
          font-weight: 800;
          font-size: 1.25rem;
          color: #ffffff;
        }

        .brand-dot {
          width: 8px;
          height: 8px;
          background: var(--accent-gold);
          border-radius: 50%;
        }

        .login-card {
          padding: 40px 30px;
          width: 100%;
          text-align: center;
        }

        .login-card h2 {
          font-size: 1.5rem;
          margin-bottom: 8px;
        }

        .login-subtitle {
          font-size: 0.875rem;
          color: var(--text-muted);
          margin-bottom: 24px;
        }

        .error-alert {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #ef4444;
          padding: 10px 14px;
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
          margin-bottom: 20px;
          text-align: left;
        }

        .login-form {
          text-align: left;
        }

        .login-btn {
          width: 100%;
          margin-top: 8px;
          padding: 14px;
        }

        @media (max-width: 480px) {
          .login-card {
            padding: 30px 20px;
          }
        }
      `}</style>
    </div>
  );
}
