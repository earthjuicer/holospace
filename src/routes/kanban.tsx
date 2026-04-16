import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { KanbanBoard } from "@/components/KanbanBoard";

export const Route = createFileRoute("/kanban")({
  head: () => ({
    meta: [
      { title: "Tasks — Kanban Board" },
      { name: "description", content: "Manage your tasks with a drag-and-drop Kanban board." },
    ],
  }),
  component: KanbanPage,
});

function KanbanPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="h-full flex flex-col"
    >
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-2">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <p className="text-sm text-muted-foreground">Drag cards between columns to update status</p>
      </div>
      <div className="flex-1 min-h-0">
        <KanbanBoard />
      </div>
    </motion.div>
  );
}
