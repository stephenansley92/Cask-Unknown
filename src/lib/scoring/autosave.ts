// Debounced autosave engine for per-pour score drafts.
//
// Guarantees the score page relies on:
// - the save callback always receives the draft as it exists when the save
//   actually runs, never a stale snapshot captured when it was scheduled
// - each key (pour) has its own debounce timer, so editing one pour cannot
//   cancel another pour's pending save
// - saves for the same key run one at a time in order, so a slow older
//   request can never overwrite a newer draft on the server
export type ScoreAutosave<TDraft, TExtra = void> = {
  setDraft(key: string, draft: TDraft): void;
  getDraft(key: string): TDraft | undefined;
  schedule(key: string): void;
  hasPending(key: string): boolean;
  flush(key: string): Promise<void>;
  flushAll(): Promise<void>;
  saveNow(key: string, extra?: TExtra): Promise<void>;
};

export function createScoreAutosave<TDraft, TExtra = void>(options: {
  debounceMs: number;
  save: (key: string, draft: TDraft, extra?: TExtra) => Promise<void>;
}): ScoreAutosave<TDraft, TExtra> {
  const drafts = new Map<string, TDraft>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const chains = new Map<string, Promise<void>>();

  const cancelTimer = (key: string) => {
    const timer = timers.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(key);
    }
  };

  const saveNow = (key: string, extra?: TExtra) => {
    cancelTimer(key);
    const prev = chains.get(key) ?? Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(() => {
        const draft = drafts.get(key);
        if (draft === undefined) return;
        return options.save(key, draft, extra);
      });
    chains.set(key, next);
    return next;
  };

  return {
    setDraft(key, draft) {
      drafts.set(key, draft);
    },
    getDraft(key) {
      return drafts.get(key);
    },
    schedule(key) {
      cancelTimer(key);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          void saveNow(key);
        }, options.debounceMs)
      );
    },
    hasPending(key) {
      return timers.has(key);
    },
    flush(key) {
      if (!timers.has(key)) {
        return chains.get(key) ?? Promise.resolve();
      }
      return saveNow(key);
    },
    flushAll() {
      const pending = [...timers.keys()].map((key) => saveNow(key));
      return Promise.all(pending).then(() => undefined);
    },
    saveNow,
  };
}
