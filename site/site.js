// Keep the public download page static: no analytics, account access, or library data.
document.querySelectorAll('a[href^="https://github.com/"]').forEach(link => {
  link.rel = 'noopener noreferrer';
});
