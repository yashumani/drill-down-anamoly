import { describe, expect, it } from 'vitest';
import {
  guidedSlides,
  liveDemoSlides,
  nextGuidedSlide,
  nextLiveDemoSlide,
  previousGuidedSlide,
  previousLiveDemoSlide,
} from './presentationFlow';

describe('guided presentation flow', () => {
  it('advances and reverses through the hierarchy', () => {
    expect(nextGuidedSlide('source')).toBe('question');
    expect(nextGuidedSlide('question')).toBe('answer');
    expect(nextGuidedSlide('answer')).toBe('drivers');
    expect(previousGuidedSlide('ai')).toBe('drivers');
  });

  it('does not leave the first or last page', () => {
    expect(previousGuidedSlide(guidedSlides[0].id)).toBe(guidedSlides[0].id);
    expect(nextGuidedSlide(guidedSlides.at(-1)!.id)).toBe(guidedSlides.at(-1)!.id);
  });
});

describe('live public presentation flow', () => {
  it('moves through overview, trend, drivers, hierarchy, AI, and method pages', () => {
    expect(nextLiveDemoSlide('overview')).toBe('trend');
    expect(nextLiveDemoSlide('drivers')).toBe('hierarchy');
    expect(nextLiveDemoSlide('hierarchy')).toBe('ai');
    expect(previousLiveDemoSlide('method')).toBe('ai');
  });

  it('honors navigation boundaries', () => {
    expect(previousLiveDemoSlide(liveDemoSlides[0].id)).toBe(liveDemoSlides[0].id);
    expect(nextLiveDemoSlide(liveDemoSlides.at(-1)!.id)).toBe(liveDemoSlides.at(-1)!.id);
  });
});
