"use client";

import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { CurrentGeneration } from "./stream-event";
import { CHAT_FILES_BUCKET, validateInputFiles } from "@/lib/chat-files";
import type { MemoryMode } from "@/lib/memory/types";
import type { ModelPreset } from "@/lib/models";
import {
  createBrowserPythonRunner,
  type BrowserPythonPhase,
  type BrowserPythonRunResult,
} from "@/lib/python";
import { parseNdjsonBuffer, type PythonStreamInput, type StreamEvent } from "@/lib/streaming";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PythonToolActivity } from "@/lib/tool-activity";
import type { ChatMessage } from "@/lib/types";

type PythonRequestEvent = Extract<StreamEvent, { type: "python_request" }>;
type Ids = { user: string; assistant: string };

interface StartResponse {
  runId: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  title: string;
  uploads: Array<{
    fileId: string; objectPath: string; name: string; mimeType: string; sizeBytes: number;
  }>;
}

interface HookOptions {
  preset: ModelPreset;
  memoryMode: MemoryMode;
  activeConversationId: string | null;
  generationRef: MutableRefObject<CurrentGeneration | null>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setIsStreaming: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  onEvent: (event: StreamEvent, ids: Ids, conversationId: string | null) => void;
  onSettled: () => void;
}

async function responseError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error || fallback);
}

function phaseName(phase: BrowserPythonPhase): PythonToolActivity["phase"] {
  if (phase === "installing") return "installing";
  if (phase === "executing") return "running";
  if (phase === "collecting") return "uploading";
  return "loading";
}

export function useChatRunner(options: HookOptions) {
  const runnerRef = useRef<ReturnType<typeof createBrowserPythonRunner> | null>(null);
  const runIdRef = useRef<string | null>(null);

  useEffect(() => () => runnerRef.current?.dispose(), []);

  function updatePythonProgress(callId: string, phase: BrowserPythonPhase, ids: Ids) {
    const activity = options.generationRef.current?.activities.find(
      (item): item is PythonToolActivity => item.id === callId && item.kind === "python",
    );
    if (activity) options.onEvent({
      type: "tool_activity", activity: { ...activity, phase: phaseName(phase) },
    }, ids, options.activeConversationId);
  }

  async function consume(response: Response, ids: Ids, conversationId: string | null) {
    if (!response.ok || !response.body) throw await responseError(response, "The response failed.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let pythonRequest: PythonRequestEvent | null = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseNdjsonBuffer(buffer);
      buffer = parsed.remainder;
      for (const event of parsed.events) {
        options.onEvent(event, ids, conversationId);
        if (event.type === "python_request") pythonRequest = event;
      }
    }
    if (buffer.trim()) {
      const event = JSON.parse(buffer) as StreamEvent;
      options.onEvent(event, ids, conversationId);
      if (event.type === "python_request") pythonRequest = event;
    }
    return pythonRequest;
  }

  async function inputBytes(inputs: PythonStreamInput[]) {
    const supabase = createSupabaseBrowserClient();
    return Promise.all(inputs.map(async (input) => {
      const { data, error } = await supabase.storage.from(CHAT_FILES_BUCKET).download(input.objectPath);
      if (error || !data) throw new Error(`Unable to load ${input.name}.`);
      return { path: input.path, data: await data.arrayBuffer(), mimeType: input.mimeType };
    }));
  }

  async function executePython(event: PythonRequestEvent, ids: Ids) {
    const runner = createBrowserPythonRunner();
    runnerRef.current = runner;
    let result: BrowserPythonRunResult;
    try {
      result = await runner.run({
        code: event.request.code,
        packages: event.request.packages,
        inputs: await inputBytes(event.inputs),
      }, ({ phase }) => updatePythonProgress(event.request.callId, phase, ids));
    } catch (caught) {
      result = {
        stdout: "", stderr: "", finalValue: null,
        error: caught instanceof Error ? caught.message : "Python execution failed.",
        outputs: [], resolvedPackages: [], durationMs: 0,
      };
    } finally {
      runner.dispose();
      if (runnerRef.current === runner) runnerRef.current = null;
    }

    let artifactFileIds: string[] = [];
    if (result.outputs.length) {
      let registered = false;
      try {
        const prepared = await fetch(`/api/chat/runs/${event.runId}/artifacts`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callToken: event.callToken, files: result.outputs.map((output) => ({
            name: output.path.split("/").pop() || "output.txt",
            mimeType: output.mimeType, sizeBytes: output.sizeBytes,
          })) }),
        });
        if (!prepared.ok) throw await responseError(prepared, "Unable to register Python files.");
        registered = true;
        const body = (await prepared.json()) as StartResponse;
        const supabase = createSupabaseBrowserClient();
        await Promise.all(body.uploads.map(async (upload, index) => {
          const output = result.outputs[index];
          const { error } = await supabase.storage.from(CHAT_FILES_BUCKET).upload(
            upload.objectPath, new Blob([output.data], { type: output.mimeType }),
            { contentType: output.mimeType, upsert: false },
          );
          if (error) throw new Error(`Unable to upload ${upload.name}.`);
        }));
        artifactFileIds = body.uploads.map((upload) => upload.fileId);
      } catch (caught) {
        if (registered) {
          await fetch(`/api/chat/runs/${event.runId}/artifacts`, {
            method: "DELETE", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callToken: event.callToken }),
          }).catch(() => undefined);
        }
        const uploadError = caught instanceof Error ? caught.message : "Generated-file upload failed.";
        result = { ...result, error: result.error ? `${result.error}\n${uploadError}` : uploadError, outputs: [] };
      }
    }
    return {
      callToken: event.callToken, stdout: result.stdout, stderr: result.stderr,
      value: result.finalValue, error: result.error, durationMs: result.durationMs,
      resolvedPackages: result.resolvedPackages, artifactFileIds,
    };
  }

  async function continueUntilDone(
    runId: string,
    ids: Ids,
    conversationId: string | null,
    firstRequest?: PythonRequestEvent | null,
  ) {
    let pending = firstRequest;
    while (true) {
      const pythonResult = pending ? await executePython(pending, ids) : undefined;
      const response = await fetch(`/api/chat/runs/${runId}/continue`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pythonResult ? { pythonResult } : {}),
        signal: options.generationRef.current?.controller.signal,
      });
      pending = await consume(response, ids, conversationId);
      if (!pending) return;
    }
  }

  async function send(message: string, files: File[], ids: Ids) {
    validateInputFiles(files.map((file) => ({ name: file.name, mimeType: file.type, sizeBytes: file.size })));
    const response = await fetch("/api/chat/start", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: options.activeConversationId, message, preset: options.preset,
        memoryMode: options.memoryMode,
        attachments: files.map((file) => ({ name: file.name, mimeType: file.type, sizeBytes: file.size })),
      }),
      signal: options.generationRef.current?.controller.signal,
    });
    if (!response.ok) throw await responseError(response, "Unable to start the response.");
    const started = (await response.json()) as StartResponse;
    runIdRef.current = started.runId;
    options.onEvent({
      type: "meta", conversationId: started.conversationId,
      userMessageId: started.userMessageId, assistantMessageId: started.assistantMessageId,
      title: started.title,
    }, ids, options.activeConversationId);
    options.setMessages((current) => current.map((item) => item.id === ids.user ? {
      ...item,
      attachments: started.uploads.map((file) => ({
        id: file.fileId, name: file.name, mime_type: file.mimeType, size_bytes: file.sizeBytes,
        created_at: new Date().toISOString(), download_url: `/api/files/${file.fileId}/content?download=1`,
      })),
    } : item));
    const supabase = createSupabaseBrowserClient();
    try {
      await Promise.all(started.uploads.map(async (upload, index) => {
        const { error } = await supabase.storage.from(CHAT_FILES_BUCKET).upload(upload.objectPath, files[index], {
          contentType: upload.mimeType, upsert: false,
        });
        if (error) throw new Error(`Unable to upload ${upload.name}.`);
      }));
      if (started.uploads.length) {
        const finalized = await fetch(`/api/chat/runs/${started.runId}/uploads`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "finalize" }),
        });
        if (!finalized.ok) throw await responseError(finalized, "Unable to verify input uploads.");
      }
    } catch (caught) {
      await fetch(`/api/chat/runs/${started.runId}/uploads`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "abort" }),
      }).catch(() => undefined);
      throw caught;
    }
    await continueUntilDone(started.runId, ids, options.activeConversationId);
  }

  async function resume(runId: string, ids: Ids, conversationId: string) {
    runIdRef.current = runId;
    while (true) {
      const response = await fetch(`/api/chat/runs/${runId}/pending`, {
        signal: options.generationRef.current?.controller.signal,
      });
      if (!response.ok) throw await responseError(response, "Unable to recover Python.");
      const pending = await response.json() as PythonRequestEvent & {
        status: string; retryAfterMs?: number; message?: ChatMessage | null;
      };
      if (pending.status === "awaiting_python") {
        await continueUntilDone(runId, ids, conversationId, {
          type: "python_request", runId, callToken: pending.callToken,
          request: pending.request, inputs: pending.inputs,
        });
        return;
      }
      if (pending.status === "ready") {
        await continueUntilDone(runId, ids, conversationId);
        return;
      }
      if (pending.status === "uploading") {
        const finalized = await fetch(`/api/chat/runs/${runId}/uploads`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "finalize" }),
          signal: options.generationRef.current?.controller.signal,
        });
        if (finalized.ok) continue;
        await fetch(`/api/chat/runs/${runId}/uploads`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "abort" }),
        });
        throw await responseError(finalized, "Interrupted input uploads could not be recovered.");
      }
      if (pending.status !== "streaming") {
        if (pending.message) {
          options.setMessages((current) => current.map((message) =>
            message.id === pending.message!.id ? pending.message! : message));
        }
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const signal = options.generationRef.current?.controller.signal;
        const timer = window.setTimeout(resolve, pending.retryAfterMs ?? 2_000);
        signal?.addEventListener("abort", () => {
          window.clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      });
    }
  }

  function reset() {
    runnerRef.current?.reset();
    runIdRef.current = null;
  }

  return { send, resume, reset, runIdRef };
}
