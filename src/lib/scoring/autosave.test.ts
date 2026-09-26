import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createScoreAutosave } from "./autosave";

type Draft = { value: number };

describe("createScoreAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves the latest draft, not the one present when the save was scheduled", async () => {
    // Regression test: the old page implementation captured the draft in a
    // stale render closure, so the final slider change was silently dropped.
    const saved: Draft[] = [];
    const autosave = createScoreAutosave<Draft>({
      debounceMs: 500,
      save: async (_key, draft) => {
        saved.push(draft);
      },
    });

    autosave.setDraft("pour-a", { value: 1 });
    autosave.schedule("pour-a");
    autosave.setDraft("pour-a", { value: 2 });
    autosave.schedule("pour-a");

    await vi.advanceTimersByTimeAsync(500);

    expect(saved).toEqual([{ value: 2 }]);
  });

  it("debounces per key so editing one pour does not cancel another pour's save", async () => {
    const saved: Array<[string, Draft]> = [];
    const autosave = createScoreAutosave<Draft>({
      debounceMs: 500,
      save: async (key, draft) => {
        saved.push([key, draft]);
      },
    });

    autosave.setDraft("pour-a", { value: 10 });
    autosave.schedule("pour-a");

    await vi.advanceTimersByTimeAsync(300);
    autosave.setDraft("pour-b", { value: 20 });
    autosave.schedule("pour-b");

    await vi.advanceTimersByTimeAsync(500);

    expect(saved).toEqual([
      ["pour-a", { value: 10 }],
      ["pour-b", { value: 20 }],
    ]);
  });

  it("flush saves a pending draft immediately", async () => {
    const saved: Draft[] = [];
    const autosave = createScoreAutosave<Draft>({
      debounceMs: 500,
      save: async (_key, draft) => {
        saved.push(draft);
      },
    });

    autosave.setDraft("pour-a", { value: 7 });
    autosave.schedule("pour-a");
    expect(autosave.hasPending("pour-a")).toBe(true);

    await autosave.flush("pour-a");

    expect(saved).toEqual([{ value: 7 }]);
    expect(autosave.hasPending("pour-a")).toBe(false);

    // The debounce window elapsing must not save a second time.
    await vi.advanceTimersByTimeAsync(500);
    expect(saved).toEqual([{ value: 7 }]);
  });

  it("flush without a pending save does not call save again", async () => {
    const save = vi.fn(async () => {});
    const autosave = createScoreAutosave<Draft>({ debounceMs: 500, save });

    autosave.setDraft("pour-a", { value: 1 });
    await autosave.flush("pour-a");

    expect(save).not.toHaveBeenCalled();
  });

  it("flushAll saves every pending key", async () => {
    const saved: Array<[string, Draft]> = [];
    const autosave = createScoreAutosave<Draft>({
      debounceMs: 500,
      save: async (key, draft) => {
        saved.push([key, draft]);
      },
    });

    autosave.setDraft("pour-a", { value: 1 });
    autosave.schedule("pour-a");
    autosave.setDraft("pour-b", { value: 2 });
    autosave.schedule("pour-b");

    await autosave.flushAll();

    expect(saved).toHaveLength(2);
    expect(saved).toContainEqual(["pour-a", { value: 1 }]);
    expect(saved).toContainEqual(["pour-b", { value: 2 }]);
  });

  it("serializes saves per key and reads the draft when each save runs", async () => {
    const started: number[] = [];
    const savedValues: number[] = [];
    let releaseFirst: () => void = () => {};

    const autosave = createScoreAutosave<Draft>({
      debounceMs: 500,
      save: (_key, draft) => {
        started.push(draft.value);
        savedValues.push(draft.value);
        if (started.length === 1) {
          return new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
        }
        return Promise.resolve();
      },
    });

    autosave.setDraft("pour-a", { value: 1 });
    const first = autosave.saveNow("pour-a");

    // Drain microtasks so the first save has begun (and captured value 1).
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual([1]);

    // While the first save is in flight, the user keeps editing.
    autosave.setDraft("pour-a", { value: 3 });
    const second = autosave.saveNow("pour-a");

    // The second save must not start until the first finishes.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual([1]);

    releaseFirst();
    await first;
    await second;

    // When it does run, it sees the newest draft.
    expect(savedValues).toEqual([1, 3]);
  });

  it("passes extra options through saveNow", async () => {
    const extras: Array<{ lock: boolean } | undefined> = [];
    const autosave = createScoreAutosave<Draft, { lock: boolean }>({
      debounceMs: 500,
      save: async (_key, _draft, extra) => {
        extras.push(extra);
      },
    });

    autosave.setDraft("pour-a", { value: 1 });
    await autosave.saveNow("pour-a", { lock: true });

    expect(extras).toEqual([{ lock: true }]);
  });

  it("keeps saving after a failed save", async () => {
    let calls = 0;
    const autosave = createScoreAutosave<Draft>({
      debounceMs: 500,
      save: async () => {
        calls += 1;
        if (calls === 1) throw new Error("network down");
      },
    });

    autosave.setDraft("pour-a", { value: 1 });
    await autosave.saveNow("pour-a").catch(() => {});

    autosave.setDraft("pour-a", { value: 2 });
    await autosave.saveNow("pour-a");

    expect(calls).toBe(2);
  });

  it("does nothing for a key that never received a draft", async () => {
    const save = vi.fn(async () => {});
    const autosave = createScoreAutosave<Draft>({ debounceMs: 500, save });

    autosave.schedule("pour-x");
    await vi.advanceTimersByTimeAsync(500);

    expect(save).not.toHaveBeenCalled();
  });
});
