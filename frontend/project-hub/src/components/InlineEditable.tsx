import { useState } from "react";

interface InlineEditableProps {
  value: string;
  onSave: (next: string) => void;
  multiline?: boolean;
  required?: boolean;
  placeholder?: string;
  canEdit?: boolean;
  className?: string; // typography, reused in both modes so the size doesn't jump
}

export function InlineEditable({
  value,
  onSave,
  multiline = false,
  required = false,
  placeholder = "",
  canEdit = true,
  className = "",
}: InlineEditableProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const startEditing = () => {
    if (!canEdit) return;
    setDraft(value); 
    setIsEditing(true);
  };

  // Runs when the field loses focus (click elsewhere, Tab)
  const commit = () => {
    setIsEditing(false);

    const next = draft.trim();
    if (next === value.trim()) return; 
    if (required && !next) return; 
    onSave(next);
  };

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={startEditing}
        disabled={!canEdit}
        className={`-mx-2 rounded-md px-2 py-1 text-left whitespace-pre-wrap wrap-break-word transition-colors ${
          canEdit ? "cursor-text hover:bg-zinc-800/60" : "cursor-default"
        } ${className}`}
      >
        {value || <span className="text-zinc-500">{placeholder}</span>}
      </button>
    );
  }

  const fieldClass = `-mx-2 w-full rounded-md border border-violet-500 bg-zinc-950 px-2 py-1 outline-none ${className}`;

  return multiline ? (
    <textarea
      autoFocus
      rows={3}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      className={fieldClass}
    />
  ) : (
    <input
      autoFocus
      type="text"
      value={draft}
      maxLength={100}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      className={fieldClass}
    />
  );
}