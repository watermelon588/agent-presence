// Sponsor and coffee buttons: any element with data-support="sponsor" | "coffee".
// With a link set in pay.js it opens the provider's page in a new tab; otherwise a "coming soon" modal.
import { PAY } from './pay.js';

const COPY = {
  sponsor: ['Sponsorship opens soon', "Thank you for wanting to back Agent Peeps. The sponsor page isn't live yet.", 'Sponsor'],
  coffee: ['The coffee jar opens soon', "That's kind of you. The tip link isn't live yet.", 'Buy me a coffee'],
};
let dlg;

export function support(kind) {
  const url = kind === 'coffee' ? PAY.coffeeUrl : PAY.sponsorUrl;
  if (url) return void window.open(url, '_blank', 'noopener');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.className = 'modal';
    dlg.setAttribute('aria-labelledby', 'modal-h');
    dlg.innerHTML = `<form method="dialog"><button class="icon-btn no-spin modal-x" aria-label="Close"><i class="ph-bold ph-x"></i></button></form>
      <img class="modal-img lift" src="${new URL('../stickers/capybaras/capybara-rose.webp', import.meta.url).href}" alt="">
      <span class="pbadge" data-k></span>
      <h2 id="modal-h" class="mt-3 text-[30px]"></h2>
      <p class="mt-2 text-muted" data-p></p>
      <div class="mt-6 flex flex-wrap gap-2.5">
        <a class="btn btn-accent !h-11" href="https://github.com/watermelon588/agentpeeps" target="_blank" rel="noopener">Star it on GitHub instead <i class="ph-bold ph-arrow-up-right"></i></a>
        <form method="dialog"><button class="btn btn-line !h-11">Close</button></form>
      </div>`;
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // click the backdrop to close
    document.body.append(dlg);
  }
  const [h, p, k] = COPY[kind] || COPY.sponsor;
  dlg.querySelector('h2').textContent = h;
  dlg.querySelector('[data-p]').textContent = p;
  dlg.querySelector('[data-k]').textContent = k;
  dlg.showModal();
}

export function wireSupport() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-support]'); if (!b) return;
    e.preventDefault();
    support(b.dataset.support);
  });
}
