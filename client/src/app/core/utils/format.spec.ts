import { percentChange } from './format';

describe('percentChange', () => {
  it('reports growth and decline as percentages', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(75, 100)).toBe(-25);
    expect(percentChange(100, 100)).toBe(0);
  });

  it('has nothing to compare with when the earlier value is zero', () => {
    expect(percentChange(50, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });
});
