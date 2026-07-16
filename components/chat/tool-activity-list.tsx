import { BookOpen, ChevronDown, CircleAlert, LoaderCircle, Search } from "lucide-react";
import type { ToolActivity } from "@/lib/tool-activity";

function safeLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function hostname(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "webpage";
  }
}

function label(activity: ToolActivity) {
  if (activity.kind === "search") {
    return activity.status === "running"
      ? `Searching for “${activity.query || "the web"}”`
      : `Searched for “${activity.query || "the web"}”`;
  }
  return activity.status === "running"
    ? `Reading ${hostname(activity.url ?? "")}`
    : `Read ${hostname(activity.url ?? "")}`;
}

export function ToolActivityList({ activities }: { activities: ToolActivity[] }) {
  if (!activities.length) return null;

  return (
    <div className="tool-activity-list" aria-label="Web activity">
      {activities.map((activity) => {
        const Icon = activity.status === "error"
          ? CircleAlert
          : activity.kind === "search"
            ? Search
            : BookOpen;
        return (
          <details className={`tool-activity tool-${activity.status}`} key={activity.id}>
            <summary>
              <Icon size={15} />
              <span>{label(activity)}</span>
              {activity.status === "running" && <LoaderCircle className="tool-spinner" size={14} />}
              <ChevronDown className="tool-chevron" size={14} />
            </summary>
            <div className="tool-activity-detail">
              {activity.error && <p className="tool-error">{activity.error}</p>}
              {activity.kind === "read" && activity.url && safeLink(activity.url) && (
                <p>
                  <a href={safeLink(activity.url) ?? undefined} target="_blank" rel="noreferrer">
                    {activity.url}
                  </a>
                  {activity.extraction_mode && <span className="tool-mode">{activity.extraction_mode} extraction</span>}
                </p>
              )}
              {activity.kind === "search" && activity.sources.length > 0 && (
                <ol>
                  {activity.sources.map((source) => (
                    <li key={source.url}>
                      {safeLink(source.url) ? (
                        <a href={safeLink(source.url) ?? undefined} target="_blank" rel="noreferrer">
                          {source.title}
                        </a>
                      ) : <span>{source.title}</span>}
                      <small>{hostname(source.url)}</small>
                      {source.snippet && <p>{source.snippet}</p>}
                    </li>
                  ))}
                </ol>
              )}
              {activity.status === "running" && <p>Waiting for the provider…</p>}
            </div>
          </details>
        );
      })}
    </div>
  );
}
