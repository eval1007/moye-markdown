const dialog = document.querySelector('#diagram-dialog');
const viewport = document.querySelector('#diagram-viewport');
const image = document.querySelector('#diagram-image');
const value = document.querySelector('#zoom-value');
const factor = 1.25;
let diagram;
let zoom = 1;
let drag;
let position = { x: 0, y: 0 };

function placeImage() {
  image.style.transform = `translate(${position.x}px, ${position.y}px)`;
}

/** Keeps the diagram point under the zoom anchor stationary. */
function applyZoom(next, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) {
  const left = (x - position.x) / zoom;
  const top = (y - position.y) / zoom;
  zoom = Math.min(8, Math.max(0.05, next));
  image.style.width = `${diagram.width * zoom}px`;
  image.style.height = `${diagram.height * zoom}px`;
  value.value = `${Math.round(zoom * 100)}%`;
  position = { x: x - left * zoom, y: y - top * zoom };
  placeImage();
}

function fit() {
  if (!diagram) return;
  applyZoom(Math.min(1.8, (viewport.clientWidth - 48) / diagram.width, (viewport.clientHeight - 48) / diagram.height));
  position = { x: (viewport.clientWidth - diagram.width * zoom) / 2, y: (viewport.clientHeight - diagram.height * zoom) / 2 };
  placeImage();
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
  if (event.button !== 0 || drag) return;
  event.preventDefault();
  drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  viewport.setPointerCapture(event.pointerId);
});
viewport.addEventListener('pointermove', (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  // Scroll offsets clamp at the content edges, so pan the image independently.
  position.x += event.clientX - drag.x;
  position.y += event.clientY - drag.y;
  drag.x = event.clientX;
  drag.y = event.clientY;
  placeImage();
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  viewport.addEventListener(type, (event) => {
    if (event.pointerId === drag?.pointerId) drag = null;
  });
}
image.draggable = false;
