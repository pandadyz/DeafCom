interface SentenceComposerProps {
  composedWords: string[];
  messageDraft: string;
  suggestedSentence: string;
  isSuggestingLoading: boolean;
  hasSelectedChat: boolean;
  onDraftChange: (value: string) => void;
  onRemoveWord: (index: number) => void;
  onClearComposer: () => void;
  onSuggestSentence: () => void;
  onSend: () => void;
  onCopyToChatInput: () => void;
}

export default function SentenceComposer({
  composedWords,
  messageDraft,
  suggestedSentence,
  isSuggestingLoading,
  hasSelectedChat,
  onDraftChange,
  onRemoveWord,
  onClearComposer,
  onSuggestSentence,
  onSend,
  onCopyToChatInput,
}: SentenceComposerProps) {
  const canSend = hasSelectedChat && Boolean(messageDraft.trim() || composedWords.length > 0);
  const canSuggest = composedWords.length > 0 || Boolean(messageDraft.trim());
  const showAiHint = Boolean(suggestedSentence) && suggestedSentence === messageDraft.trim();

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/8 to-surface-container-low/40 p-3 shadow-sm">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">edit_note</span>
          <span className="text-sm font-semibold text-on-surface">Câu đang soạn</span>
          {composedWords.length > 0 && (
            <span className="rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold text-on-primary">
              {composedWords.length}
            </span>
          )}
        </div>
        {composedWords.length > 0 && (
          <button
            type="button"
            onClick={onClearComposer}
            className="flex items-center gap-1 text-xs text-error transition-opacity hover:opacity-80"
          >
            <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
            Xóa tất cả
          </button>
        )}
      </header>

      {composedWords.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {composedWords.map((word, idx) => (
            <span
              key={`${word}-${idx}`}
              className="inline-flex items-center gap-0.5 rounded-full border border-primary/30 bg-primary/12 pl-2.5 pr-1 py-1 text-sm font-medium text-primary"
            >
              {word}
              <button
                type="button"
                onClick={() => onRemoveWord(idx)}
                className="flex h-5 w-5 items-center justify-center rounded-full text-primary/70 transition-colors hover:bg-primary/20 hover:text-primary"
                aria-label={`Xóa từ ${word}`}
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-on-surface-variant/80 italic px-0.5">
          Chọn từ đã nhận diện phía trên để bắt đầu soạn câu.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="sentence-draft" className="text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
          Nội dung gửi
        </label>
        <textarea
          id="sentence-draft"
          rows={3}
          value={messageDraft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Soạn hoặc chỉnh sửa câu trước khi gửi..."
          className="w-full resize-none rounded-xl border border-surface-variant bg-surface px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {showAiHint && (
          <p className="flex items-center gap-1 text-[11px] text-primary/90">
            <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
            Câu được gợi ý bởi AI — bạn có thể chỉnh sửa trực tiếp
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onSuggestSentence}
          disabled={!canSuggest || isSuggestingLoading}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary/35 bg-surface/60 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isSuggestingLoading ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              Đang gợi ý...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
              Gợi ý câu
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCopyToChatInput}
          disabled={!messageDraft.trim()}
          className="inline-flex items-center justify-center gap-1 rounded-xl border border-surface-variant bg-surface-container py-2.5 text-sm font-medium text-on-surface transition-colors hover:bg-surface-variant disabled:cursor-not-allowed disabled:opacity-45"
          title="Copy vào ô nhắn tin chính"
        >
          <span className="material-symbols-outlined text-[16px]">content_copy</span>
          Copy
        </button>
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className="col-span-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
          title={hasSelectedChat ? 'Gửi câu vào chat' : 'Chọn cuộc trò chuyện để gửi'}
        >
          <span className="material-symbols-outlined text-[18px]">send</span>
          Gửi
        </button>
      </div>

      {!hasSelectedChat && (
        <p className="text-center text-[11px] text-on-surface-variant">
          Chọn cuộc trò chuyện bên trái để gửi tin nhắn
        </p>
      )}
    </section>
  );
}
