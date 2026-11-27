(() => {
  const raised = 105;
  const annualGoal = 1692.24;
  const appGoal = 145;
  const money = amount => `S$${amount.toLocaleString('en-SG', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;
  const remaining = Math.max(annualGoal - raised, 0);
  const panel = document.createElement('section');
  panel.id = 'support-sg-social-services';
  panel.className = 'donation-panel';
  panel.setAttribute('aria-labelledby', 'donation-title');
  panel.innerHTML = `
    <div class="donation-intro">
      <h2 id="donation-title">Make sure SG Social Services remains free for all in 2027</h2>
      <p>Your donations ensure that our site infrastructure and AI Assistants can keep running effortlessly, and so that we can continue developing additional features on this platform!</p>
      <a class="donation-button" href="https://buymeacoffee.com/sgsocialservices">Donate on Buy Me a Coffee <span aria-hidden="true">↗</span></a>
    </div>
    <div class="donation-goals">
      <div class="donation-campaign">
        <p><strong id="donation-progress-label">2027 website costs</strong></p>
        <p id="donation-progress-details"><strong>${money(raised)} donated</strong> of ${money(annualGoal)} needed</p>
        <progress value="${Math.min(raised, annualGoal)}" max="${annualGoal}" aria-labelledby="donation-progress-label" aria-describedby="donation-progress-details"></progress>
        <p>${remaining ? `${money(remaining)} still needed` : '2027 goal reached'}</p>
      </div>
      <p class="donation-app"><strong>Mobile app goal</strong><span>${money(appGoal)} needed (one-time)</span></p>
    </div>`;

  const footer = document.querySelector('body > footer');
  if (footer) footer.before(panel);
  else document.body.append(panel);

  const actions = document.querySelector('header.top .header-actions');
  if (actions) {
    const shortcut = document.createElement('a');
    shortcut.className = 'donation-shortcut';
    shortcut.href = `#${panel.id}`;
    shortcut.textContent = 'Support us';
    actions.append(shortcut);
  }
})();
