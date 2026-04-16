export interface PromptTemplate {
  title: string;
  description: string;
  content: string;
  model: string;
  tags: string[];
  icon: string;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    icon: '📝',
    title: 'Summarizer',
    description: 'Condense long text into a clear, structured summary.',
    model: 'google/gemini-3-flash-preview',
    tags: ['writing', 'summary'],
    content:
      'You are an expert summarizer. Produce a concise summary of the text below.\n\nRules:\n- Start with a one-sentence TL;DR.\n- Then a bulleted list of key points.\n- Preserve names, numbers, and technical terms.\n- Length target: {{length}}.\n\nText:\n"""\n{{text}}\n"""',
  },
  {
    icon: '🌐',
    title: 'Translator',
    description: 'Translate text between languages while preserving tone.',
    model: 'google/gemini-2.5-flash',
    tags: ['language', 'translation'],
    content:
      'You are a professional translator. Translate the text from {{source_language}} to {{target_language}}.\n\nGuidelines:\n- Preserve tone, formatting, and intent.\n- Keep proper nouns untranslated.\n- If idioms exist, adapt naturally rather than literally.\n\nText:\n"""\n{{text}}\n"""',
  },
  {
    icon: '🔍',
    title: 'Code Reviewer',
    description: 'Review code for bugs, style, and improvements.',
    model: 'openai/gpt-5',
    tags: ['code', 'review'],
    content:
      'You are a senior software engineer doing a thorough code review.\n\nFocus areas:\n1. Correctness & bugs\n2. Edge cases\n3. Readability & naming\n4. Performance concerns\n5. Security issues\n\nReturn findings as a markdown list grouped by severity (Critical / Warning / Nit).\n\nLanguage: {{language}}\n\nCode:\n```{{language}}\n{{code}}\n```',
  },
  {
    icon: '✉️',
    title: 'Email Writer',
    description: 'Draft polished emails with the right tone.',
    model: 'google/gemini-3-flash-preview',
    tags: ['writing', 'email'],
    content:
      'You are an expert email writer. Draft an email based on the brief below.\n\nRecipient: {{recipient}}\nTone: {{tone}}\nGoal: {{goal}}\n\nKey points to include:\n{{key_points}}\n\nReturn:\n- Subject line\n- Email body (no placeholders, ready to send)',
  },
  {
    icon: '🧠',
    title: 'Brainstorm Partner',
    description: 'Generate creative ideas around any topic.',
    model: 'google/gemini-2.5-pro',
    tags: ['creative', 'ideation'],
    content:
      'You are a creative brainstorming partner. Generate {{count}} distinct ideas about: {{topic}}.\n\nFor each idea provide:\n- A short title\n- One-paragraph description\n- Why it could work\n- One risk or trade-off',
  },
  {
    icon: '📚',
    title: 'Explain Like I\'m 5',
    description: 'Break down complex topics in simple terms.',
    model: 'google/gemini-3-flash-preview',
    tags: ['learning', 'explain'],
    content:
      'Explain the following concept as if to a curious 5-year-old, using everyday analogies. Keep it fun, clear, and accurate.\n\nConcept: {{concept}}',
  },
];
