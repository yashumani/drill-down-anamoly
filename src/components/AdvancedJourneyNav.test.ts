import { describe, expect, it } from 'vitest';
import {
  advancedStageIndex,
  nextAdvancedStage,
  previousAdvancedStage,
} from './AdvancedJourneyNav';

describe('advanced anomaly investigation journey', () => {
  it('moves through scope, detection, explanation, validation, and sharing', () => {
    expect(advancedStageIndex('scope')).toBe(0);
    expect(nextAdvancedStage('scope')).toBe('detect');
    expect(nextAdvancedStage('detect')).toBe('explain');
    expect(nextAdvancedStage('explain')).toBe('validate');
    expect(nextAdvancedStage('validate')).toBe('share');
  });

  it('does not move beyond the beginning or end', () => {
    expect(previousAdvancedStage('scope')).toBe('scope');
    expect(nextAdvancedStage('share')).toBe('share');
  });
});
