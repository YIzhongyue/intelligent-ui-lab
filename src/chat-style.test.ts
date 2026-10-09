import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
const rgb = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
function luminance(color: string) {
  const [r, g, b] = rgb(color).map(channel => { const value = channel / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; });
  return .2126 * r + .7152 * g + .0722 * b;
}
it('keeps chat text at readable contrast against the shared dark theme', () => {
  const dom = new JSDOM(`<html><head></head><body><div class="chat-app"><div class="question"><span class="speaker">YOU</span><p>Question</p></div><div class="answer"><div class="preview-heading">Response <span class="status">complete</span><span class="status live">streaming</span></div><p class="answer-text">Answer</p><p class="small">Help</p><aside class="notice"><strong>Notice</strong><p>Notice text</p></aside></div><form class="composer"><label>Question</label><textarea>Typed question</textarea><span class="small">Keyboard help</span></form></div></body></html>`);
  try {
    const { document } = dom.window;
    const style = document.createElement('style');
    style.textContent = readFileSync(new URL('./style.css', import.meta.url), 'utf8') + '\n' + readFileSync(new URL('./chat.css', import.meta.url), 'utf8');
    document.head.append(style);
    const placeholder = style.textContent.match(/textarea::placeholder\s*\{\s*color:\s*(#[a-f\d]{6})/i)?.[1];
    expect(placeholder).toBeTruthy();
    const placeholderProbe = document.createElement('span');
    placeholderProbe.className = 'placeholder-probe';
    placeholderProbe.style.color = placeholder!;
    placeholderProbe.style.backgroundColor = dom.window.getComputedStyle(document.querySelector('textarea')!).backgroundColor;
    document.querySelector('.composer')!.append(placeholderProbe);
    for (const element of document.querySelectorAll('.speaker, .question p, .preview-heading, .status, .answer-text, .small, .notice strong, .notice p, .composer label, textarea, .placeholder-probe')) {
      let foreground = dom.window.getComputedStyle(element).color;
      if (foreground === 'inherit' || !foreground || foreground === 'canvastext') {
        let ancestor = element.parentElement;
        while (ancestor) { const color = dom.window.getComputedStyle(ancestor).color; if (color && color !== 'inherit' && color !== 'canvastext') { foreground = color; break; } ancestor = ancestor.parentElement; }
      }
      let background = 'rgba(0, 0, 0, 0)'; let parent: Element | null = element;
      while (parent && (background === 'rgba(0, 0, 0, 0)' || background === 'transparent')) {
        background = dom.window.getComputedStyle(parent).backgroundColor; parent = parent.parentElement;
      }
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      expect((values[0] + .05) / (values[1] + .05), `${element.className || element.tagName}: ${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  } finally { dom.window.close(); }
});
