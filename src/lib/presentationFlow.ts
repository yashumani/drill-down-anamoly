export const guidedSlides = [
  { id: 'source', label: 'Data', shortLabel: 'Choose data' },
  { id: 'question', label: 'Question', shortLabel: 'Ask a question' },
  { id: 'setup', label: 'Setup', shortLabel: 'Confirm setup' },
  { id: 'answer', label: 'Answer', shortLabel: 'See the answer' },
  { id: 'drivers', label: 'Drivers', shortLabel: 'Review drivers' },
  { id: 'ai', label: 'AI analyst', shortLabel: 'Ask AI' },
] as const;

export type GuidedSlideId = typeof guidedSlides[number]['id'];

export function guidedSlideIndex(id: GuidedSlideId) {
  return guidedSlides.findIndex((slide) => slide.id === id);
}

export function nextGuidedSlide(id: GuidedSlideId): GuidedSlideId {
  const index = guidedSlideIndex(id);
  return guidedSlides[Math.min(guidedSlides.length - 1, index + 1)].id;
}

export function previousGuidedSlide(id: GuidedSlideId): GuidedSlideId {
  const index = guidedSlideIndex(id);
  return guidedSlides[Math.max(0, index - 1)].id;
}

export const liveDemoSlides = [
  { id: 'overview', label: 'Executive overview' },
  { id: 'trend', label: 'Monthly pulse' },
  { id: 'drivers', label: '10-dimension drill' },
  { id: 'ai', label: 'AI review' },
  { id: 'method', label: 'Method & source' },
] as const;

export type LiveDemoSlideId = typeof liveDemoSlides[number]['id'];

export function liveDemoSlideIndex(id: LiveDemoSlideId) {
  return liveDemoSlides.findIndex((slide) => slide.id === id);
}

export function nextLiveDemoSlide(id: LiveDemoSlideId): LiveDemoSlideId {
  const index = liveDemoSlideIndex(id);
  return liveDemoSlides[Math.min(liveDemoSlides.length - 1, index + 1)].id;
}

export function previousLiveDemoSlide(id: LiveDemoSlideId): LiveDemoSlideId {
  const index = liveDemoSlideIndex(id);
  return liveDemoSlides[Math.max(0, index - 1)].id;
}
