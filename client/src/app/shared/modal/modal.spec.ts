import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Modal } from './modal';

@Component({
  imports: [Modal],
  template: `
    <app-modal title="Example" (closed)="closedCount = closedCount + 1">
      <button id="inner" type="submit">Save</button>
    </app-modal>
  `,
})
class Host {
  closedCount = 0;
}

describe('Modal', () => {
  beforeEach(() => {
    // jsdom does not implement the modal parts of <dialog>.
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, dialog: element.querySelector('dialog')!, inner: element.querySelector<HTMLElement>('#inner')! };
  }

  it('opens as a modal dialog after rendering', async () => {
    const { dialog } = await render();

    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
    expect(dialog.hasAttribute('open')).toBe(true);
  });

  it('does not cancel clicks on its content, so submit buttons keep working', async () => {
    const { inner } = await render();

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    inner.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(false);
  });

  it('closes when the backdrop is clicked and reports it', async () => {
    const { fixture, dialog } = await render();

    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled();
    expect(fixture.componentInstance.closedCount).toBe(1);
  });

  it('stays open when the content is clicked', async () => {
    const { fixture, inner } = await render();

    inner.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(fixture.componentInstance.closedCount).toBe(0);
  });
});
