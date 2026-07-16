"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AlertCircle, LoaderCircle, X } from "lucide-react";
import { MAX_SYSTEM_PROMPT_LENGTH } from "@/lib/system-prompt";

const FOCUSABLE = [
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

interface SettingsDialogProps {
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}

type LoadState = "loading" | "ready" | "error";

export function SettingsDialog({ onClose, returnFocusRef }: SettingsDialogProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [savedPrompt, setSavedPrompt] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);

  const closeNow = useCallback(() => {
    onClose();
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  }, [onClose, returnFocusRef]);

  const requestClose = useCallback(() => {
    if (loadState === "ready" && draft !== savedPrompt) {
      setConfirmDiscard(true);
      return;
    }
    closeNow();
  }, [closeNow, draft, loadState, savedPrompt]);

  const saveSettings = useCallback(async () => {
    if (loadState !== "ready" || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt: draft }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        systemPrompt?: string;
        error?: string;
      };
      if (!response.ok || typeof result.systemPrompt !== "string") {
        throw new Error(result.error || "Unable to save settings.");
      }
      setSavedPrompt(result.systemPrompt);
      setDraft(result.systemPrompt);
      closeNow();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }, [closeNow, draft, loadState, saving]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/settings", {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = (await response.json().catch(() => ({}))) as {
          systemPrompt?: string;
          error?: string;
        };
        if (!response.ok || typeof result.systemPrompt !== "string") {
          throw new Error(result.error || "Unable to load settings.");
        }
        setSavedPrompt(result.systemPrompt);
        setDraft(result.systemPrompt);
        setLoadState("ready");
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Unable to load settings.");
        setLoadState("error");
      }
    })();

    return () => controller.abort();
  }, [loadAttempt]);

  useEffect(() => {
    if (confirmDiscard) keepEditingRef.current?.focus();
    else if (loadState === "ready") textareaRef.current?.focus();
  }, [confirmDiscard, loadState]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveSettings();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (confirmDiscard) setConfirmDiscard(false);
        else requestClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const elements = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [confirmDiscard, requestClose, saveSettings]);

  function discardChanges() {
    setDraft(savedPrompt);
    closeNow();
  }

  function retryLoad() {
    setLoadState("loading");
    setError("");
    setConfirmDiscard(false);
    setLoadAttempt((value) => value + 1);
  }

  return (
    <div className="settings-overlay">
      <button className="settings-scrim" type="button" aria-label="Close settings" onClick={requestClose} />
      <section
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        aria-describedby={loadState === "ready" ? "settings-description" : undefined}
      >
        <header className="settings-header">
          <div>
            <p>Preferences</p>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button autoFocus type="button" onClick={requestClose} aria-label="Close settings"><X size={20} /></button>
        </header>

        {loadState === "loading" && (
          <div className="settings-state" role="status">
            <LoaderCircle className="settings-spinner" size={22} />
            <span>Loading settings…</span>
          </div>
        )}

        {loadState === "error" && (
          <div className="settings-state settings-load-error" role="alert">
            <AlertCircle size={22} />
            <strong>Settings could not be loaded</strong>
            <span>{error}</span>
            <button type="button" onClick={retryLoad}>Retry</button>
          </div>
        )}

        {loadState === "ready" && (
          <>
            <div className="settings-field">
              <div className="settings-label-row">
                <label htmlFor="system-prompt">System prompt</label>
                <span>{draft.length.toLocaleString()} / {MAX_SYSTEM_PROMPT_LENGTH.toLocaleString()}</span>
              </div>
              <p id="settings-description">
                Used for new conversations and reinforced every five user turns. Saving an empty prompt disables it.
              </p>
              <textarea
                ref={textareaRef}
                id="system-prompt"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={MAX_SYSTEM_PROMPT_LENGTH}
                rows={11}
                placeholder="Describe how the assistant should behave…"
                disabled={saving}
              />
            </div>

            {error && <div className="settings-save-error" role="alert">{error}</div>}

            {confirmDiscard ? (
              <div className="settings-discard" role="alertdialog" aria-label="Discard unsaved changes?">
                <div>
                  <strong>Discard unsaved changes?</strong>
                  <span>Your last saved system prompt will be kept.</span>
                </div>
                <div>
                  <button ref={keepEditingRef} type="button" onClick={() => setConfirmDiscard(false)}>Keep editing</button>
                  <button className="danger-button" type="button" onClick={discardChanges}>Discard</button>
                </div>
              </div>
            ) : (
              <footer className="settings-actions">
                <span>Ctrl/⌘ + S to save</span>
                <div>
                  <button type="button" onClick={requestClose} disabled={saving}>Cancel</button>
                  <button className="settings-save" type="button" onClick={() => void saveSettings()} disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </footer>
            )}
          </>
        )}
      </section>
    </div>
  );
}
