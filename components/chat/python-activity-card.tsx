import { ChevronDown, CircleAlert, Code2, LoaderCircle } from "lucide-react";
import type { PythonActivityPhase, PythonToolActivity } from "@/lib/tool-activity";
import { ArtifactList } from "./artifact-list";

const PHASE_LABELS: Record<PythonActivityPhase, string> = {
  queued: "Preparing Python",
  loading: "Loading Python",
  installing: "Installing packages",
  running: "Running Python",
  uploading: "Saving generated files",
  completed: "Ran Python",
};

function activityLabel(activity: PythonToolActivity) {
  if (activity.status === "error") return "Python failed";
  if (activity.status === "completed") return "Ran Python";
  return PHASE_LABELS[activity.phase];
}

function LogBlock({ label, value, error = false }: {
  label: string;
  value: string;
  error?: boolean;
}) {
  if (!value) return null;
  return (
    <section className={`python-log${error ? " python-log-error" : ""}`}>
      <h4>{label}</h4>
      <pre>{value}</pre>
    </section>
  );
}

export function PythonActivityCard({ activity }: { activity: PythonToolActivity }) {
  const Icon = activity.status === "error" ? CircleAlert : Code2;
  return (
    <details className={`tool-activity python-activity tool-${activity.status}`}>
      <summary>
        <Icon size={15} />
        <span>{activityLabel(activity)}</span>
        {activity.status === "running" && <LoaderCircle className="tool-spinner" size={14} />}
        <ChevronDown className="tool-chevron" size={14} />
      </summary>
      <div className="python-activity-detail">
        {activity.error && <p className="tool-error">{activity.error}</p>}
        {activity.packages.length > 0 && (
          <p className="python-packages">
            Packages: <span>{activity.packages.join(", ")}</span>
          </p>
        )}
        {activity.code && (
          <section className="python-code">
            <h4>Code</h4>
            <pre><code>{activity.code}</code></pre>
          </section>
        )}
        <LogBlock label="Output" value={activity.stdout} />
        <LogBlock label="Errors" value={activity.stderr} error />
        <LogBlock label="Result" value={activity.final_value ?? ""} />
        <ArtifactList artifacts={activity.artifacts} />
        {activity.duration_ms !== undefined && (
          <p className="python-duration">Completed in {(activity.duration_ms / 1_000).toFixed(1)}s</p>
        )}
      </div>
    </details>
  );
}
