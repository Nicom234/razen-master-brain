// Lightweight pub/sub. Mirrors `packages/sdk/src/event-hub.ts` from OpenClaw
// but uses async generators instead of an external EventEmitter.

import type { AgentEvent, AgentEventType } from "./types.ts";

type Listener = (e: AgentEvent) => void;

export class EventHub {
  private listeners = new Set<Listener>();

  emit(e: AgentEvent): void {
    for (const l of this.listeners) {
      try {
        l(e);
      } catch {
        // ignore — a bad listener must never break the run loop
      }
    }
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  once(type: AgentEventType): Promise<AgentEvent> {
    return new Promise((resolve) => {
      const off = this.on((e) => {
        if (e.type === type) {
          off();
          resolve(e);
        }
      });
    });
  }
}

let seq = 0;
export function makeEvent<T>(
  runId: string,
  type: AgentEventType,
  data: T,
): AgentEvent<T> {
  seq += 1;
  return {
    id: `${runId}.${seq}`,
    type,
    ts: Date.now(),
    runId,
    data,
  };
}
