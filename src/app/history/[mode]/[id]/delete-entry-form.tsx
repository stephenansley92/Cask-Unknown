"use client";

import { useFormStatus } from "react-dom";
import { deleteHistoryEntryAction } from "./actions";

type DeleteEntryFormProps = {
  mode: "blind" | "rate";
  entryId: string;
  returnTo: string;
};

function DeleteButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-4 py-2 font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
    >
      {pending ? "Deleting..." : "Delete"}
    </button>
  );
}

export default function DeleteEntryForm({
  mode,
  entryId,
  returnTo,
}: DeleteEntryFormProps) {
  return (
    <form
      action={deleteHistoryEntryAction}
      onSubmit={(event) => {
        if (!window.confirm("Are you sure you want to delete?")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <DeleteButton />
    </form>
  );
}
