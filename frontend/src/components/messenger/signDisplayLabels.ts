/** Nhãn hiển thị tiếng Việt cho mã ký hiệu (khớp classes backend, không đọc config). */
const SIGN_DISPLAY_LABELS: Record<string, string> = {
  xin_chao: 'xin chào bạn',
  cam_on: 'cảm ơn bạn',
  toi_yeu_ban: 'tôi yêu bạn',
  giup_do: 'giúp đỡ',
  xin_loi: 'xin lỗi bạn',
};

export function normalizeSignKey(sign: string): string {
  return sign.trim().toLowerCase().replace(/\s+/g, '_');
}

/** Chuẩn hóa mã ký hiệu backend (xin_chao) hoặc nhãn hiển thị (xin chào bạn). */
export function toCanonicalSignKey(sign: string): string {
  const key = normalizeSignKey(sign);
  if (SIGN_DISPLAY_LABELS[key]) {
    return key;
  }
  const match = Object.entries(SIGN_DISPLAY_LABELS).find(
    ([, label]) => normalizeSignKey(label) === key
  );
  return match?.[0] ?? key;
}

export function formatSignForDisplay(sign: string): string {
  const key = normalizeSignKey(sign);
  if (SIGN_DISPLAY_LABELS[key]) {
    return SIGN_DISPLAY_LABELS[key];
  }
  return sign.trim().replace(/_/g, ' ');
}

export function formatSignsForDisplay(words: string[]): string {
  return words.map(formatSignForDisplay).join(' ').trim();
}
