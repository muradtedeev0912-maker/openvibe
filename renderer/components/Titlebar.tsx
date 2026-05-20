import React from "react";

export function Titlebar(): React.ReactElement {
  return (
    <div className="titlebar">
      <div className="titlebar__drag">
        <span className="titlebar__title">~open@root</span>
      </div>
      <div className="titlebar__controls">
        <button
          className="titlebar__btn"
          onClick={() => window.vibe.window.minimize()}
          title="Minimize"
          aria-label="Minimize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 6h8" />
          </svg>
        </button>
        <button
          className="titlebar__btn"
          onClick={() => window.vibe.window.maximize()}
          title="Maximize"
          aria-label="Maximize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="8" height="8" />
          </svg>
        </button>
        <button
          className="titlebar__btn titlebar__btn--close"
          onClick={() => window.vibe.window.close()}
          title="Close"
          aria-label="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
