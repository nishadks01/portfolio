"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { clearAuthError, loginWithUsername } from "@/lib/store/auth-slice";
import { useAppDispatch, useAppSelector } from "@/lib/store/provider";

export default function LoginPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { loading, error } = useAppSelector((state) => state.auth);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function login(e: FormEvent) {
    e.preventDefault();
    dispatch(clearAuthError());
    try {
      await dispatch(loginWithUsername({ username, password })).unwrap();
      router.refresh();
      router.replace("/admin");
    } catch {}
  }

  return (
    <main className="login-wrap page-shell">
      <div className="noise" />
      <div className="orb orb-one" />
      <form className="glass-card login-card" onSubmit={login}>
          <Link
          className="btn"
         style={{ marginRight: 16, width: "fit-content" }}
          href="/"
        >
          <ArrowLeft size={15} />
        </Link>
        <div className="eyebrow">
        
          <div className="eyebrow-dot" /> Private workspace
        </div>
        <h1>Welcome back.</h1>
        <p className="muted">Sign in to update your portfolio content.</p>
        <div className="admin-form">
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
    </main>
  );
}
