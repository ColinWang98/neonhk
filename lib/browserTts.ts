type SpeechSegment = {
  text: string;
  lang: "en-GB" | "zh-HK";
};

export function speakSegmentedText(
  text: string,
  options: {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: () => void;
  } = {}
) {
  if (!window.speechSynthesis) {
    options.onError?.();
    return;
  }

  const segments = segmentSpeechText(text);
  let index = 0;
  window.speechSynthesis.cancel();

  function speakNext() {
    const segment = segments[index];
    if (!segment) {
      options.onEnd?.();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(segment.text);
    utterance.lang = segment.lang;
    utterance.voice = pickVoice(segment.lang);
    utterance.rate = segment.lang === "zh-HK" ? 0.9 : 0.92;
    utterance.pitch = 1;
    utterance.onstart = () => {
      if (index === 0) options.onStart?.();
    };
    utterance.onend = () => {
      index += 1;
      speakNext();
    };
    utterance.onerror = () => options.onError?.();
    window.speechSynthesis.speak(utterance);
  }

  speakNext();
}

export function stopSegmentedSpeech() {
  window.speechSynthesis?.cancel();
}

function segmentSpeechText(text: string): SpeechSegment[] {
  const chunks = text
    .split(/([\u3400-\u9fff\u3000-\u303f\uff00-\uffef]+(?:[，。！？、；：「」『』（）\s]*)?)/g)
    .map((part) => part.trim())
    .filter(Boolean);

  return chunks.map((chunk) => ({
    text: chunk,
    lang: containsCjk(chunk) ? "zh-HK" : "en-GB"
  }));
}

function containsCjk(text: string) {
  return /[\u3400-\u9fff]/.test(text);
}

function pickVoice(lang: SpeechSegment["lang"]) {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang === lang) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith(lang.toLowerCase().split("-")[0])) ||
    null
  );
}
