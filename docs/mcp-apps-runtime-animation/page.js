function playPage() {
  document.body.classList.remove('play');
  void document.body.offsetWidth;
  document.body.classList.add('play');
}
window.__replay = playPage;
window.addEventListener('message', event => {
  if (event.data?.type === 'mcp-deck-replay') playPage();
});
document.fonts.ready.then(() => {
  requestAnimationFrame(() => {
    playPage();
    window.__ready = true;
    parent.postMessage({ type: 'mcp-deck-page-ready' }, '*');
  });
});
