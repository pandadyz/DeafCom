/** Gợi ý câu tiếng Việt từ nhãn ký hiệu (khớp config backend). */
const SINGLE_SIGN_PHRASES: Record<string, string> = {
  hello: 'Xin chào!',
  iloveyou: 'Tôi yêu bạn.',
  thankyou: 'Cảm ơn bạn.',
};

/** Khóa = các nhãn đã sort, nối bằng "|". */
const COMBO_SIGN_PHRASES: Record<string, string> = {
  'hello|iloveyou': 'Xin chào, rất vui được gặp bạn',
  'hello|thankyou': 'Xin chào, cảm ơn bạn.',
  'iloveyou|thankyou': 'Cảm ơn bạn rất nhiều.',
  'hello|iloveyou|thankyou': 'Xin chào, rất vui được gặp bạn và cảm ơn bạn.',
};

function normalizeSignWords(words: string[]): string[] {
  return words
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}

function comboKey(words: string[]): string {
  return [...normalizeSignWords(words)].sort().join('|');
}

export function suggestSignPhrase(words: string[]): string | null {
  const normalized = normalizeSignWords(words);
  if (normalized.length === 0) return null;

  if (normalized.length === 1) {
    return SINGLE_SIGN_PHRASES[normalized[0]] ?? null;
  }

  return COMBO_SIGN_PHRASES[comboKey(normalized)] ?? null;
}
