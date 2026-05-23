const LOCALE = 'vi-VN';

/**
 * Format giờ hiển thị trong bầu thông điệp: "10:03 SA" / "10:03 CH"
 */
function formatTimeOfDay(date: Date): string {
  return date.toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Kiểm tra hai Date có cùng ngày dương lịch không.
 */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Format timestamp cho từng tin nhắn trong khung chat.
 *
 * Logic (so với thời điểm hiện tại):
 *  - < 1 phút          → "Vừa xong"
 *  - 1 – 59 phút        → "5 phút trước"
 *  - Hôm nay            → "10:03 SA"
 *  - Hôm qua           → "Hôm qua, 10:03 SA"
 *  - Trong tuần (< 7 ngày) → "Thứ Ba, 10:03 SA"
 *  - Cùng năm          → "22 tháng 5, 10:03 SA"
 *  - Khác năm          → "22/5/2024, 10:03 SA"
 */
export function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) return 'Vừa xong';

  if (diffMinutes < 60) return `${diffMinutes} phút trước`;

  const time = formatTimeOfDay(date);

  if (isSameDay(date, now)) return time;

  // Hôm qua
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return `Hôm qua, ${time}`;

  // Trong tuần (< 7 ngày)
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays < 7) {
    const weekday = date.toLocaleDateString(LOCALE, { weekday: 'long' });
    const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    return `${capitalized}, ${time}`;
  }

  // Cùng năm
  if (date.getFullYear() === now.getFullYear()) {
    const dayMonth = date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });
    return `${dayMonth}, ${time}`;
  }

  // Khác năm
  const full = date.toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
  return `${full}, ${time}`;
}

/**
 * Format timestamp ngắn gọn cho sidebar (danh sách cuộc trò chuyện).
 *
 * Logic:
 *  - < 1 phút          → "Vừa xong"
 *  - 1 – 59 phút        → "5 phút"
 *  - Hôm nay            → "10:03 SA"
 *  - Hôm qua           → "Hôm qua"
 *  - Trong tuần (< 7 ngày) → "Thứ Ba"
 *  - Cùng năm          → "22 tháng 5"
 *  - Khác năm          → "22/5/2024"
 */
export function formatConversationTime(timestamp: string): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) return 'Vừa xong';

  if (diffMinutes < 60) return `${diffMinutes} phút`;

  if (isSameDay(date, now)) return formatTimeOfDay(date);

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Hôm qua';

  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays < 7) {
    const weekday = date.toLocaleDateString(LOCALE, { weekday: 'long' });
    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });
  }

  return date.toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

/**
 * Tạo nhãn phân cách ngày giữa các cụm tin nhắn.
 *
 * Ví dụ: "Hôm nay", "Hôm qua", "Thứ Ba, 20 tháng 5", "22/5/2024"
 */
export function formatDateDivider(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (isSameDay(date, now)) return 'Hôm nay';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Hôm qua';

  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays < 7) {
    const weekday = date.toLocaleDateString(LOCALE, { weekday: 'long' });
    const dayMonth = date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });
    const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    return `${capitalized}, ${dayMonth}`;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  return date.toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

/**
 * @deprecated Dùng formatMessageTime() thay thế.
 */
export function formatTimestamp(timestamp: string): string {
  return formatMessageTime(timestamp);
}

/**
 * @deprecated Dùng formatConversationTime() thay thế.
 */
export function formatDate(timestamp: string): string {
  return formatConversationTime(timestamp);
}

export function getAvatarUrl(seed: string) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
}
