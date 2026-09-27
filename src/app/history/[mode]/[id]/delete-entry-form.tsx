"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";
import { ConfirmModal } from "@/components/confirm-modal";
import { Button } from "@/components/ui/button";
import { deleteHistoryEntryAction } from "./actions";

type DeleteEntryFormProps = {
  mode: "blind" | "rate";
  entryId: string;
  returnTo: string;
};

function DeleteButton({ onClick }: { onClick: () => void }) {
  const { pending } = useFormStatus();

  return (
    <Button variant="ghostDanger" size="sm" onClick={onClick} disabled={pending}>
      <Trash2 className="h-4 w-4" /> {pending ? "Deleting…" : "Delete"}
    </Button>
  );
}

export default function DeleteEntryForm({
  mode,
  entryId,
  returnTo,
}: DeleteEntryFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);

  return (
    <form ref={formRef} action={deleteHistoryEntryAction}>
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <DeleteButton onClick={() => setConfirming(true)} />
      <ConfirmModal
        open={confirming}
        title="Delete this rating?"
        message="It will be removed from your history and averages. This can't be undone."
        confirmLabel="Delete rating"
        cancelLabel="Keep it"
        dangerous
        onConfirm={() => {
          setConfirming(false);
          formRef.current?.requestSubmit();
        }}
        onCancel={() => setConfirming(false)}
      />
    </form>
  );
}
