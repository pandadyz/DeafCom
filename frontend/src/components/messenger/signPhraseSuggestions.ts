import { toCanonicalSignKey } from './signDisplayLabels';

/** Gợi ý câu đơn từ (mã class backend). */
const SINGLE_SIGN_PHRASES: Record<string, string> = {
  xin_chao: 'Xin chào!',
  cam_on: 'Cảm ơn bạn.',
  toi_yeu_ban: 'Tôi yêu bạn.',
  giup_do: 'Bạn có thể giúp đỡ tôi được không?',
  xin_loi: 'Xin lỗi bạn.',
};

/** Khóa = hai mã class đã sort, nối bằng "|". */
const COMBO_SIGN_PHRASES: Record<string, string> = {
  'giup_do|xin_loi':
    'Xin lỗi vì đã làm phiền, bạn có thể giúp đỡ tôi được không?',
  'toi_yeu_ban|xin_loi': 'Xin lỗi vì đã làm bạn buồn.',
  'cam_on|giup_do': 'Cảm ơn bạn đã nhiệt tình giúp đỡ tôi.',
  'cam_on|toi_yeu_ban': 'Tôi yêu bạn, cảm ơn vì bạn đã luôn ở bên tôi.',
  'giup_do|xin_chao': 'Xin chào, bạn có thể giúp đỡ tôi một chút được không?',
  'cam_on|xin_chao': 'Tạm biệt, rất cảm ơn bạn đã dành thời gian cho tôi.',
};

function normalizeSignWords(words: string[]): string[] {
  return words
    .map((w) => toCanonicalSignKey(w))
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
