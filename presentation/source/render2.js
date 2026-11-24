const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const dir = process.argv[2];
  const b = await chromium.launch({args:['--disable-gpu','--force-color-profile=srgb']});
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  await p.goto('file://' + path.join(dir, 'slides.html'));
  await p.waitForSelector('body[data-ready]');
  await p.waitForTimeout(400);
  const ov = await p.$$eval('section.slide', ss => ss.map(s => {
    const r = s.getBoundingClientRect(); const bad = [];
    s.querySelectorAll('*').forEach(e => {
      if (e.closest('.abs.ph,.star,svg') && !e.matches('svg')) return;
      if (e.matches('.abs.ph,.star')) return;
      const q = e.getBoundingClientRect();
      if (q.width && (q.right > r.right - 60 || q.bottom > r.bottom - 50) && !e.matches('.ph') && e.textContent.trim()) bad.push('EDGE '+e.className+' '+e.textContent.trim().slice(0,30)+' b='+Math.round(q.bottom-r.top)+' r='+Math.round(q.right-r.left));
    });
    s.querySelectorAll('.col,.g,div').forEach(e=>{ if (e.scrollHeight > e.clientHeight + 3 && getComputedStyle(e).overflow==='visible' && e.clientHeight>0 && e.style.height) bad.push('OVF '+e.textContent.trim().slice(0,30)); });
    return s.id + ': ' + [...new Set(bad)].slice(0,6).join(' | '); }));
  console.log(ov.join('\n'));
  const els = await p.$$('section.slide');
  for (let i = 0; i < els.length; i++) await els[i].screenshot({ path: path.join(dir, 'out', `slide${String(i+1).padStart(2,'0')}.png`) });
  await b.close();
})();
