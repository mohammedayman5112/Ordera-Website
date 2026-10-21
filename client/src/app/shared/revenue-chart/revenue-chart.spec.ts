import { TestBed } from '@angular/core/testing';
import { DailyPoint } from '../../core/models/api.models';
import { RevenueChart, niceMax } from './revenue-chart';

function days(revenues: number[]): DailyPoint[] {
  return revenues.map((revenue, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, orders: revenue > 0 ? 1 : 0, revenue }));
}

describe('niceMax', () => {
  it.each([
    [0, 100],
    [-5, 100],
    [0.7, 1],
    [1, 1],
    [1.2, 2],
    [2.3, 2.5],
    [4, 5],
    [7, 10],
    [1234, 2000],
    [19540.93, 20000],
  ])('rounds %d up to %d', (value, expected) => {
    expect(niceMax(value)).toBe(expected);
  });
});

describe('RevenueChart', () => {
  async function render(points: DailyPoint[]) {
    const fixture = TestBed.createComponent(RevenueChart);
    fixture.componentRef.setInput('points', points);
    await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('draws a line and an area for the data', async () => {
    const { element } = await render(days([0, 100, 250, 50]));

    expect(element.querySelector('path.line')?.getAttribute('d')).toMatch(/^M[\d.]+ [\d.]+( L[\d.]+ [\d.]+){3}$/);
    expect(element.querySelector('path.area')?.getAttribute('d')).toMatch(/Z$/);
  });

  it('describes the chart for assistive technology', async () => {
    const { element } = await render(days([100, 200, 300]));

    expect(element.querySelector('svg')?.getAttribute('aria-label')).toBe('Revenue per day over the last 3 days: $600.00 in total.');
  });

  it('labels the axis with the highest tidy value and the first and last day', async () => {
    const { element } = await render(days([100, 1200, 300]));

    const labels = Array.from(element.querySelectorAll('text.axis')).map((t) => t.textContent?.trim());
    expect(labels).toContain('$2K');
    expect(labels).toContain('$0');
    expect(labels).toContain('Oct 1');
    expect(labels).toContain('Oct 3');
  });

  it('keeps the highest day inside the plot area', async () => {
    const { element } = await render(days([0, 500, 0]));

    // Every y coordinate of the line stays between the top padding (16) and the baseline (210).
    const ys = (element.querySelector('path.line')?.getAttribute('d') ?? '').split(' L').map((p) => Number(p.split(' ')[1]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(16);
    expect(Math.max(...ys)).toBeLessThanOrEqual(210);
    expect(Math.min(...ys)).toBe(16); // the highest day touches the top of the plot
  });

  it('shows the details of a day while it is hovered', async () => {
    const { fixture, element } = await render(days([100, 250, 50]));
    expect(element.querySelector('.tip')).toBeNull();

    element.querySelectorAll('rect.hit')[1].dispatchEvent(new Event('mouseenter'));
    await fixture.whenStable();

    const tip = element.querySelector('.tip')?.textContent ?? '';
    expect(tip).toContain('Oct 2');
    expect(tip).toContain('$250.00');
    expect(tip).toContain('1 orders');

    element.querySelector('svg')!.dispatchEvent(new Event('mouseleave'));
    await fixture.whenStable();
    expect(element.querySelector('.tip')).toBeNull();
  });

  it('copes with no data and with a single day', async () => {
    const empty = await render([]);
    expect(empty.element.querySelector('path.line')).toBeNull();

    const single = await render(days([120]));
    expect(single.element.querySelector('path.line')?.getAttribute('d')).toMatch(/^M[\d.]+ [\d.]+$/);
  });
});
