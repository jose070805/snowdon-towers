const family = new URLSearchParams(window.location.search).get('title');

if (family === 'space-grotesk' || family === 'barlow-condensed') {
  document.documentElement.dataset.titlePreview = family;
}
