import { useCallback, useRef, useState } from 'react';
import { apiClient } from '@/services/api';
import { formatSignForDisplay, formatSignsForDisplay } from '../signDisplayLabels';
import { suggestSignPhrase } from '../signPhraseSuggestions';
import type { Chat } from '../types';
import type { ToastType } from '../types';

const GEMINI_API_KEY =
  process.env.NEXT_PUBLIC_GEMINI_API_KEY ??
  'AIzaSyCLqKoxsXiJhEBQiDlNHpWIrMvkl2P2oH4';

interface UseSignLanguageComposerOptions {
  userId: string | undefined;
  selectedChat: string | null;
  chats: Chat[];
  sendMessage: (event: string, payload: Record<string, unknown>) => void;
  showToast: (message: string, type?: ToastType) => void;
  onCopyToMessageInput: (text: string) => void;
}

function buildDraftFromWords(words: string[]) {
  return formatSignsForDisplay(words);
}

export function useSignLanguageComposer({
  userId,
  selectedChat,
  chats,
  sendMessage,
  showToast,
  onCopyToMessageInput,
}: UseSignLanguageComposerOptions) {
  const [transcribedText, setTranscribedText] = useState('');
  const [recognizedGestures, setRecognizedGestures] = useState<string[]>([]);
  const [transcribedWordsHistory, setTranscribedWordsHistory] = useState<string[]>([]);
  const [composedWords, setComposedWords] = useState<string[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [isDraftEdited, setIsDraftEdited] = useState(false);
  const [suggestedSentence, setSuggestedSentence] = useState('');
  const [isSuggestingLoading, setIsSuggestingLoading] = useState(false);
  const [showSignLanguagePanel, setShowSignLanguagePanel] = useState(false);
  const suggestRequestId = useRef(0);

  const syncDraftFromWords = useCallback((words: string[]) => {
    setMessageDraft(buildDraftFromWords(words));
    setIsDraftEdited(false);
    setSuggestedSentence('');
  }, []);

  const handleClearTranscription = useCallback(() => {
    setTranscribedText('');
    setRecognizedGestures([]);
  }, []);

  const handleClearHistory = useCallback(() => {
    setTranscribedWordsHistory([]);
  }, []);

  const handleClearComposer = useCallback(() => {
    setComposedWords([]);
    setMessageDraft('');
    setSuggestedSentence('');
    setIsDraftEdited(false);
  }, []);

  const handleClearAll = useCallback(() => {
    handleClearTranscription();
    handleClearHistory();
    handleClearComposer();
  }, [handleClearTranscription, handleClearHistory, handleClearComposer]);

  const handleSelectWordToSend = useCallback(
    (word: string) => {
      const trimmed = word.trim();
      if (!trimmed) return;

      const exists = composedWords.some((w) => w.toLowerCase() === trimmed.toLowerCase());
      if (exists) {
        showToast('Từ này đã có trong câu', 'info');
        return;
      }

      const nextWords = [...composedWords, trimmed];
      setComposedWords(nextWords);
      setSuggestedSentence('');

      if (isDraftEdited) {
        const displayWord = formatSignForDisplay(trimmed);
        setMessageDraft((prev) => (prev.trim() ? `${prev.trim()} ${displayWord}` : displayWord));
      } else {
        syncDraftFromWords(nextWords);
      }
    },
    [composedWords, isDraftEdited, showToast, syncDraftFromWords]
  );

  const handleRemoveComposedWord = useCallback(
    (index: number) => {
      const nextWords = composedWords.filter((_, i) => i !== index);
      setComposedWords(nextWords);
      setSuggestedSentence('');

      if (!isDraftEdited) {
        syncDraftFromWords(nextWords);
      }
    },
    [composedWords, isDraftEdited, syncDraftFromWords]
  );

  const handleDraftChange = useCallback((value: string) => {
    setMessageDraft(value);
    setIsDraftEdited(true);
    setSuggestedSentence('');
  }, []);

  const handleSuggestSentence = useCallback(async () => {
    if (composedWords.length === 0 && !messageDraft.trim()) return;

    const requestId = ++suggestRequestId.current;
    setIsSuggestingLoading(true);

    const wordsForSuggest =
      composedWords.length > 0 ? composedWords : messageDraft.trim().split(/\s+/);
    const localSuggestion = suggestSignPhrase(wordsForSuggest);

    if (localSuggestion) {
      setSuggestedSentence(localSuggestion);
      setMessageDraft(localSuggestion);
      setIsDraftEdited(true);
      setIsSuggestingLoading(false);
      return;
    }

    const rawText = messageDraft.trim() || buildDraftFromWords(composedWords);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Bạn là trợ lý ngôn ngữ. Hãy ghép các từ/cụm từ sau thành một câu tiếng Việt hoàn chỉnh, tự nhiên và lịch sự. Chỉ trả lời đúng một câu, không giải thích gì thêm. Các từ: ${rawText}`,
                  },
                ],
              },
            ],
          }),
        }
      );

      if (requestId !== suggestRequestId.current) return;

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      const result = text || rawText;

      setSuggestedSentence(result);
      setMessageDraft(result);
      setIsDraftEdited(true);
    } catch {
      if (requestId !== suggestRequestId.current) return;
      showToast('Không tạo được gợi ý, dùng bản nháp hiện tại', 'info');
      setMessageDraft(rawText);
    } finally {
      if (requestId === suggestRequestId.current) {
        setIsSuggestingLoading(false);
      }
    }
  }, [composedWords, messageDraft, showToast]);

  const getSendContent = useCallback(() => {
    return messageDraft.trim() || suggestedSentence.trim() || buildDraftFromWords(composedWords);
  }, [messageDraft, suggestedSentence, composedWords]);

  const handleSendComposedSentence = useCallback(async () => {
    if (!selectedChat || !userId) {
      showToast('Chọn cuộc trò chuyện trước khi gửi', 'info');
      return;
    }

    const content = getSendContent();
    if (!content) return;

    try {
      const chat = chats.find((c) => c.id === selectedChat);
      if (chat) {
        sendMessage('message.send', {
          receiver_id: chat.userId,
          content,
          message_type: 'sign_text',
        });
        handleClearComposer();
        showToast('Đã gửi câu thành công!', 'success');
      }
    } catch (error) {
      console.error('Failed to send composed sentence:', error);
      try {
        const chat = chats.find((c) => c.id === selectedChat);
        if (chat) {
          await apiClient.sendMessage(chat.userId, content, 'sign_text');
          handleClearComposer();
          showToast('Đã gửi câu thành công!', 'success');
        }
      } catch (apiError) {
        console.error('API fallback also failed:', apiError);
        showToast('Gửi tin nhắn thất bại', 'error');
      }
    }
  }, [
    selectedChat,
    userId,
    getSendContent,
    chats,
    sendMessage,
    handleClearComposer,
    showToast,
  ]);

  const handleSendSignLanguageToChat = useCallback(async () => {
    if (!transcribedText.trim() || !selectedChat || !userId) return;

    try {
      const chat = chats.find((c) => c.id === selectedChat);
      if (chat) {
        sendMessage('message.send', {
          receiver_id: chat.userId,
          content: transcribedText,
          message_type: 'sign_text',
        });
        setTranscribedText('');
        setRecognizedGestures([]);
        showToast('Đã gửi từ nhanh!', 'success');
      }
    } catch (error) {
      console.error('Failed to send sign language message:', error);
      try {
        const chat = chats.find((c) => c.id === selectedChat);
        if (chat) {
          await apiClient.sendMessage(chat.userId, transcribedText, 'sign_text');
          setTranscribedText('');
          setRecognizedGestures([]);
        }
      } catch (apiError) {
        console.error('API fallback also failed:', apiError);
        showToast('Gửi tin nhắn thất bại', 'error');
      }
    }
  }, [transcribedText, selectedChat, userId, chats, sendMessage, showToast]);

  const handleDetection = useCallback(
    (detectionData: { stableWord?: string | null; candidateSigns?: string[] }) => {
      if (detectionData.stableWord) {
        setTranscribedText(detectionData.stableWord);
        const word = detectionData.stableWord.trim();
        if (word) {
          setTranscribedWordsHistory((prev) =>
            prev.some((w) => w.toLowerCase() === word.toLowerCase()) ? prev : [...prev, word]
          );
        }
      }
      if (detectionData.candidateSigns?.length) {
        setRecognizedGestures(detectionData.candidateSigns);
      }
    },
    []
  );

  const handleCopyToChatInput = useCallback(() => {
    const content = getSendContent();
    if (!content) return;
    onCopyToMessageInput(content);
    showToast('Đã copy vào ô nhập tin nhắn', 'success');
  }, [getSendContent, onCopyToMessageInput, showToast]);

  return {
    transcribedText,
    recognizedGestures,
    transcribedWordsHistory,
    composedWords,
    messageDraft,
    suggestedSentence,
    isSuggestingLoading,
    showSignLanguagePanel,
    setShowSignLanguagePanel,
    handleClearTranscription,
    handleClearHistory,
    handleClearAll,
    handleClearComposer,
    handleSelectWordToSend,
    handleRemoveComposedWord,
    handleDraftChange,
    handleSuggestSentence,
    handleSendComposedSentence,
    handleSendSignLanguageToChat,
    handleDetection,
    handleCopyToChatInput,
    getSendContent,
  };
}
