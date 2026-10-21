import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { DailyPoint } from '../../core/models/api.models';

const WIDTH = 560;
const HEIGHT = 240;
const PAD = { top: 16, right: 12, bottom: 30, left: 54 };

const compact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

// Rounds the top of the axis up to a tidy value (1, 2, 2.5, 5 or 10 times a power of ten).
export function niceMax(value: number): number {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = [1, 2, 2.5, 5, 10].find((s) => normalized <= s) ?? 10;
  return step * magnitude;
}

// Daily revenue as an area chart, drawn with plain SVG so no charting library is needed.
@Component({
  selector: 'app-revenue-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, DatePipe],
  template: `
    <svg
      class="chart"
      role="img"
      [attr.viewBox]="'0 0 ' + width + ' ' + height"
      [attr.aria-label]="summary()"
      (mouseleave)="hovered.set(null)"
    >
      @for (tick of ticks(); track $index) {
        <line class="grid" [attr.x1]="pad.left" [attr.x2]="width - pad.right" [attr.y1]="tick.y" [attr.y2]="tick.y" />
        <text class="axis" text-anchor="end" [attr.x]="pad.left - 8" [attr.y]="tick.y + 4">{{ tick.label }}</text>
      }

      @if (coords().length > 0) {
        <path class="area" [attr.d]="areaPath()" />
        <path class="line" [attr.d]="linePath()" />
      }

      @for (label of xLabels(); track $index) {
        <text class="axis" [attr.text-anchor]="label.anchor" [attr.x]="label.x" [attr.y]="height - 8">
          {{ label.date | date: 'MMM d' }}
        </text>
      }

      @for (c of coords(); track c.point.date; let i = $index) {
        <rect
          class="hit"
          [attr.x]="c.x - band() / 2"
          [attr.y]="pad.top"
          [attr.width]="band()"
          [attr.height]="plotHeight"
          (mouseenter)="hovered.set(i)"
        />
      }

      @if (active(); as a) {
        <line class="cursor" [attr.x1]="a.x" [attr.x2]="a.x" [attr.y1]="pad.top" [attr.y2]="baseline" />
        <circle class="dot" r="4" [attr.cx]="a.x" [attr.cy]="a.y" />
        <g class="tip" [attr.transform]="'translate(' + tipX() + ' ' + pad.top + ')'">
          <rect width="132" height="44" rx="6" />
          <text x="10" y="18" class="tip-title">{{ a.point.date | date: 'EEE, MMM d' }}</text>
          <text x="10" y="35">{{ a.point.revenue | currency }} · {{ a.point.orders }} orders</text>
        </g>
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
    }
    .chart {
      display: block;
      width: 100%;
      height: auto;
    }
    .grid {
      stroke: var(--border);
      stroke-width: 1;
    }
    .axis {
      fill: var(--text-muted);
      font-size: 12px;
    }
    .area {
      fill: var(--primary);
      fill-opacity: 0.14;
    }
    .line {
      fill: none;
      stroke: var(--primary);
      stroke-width: 2.5;
      stroke-linejoin: round;
      stroke-linecap: round;
    }
    .hit {
      fill: transparent;
    }
    .cursor {
      stroke: var(--text-muted);
      stroke-dasharray: 3 3;
    }
    .dot {
      fill: var(--surface);
      stroke: var(--primary);
      stroke-width: 2.5;
    }
    .tip rect {
      fill: var(--text);
    }
    .tip text {
      fill: var(--surface);
      font-size: 12px;
    }
    .tip .tip-title {
      font-weight: 700;
    }
  `,
})
export class RevenueChart {
  readonly points = input.required<DailyPoint[]>();

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly pad = PAD;
  protected readonly plotHeight = HEIGHT - PAD.top - PAD.bottom;
  protected readonly baseline = HEIGHT - PAD.bottom;
  private readonly plotWidth = WIDTH - PAD.left - PAD.right;

  protected readonly hovered = signal<number | null>(null);

  private readonly max = computed(() => niceMax(Math.max(0, ...this.points().map((p) => p.revenue))));

  protected readonly coords = computed(() => {
    const points = this.points();
    const max = this.max();
    const step = points.length > 1 ? this.plotWidth / (points.length - 1) : 0;
    return points.map((point, i) => ({
      point,
      x: points.length > 1 ? PAD.left + i * step : PAD.left + this.plotWidth / 2,
      y: this.baseline - (point.revenue / max) * this.plotHeight,
    }));
  });

  // Width of the invisible hover target around each point.
  protected readonly band = computed(() => this.plotWidth / Math.max(1, this.points().length - 1));

  protected readonly linePath = computed(() =>
    this.coords()
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' '),
  );

  protected readonly areaPath = computed(() => {
    const coords = this.coords();
    if (coords.length === 0) return '';
    const first = coords[0];
    const last = coords[coords.length - 1];
    return `${this.linePath()} L${last.x.toFixed(1)} ${this.baseline} L${first.x.toFixed(1)} ${this.baseline} Z`;
  });

  protected readonly ticks = computed(() =>
    [0, 0.5, 1].map((fraction) => ({
      y: this.baseline - fraction * this.plotHeight,
      label: compact.format(this.max() * fraction),
    })),
  );

  // First, middle and last day, so the axis is readable without crowding.
  protected readonly xLabels = computed(() => {
    const coords = this.coords();
    if (coords.length === 0) return [];
    const picks: { index: number; anchor: string }[] =
      coords.length === 1
        ? [{ index: 0, anchor: 'middle' }]
        : [
            { index: 0, anchor: 'start' },
            { index: Math.floor((coords.length - 1) / 2), anchor: 'middle' },
            { index: coords.length - 1, anchor: 'end' },
          ];
    return picks.map(({ index, anchor }) => ({ x: coords[index].x, anchor, date: coords[index].point.date }));
  });

  protected readonly active = computed(() => {
    const index = this.hovered();
    return index === null ? null : (this.coords()[index] ?? null);
  });

  // Keeps the tooltip inside the chart, whichever side the hovered point is on.
  protected readonly tipX = computed(() => {
    const a = this.active();
    if (!a) return 0;
    return Math.min(Math.max(a.x - 66, PAD.left), WIDTH - PAD.right - 132);
  });

  protected readonly summary = computed(() => {
    const points = this.points();
    const total = points.reduce((sum, p) => sum + p.revenue, 0);
    return `Revenue per day over the last ${points.length} days: ${money.format(total)} in total.`;
  });
}
