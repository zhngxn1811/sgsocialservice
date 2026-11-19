// Shared listing renderer, used in two places:
//   1. the browser, which filters and searches the directory live (window.SGSSRender)
//   2. the build step (scripts/build.mjs), which writes the same cards into the HTML
//      so search engines and slow connections see every listing straight away.
// Keeping one copy means the built page and the live page can never drift apart.
(function (root) {
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const anchor = (href, label, external = false) => `<a href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ''}>${esc(label)}</a>`;
  const mapLink = (address, url) => website(url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, address);
  function website(value, label = value) {
    try {
      const url = new URL(/^[\w+.-]+:/.test(value) ? value : `https://${value}`);
      return /^https?:$/.test(url.protocol) ? anchor(url.href, label, true) : esc(label);
    } catch { return esc(label); }
  }
  function numbers(value, mode) {
    // Keep hours and annotations outside the link, and preserve visible spacing.
    const pattern = /\+?\d[\d ]+\d/g;
    let result = '', start = 0;
    for (const match of value.matchAll(pattern)) {
      const number = match[0].trim();
      const digits = number.replace(/\D/g, '');
      const whatsapp = () => anchor(`https://wa.me/${digits.length === 8 ? '65' : ''}${digits}`, number, true);
      const sms = () => anchor(`sms:${number.replace(/ /g, '')}`, number);
      const linked = /WhatsApp/i.test(mode)
        ? (/SMS/i.test(mode) ? `${whatsapp()} (SMS: ${sms()})` : whatsapp())
        : /SMS/i.test(mode) ? sms() : anchor(`tel:${number.replace(/ /g, '')}`, number);
      result += esc(value.slice(start, match.index)) + linked;
      start = match.index + number.length;
    }
    return result + esc(value.slice(start));
  }
  function contactRow(contact) {
    const hours = contact.trim().match(/^((?:(?:Office|Hotline)\s+)?(?:operating|opening)\s+hours|Office hours|Hotline hours):\s*(.+)$/i);
    const match = contact.trim().match(/^(WhatsApp(?:\/SMS)?|SMS(?:\/WhatsApp)?|Email|Skype|Website|Address):?\s+(.+)$/i);
    const emergency = contact.trim().match(/^(.+?) SMS:\s*(.+)$/i);
    let label, value, detail;
    if (hours) {
      label = /hotline/i.test(hours[1]) ? 'Hotline operating hours' : /office/i.test(hours[1]) ? 'Office operating hours' : 'Operating hours';
      detail = esc(hours[2]);
    } else if (match) {
      label = ({ whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', skype: 'Skype', website: 'Website', address: 'Address', 'whatsapp/sms': 'WhatsApp/SMS', 'sms/whatsapp': 'SMS/WhatsApp' })[match[1].toLowerCase()];
      value = match[2];
      if (/WhatsApp|SMS/.test(label)) detail = numbers(value, label);
      else if (label === 'Email') detail = anchor(`mailto:${value}`, value);
      else if (label === 'Skype') detail = anchor(`skype:${value}?chat`, value);
      else if (label === 'Address') detail = mapLink(value);
      else detail = website(value);
    } else if (emergency) {
      label = 'SMS';
      detail = `${esc(emergency[1])}: ${numbers(emergency[2], 'SMS')}`;
    } else {
      label = 'Also';
      detail = esc(contact);
    }
    return `<dt>${label}</dt><dd>${detail}</dd>`;
  }

  function card(s) {
    const tags = (s.h24 ? '<span class="tag h24">24 hours</span>' : "") + (s.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join("");
    const address = s.address ? `<dt>Address</dt><dd>${mapLink(s.address, s.mapsUrl)}</dd>` : '';
    const contacts = address + (s.other || "").split(/;\s*/).filter(Boolean).map(contactRow).join("");
    const web = s.web ? website(s.web, s.web.replace(/^https?:\/\//, "")) : "";
    const webLinks = [web, ...(s.links || []).map(link => website(link.url, link.label))].filter(Boolean).join('<br>');
    return `<article class="card${s.cats.includes("crisis") ? " crisis-card" : ""}">
    <h3>${esc(s.name)}</h3><p class="org">${esc(s.org)}</p>${s.desc ? `<p>${esc(s.desc)}</p>` : ''}<div class="tags">${tags}</div>
    <dl class="contact">${s.phone ? `<dt>Call</dt><dd class="mono">${numbers(s.phone, 'Call')}</dd>` : ""}${contacts}${webLinks ? `<dt>Website</dt><dd>${webLinks}</dd>` : ''}</dl>
    <div class="foot"><span></span><button class="linkbtn" type="button" data-report="${esc(s.id)}">Report an update</button></div></article>`;
  }

  function chips(categories, services, active) {
    const counts = { all: services.length };
    categories.forEach(c => { counts[c.id] = services.filter(s => s.cats.includes(c.id)).length; });
    return [{ id: "all", label: "All" }, ...categories]
      .map(c => `<button class="chip" type="button" data-cat="${esc(c.id)}" aria-pressed="${c.id === active}">${esc(c.label)}<span class="n">${counts[c.id]}</span></button>`)
      .join("");
  }

  root.SGSSRender = { esc, card, chips };
})(typeof window !== "undefined" ? window : globalThis);
