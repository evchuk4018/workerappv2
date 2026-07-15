"use client";

import { useState } from "react";
import { ArrowRight, Mail, Sparkles } from "lucide-react";
import { ALLOWED_EMAIL } from "@/lib/auth";

export function LoginCard() {
  const [state, setState] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function sendMagicLink() {
    setState("loading");
    setError("");

    try {
      const response = await fetch("/api/auth/magic-link", { method: "POST" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to send the sign-in link.");
      setState("sent");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send the sign-in link.");
      setState("error");
    }
  }

  return (
    <main className="login-page">
      <div className="login-glow" aria-hidden="true" />
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-mark"><Sparkles size={24} /></div>
        <p className="eyebrow">Private workspace</p>
        <h1 id="login-title">Welcome to DeepSeek Chat</h1>
        <p className="login-copy">
          A focused space for thoughtful conversations, powered by DeepSeek V4.
        </p>

        {state === "sent" ? (
          <div className="login-success" role="status">
            <Mail size={20} />
            <div>
              <strong>Check your inbox</strong>
              <span>We sent a secure sign-in link to {ALLOWED_EMAIL}.</span>
            </div>
          </div>
        ) : (
          <button className="primary-button" onClick={sendMagicLink} disabled={state === "loading"}>
            <span>{state === "loading" ? "Sending link…" : "Email me a sign-in link"}</span>
            <ArrowRight size={18} />
          </button>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="login-email">Authorized account: {ALLOWED_EMAIL}</p>
      </section>
    </main>
  );
}
