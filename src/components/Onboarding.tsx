import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/app-store';
import { Sparkles, FileText, Users } from 'lucide-react';

const STEPS = [
  {
    icon: Sparkles,
    title: 'Welcome to your workspace',
    description: 'A beautiful, focused place for all your thoughts, tasks, and projects.',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  {
    icon: FileText,
    title: 'Create your first page',
    description: 'Write documents with a rich block editor. Use headings, lists, code blocks, and more.',
    gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  },
  {
    icon: Users,
    title: 'Stay organized',
    description: 'Track tasks on your Kanban board, manage your calendar, and find anything with search.',
    gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  },
];

export function Onboarding() {
  const { onboardingComplete, completeOnboarding, updateSettings } = useAppStore();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');

  if (onboardingComplete) return null;

  const handleNext = () => {
    if (step === 0 && name.trim()) {
      updateSettings({ userName: name.trim() });
    }
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      completeOnboarding();
    }
  };

  const currentStep = STEPS[step];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
    >
      <div className="fixed inset-0 bg-black/40 backdrop-blur-md" />
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -12 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="glass-strong w-full max-w-md p-8 text-center relative"
        >
          <button
            onClick={completeOnboarding}
            className="absolute top-4 right-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip
          </button>

          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: currentStep.gradient }}
          >
            <currentStep.icon size={28} className="text-white" />
          </div>

          <h2 className="text-xl font-bold text-foreground mb-2">{currentStep.title}</h2>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{currentStep.description}</p>

          {step === 0 && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What's your name?"
              className="w-full px-4 py-3 rounded-2xl bg-muted/50 border border-border/30 text-sm outline-none focus:ring-2 focus:ring-primary/30 mb-4 text-center"
            />
          )}

          <button
            onClick={handleNext}
            className="w-full py-3 rounded-2xl gradient-accent text-white font-medium text-sm transition-all hover:opacity-90 active:scale-[0.97]"
          >
            {step < STEPS.length - 1 ? 'Continue' : 'Get Started'}
          </button>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2 mt-5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === step ? 'bg-primary w-6' : i < step ? 'bg-primary/40' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
