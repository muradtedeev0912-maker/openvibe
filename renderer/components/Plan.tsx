import React from "react";
import { useT } from "../i18n.js";
import { usePlans, toggleStep, deleteTask, clearAllTasks, progress, type PlanStep } from "../planStore.js";

interface Props {
  projectId: string | null;
  onClose: () => void;
  onRunStep?: (stepId: string, stepText: string) => void;
  /** id of the step the agent is currently executing, if any */
  runningStepId?: string | null;
}

function PlanStepRow({
  projectId,
  taskId,
  step,
  depth = 0,
  onRunStep,
  runningStepId,
}: {
  projectId: string | null;
  taskId: string;
  step: PlanStep;
  depth?: number;
  onRunStep?: (stepId: string, stepText: string) => void;
  runningStepId?: string | null;
}): React.ReactElement {
  const isRunning = runningStepId === step.id;
  return (
    <>
      <li
        className={
          "plan-step" +
          (step.done ? " plan-step--done" : "") +
          (isRunning ? " plan-step--running" : "")
        }
        style={{ paddingLeft: 10 + depth * 20 }}
      >
        <span
          className="plan-step__check"
          onClick={() => projectId && toggleStep(projectId, taskId, step.id)}
        >
          {step.done ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : null}
        </span>
        <span className="plan-step__text">{step.text}</span>
        {!step.done && onRunStep ? (
          <button
            type="button"
            className="plan-step__run"
            onClick={(e) => {
              e.stopPropagation();
              if (isRunning) return;
              onRunStep(step.id, step.text);
            }}
            disabled={isRunning || !!runningStepId}
            title={isRunning ? "Running…" : "Run this step"}
            aria-label="Run this step"
          >
            {isRunning ? (
              <span className="plan-step__spinner" aria-hidden />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="5 12 19 12" />
                <polyline points="13 6 19 12 13 18" />
              </svg>
            )}
          </button>
        ) : null}
      </li>
      {step.children && step.children.length > 0
        ? step.children.map((child) => (
            <PlanStepRow
              key={child.id}
              projectId={projectId}
              taskId={taskId}
              step={child}
              depth={depth + 1}
              onRunStep={onRunStep}
              runningStepId={runningStepId}
            />
          ))
        : null}
    </>
  );
}

function ProgressRing({ pct }: { pct: number }): React.ReactElement {
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  return (
    <span className="plan-ring" title={`${pct}%`}>
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
        <circle cx="9" cy="9" r={radius} stroke="var(--line-strong)" strokeWidth="2" fill="none" />
        <circle
          cx="9"
          cy="9"
          r={radius}
          stroke="var(--fg)"
          strokeWidth="2"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 9 9)"
          style={{ transition: "stroke-dashoffset 0.35s cubic-bezier(0.4, 0, 0.2, 1)" }}
        />
      </svg>
    </span>
  );
}

export function Plan({ projectId, onClose, onRunStep, runningStepId }: Props): React.ReactElement {
  const t = useT();
  const tasks = usePlans(projectId);

  return (
    <div className="plan">
      <div className="plan__head">
        <div className="plan__title">{t("plan.title")}</div>
        <div className="plan__head-actions">
          <button className="plan__close" onClick={onClose} aria-label={t("common.close")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="plan__body">
        {tasks.length === 0 ? (
          <div className="plan__empty">{t("plan.empty")}</div>
        ) : (
          tasks.map((task) => {
            const { done, total, pct } = progress(task);
            return (
              <div key={task.id} className="plan-task">
                <div className="plan-task__head">
                  <ProgressRing pct={pct} />
                  <div className="plan-task__title" title={task.title}>{task.title}</div>
                  <div className="plan-task__meta" title={`${done}/${total} · ${pct}%`}>
                    {total > 0 ? `${done}/${total}` : ""}
                  </div>
                  <button
                    className="plan-task__delete"
                    onClick={() => projectId && deleteTask(projectId, task.id)}
                    title={t("common.delete")}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                {task.steps.length > 0 ? (
                  <ul className="plan-task__steps">
                    {task.steps.map((step) => (
                      <PlanStepRow
                        key={step.id}
                        projectId={projectId}
                        taskId={task.id}
                        step={step}
                        onRunStep={onRunStep}
                        runningStepId={runningStepId}
                      />
                    ))}
                  </ul>
                ) : (
                  <div className="plan-task__empty">{t("plan.no_steps")}</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
