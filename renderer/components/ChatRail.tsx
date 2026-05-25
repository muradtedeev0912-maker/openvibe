import React from "react";
import { SidebarToggleIcon } from "./icons.js";
import { useT } from "../i18n.js";

interface Props {
  expanded: boolean;
  onToggleExpanded: () => void;
  onSettings: () => void;
}

export function ChatRail({
  expanded,
  onToggleExpanded,
  onSettings,
}: Props): React.ReactElement {
  const t = useT();

  return (
    <div className="chatrail">
      <button
        className={
          "chatrail__top" + (expanded ? " chatrail__top--active" : "")
        }
        onClick={onToggleExpanded}
        title={expanded ? t("rail.hide_sessions") : t("rail.show_sessions")}
        aria-label={t("rail.toggle_sessions")}
      >
        <SidebarToggleIcon />
      </button>

      <div className="chatrail__bottom">
        <button
          className="chatrail__settings"
          title={t("rail.settings")}
          aria-label={t("rail.settings")}
          onClick={onSettings}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.08 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.08z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
