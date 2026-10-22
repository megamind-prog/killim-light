// A "Copy" button on every code sample.
document.querySelectorAll('.doc pre').forEach(pre => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'copybtn'; b.textContent = 'Copy';
  b.onclick = async () => {
    try { await navigator.clipboard.writeText(pre.innerText); b.textContent = 'Copied ✓'; }
    catch { b.textContent = 'Select and copy'; }
    setTimeout(() => (b.textContent = 'Copy'), 1800);
  };
  const wrap = document.createElement('div'); wrap.className = 'codewrap';
  pre.before(wrap); wrap.append(pre, b); pre.classList.add('hascopy');
});
