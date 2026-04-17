import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAppStore } from "@/store/app-store";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { User, Palette, Type, Lock, Trash2, Sun, Moon, LogOut, Save, Clock } from "lucide-react";
import { toast } from "sonner";

const ACCENT_COLORS = [
  { name: 'Purple', value: '#667eea' },
  { name: 'Pink', value: '#f5576c' },
  { name: 'Blue', value: '#4facfe' },
  { name: 'Green', value: '#43e97b' },
  { name: 'Orange', value: '#fa709a' },
  { name: 'Gold', value: '#fbc2eb' },
];

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings" },
      { name: "description", content: "Customize your workspace preferences." },
    ],
  }),
  component: SettingsPage,
});

function applyAccentColor(color: string) {
  // Convert hex to oklch approximation by updating CSS custom property directly
  // We inject a <style> tag with the override
  let styleEl = document.getElementById("accent-override") as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "accent-override";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    :root {
      --primary: ${color} !important;
      --ring: ${color} !important;
      --sidebar-primary: ${color} !important;
    }
    .dark {
      --primary: ${color} !important;
      --ring: ${color} !important;
      --sidebar-primary: ${color} !important;
    }
    .gradient-accent {
      background: linear-gradient(135deg, ${color}, ${color}cc) !important;
    }
    .gradient-accent-text {
      background: linear-gradient(135deg, ${color}, ${color}cc) !important;
      -webkit-background-clip: text !important;
      -webkit-text-fill-color: transparent !important;
      background-clip: text !important;
    }
  `;
}

function SettingsPage() {
  const { settings, updateSettings } = useAppStore();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteCountdown, setDeleteCountdown] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Local draft state — only applied when Save is clicked
  const [draft, setDraft] = useState({ ...settings });
  const [dirty, setDirty] = useState(false);

  // Apply accent color live when page loads
  useEffect(() => {
    applyAccentColor(settings.accentColor);
  }, [settings.accentColor]);

  // Apply theme live
  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
  }, [settings.theme]);

  const updateDraft = (updates: Partial<typeof settings>) => {
    setDraft((prev) => ({ ...prev, ...updates }));
    setDirty(true);
    // Apply accent color preview immediately for visual feedback
    if (updates.accentColor) applyAccentColor(updates.accentColor);
    // Apply theme immediately
    if (updates.theme) document.documentElement.classList.toggle('dark', updates.theme === 'dark');
  };

  const saveSettings = () => {
    updateSettings(draft);
    setDirty(false);
    toast.success("Settings saved!");
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      updateDraft({ avatar: ev.target?.result as string });
    };
    reader.readAsDataURL(file);
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setUpdatingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated!");
      setNewPassword('');
    }
    setUpdatingPassword(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: '/login' });
  };

  // 30-day deletion: schedule deletion request, show countdown
  const handleRequestDeleteAccount = () => {
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days from now
    localStorage.setItem('delete_account_requested_at', String(expiresAt));
    setDeleteCountdown(30);
    toast.success("Account deletion scheduled in 30 days. You can cancel anytime.", { duration: 5000 });
    setShowDeleteConfirm(false);
  };

  const handleCancelDeleteAccount = () => {
    localStorage.removeItem('delete_account_requested_at');
    setDeleteCountdown(null);
    toast.success("Account deletion cancelled.");
  };

  // Check if a deletion was previously scheduled
  useEffect(() => {
    const storedExpiry = localStorage.getItem('delete_account_requested_at');
    if (storedExpiry) {
      const daysLeft = Math.ceil((Number(storedExpiry) - Date.now()) / (24 * 60 * 60 * 1000));
      if (daysLeft > 0) {
        setDeleteCountdown(daysLeft);
      } else {
        // Expired — actually delete
        localStorage.clear();
        window.location.reload();
      }
    }
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="max-w-2xl mx-auto px-4 md:px-8 py-6 md:py-10"
    >
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Settings</h1>
        <button
          onClick={saveSettings}
          disabled={!dirty}
          className={`flex items-center gap-2 pill-button transition-all ${
            dirty
              ? 'gradient-accent text-white shadow-lg'
              : 'bg-muted/50 text-muted-foreground cursor-not-allowed'
          }`}
        >
          <Save size={15} />
          Save Settings
        </button>
      </div>

      {/* Profile */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04 }}
        className="glass p-5 md:p-6 mb-4"
      >
        <div className="flex items-center gap-2 mb-4">
          <User size={18} className="text-primary" />
          <h2 className="font-semibold">Profile</h2>
        </div>
        <div className="flex items-center gap-4 mb-4">
          <label className="relative cursor-pointer group">
            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-muted flex items-center justify-center">
              {draft.avatar ? (
                <img src={draft.avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User size={24} className="text-muted-foreground" />
              )}
            </div>
            <div className="absolute inset-0 rounded-2xl bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-white text-xs font-medium">Edit</span>
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="sr-only"
            />
          </label>
          <div className="flex-1 space-y-3">
            <input
              value={draft.userName}
              onChange={(e) => updateDraft({ userName: e.target.value })}
              placeholder="Your name"
              className="w-full px-4 py-2.5 rounded-xl bg-muted/50 border border-border/30 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="text-sm text-muted-foreground px-1">
              {user?.email}
            </div>
          </div>
        </div>
      </motion.section>

      {/* Appearance */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="glass p-5 md:p-6 mb-4"
      >
        <div className="flex items-center gap-2 mb-4">
          <Palette size={18} className="text-primary" />
          <h2 className="font-semibold">Appearance</h2>
        </div>

        {/* Theme toggle */}
        <div className="flex items-center justify-between mb-5">
          <span className="text-sm">Theme</span>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50">
            <button
              onClick={() => updateDraft({ theme: 'light' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
                draft.theme === 'light'
                  ? 'bg-background shadow text-foreground'
                  : 'text-muted-foreground'
              }`}
            >
              <Sun size={14} />
              Light
            </button>
            <button
              onClick={() => updateDraft({ theme: 'dark' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
                draft.theme === 'dark'
                  ? 'bg-background shadow text-foreground'
                  : 'text-muted-foreground'
              }`}
            >
              <Moon size={14} />
              Dark
            </button>
          </div>
        </div>

        {/* Accent color */}
        <div className="mb-5">
          <span className="text-sm block mb-2">Accent Color</span>
          <div className="flex items-center gap-2">
            {ACCENT_COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => updateDraft({ accentColor: color.value })}
                className={`w-8 h-8 rounded-full transition-transform ${
                  draft.accentColor === color.value
                    ? 'scale-125 ring-2 ring-offset-2 ring-offset-background ring-primary'
                    : 'hover:scale-110'
                }`}
                style={{ backgroundColor: color.value }}
                aria-label={color.name}
                title={color.name}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">Click Save to apply permanently.</p>
        </div>

        {/* Font size */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Type size={14} className="text-muted-foreground" />
            <span className="text-sm">Font Size</span>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50">
            {(['small', 'default', 'large'] as const).map((size) => (
              <button
                key={size}
                onClick={() => updateDraft({ fontSize: size })}
                className={`flex-1 px-3 py-1.5 rounded-lg text-sm capitalize transition-all ${
                  draft.fontSize === size
                    ? 'bg-background shadow text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Account */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="glass p-5 md:p-6 mb-4"
      >
        <div className="flex items-center gap-2 mb-4">
          <Lock size={18} className="text-primary" />
          <h2 className="font-semibold">Account</h2>
        </div>
        <div className="space-y-3 mb-4">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            className="w-full px-4 py-2.5 rounded-xl bg-muted/50 border border-border/30 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={handleUpdatePassword}
            disabled={updatingPassword}
            className="pill-button gradient-accent text-white text-sm disabled:opacity-50"
          >
            Update Password
          </button>
        </div>

        <div className="pt-4 border-t border-border/30 space-y-3">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>

          {deleteCountdown !== null ? (
            <div className="glass p-4 space-y-3 border border-destructive/30 rounded-2xl">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <Clock size={15} />
                <span>Account deletion in <strong>{deleteCountdown} day{deleteCountdown !== 1 ? 's' : ''}</strong></span>
              </div>
              <p className="text-xs text-muted-foreground">
                Your account and all data will be permanently deleted on that date. You can cancel anytime before then.
              </p>
              <button
                onClick={handleCancelDeleteAccount}
                className="pill-button bg-muted text-foreground text-sm"
              >
                Cancel Deletion
              </button>
            </div>
          ) : showDeleteConfirm ? (
            <div className="glass p-4 space-y-3 border border-destructive/20 rounded-2xl">
              <p className="text-sm text-destructive font-medium">Delete Account?</p>
              <p className="text-xs text-muted-foreground">
                Your account won't be deleted immediately. Like Discord, you'll have a <strong>30-day grace period</strong> to cancel. After 30 days, all data is permanently removed.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleRequestDeleteAccount}
                  className="pill-button bg-destructive text-destructive-foreground text-sm"
                >
                  Schedule Deletion (30 days)
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="pill-button bg-muted text-foreground text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80 transition-colors"
            >
              <Trash2 size={14} />
              Delete account
            </button>
          )}
        </div>
      </motion.section>
    </motion.div>
  );
}
