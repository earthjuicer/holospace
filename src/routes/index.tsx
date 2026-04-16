import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useAppStore } from "@/store/app-store";
import {
  FileText, CheckCircle2, Flame, Clock, Pin, Search, ArrowRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function StatCard({
  icon: Icon,
  label,
  value,
  gradient,
  delay,
}: {
  icon: typeof FileText;
  label: string;
  value: string | number;
  gradient: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.28, ease: "easeOut" }}
      className="glass p-4 md:p-5"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: gradient }}
        >
          <Icon size={20} className="text-white" />
        </div>
        <div>
          <div className="text-2xl font-bold text-foreground">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </div>
    </motion.div>
  );
}

function Dashboard() {
  const { documents, tasks, settings } = useAppStore();

  const now = new Date();
  const hours = now.getHours();
  const greeting =
    hours < 12 ? "Good morning" : hours < 17 ? "Good afternoon" : "Good evening";

  const doneTasks = tasks.filter((t) => t.columnId === "done").length;
  const pinnedDocs = documents.filter((d) => d.pinned);
  const recentDocs = [...documents]
    .sort((a, b) => b.lastEdited - a.lastEdited)
    .slice(0, 6);

  const recentActivity = [...documents]
    .sort((a, b) => b.lastEdited - a.lastEdited)
    .slice(0, 5);

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="mb-8"
      >
        <h1 className="text-3xl md:text-4xl font-bold text-foreground">
          {greeting}, {settings.userName} 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          {now.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard
          icon={FileText}
          label="Documents"
          value={documents.length}
          gradient="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
          delay={0.04}
        />
        <StatCard
          icon={CheckCircle2}
          label="Tasks Done"
          value={doneTasks}
          gradient="linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)"
          delay={0.08}
        />
        <StatCard
          icon={Flame}
          label="Active Tasks"
          value={tasks.length - doneTasks}
          gradient="linear-gradient(135deg, #fa709a 0%, #fee140 100%)"
          delay={0.12}
        />
        <StatCard
          icon={Clock}
          label="This Week"
          value={
            documents.filter(
              (d) => d.lastEdited > Date.now() - 7 * 86400000
            ).length
          }
          gradient="linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)"
          delay={0.16}
        />
      </div>

      {/* Pinned Pages */}
      {pinnedDocs.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.28 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2 mb-3">
            <Pin size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Pinned
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {pinnedDocs.map((doc, i) => (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.24 + i * 0.04 }}
              >
                <Link
                  to="/editor/$docId"
                  params={{ docId: doc.id }}
                  className="glass p-4 block hover:scale-[1.015] hover:shadow-lg transition-all group"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{doc.icon}</span>
                    <span className="font-medium text-foreground truncate">{doc.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {doc.blocks.find((b) => b.content)?.content || "Empty page"}
                  </p>
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.section>
      )}

      {/* Recent Documents */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28, duration: 0.28 }}
        className="mb-8"
      >
        <div className="flex items-center gap-2 mb-3">
          <Clock size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Recent
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {recentDocs.map((doc, i) => (
            <motion.div
              key={doc.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32 + i * 0.04 }}
            >
              <Link
                to="/editor/$docId"
                params={{ docId: doc.id }}
                className="glass p-4 block hover:scale-[1.015] hover:shadow-lg transition-all group"
              >
                <div
                  className="w-full h-20 rounded-xl mb-3 overflow-hidden"
                  style={{ background: doc.coverGradient }}
                />
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{doc.icon}</span>
                  <span className="font-medium text-foreground truncate text-sm">
                    {doc.title}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Edited{" "}
                  {formatDistanceToNow(doc.lastEdited, { addSuffix: true })}
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Activity Feed */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.28 }}
      >
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Activity
        </h2>
        <div className="glass divide-y divide-border/30">
          {recentActivity.map((doc, i) => (
            <Link
              key={doc.id}
              to="/editor/$docId"
              params={{ docId: doc.id }}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
            >
              <span className="text-lg">{doc.icon}</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground truncate block">
                  {doc.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  Edited{" "}
                  {formatDistanceToNow(doc.lastEdited, { addSuffix: true })}
                </span>
              </div>
              <ArrowRight
                size={14}
                className="text-muted-foreground shrink-0"
              />
            </Link>
          ))}
        </div>
      </motion.section>
    </div>
  );
}
