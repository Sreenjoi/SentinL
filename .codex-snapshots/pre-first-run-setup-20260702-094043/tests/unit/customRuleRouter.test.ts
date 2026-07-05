import { describe, it, expect } from 'vitest';
import { shouldForceFullPassForCustomRules } from '../../src/utils/customRuleRouter';

describe('customRuleRouter', () => {
  it('must return true for matched restrictions', () => {
    expect(shouldForceFullPassForCustomRules('who are you voting for', 'No politics in general chat', [])).toBe(true);
    expect(shouldForceFullPassForCustomRules('election results are wild', 'Politics only in #debate', [])).toBe(true);
    expect(shouldForceFullPassForCustomRules('wts account', 'No trading accounts', [])).toBe(true);
    expect(shouldForceFullPassForCustomRules('check out my youtube.com channel', 'Self promo is not allowed', [])).toBe(true);
    expect(shouldForceFullPassForCustomRules('join my server discord.gg/abc', 'No Discord invites', [])).toBe(true);
    expect(shouldForceFullPassForCustomRules('the final boss dies', 'No spoilers', [])).toBe(true);
    expect(shouldForceFullPassForCustomRules('dm me for price', 'No DM sales', [])).toBe(true);
    // hindi text Hello (used a generic non-latin script here)
    expect(shouldForceFullPassForCustomRules('नमस्ते', 'English only', [])).toBe(true);
    expect(shouldForceFullPassForCustomRules('onlyfans link', 'No NSFW', [])).toBe(true);
    expect(shouldForceFullPassForCustomRules('selling account', 'Trading allowed only in marketplace', [])).toBe(true);
    expect(shouldForceFullPassForCustomRules('oh wow how genius of you -_-', 'No sarcasm or toxicity allowed, respect others', [])).toBe(true);
    expect(shouldForceFullPassForCustomRules('you are an absolute genius', 'Sarcasm will result in ban', [])).toBe(true);
  });

  it('must return false for allowed topics or neutral mentions', () => {
    expect(shouldForceFullPassForCustomRules('who are you voting for', '', [])).toBe(false);
    expect(shouldForceFullPassForCustomRules('who are you voting for', 'Politics is allowed here', [])).toBe(false);
    expect(shouldForceFullPassForCustomRules('politics discussion', 'Debate and controversial topics are welcome', [])).toBe(false);
    expect(shouldForceFullPassForCustomRules('nice shot', 'No trading', [])).toBe(false);
    expect(shouldForceFullPassForCustomRules('good game', 'No spoilers', [])).toBe(false);
    expect(shouldForceFullPassForCustomRules('thanks bro', 'No promo', [])).toBe(false);
    expect(shouldForceFullPassForCustomRules('what language is this', 'English only', [])).toBe(false);
    expect(shouldForceFullPassForCustomRules('role model', 'No role begging', [])).toBe(false);
    expect(shouldForceFullPassForCustomRules('president of the club', 'No politics', [])).toBe(false);
    expect(shouldForceFullPassForCustomRules('oh wow how genius of you -_-', '', [])).toBe(false); // No sarcasm rule
    expect(shouldForceFullPassForCustomRules('great job team', 'No sarcasm or toxicity', [])).toBe(false);
    expect(shouldForceFullPassForCustomRules('you helped a lot', 'No mockery', [])).toBe(false);
  });

  it('handles keywords correctly', () => {
    expect(shouldForceFullPassForCustomRules('I love bad.site', '', ['bad.site'])).toBe(true);
    expect(shouldForceFullPassForCustomRules('I love good.site', '', ['bad.site'])).toBe(false);
  });
});
