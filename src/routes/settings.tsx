import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { useAppStore } from "@/store/app-store";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { User, Palette, Type, Lock, Trash2, Sun, Moon, LogOut } from "lucide-react";
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

function SettingsPage() {
  const { settings, updateSettings } = useAppStore();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      updateSettings({ avatar: ev.target?.result as string });
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

  const handleDeleteAccount = () => {
    localStorage.clear();
    window.location.reload();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="max-w-2xl mx-auto px-4 md:px-8 py-6 md:py-10"
    >
      <h1 className="text-2xl font-bold mb-8">Settings</h1>

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
              {settings.avatar ? (
                <img src={settings.avatar} alt="Avatar" className="w-full h-full object-cover" />
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
              value={settings.userName}
              onChange={(e) => updateSettings({ userName: e.target.value })}
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
              onClick={() => updateSettings({ theme: 'light' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
                settings.theme === 'light'
                  ? 'bg-background shadow text-foreground'
                  : 'text-muted-foreground'
              }`}
            >
              <Sun size={14} />
              Light
            </button>
            <button
              onClick={() => updateSettings({ theme: 'dark' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
                settings.theme === 'dark'
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
                onClick={() => updateSettings({ accentColor: color.value })}
                className={`w-8 h-8 rounded-full transition-transform ${
                  settings.accentColor === color.value
                    ? 'scale-125 ring-2 ring-offset-2 ring-offset-background ring-primary'
                    : 'hover:scale-110'
                }`}
                style={{ backgroundColor: color.value }}
                aria-label={color.name}
              />
            ))}
          </div>
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
                onClick={() => updateSettings({ fontSize: size })}
                className={`flex-1 px-3 py-1.5 rounded-lg text-sm capitalize transition-all ${
                  settings.fontSize === size
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

          {showDeleteConfirm ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-destructive">Are you sure? This will reset all data.</span>
              <button
                onClick={handleDeleteAccount}
                className="pill-button bg-destructive text-destructive-foreground text-sm"
              >
                Confirm
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="pill-button bg-muted text-foreground text-sm"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80 transition-colors"
            >
              <Trash2 size={14} />
              Delete account & reset data
            </button>
          )}
        </div>
      </motion.section>
    </motion.div>
  );
}
