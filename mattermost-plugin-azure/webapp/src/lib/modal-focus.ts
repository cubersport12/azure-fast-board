/** Mattermost listens for keydown and steals focus into #post_textbox. */
export function blurChannelTextbox() {
  const nodes = document.querySelectorAll<HTMLElement>(
    '#post_textbox, #reply_textbox, [data-testid="post_textbox"], [data-testid="reply_textbox"], .advanced-text-editor__textbox textarea, .advanced-text-editor__textbox [contenteditable="true"]',
  );
  nodes.forEach((el) => el.blur());
}

export function stopKeyToChannel(e: KeyboardEvent) {
  e.stopPropagation();
}

export function attachModalFocusGuard(modalEl: HTMLElement | null): () => void {
  if (!modalEl) return () => undefined;
  blurChannelTextbox();
  const opts: AddEventListenerOptions = { capture: false };
  modalEl.addEventListener('keydown', stopKeyToChannel, opts);
  modalEl.addEventListener('keypress', stopKeyToChannel, opts);
  modalEl.addEventListener('keyup', stopKeyToChannel, opts);

  const onFocusIn = (e: FocusEvent) => {
    const target = e.target as Node | null;
    if (!target || !modalEl.contains) return;
    if (modalEl.contains(target)) return;
    const textbox =
      document.getElementById('post_textbox') || document.getElementById('reply_textbox');
    if (textbox && (target === textbox || textbox.contains(target))) {
      blurChannelTextbox();
      const active = modalEl.querySelector<HTMLElement>(
        'input:not([type="hidden"]), textarea, select, [contenteditable="true"]',
      );
      active?.focus();
    }
  };
  document.addEventListener('focusin', onFocusIn, true);

  return () => {
    modalEl.removeEventListener('keydown', stopKeyToChannel, opts);
    modalEl.removeEventListener('keypress', stopKeyToChannel, opts);
    modalEl.removeEventListener('keyup', stopKeyToChannel, opts);
    document.removeEventListener('focusin', onFocusIn, true);
  };
}
