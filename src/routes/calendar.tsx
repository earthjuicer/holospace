import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { CalendarView } from "@/components/CalendarView";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — Events" },
      { name: "description", content: "View and manage your events on a monthly calendar." },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="h-full"
    >
      <CalendarView />
    </motion.div>
  );
}
