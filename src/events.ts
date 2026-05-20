import { EventEmitter } from "node:events";

export type SessionEvent =
  | { kind: "user"; text: string }
  | { kind: "assistant-start" }
  | { kind: "assistant-chunk"; text: string }
  | { kind: "assistant-end" }
  | { kind: "tool-call"; id: string; name: string; args: unknown }
  | { kind: "tool-result"; id: string; ok: boolean; text: string }
  | { kind: "tool-denied"; id: string; name: string }
  | { kind: "fs-changed"; path?: string }
  | { kind: "info"; text: string }
  | { kind: "error"; text: string };

export interface ConfirmRequest {
  id: string;
  toolName: string;
  args: unknown;
  resolve: (decision: "yes" | "no" | "always") => void;
}

/** App-wide bus: agent emits events, UI subscribes and renders. */
export class SessionBus extends EventEmitter {
  emitEvent(event: SessionEvent): void {
    this.emit("event", event);
  }
  onEvent(listener: (e: SessionEvent) => void): () => void {
    this.on("event", listener);
    return () => this.off("event", listener);
  }
  requestConfirm(req: ConfirmRequest): void {
    this.emit("confirm", req);
  }
  onConfirm(listener: (req: ConfirmRequest) => void): () => void {
    this.on("confirm", listener);
    return () => this.off("confirm", listener);
  }
  setBusy(busy: boolean): void {
    this.emit("busy", busy);
  }
  onBusy(listener: (busy: boolean) => void): () => void {
    this.on("busy", listener);
    return () => this.off("busy", listener);
  }
}
