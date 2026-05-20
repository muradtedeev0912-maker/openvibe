import React, { useEffect } from "react";
import type { ConfirmPayload } from "../types.js";

interface Props {
  payload: ConfirmPayload;
  onDecide: (decision: "yes" | "no" | "always") => void;
}

export function Confirm({ payload, onDecide }: Props): React.ReactElement {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const k = e.key.toLowerCase();
      if (k === "y") onDecide("yes");
      else if (k === "a") onDecide("always");
      else if (k === "n" || e.key === "Escape") onDecide("no");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDecide]);

  let preview = "";
  try {
    preview = JSON.stringify(payload.args, null, 2);
  } catch {
    preview = "";
  }
  if (preview.length > 1200) preview = preview.slice(0, 1200) + "…";

  return (
    <div className="confirm">
      <div className="confirm__title">
        Approve tool call: <code>{payload.toolName}</code>
      </div>
      {preview ? <div className="confirm__args">{preview}</div> : null}
      <div className="confirm__buttons">
        <button
          className="confirm__btn confirm__btn--yes"
          onClick={() => onDecide("yes")}
        >
          <kbd>Y</kbd> Yes, run it
        </button>
        <button
          className="confirm__btn confirm__btn--always"
          onClick={() => onDecide("always")}
        >
          <kbd>A</kbd> Always allow this tool
        </button>
        <button
          className="confirm__btn confirm__btn--no"
          onClick={() => onDecide("no")}
        >
          <kbd>N</kbd> No, skip
        </button>
      </div>
    </div>
  );
}
