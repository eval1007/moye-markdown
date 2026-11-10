/** Keeps compact menus mutually exclusive and returns keyboard focus when dismissed. */
export function mountAppMenus(header) {
  const menus = [...header.querySelectorAll('details.app-menu')];
  const close = (menu, restoreFocus = false) => {
    menu.open = false;
    if (restoreFocus) menu.querySelector('summary').focus();
  };
  for (const menu of menus) {
    menu.querySelector('summary').addEventListener('click', () => {
      for (const other of menus) if (other !== menu) close(other);
    });
    // Dialog return focus must not point at an action hidden inside the closed menu.
    menu.addEventListener('click', (event) => {
      if (!event.target.closest('button')) return;
      close(menu, true);
      queueMicrotask(() => {
        document.querySelector('dialog[open]')?.addEventListener('close', () => {
          menu.querySelector('summary').focus();
        }, { once: true });
      });
    }, { capture: true });
  }
  document.addEventListener('click', (event) => {
    for (const menu of menus) if (menu.open && !menu.contains(event.target)) close(menu);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      requestAnimationFrame(() => {
        for (const menu of menus) if (menu.open && !menu.contains(document.activeElement)) close(menu);
      });
      return;
    }
    if (event.key !== 'Escape') return;
    const menu = menus.find((item) => item.open);
    if (menu) {
      event.preventDefault();
      close(menu, true);
    }
  });
}
