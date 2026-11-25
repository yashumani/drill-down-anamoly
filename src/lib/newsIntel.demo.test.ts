import { describe, expect, it } from 'vitest';
import { analyzeExternalNews, createDemoNewsAnalysis } from './newsIntel';

describe('fictional demo news', () => {
  it('never attributes sample events to companies supplied by the user', async () => {
    const result = await analyzeExternalNews({ provider: 'demo', company: 'Real Company Input', competitors: 'Real Rival Input', days: 30, apiKey: '' });
    expect(result).toEqual(createDemoNewsAnalysis());
    expect(result.contextText).toContain('FICTIONAL DEMO CONTEXT');
    expect(result.contextText).not.toMatch(/Real Company Input|Real Rival Input/);
    expect(result.articles).toHaveLength(8);
    expect(result.articles.every((article) => article.title.startsWith('Fictional demo:'))).toBe(true);
  });
});
