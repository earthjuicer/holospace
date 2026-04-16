import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAppStore } from "@/store/app-store";
import { BlockEditor } from "@/components/BlockEditor";
import { motion } from "framer-motion";
import { Star, Pin, Trash2, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/editor/$docId")({
  component: EditorPage,
  notFoundComponent: () => (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">Document not found</h2>
        <Link to="/" className="text-primary text-sm hover:underline">Go home</Link>
      </div>
    </div>
  ),
});

function EditorPage() {
  const { docId } = Route.useParams();
  const { documents, toggleFavorite, togglePin, deleteDocument } = useAppStore();
  const navigate = useNavigate();
  const doc = documents.find((d) => d.id === docId);

  if (!doc) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Document not found</h2>
          <Link to="/" className="text-primary text-sm hover:underline">Go home</Link>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="h-full"
    >
      {/* Toolbar */}
      <div className="sticky top-0 z-10 glass-subtle border-b border-border/20">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-2 flex items-center justify-between">
          <Link to="/" className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-1">
            <button
              onClick={() => toggleFavorite(doc.id)}
              className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
              aria-label="Toggle favorite"
            >
              <Star
                size={16}
                className={doc.favorite ? 'fill-primary text-primary' : 'text-muted-foreground'}
              />
            </button>
            <button
              onClick={() => togglePin(doc.id)}
              className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
              aria-label="Toggle pin"
            >
              <Pin
                size={16}
                className={doc.pinned ? 'fill-primary text-primary' : 'text-muted-foreground'}
              />
            </button>
            <button
              onClick={() => {
                if (confirm('Delete this document?')) {
                  deleteDocument(doc.id);
                  navigate({ to: '/' });
                }
              }}
              className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Delete document"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>

      <BlockEditor doc={doc} />
    </motion.div>
  );
}
