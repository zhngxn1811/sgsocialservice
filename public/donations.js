(() => {
  const raised = 30;
  const monthlyGoal = 105;
  const appGoal = 145;
  const money = amount => `S$${amount.toLocaleString('en-SG', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2 })}`;
  const remaining = Math.max(monthlyGoal - raised, 0);
  const panel = document.createElement('section');
  panel.id = 'support-sg-social-services';
  panel.className = 'donation-panel';
  panel.setAttribute('aria-labelledby', 'donation-title');
  panel.innerHTML = `
    <div class="donation-intro">
      <h2 id="donation-title">Help keep SG Social Services free for everyone</h2>
      <p>Donations help cover the cost of running this volunteer-run website.</p>
      <a class="donation-button" href="https://buymeacoffee.com/sgsocialservices">Donate on Buy Me a Coffee <span aria-hidden="true">↗</span></a>
    </div>
    <div class="donation-goals">
      <div class="donation-monthly">
        <p><strong id="donation-progress-label">Monthly website costs</strong></p>
        <p id="donation-progress-details"><strong>${money(raised)} donated</strong> of ${money(monthlyGoal)} needed per month</p>
        <progress value="${Math.min(raised, monthlyGoal)}" max="${monthlyGoal}" aria-labelledby="donation-progress-label" aria-describedby="donation-progress-details"></progress>
        <p>${remaining ? `${money(remaining)} still needed` : 'Monthly goal reached'}</p>
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
