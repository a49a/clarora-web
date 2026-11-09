// Progressive enhancement only: the complete handbook remains readable without JS.
const chapters = [...document.querySelectorAll('[data-guide-chapter]')];
const search = document.querySelector('#guide-search');
const clear = document.querySelector('#guide-clear');
const status = document.querySelector('#guide-search-status');
const empty = document.querySelector('#guide-no-results');
const contents = document.querySelector('#guide-contents');
const links = [...contents.querySelectorAll('nav a')];
const mobile = window.matchMedia('(max-width: 860px)');
const searchable = chapters.map(chapter => ({ chapter, text: `${chapter.textContent} ${chapter.dataset.keywords ?? ''}`.toLocaleLowerCase() }));
document.querySelector('.guide-search-tools').hidden = false;
contents.open = !mobile.matches;
mobile.addEventListener('change', () => { contents.open = !mobile.matches; });
function filter() {
  const terms = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  let count = 0;
  for (const {chapter, text} of searchable) {
    chapter.hidden = !terms.every(term => text.includes(term));
    if (!chapter.hidden) count++;
  }
  clear.disabled = terms.length === 0;
  empty.hidden = count > 0;
  status.textContent = terms.length ? `找到 ${count} 个相关主题` : `共 ${chapters.length} 个主题`;
}
search.addEventListener('input', filter);
function resetSearch() { search.value = ''; filter(); }
let handledHash = null;
clear.addEventListener('click', () => { resetSearch(); search.focus(); });
search.addEventListener('keydown', event => { if (event.key === 'Escape') { resetSearch(); event.preventDefault(); } });
function showHashTarget() {
  // A contents link already reset the filter before the browser fired hashchange.
  // Ignore that one delayed event so it cannot clear a search typed in between.
  if (handledHash === location.hash) { handledHash = null; return; }
  const target = document.getElementById(location.hash.slice(1));
  if (target?.closest('[data-guide-chapter]')?.hidden) {
    resetSearch();
    requestAnimationFrame(() => target.scrollIntoView());
  }
}
window.addEventListener('hashchange', showHashTarget);
document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', () => {
  const target = document.getElementById(link.hash.slice(1));
  if (target?.closest('[data-guide-chapter]')?.hidden) { resetSearch(); handledHash = link.hash; }
  if (mobile.matches && contents.contains(link)) contents.open = false;
}));
const observer = new IntersectionObserver(entries => {
  const entry = entries.filter(item => item.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
  if (!entry) return;
  for (const link of links) {
    if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}, { rootMargin: '-5% 0px -65% 0px' });
chapters.forEach(chapter => observer.observe(chapter));
document.querySelectorAll('[data-copy-code]').forEach(button => {
  button.hidden = false;
  button.addEventListener('click', async () => {
    const code = document.getElementById(button.dataset.copyCode);
    const feedback = document.querySelector('#guide-copy-status');
    try {
      await navigator.clipboard.writeText(code.textContent);
      button.textContent = '已复制 ✓';
      feedback.textContent = '示例已复制';
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(code);
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = '请手动复制';
      feedback.textContent = '自动复制不可用，已选中示例，请手动复制';
    }
  });
});
showHashTarget();
