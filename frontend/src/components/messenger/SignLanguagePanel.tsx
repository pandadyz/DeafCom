import SignLanguageCamera from '@/components/SignLanguageCamera';
import SentenceComposer from '@/components/messenger/SentenceComposer';
import { formatSignForDisplay } from '@/components/messenger/signDisplayLabels';

export interface SignLanguagePanelProps {
  isOpen: boolean;
  selectedChat: string | null;
  transcribedText: string;
  transcribedWordsHistory: string[];
  composedWords: string[];
  messageDraft: string;
  suggestedSentence: string;
  isSuggestingLoading: boolean;
  onClose: () => void;
  onDetection: (data: {
    stableWord?: string | null;
    previewWord?: string | null;
    candidateSigns?: string[];
    detections?: { class?: string }[];
  }) => void;
  onClearAll: () => void;
  onClearHistory: () => void;
  onSelectWord: (word: string) => void;
  onClearComposer: () => void;
  onRemoveComposedWord: (index: number) => void;
  onDraftChange: (value: string) => void;
  onSuggestSentence: () => void;
  onSendComposedSentence: () => void;
  onCopyToChatInput: () => void;
  onSendSignLanguageToChat: () => void;
}

export default function SignLanguagePanel({
  isOpen,
  selectedChat,
  transcribedText,
  transcribedWordsHistory,
  composedWords,
  messageDraft,
  suggestedSentence,
  isSuggestingLoading,
  onClose,
  onDetection,
  onClearAll,
  onClearHistory,
  onSelectWord,
  onClearComposer,
  onRemoveComposedWord,
  onDraftChange,
  onSuggestSentence,
  onSendComposedSentence,
  onCopyToChatInput,
  onSendSignLanguageToChat,
}: SignLanguagePanelProps) {
  const hasWords = transcribedWordsHistory.length > 0;

  return (
    <aside
      className={`w-sidebar-width h-full bg-surface-container-lowest border-l border-surface-variant flex flex-col z-40 flex-shrink-0 transition-all duration-300 lg:flex ${
        isOpen ? 'flex' : 'hidden lg:hidden'
      }`}
    >
      <div className="p-4 border-b border-surface-variant flex items-center justify-between bg-surface shrink-0">
        <h2 className="font-h2-header text-h2-header text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">interpreter_mode</span>
          Sign Language Assistant
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      <div className="shrink-0 p-4 flex flex-col gap-2 border-b border-surface-variant">
        <div className="flex items-center justify-between mb-1">
          <span className="font-label-caps text-label-caps text-on-surface-variant">Live Recognition</span>
          <div className="flex items-center gap-1 bg-error-container text-on-error-container px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-error rounded-full animate-pulse" />
            <span className="text-[10px] font-semibold">REC</span>
          </div>
        </div>
        <SignLanguageCamera
          onDetection={onDetection}
          onConnectionChange={(connected) => {
            console.log('Sign detection connection status:', connected);
          }}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="p-4 flex flex-col gap-3 pb-6">
          <div className="flex items-center justify-between shrink-0">
            <span className="font-label-caps text-label-caps text-on-surface-variant">Văn bản nhận diện</span>
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              Xóa tất cả
            </button>
          </div>

          {hasWords ? (
            <div className="flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-on-surface-variant">Từ đã nhận diện — nhấn để thêm</span>
                <button
                  type="button"
                  onClick={onClearHistory}
                  className="text-[11px] text-error hover:underline"
                >
                  Xóa danh sách
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {transcribedWordsHistory.map((word, index) => {
                  const isInComposer = composedWords.some(
                    (w) => w.toLowerCase() === word.toLowerCase()
                  );
                  return (
                    <button
                      key={`${word}-${index}`}
                      type="button"
                      onClick={() => onSelectWord(word)}
                      disabled={isInComposer}
                      className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-all active:scale-95 ${
                        isInComposer
                          ? 'cursor-default border-surface-variant bg-surface-container/50 text-on-surface-variant opacity-60'
                          : 'border-surface-variant bg-surface-container text-on-surface hover:border-primary/40 hover:bg-primary/10 hover:text-primary'
                      }`}
                      title={
                        isInComposer
                          ? 'Đã thêm vào câu'
                          : `Thêm "${formatSignForDisplay(word)}" vào câu`
                      }
                    >
                      {formatSignForDisplay(word)}
                      {!isInComposer && (
                        <span className="material-symbols-outlined text-[14px] opacity-60">add</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-variant py-8 text-center shrink-0">
              <span className="material-symbols-outlined mb-2 text-[36px] text-on-surface-variant/25">waving_hand</span>
              <p className="text-sm text-on-surface-variant/70">Thực hiện cử chỉ trước camera để nhận diện từ</p>
            </div>
          )}

          <SentenceComposer
            composedWords={composedWords}
            messageDraft={messageDraft}
            suggestedSentence={suggestedSentence}
            isSuggestingLoading={isSuggestingLoading}
            hasSelectedChat={Boolean(selectedChat)}
            onDraftChange={onDraftChange}
            onRemoveWord={onRemoveComposedWord}
            onClearComposer={onClearComposer}
            onSuggestSentence={onSuggestSentence}
            onSend={onSendComposedSentence}
            onCopyToChatInput={onCopyToChatInput}
          />
        </div>
      </div>

    </aside>
  );
}
