const dialog = document.querySelector('#diagram-dialog');
const viewport = document.querySelector('#diagram-viewport');
const stage = document.querySelector('#diagram-stage');
const image = document.querySelector('#diagram-image');
const value = document.querySelector('#zoom-value');
const factor = 1.25;
let diagram;
let zoom = 1;
let drag;

function applyZoom(next, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) {
  const left = (viewport.scrollLeft + x - image.offsetLeft) / zoom;
  const top = (viewport.scrollTop + y - image.offsetTop) / zoom;
  zoom = Math.min(8, Math.max(0.05, next));
  image.style.width = `${diagram.width * zoom}px`;
  image.style.height = `${diagram.height * zoom}px`;
  stage.style.minWidth = `max(100%, ${diagram.width * zoom + 48}px)`;
  stage.style.minHeight = `max(100%, ${diagram.height * zoom + 48}px)`;
  value.value = `${Math.round(zoom * 100)}%`;
  viewport.scrollTo(image.offsetLeft + left * zoom - x, image.offsetTop + top * zoom - y);
}

function fit() {
  if (!diagram) return;
  applyZoom(Math.min(1.8, (viewport.clientWidth - 48) / diagram.width, (viewport.clientHeight - 48) / diagram.height));
  viewport.scrollTo(0, 0);
}

export function showDiagram(data, url, title) {
  diagram = data;
  document.querySelector('#diagram-title').textContent = title;
  image.src = url;
  dialog.showModal();
  fit();
}

export function closeDiagram() {
  if (dialog.open) dialog.close();
}

document.querySelector('#zoom-in').onclick = () => applyZoom(zoom * factor);
document.querySelector('#zoom-out').onclick = () => applyZoom(zoom / factor);
document.querySelector('#zoom-fit').onclick = fit;
document.querySelector('#zoom-actual').onclick = () => applyZoom(1);
document.querySelector('#diagram-close').onclick = closeDiagram;
dialog.addEventListener('close', () => { image.removeAttribute('src'); diagram = null; drag = null; });
viewport.addEventListener('wheel', (event) => {
  if (!diagram) return;
  event.preventDefault();
  const rect = viewport.getBoundingClientRect();
  applyZoom(zoom * Math.exp(-Math.sign(event.deltaY) * 0.18), event.clientX - rect.left, event.clientY - rect.top);
}, { passive: false });
viewport.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  drag = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
  viewport.setPointerCapture(event.pointerId);
});
viewport.addEventListener('pointermove', (event) => {
  if (drag) viewport.scrollTo(drag.left + drag.x - event.clientX, drag.top + drag.y - event.clientY);
});
viewport.addEventListener('lostpointercapture', () => { drag = null; });
image.draggable = false;
