(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = (path, options = {}) => {
    if (typeof window.dinitAdminRequest !== 'function') throw new Error('Admin-panelets API er ikke indlæst. Genindlæs siden.');
    return window.dinitAdminRequest(path, options);
  };

  const style = document.createElement('style');
  style.textContent = `
  #view-employment-contracts .employment-grid{display:grid;grid-template-columns:minmax(300px,.9fr) minmax(380px,1.1fr);gap:18px;align-items:start}
  #view-employment-contracts .employment-form,#view-staff .staff-form{display:grid;grid-template-columns:1fr 1fr;gap:13px}
  #view-employment-contracts .employment-form label,#view-staff .staff-form label{display:flex;flex-direction:column;gap:7px;color:#b8c9db;font-size:12px}
  #view-employment-contracts .employment-form input,#view-employment-contracts .employment-form select,#view-employment-contracts .employment-form textarea,#view-staff .staff-form input{width:100%;border:1px solid #294158;background:#071321;color:#eef5fc;border-radius:8px;padding:11px 12px;font:inherit;min-width:0}
  #view-employment-contracts .employment-form textarea{min-height:180px;resize:vertical;line-height:1.55}
  #view-employment-contracts .employment-form .wide,#view-staff .staff-form .wide{grid-column:1/-1}
  #view-employment-contracts .employment-list{display:grid;gap:10px}
  .employment-record{border:1px solid #213951;border-radius:10px;padding:15px;background:#0d1c2c}
  .employment-record h3{margin:0 0 5px;color:#f1f6fc}.employment-record p{margin:4px 0;color:#a9bdd2;font-size:12px}
  .employment-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
  .employment-actions button,.staff-remove{border:1px solid #294158;background:#102238;color:#eaf2fb;border-radius:7px;padding:8px 11px;cursor:pointer;font:inherit;font-size:12px}
  .employment-actions .danger,.staff-remove{color:#ffb4b4;border-color:#6a3439}
  #view-staff .staff-note{border:1px solid #294158;background:#0d1c2c;border-radius:10px;padding:14px;color:#afc2d6;font-size:13px;line-height:1.6;margin:0 0 16px}
  #view-staff .staff-list{display:grid;gap:10px;margin-top:16px}.staff-record{display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid #213951;background:#0d1c2c;border-radius:10px;padding:14px}.staff-record b,.staff-record small{display:block}.staff-record small{color:#9eb2c8;margin-top:4px}
  @media(max-width:900px){#view-employment-contracts .employment-grid{grid-template-columns:1fr}}
  `;
  style.textContent += `
  #adminApp #view-staff>.card{padding:24px;background:#0d1c2b;border:1px solid #203a55;border-radius:10px;color:#edf5ff}
  #adminApp #view-staff .staff-note{margin:0 0 24px;padding:16px 18px;background:#102238;border:1px solid #29435f;border-radius:8px;color:#a9bdd2;font:400 13px/1.7 Arial,sans-serif}
  #adminApp #view-staff form.staff-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;max-width:800px}
  #adminApp #view-staff form.staff-form>label{display:flex;flex-direction:column;gap:8px;min-width:0;margin:0;color:#c4d4e7;font:600 12px/1.5 Arial,sans-serif}
  #adminApp #view-staff form.staff-form input{display:block;box-sizing:border-box;width:100%;min-width:0;min-height:44px;margin:0;padding:11px 13px;border:1px solid #29435f;border-radius:7px;background:#071321;color:#eef5fc;font:400 13px/1.5 Arial,sans-serif;color-scheme:dark}
  #adminApp #view-staff form.staff-form input:focus{outline:none;border-color:#168bfa;box-shadow:0 0 0 3px #168bfa24}
  #adminApp #view-staff form.staff-form input::placeholder{color:#7188a2}
  #adminApp #view-staff form.staff-form>.wide{grid-column:1/-1}
  #adminApp #view-staff form.staff-form>button{justify-self:start;min-height:42px;padding:11px 18px;border:0;border-radius:7px;background:#087cf0;color:white;font:700 12px/1.5 Arial,sans-serif;cursor:pointer}
  #adminApp #view-staff .staff-list{margin-top:28px;padding-top:22px;border-top:1px solid #29435f;display:grid;gap:12px}
  #adminApp #view-staff .staff-record{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px;background:#102238;border:1px solid #29435f;border-radius:8px;font-size:13px}
  #adminApp #view-staff .staff-record small{font-size:12px;line-height:1.6;overflow-wrap:anywhere}
  #adminApp #view-staff .empty-note{font-size:12px;line-height:1.6;color:#9eb1c7}
  #adminApp .employment-preview{grid-column:1/-1;padding:18px;background:#071321;border:1px solid #29435f;border-radius:8px;min-width:0}
  #adminApp .employment-preview[hidden]{display:none}
  #adminApp .employment-preview h3{margin:0;color:#edf5ff;font-size:15px}
  #adminApp .employment-preview p{margin:8px 0 16px;color:#9eb1c7;font-size:12px;line-height:1.6}
  #adminApp .employment-preview pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:#c4d4e7;font:400 13px/1.8 Arial,sans-serif}
  @media(max-width:600px){#adminApp #view-staff form.staff-form{grid-template-columns:1fr}#adminApp #view-staff>.card{padding:17px}#adminApp #view-staff .staff-record{align-items:flex-start;flex-direction:column}}
  `;
  document.head.append(style);

  const sidebar = $('.sidebar');
  if (!sidebar) return;
  const navButton = (page, icon, label) => { const b = document.createElement('button'); b.className = 'side-link'; b.dataset.page = page; b.innerHTML = `<span class="ico">${icon}</span><span class="label">${label}</span>`; b.addEventListener('click', () => window.go?.(page)); return b; };
  const contractLink = $('[data-page="contracts"]');
  const adminLabel = Array.from(sidebar.querySelectorAll('.side-label')).find(el => el.textContent.trim().toLowerCase() === 'administration');
  if (contractLink && ! $('[data-page="employment-contracts"]')) contractLink.after(navButton('employment-contracts', '▧', 'Ansættelseskontrakter'));
  const settingsLink = $('[data-page="settings"]');
  if (settingsLink && ! $('[data-page="staff"]')) settingsLink.before(navButton('staff', '♙', 'Medarbejdere'));

  const settingsView = $('#view-settings');
  if (settingsView && !$('#view-employment-contracts')) {
    const employmentView = document.createElement('section');
    employmentView.className = 'section-view';
    employmentView.id = 'view-employment-contracts';
    employmentView.innerHTML = `<div class="page-title"><div><div class="admin-eyebrow">Personale</div><h1>Ansættelseskontrakter</h1><p>Opret et udkast med standardtekst eller skriv din egen aftale. Udskriv eller gem som PDF.</p></div><button class="action" type="button" id="employmentNew">＋ Ny ansættelseskontrakt</button></div>
      <div class="employment-grid"><div class="card"><div class="card-head"><div><h3>Opret ansættelseskontrakt</h3><p>Udfyld medarbejderens oplysninger og aftalens vilkår.</p></div></div>
      <form id="employmentForm" class="employment-form">
        <label>Medarbejderens fulde navn<input name="employee_name" required maxlength="120" placeholder="Navn Efternavn"></label>
        <label>Stilling<input name="job_title" required maxlength="160" placeholder="Fx Webudvikler"></label>
        <label>E-mail<input name="employee_email" type="email" maxlength="190" placeholder="medarbejder@eksempel.dk"></label>
        <label>Telefon<input name="employee_phone" type="tel" maxlength="40" placeholder="Telefonnummer"></label>
        <label>Startdato<input name="start_date" type="date"></label>
        <label>Aftaletype<select name="mode" id="employmentMode"><option value="standard">Standardudkast</option><option value="custom">Egen aftaletekst</option></select></label>
        <label class="wide">Kontrakttitel<input name="title" required maxlength="200" value="Ansættelsesaftale"></label>
        <label>Løn / vederlag<input name="pay" maxlength="160" placeholder="Udfyld aftalt løn eller skriv i vilkårene"></label>
        <label>Arbejdstid<input name="hours" maxlength="160" placeholder="Udfyld aftalt arbejdstid"></label>
        <label class="wide">Arbejdssted<input name="workplace" maxlength="240" placeholder="Udfyld aftalt arbejdssted"></label>
        <label class="wide" id="employmentBodyLabel">Aftale og særlige vilkår<textarea name="body" id="employmentBody" maxlength="12000" placeholder="Skriv særlige vilkår. Standardudkastet tilpasses medarbejderens oplysninger."></textarea></label>
        <p class="wide empty-note" id="employmentHint">Standardudkastet udfyldes med navn, stilling, startdato og de løn-/arbejdstidsoplysninger, du angiver. Gennemgå alle vilkår og få aftalen kontrolleret, før den underskrives.</p>
        <button class="action wide" type="submit">Gem kontrakt og lav PDF</button>
      </form></div><div class="card"><div class="card-head"><div><h3>Gemte kontrakter</h3><p>Udkast kan åbnes og gemmes som PDF igen.</p></div><button class="subtle" type="button" id="employmentRefresh">Opdater</button></div><div class="employment-list" id="employmentList"><p class="empty-note">Henter kontrakter…</p></div></div></div>`;
    settingsView.before(employmentView);
  }
  if (settingsView && !$('#view-staff')) {
    const staffView = document.createElement('section');
    staffView.className = 'section-view'; staffView.id = 'view-staff';
    staffView.innerHTML = `<div class="page-title"><div><div class="admin-eyebrow">Administration</div><h1>Medarbejdere</h1><p>Giv medarbejdere adgang til de daglige opgaver i admin-panelet.</p></div></div>
      <div class="card"><div class="staff-note">Medarbejdere kan oprette kunder, journalnotater, kontrakter og fakturaer samt læse og besvare henvendelser. Kun ejeren kan oprette eller fjerne medarbejderadgang, ændre indstillinger og slette kunder, journalnotater, henvendelser, fakturaer og kontrakter.<br><br>Når du opretter en medarbejder, skal personen vælge <b>Opret bruger</b> med den samme e-mailadresse, oprette en adgangskode og bekræfte e-mailen. Hvis personen allerede har en konto, kan vedkommende logge ind igen.</div>
      <form class="staff-form" id="staffForm"><label>Medarbejderens navn<input name="name" required maxlength="100" placeholder="Navn Efternavn"></label><label>E-mail<input name="email" required type="email" maxlength="190" placeholder="medarbejder@firma.dk"></label><label class="wide">Telefon (valgfri)<input name="phone" type="tel" maxlength="40" placeholder="Telefonnummer"></label><button class="action wide" type="submit">＋ Opret medarbejder</button></form>
      <div class="staff-list" id="staffList"><p class="empty-note">Henter medarbejdere…</p></div></div>`;
    settingsView.before(staffView);
  }

  const staffView = $('#view-staff');
  const staffForm = $('#staffForm');
  let staffRecords = [];
  let staffDialog;
  if (staffView && staffForm) {
    staffDialog = document.createElement('dialog');
    staffDialog.id = 'staffDialog';
    staffDialog.className = 'modal';
    staffDialog.innerHTML = '<h2>Opret medarbejder</h2><p>Giv adgang til kunder, journaler, kontrakter, fakturaer og henvendelser.</p>';
    staffForm.className = 'form-grid';
    const passwordField = document.createElement('label');
    passwordField.className = 'field wide';
    passwordField.textContent = 'Adgangskode til medarbejderen';
    const passwordInput = document.createElement('input');
    passwordInput.type = 'password'; passwordInput.name = 'password'; passwordInput.required = true;
    passwordInput.minLength = 12; passwordInput.maxLength = 200; passwordInput.autocomplete = 'new-password';
    passwordInput.placeholder = 'Mindst 12 tegn';
    passwordField.append(passwordInput);
    staffForm.querySelector('[type="submit"]').before(passwordField);
    staffForm.querySelectorAll('label').forEach(label => label.classList.add('field'));
    const submit = staffForm.querySelector('[type="submit"]');
    const actions = document.createElement('div');
    actions.className = 'modal-actions wide';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'action light'; cancel.textContent = 'Annuller';
    cancel.addEventListener('click', () => staffDialog.close());
    actions.append(cancel, submit);
    staffForm.append(actions);
    staffDialog.append(staffForm);
    $('#adminApp').append(staffDialog);
    staffView.innerHTML = '<div class="page-title"><div><div class="admin-eyebrow">Medarbejderkartotek</div><h1>Medarbejdere</h1><p>Administrer medarbejdernes adgang til admin-panelet.</p></div><button class="action" id="staffNew" type="button">＋ Opret medarbejder</button></div><div class="card"><div class="toolbar" style="justify-content:space-between;align-items:center"><input id="staffSearch" type="search" placeholder="Søg efter navn eller e-mail…" aria-label="Søg medarbejdere"><span id="staffCount" style="font-size:11px;color:#9eb1c7">0 medarbejdere</span></div><div style="overflow-x:auto"><table class="table"><thead><tr><th>Medarbejder</th><th>Telefon</th><th>Adgang</th><th>Status</th><th></th></tr></thead><tbody id="staffList"><tr><td colspan="5">Henter medarbejdere…</td></tr></tbody></table></div></div><p class="staff-help">Medarbejdere kan oprette og besvare. Kun ejeren kan slette og administrere adgang. Nye medarbejdere opretter en bruger med den samme e-mailadresse og bekræfter deres e-mail.</p>';
    $('#staffNew').addEventListener('click', () => { staffForm.reset(); staffDialog.showModal(); });
    $('#staffSearch').addEventListener('input', () => renderStaff());
    staffDialog.addEventListener('click', event => { if (event.target === staffDialog) { const rect = staffDialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) staffDialog.close(); } });
    style.textContent += `
    #adminApp #view-staff .staff-help{margin:18px 0;color:#9eb1c7;font-size:12px;line-height:1.7;max-width:800px}
    #adminApp #view-staff #staffList{display:table-row-group;margin:0;padding:0;border:0}
    #adminApp #staffDialog{box-sizing:border-box;background:#0d1c2b;border:1px solid #29435f;color:#edf5ff;max-height:90vh;overflow:auto}
    #staffDialog::backdrop{background:#06111fcc;backdrop-filter:blur(3px)}
    #adminApp #staffDialog h2{color:#edf5ff}
    #adminApp #staffDialog>p{color:#9eb1c7;font-size:12px;line-height:1.6}
    #adminApp #staffDialog .field{color:#b8c9db}
    #adminApp #staffDialog input{box-sizing:border-box;width:100%;min-width:0;background:#071321;color:#eef5fc;border:1px solid #29435f;border-radius:6px;padding:11px;font-size:12px}
    #adminApp #staffDialog .wide{grid-column:1/-1}
    #adminApp #staffDialog input:focus{outline:2px solid #168bfa;outline-offset:1px}
    #adminApp #view-staff .table td{vertical-align:middle}
    `;
  }
  if ($('.staff-help')) $('.staff-help').textContent = 'Opret medarbejderen med en adgangskode, som personen selv kan ændre via Skift adgangskode i admin-panelet. Eksisterende bekræftede konti beholder deres nuværende adgangskode. Kun ejeren kan slette og administrere adgang.';
  const passwordDialog = document.createElement('dialog');
  passwordDialog.className = 'modal'; passwordDialog.id = 'passwordDialog';
  passwordDialog.innerHTML = '<h2>Skift adgangskode</h2><p>Opdater adgangskoden til din egen konto.</p><form class="form-grid" id="changePasswordForm"><label class="field wide">Nuværende adgangskode<input name="current_password" type="password" autocomplete="current-password" required maxlength="200"></label><label class="field wide">Ny adgangskode<input name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="200" placeholder="Mindst 12 tegn"></label><label class="field wide">Gentag ny adgangskode<input name="confirm_password" type="password" autocomplete="new-password" required minlength="12" maxlength="200"></label><p id="passwordStatus" class="field wide" role="status"></p><div class="modal-actions wide"><button type="button" class="action light" id="cancelPassword">Annuller</button><button class="action" type="submit">Gem adgangskode</button></div></form>';
  $('#adminApp').append(passwordDialog);
  const passwordButton = document.createElement('button');
  passwordButton.type = 'button'; passwordButton.className = 'side-link'; passwordButton.innerHTML = '<span class="ico">⚿</span><span class="label">Skift adgangskode</span>';
  $('.side-bottom')?.before(passwordButton);
  passwordButton.addEventListener('click', () => { $('#changePasswordForm').reset(); $('#passwordStatus').textContent = ''; passwordDialog.showModal(); });
  $('#cancelPassword').addEventListener('click', () => passwordDialog.close());
  style.textContent += '#adminApp #passwordDialog{box-sizing:border-box;background:#0d1c2b;border:1px solid #29435f;color:#edf5ff;max-height:90vh;overflow:auto}#passwordDialog::backdrop{background:#06111fcc;backdrop-filter:blur(3px)}#passwordDialog .wide{grid-column:1/-1}#passwordDialog input{box-sizing:border-box;width:100%;background:#071321;color:#edf5ff;border:1px solid #29435f;padding:11px;border-radius:6px}#passwordDialog .field,#passwordDialog>p{color:#b8c9db}';
  $('#changePasswordForm').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget, data = Object.fromEntries(new FormData(form));
    const status = $('#passwordStatus'), button = form.querySelector('[type="submit"]');
    if (data.password !== data.confirm_password) { status.textContent = 'De nye adgangskoder er ikke ens.'; return; }
    button.disabled = true; status.textContent = 'Gemmer…';
    try { await api('/api/admin/password', { method: 'POST', body: { current_password: data.current_password, password: data.password } }); form.reset(); status.textContent = 'Adgangskoden er ændret. Andre aktive login er afsluttet.'; }
    catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
  const renderStaff = () => {
    const list = $('#staffList'); if (!list) return;
    const term = ($('#staffSearch')?.value || '').trim().toLocaleLowerCase('da-DK');
    const records = staffRecords.filter(s => `${s.name} ${s.email} ${s.phone || ''}`.toLocaleLowerCase('da-DK').includes(term));
    if ($('#staffCount')) $('#staffCount').textContent = `${records.length} ${records.length === 1 ? 'medarbejder' : 'medarbejdere'}`;
    list.innerHTML = records.length ? records.map(s => `<tr><td class="client-cell"><b>${esc(s.name)}</b><small>${esc(s.email)}</small></td><td>${esc(s.phone || '—')}</td><td><span class="badge blue">Medarbejder</span></td><td><span class="badge">${s.email_verified_at ? 'Konto bekræftet' : 'Afventer bekræftelse'}</span></td><td>${owner ? `<button class="staff-remove" type="button" data-staff-remove="${esc(s.id)}">Fjern adgang</button>` : ''}</td></tr>`).join('') : `<tr><td colspan="5" class="empty-note">${term ? 'Ingen medarbejdere matcher søgningen.' : 'Ingen medarbejdere endnu. Klik på Opret medarbejder for at komme i gang.'}</td></tr>`;
  };
  let owner = false;
  const guardUi = () => {
    owner = Boolean(window.dinitCurrentUser?.isOwner);
    const staffMenu = $('[data-page="staff"]'); if (staffMenu) staffMenu.hidden = !owner;
    const settingsMenu = $('[data-page="settings"]'); if (settingsMenu) settingsMenu.hidden = !owner;
    const staffView = $('#view-staff'); if (staffView && !owner && staffView.classList.contains('active')) window.go?.('dashboard');
    document.querySelectorAll('#adminApp [data-invoice-delete],#adminApp [data-contract-delete],#adminApp [data-delete-note],#adminApp #deleteCustomerButton,#adminApp #dinitDeleteThread,#adminApp [data-employment-delete]').forEach(el => { el.hidden = !owner; });
  };
  document.addEventListener('dinit:admin-ready', () => { guardUi(); window.loadEmploymentContracts?.(); if (owner) window.loadStaff?.(); });
  new MutationObserver(guardUi).observe($('#adminApp'), { childList: true, subtree: true });
  guardUi();

  const standardEmploymentBody = (data) => {
    const val = (key, fallback = 'Aftales skriftligt') => data.get(key)?.trim() || fallback;
    const name = val('employee_name', 'Medarbejderen'), job = val('job_title', 'Stilling aftales'), start = val('start_date', 'Aftales'), pay = val('pay'), hours = val('hours'), place = val('workplace');
    const extra = val('body', 'Ingen særlige vilkår angivet.');
    return [`## 1. Parterne`, `Arbejdsgiver: ${(window.dinitBusinessSettings?.company_name || 'DinitWeb')}.`, `Medarbejder: ${name}${data.get('employee_email') ? ` (${data.get('employee_email')})` : ''}.`, '', `## 2. Stilling og start`, `Medarbejderen ansættes som ${job}. Startdato: ${start}.`, '', `## 3. Arbejdssted og arbejdstid`, `Arbejdssted: ${place}.`, `Arbejdstid: ${hours}.`, '', `## 4. Løn og betaling`, `Løn/vederlag: ${pay}. Eventuelle tillæg, pension, ferie og øvrige vilkår aftales skriftligt mellem parterne.`, '', `## 5. Øvrige vilkår`, extra, '', `## 6. Ændringer og afslutning`, `Ændringer til aftalen skal aftales skriftligt. Opsigelse og øvrige ansættelsesvilkår følger den særskilte aftale og gældende regler.`, '', `## 7. Underskrifter`, `Parterne bekræfter med deres underskrift, at aftalens konkrete vilkår er gennemgået.`, '', `Arbejdsgiver: ${(window.dinitBusinessSettings?.company_name || 'DinitWeb')}`, `Dato og underskrift: ____________________________________`, '', `Medarbejder: ${name}`, `Dato og underskrift: ____________________________________`].join('\n');
  };
  const contractDocument = (contract) => {
    const settings = window.dinitBusinessSettings || {};
    const markup = (text) => String(text || '').split(/\r?\n/).map(line => { const safe = esc(line); const h = line.match(/^#{1,4}\s+(.+)$/); return h ? `<h2>${esc(h[1])}</h2>` : line.startsWith('- ') ? `<p class="li">• ${safe.slice(2)}</p>` : line ? `<p>${safe}</p>` : ''; }).join('');
    const logo = new URL('dinitweb-wordmark.png', location.href).href;
    const win = window.open('', '_blank');
    if (!win) { alert('Tillad pop-ups for at åbne PDF-visningen.'); return; }
    const html = `<!doctype html><html lang="da"><meta charset="utf-8"><title>${esc(contract.title)}</title><style>*{box-sizing:border-box}body{margin:0 auto;padding:16mm;max-width:210mm;background:#06111f;color:#eaf2fb;font:12pt/1.6 Arial,sans-serif}header{display:flex;justify-content:space-between;align-items:center;border:1px solid #294158;border-radius:12px;background:#0d1c2c;padding:16px 20px}header img{width:165px;filter:brightness(0) invert(1)}header div{text-align:right}h1{margin:28px 0 4px}.meta{color:#a9bdd2}.panel{margin-top:20px;padding:22px 26px;background:#0d1c2c;border:1px solid #294158;border-radius:12px}.facts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:22px}.fact{background:#102238;border:1px solid #294158;border-radius:8px;padding:10px}.fact small{display:block;color:#90abc5;text-transform:uppercase}.contract h2{font-size:14pt;margin:22px 0 5px}.contract p{margin:6px 0;white-space:pre-wrap}.sign{margin-top:35px;border-top:1px solid #55708a;padding-top:8px;min-height:60px}.note{font-size:9pt;color:#91a8bf;margin-top:24px}@media print{html,body{background:#06111f!important;color:#eaf2fb!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.panel,header,.fact{break-inside:avoid}.toolbar{display:none}}@page{size:A4;margin:0}</style><body><header><img src="${logo}" alt="DinitWeb"><div><b>${esc(settings.company_name || 'DinitWeb')}</b>${settings.phone ? `<br>Telefon: ${esc(settings.phone)}` : ''}${settings.contact_email ? `<br>${esc(settings.contact_email)}` : ''}</div></header><h1>${esc(contract.title)}</h1><div class="meta">Ansættelsesudkast · Oprettet ${esc(new Date(contract.created_at || Date.now()).toLocaleDateString('da-DK'))}</div><main class="panel"><div class="facts"><div class="fact"><small>Medarbejder</small>${esc(contract.employee_name)}</div><div class="fact"><small>Stilling</small>${esc(contract.job_title)}</div><div class="fact"><small>E-mail</small>${esc(contract.employee_email || '—')}</div><div class="fact"><small>Telefon</small>${esc(contract.employee_phone || '—')}</div><div class="fact"><small>Startdato</small>${esc(contract.start_date || 'Aftales')}</div></div><article class="contract">${markup(contract.body)}</article><div class="sign">Arbejdsgiver · dato og underskrift</div><div class="sign">Medarbejder · dato og underskrift</div><p class="note">Udkast til gennemgang. Kontrollér, at alle vilkår passer til ansættelsen og gældende regler, før aftalen underskrives.</p></main><script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`;
    win.document.open(); win.document.write(html); win.document.close();
  };

  window.loadEmploymentContracts = async () => {
    const list = $('#employmentList'); if (!list) return;
    try { const result = await api('/api/admin/employment-contracts'); const records = result.contracts || []; list.innerHTML = records.length ? records.map(c => `<article class="employment-record"><h3>${esc(c.title)}</h3><p>${esc(c.employee_name)} · ${esc(c.job_title)} · ${esc(c.start_date || 'Startdato aftales')}</p><p>${esc(c.employee_email || 'Ingen e-mail angivet')} · oprettet ${esc(new Date(c.created_at).toLocaleDateString('da-DK'))}</p><div class="employment-actions"><button type="button" data-employment-pdf="${esc(c.id)}">Åbn / gem PDF</button>${owner ? `<button type="button" class="danger" data-employment-delete="${esc(c.id)}">Slet</button>` : ''}</div></article>`).join('') : '<p class="empty-note">Ingen ansættelseskontrakter endnu.</p>'; list._records = records; guardUi(); }
    catch (error) { list.innerHTML = `<p class="empty-note">${esc(error.message)}</p>`; }
  };
  window.loadStaff = async () => {
    const list = $('#staffList'); if (!list || !owner) return;
    try { const result = await api('/api/admin/staff'); staffRecords = result.staff || []; renderStaff(); }
    catch (error) { list.innerHTML = `<tr><td colspan="5" class="empty-note">${esc(error.message)}</td></tr>`; }
  };

  const form = $('#employmentForm');
  const mode = $('#employmentMode');
  const preview = document.createElement('section');
  preview.className = 'employment-preview wide';
  preview.innerHTML = '<h3>Standardtekst til ansættelsesaftalen</h3><p>Teksten opdateres med oplysningerne ovenfor og gemmes i kontrakten.</p><pre></pre>';
  form?.querySelector('[type="submit"]')?.before(preview);
  const updatePreview = () => {
    preview.hidden = mode?.value === 'custom';
    if (form && !preview.hidden) preview.querySelector('pre').textContent = standardEmploymentBody(new FormData(form)).replaceAll('\\n', '\n').replace(/^## /gm, '');
  };
  form?.addEventListener('input', updatePreview);
  mode?.addEventListener('change', updatePreview);
  document.addEventListener('dinit:admin-ready', updatePreview);
  form?.addEventListener('reset', () => setTimeout(updatePreview, 0));
  updatePreview();
  const setMode = () => { const custom = mode?.value === 'custom'; const body = $('#employmentBody'); const hint = $('#employmentHint'); if (body) { body.required = custom; body.placeholder = custom ? 'Skriv hele din egen aftaletekst.' : 'Tilføj særlige vilkår, der skal med i standardudkastet.'; } if (hint) hint.hidden = custom; };
  mode?.addEventListener('change', setMode); setMode();
  $('#employmentNew')?.addEventListener('click', () => { form?.reset(); setMode(); form?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  $('#employmentRefresh')?.addEventListener('click', () => window.loadEmploymentContracts());
  form?.addEventListener('submit', async (event) => {
    event.preventDefault(); const data = new FormData(form); const custom = mode.value === 'custom';
    const payload = Object.fromEntries(data); payload.body = custom ? String(data.get('body') || '').trim() : standardEmploymentBody(data); delete payload.mode; delete payload.pay; delete payload.hours; delete payload.workplace;
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
    try { const result = await api('/api/admin/employment-contracts', { method: 'POST', body: payload }); await window.loadEmploymentContracts(); form.reset(); setMode(); contractDocument(result.contract); }
    catch (error) { alert(error.message); }
    finally { submit.disabled = false; }
  });
  $('#staffForm')?.addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget, button = form.querySelector('[type="submit"]'); button.disabled = true; try { const result = await api('/api/admin/staff', { method: 'POST', body: Object.fromEntries(new FormData(form)) }); staffDialog?.close(); alert(result.message || 'Medarbejderen er oprettet.'); form.reset(); await window.loadStaff(); } catch (error) { alert(error.message); } finally { button.disabled = false; } });
  document.addEventListener('click', async (event) => {
    const pdf = event.target.closest('[data-employment-pdf]');
    if (pdf) { const record = $('#employmentList')?._records?.find(c => c.id === pdf.dataset.employmentPdf); if (record) contractDocument(record); }
    const removeStaff = event.target.closest('[data-staff-remove]');
    if (removeStaff && owner) { if (!confirm('Fjern medarbejderens adgang? Personen mister straks adgang til admin-panelet. Kontoens øvrige oplysninger slettes ikke.')) return; try { await api(`/api/admin/staff/${encodeURIComponent(removeStaff.dataset.staffRemove)}`, { method: 'DELETE' }); await window.loadStaff(); } catch (error) { alert(error.message); } }
    const deleteContract = event.target.closest('[data-employment-delete]');
    if (deleteContract && owner) { if (!confirm('Slet denne ansættelseskontrakt permanent?')) return; try { await api(`/api/admin/employment-contracts/${encodeURIComponent(deleteContract.dataset.employmentDelete)}`, { method: 'DELETE' }); await window.loadEmploymentContracts(); } catch (error) { alert(error.message); } }
  });
})();
