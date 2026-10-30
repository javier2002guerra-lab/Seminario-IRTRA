"use client";
import { useEffect, useState } from "react";
export default function LogoutButton() {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  async function out() {
    await fetch("/api/auth/logout", { method: "POST" });
    location.href = "/login";
  }
  return (
    <button className="btn secondary" onClick={out} disabled={!ready}>
      Salir
    </button>
  );
}
