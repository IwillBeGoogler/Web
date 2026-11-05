import { useState } from "react";
import { api, setToken } from "../api/client";

export default function AuthPage({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    try {
      const s = await api(`/auth/${mode}`, "POST", { username, password });
      setToken(s.token);
      onAuth(s.user);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>{mode === "login" ? "Log in" : "Sign up"}</h2>
      <input placeholder="Username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <input
        type="password"
        placeholder="Password (min 8)"
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {err && <small className="error">{err}</small>}
      <button>{mode === "login" ? "Log in" : "Sign up"}</button>
      <button
        type="button"
        className="ghost"
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setErr("");
        }}
      >
        {mode === "login" ? "No account? Sign up" : "Have an account? Log in"}
      </button>
    </form>
  );
}
