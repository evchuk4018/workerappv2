"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, LoaderCircle, Pin, PinOff, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import type { MemoryChange, MemoryProfile, MemoryRecord, MemoryReview, MemorySettings, MemoryType } from "@/lib/memory/types";

const TYPES: MemoryType[] = ["instruction", "preference", "fact", "goal", "constraint", "project", "relationship", "event", "temporary"];

function Toggle({ checked, label, description, disabled, onChange }: {
  checked: boolean; label: string; description: string; disabled: boolean; onChange: (value: boolean) => void;
}) {
  return <label className="memory-toggle"><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></label>;
}

export function MemorySettingsPanel({ value, onChange, disabled }: {
  value: MemorySettings; onChange: (settings: MemorySettings) => void; disabled: boolean;
}) {
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [profiles, setProfiles] = useState<MemoryProfile[]>([]);
  const [reviews, setReviews] = useState<MemoryReview[]>([]);
  const [changes, setChanges] = useState<MemoryChange[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState<MemoryType>("preference");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sources, setSources] = useState<Record<string, Array<Record<string, string>>>>({});

  const loadData = useCallback(async (search: string) => {
    setLoading(true); setError("");
    try {
      const [memoryResponse, activityResponse] = await Promise.all([
        fetch(`/api/memories?query=${encodeURIComponent(search)}`, { cache: "no-store" }),
        fetch("/api/memory", { cache: "no-store" }),
      ]);
      const memoryData = await memoryResponse.json();
      const activityData = await activityResponse.json();
      if (!memoryResponse.ok || !activityResponse.ok) throw new Error(memoryData.error || activityData.error || "Unable to load memory.");
      setMemories(memoryData.memories ?? []); setProfiles(activityData.profiles ?? []);
      setReviews(activityData.reviews ?? []); setChanges(activityData.changes ?? []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load memory."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadData(""), 0);
    return () => window.clearTimeout(timeout);
  }, [loadData]);

  async function createMemory() {
    if (!newContent.trim()) return;
    const response = await fetch("/api/memories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: newContent, memoryType: newType }) });
    if (!response.ok) { setError("Unable to create memory."); return; }
    setNewContent(""); await loadData(query);
  }

  async function patchMemory(id: string, body: Record<string, unknown>) {
    const response = await fetch(`/api/memories/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) { setError("Unable to update memory."); return; }
    setEditingId(null); await loadData(query);
  }

  async function forgetMemory(id: string) {
    if (!window.confirm("Forget this memory? Its content and provenance will be erased.")) return;
    const response = await fetch(`/api/memories/${id}`, { method: "DELETE" });
    if (!response.ok) { setError("Unable to forget memory."); return; }
    await loadData(query);
  }

  async function clearMemories(scope: "inferred" | "all") {
    if (!window.confirm(scope === "all" ? "Forget all saved memories?" : "Clear all inferred memories?")) return;
    const response = await fetch("/api/memories/clear", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope }) });
    if (!response.ok) { setError("Unable to clear memories."); return; }
    await loadData(query);
  }

  async function toggleSources(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id); if (sources[id]) return;
    const response = await fetch(`/api/memories/${id}`);
    if (!response.ok) return;
    const data = await response.json();
    setSources((current) => ({ ...current, [id]: data.sources ?? [] }));
  }

  async function profileAction(action: "refresh" | "rollback", profileId?: string) {
    const response = await fetch("/api/memory/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(profileId ? { profileId } : {}) }) });
    if (!response.ok) { setError("Unable to queue profile action."); return; }
    await loadData(query);
  }

  async function review(id: string, decision: "accept" | "reject") {
    const response = await fetch(`/api/memory/reviews/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
    if (!response.ok) { setError("Unable to review memory."); return; }
    await loadData(query);
  }

  const activeProfile = profiles.find((profile) => profile.status === "active");
  return <div className="memory-settings">
    <section className="memory-toggles">
      <Toggle checked={value.savedMemoryEnabled} disabled={disabled} label="Saved memories" description="Use and save durable preferences, facts, goals, and instructions." onChange={(checked) => onChange({ ...value, savedMemoryEnabled: checked })} />
      <Toggle checked={value.previousConversationsEnabled} disabled={disabled} label="Previous conversations" description="Use incremental summaries from other chats when relevant." onChange={(checked) => onChange({ ...value, previousConversationsEnabled: checked })} />
      <Toggle checked={value.inferredMemoryEnabled} disabled={disabled || !value.savedMemoryEnabled} label="Automatic inferred memory" description="Allow high-confidence, non-conflicting inferences." onChange={(checked) => onChange({ ...value, inferredMemoryEnabled: checked })} />
      <Toggle checked={value.writeMode === "read_only"} disabled={disabled} label="Read-only memory" description="Use existing memory without learning anything new." onChange={(checked) => onChange({ ...value, writeMode: checked ? "read_only" : "read_write" })} />
    </section>
    <section className="memory-profile-card">
      <header><strong>Active profile</strong><button type="button" onClick={() => void profileAction("refresh")}><RefreshCw size={14} /> Refresh</button></header>
      <p>{activeProfile?.profile_text || "No synthesized profile yet."}</p>
      {profiles.filter((profile) => profile.id !== activeProfile?.id).slice(0, 5).map((profile) => <button className="profile-history" type="button" key={profile.id} onClick={() => void profileAction("rollback", profile.id)}><RotateCcw size={13} /> Restore version {profile.version} · {new Date(profile.created_at).toLocaleDateString()}</button>)}
    </section>
    <section className="memory-browser">
      <header><strong>Saved memories</strong><span>{memories.length}</span></header>
      <form onSubmit={(event) => { event.preventDefault(); void loadData(query); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search memories" /><button type="submit">Search</button></form>
      <div className="memory-create"><select value={newType} onChange={(event) => setNewType(event.target.value as MemoryType)}>{TYPES.map((type) => <option key={type}>{type}</option>)}</select><input value={newContent} onChange={(event) => setNewContent(event.target.value)} placeholder="Add an explicit memory" /><button type="button" onClick={() => void createMemory()} aria-label="Add memory"><Plus size={15} /></button></div>
      {loading ? <div className="memory-loading"><LoaderCircle size={17} /> Loading…</div> : memories.map((memory) => <article className="memory-row" key={memory.id}>
        <div className="memory-row-main"><span className="memory-kind">{memory.memory_type} · {memory.origin}</span>{editingId === memory.id ? <input value={editContent} onChange={(event) => setEditContent(event.target.value)} /> : <p>{memory.canonical_content}</p>}</div>
        <div className="memory-row-actions">
          {editingId === memory.id ? <button type="button" onClick={() => void patchMemory(memory.id, { content: editContent, memoryType: memory.memory_type, salience: memory.salience, validUntil: memory.valid_until })}>Save</button> : <button type="button" onClick={() => { setEditingId(memory.id); setEditContent(memory.canonical_content ?? ""); }}>Edit</button>}
          <button type="button" onClick={() => void patchMemory(memory.id, { pinned: !memory.pinned })} aria-label={memory.pinned ? "Unpin" : "Pin"}>{memory.pinned ? <PinOff size={14} /> : <Pin size={14} />}</button>
          <button type="button" onClick={() => void toggleSources(memory.id)} aria-label="Show provenance">{expandedId === memory.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
          <button type="button" onClick={() => void forgetMemory(memory.id)} aria-label="Forget"><Trash2 size={14} /></button>
        </div>
        {expandedId === memory.id && <div className="memory-sources">{sources[memory.id]?.length ? sources[memory.id].map((source) => <a key={source.id} href={`/c/${source.conversation_id}`}>{source.source_kind} · {new Date(source.created_at).toLocaleString()}</a>) : "No retained provenance."}</div>}
      </article>)}
    </section>
    {reviews.some((item) => item.state === "pending") && <section className="memory-review-list"><strong>Needs review</strong>{reviews.filter((item) => item.state === "pending").map((item) => <article key={item.id}><p>{item.proposed_content || item.reason}</p><div><button type="button" onClick={() => void review(item.id, "reject")}>Reject</button><button type="button" onClick={() => void review(item.id, "accept")}>Accept</button></div></article>)}</section>}
    <section className="memory-changes"><strong>Recent changes</strong>{changes.slice(0, 8).map((change) => <p key={change.id}>{change.action.replaceAll("_", " ")} · {new Date(change.created_at).toLocaleString()}</p>)}</section>
    <div className="memory-danger"><button type="button" onClick={() => void clearMemories("inferred")}>Clear inferred</button><button type="button" onClick={() => void clearMemories("all")}>Clear all memory</button></div>
    {error && <div className="settings-save-error" role="alert">{error}</div>}
  </div>;
}
