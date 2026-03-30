import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useState } from "react";
import PageHeader from "../components/shared/PageHeader";
import { CheckCircle2, Circle, Clock } from "lucide-react";

const PRIORITY_STYLES = {
  high: "text-red-400 bg-red-500/10 border-red-500/30",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  low: "text-green-400 bg-green-500/10 border-green-500/30",
};

const STATUS_ICON = {
  pending: <Circle className="w-4 h-4 text-muted-foreground" />,
  in_progress: <Clock className="w-4 h-4 text-yellow-400" />,
  done: <CheckCircle2 className="w-4 h-4 text-green-400" />,
};

const PRIORITY_LABEL = { high: "🔴 High", medium: "🟡 Medium", low: "🟢 Polish" };

export default function DevTodos() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");

  const { data: todos = [], isLoading } = useQuery({
    queryKey: ["dev-todos"],
    queryFn: () => maxikay.entities.DevTodo.list("-priority", 100),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => maxikay.entities.DevTodo.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dev-todos"] }),
  });

  const cycleStatus = (todo) => {
    const next = { pending: "in_progress", in_progress: "done", done: "pending" };
    updateStatus.mutate({ id: todo.id, status: next[todo.status] });
  };

  const filtered = filter === "all" ? todos : todos.filter((t) => t.priority === filter || t.status === filter);

  const grouped = ["high", "medium", "low"].reduce((acc, p) => {
    acc[p] = filtered.filter((t) => t.priority === p);
    return acc;
  }, {});

  const total = todos.length;
  const done = todos.filter((t) => t.status === "done").length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20">
      <PageHeader
        title="Dev Backlog"
        subtitle="Pending implementation items"
        actions={
          <div className="flex gap-2 flex-wrap">
            {["all", "pending", "in_progress", "done"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
              >
                {f.replace("_", " ")}
              </button>
            ))}
          </div>
        }
      />

      {/* Progress bar */}
      <div className="glass rounded-xl p-4 space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{done} / {total} items completed</span>
          <span className="font-display font-bold text-primary">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-secondary overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Loading...</div>
      ) : (
        Object.entries(grouped).map(([priority, items]) =>
          items.length === 0 ? null : (
            <div key={priority} className="space-y-2">
              <h2 className="text-xs font-display uppercase tracking-widest text-muted-foreground px-1">
                {PRIORITY_LABEL[priority]}
              </h2>
              {items.map((todo) => (
                <div
                  key={todo.id}
                  className={`glass rounded-xl p-4 flex items-start gap-3 cursor-pointer hover:border-primary/30 transition-all ${todo.status === "done" ? "opacity-50" : ""}`}
                  onClick={() => cycleStatus(todo)}
                >
                  <div className="mt-0.5 shrink-0">{STATUS_ICON[todo.status]}</div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${todo.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {todo.title}
                    </p>
                    {todo.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{todo.description}</p>
                    )}
                    {todo.category && (
                      <span className="text-[10px] mt-1.5 inline-block px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                        {todo.category}
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${PRIORITY_STYLES[priority]}`}>
                    {priority}
                  </span>
                </div>
              ))}
            </div>
          )
        )
      )}
    </div>
  );
}