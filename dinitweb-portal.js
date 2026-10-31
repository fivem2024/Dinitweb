(() => {
  const config = window.DINITWEB_CONFIG || {};
  const apiBase = String(config.apiUrl || "").replace(/\/+$/, "");
  const authKey = "dinitweb_session";
  const state = { token: sessionStorage.getItem(authKey) || "", user: null, pendingEmail: "", selectedThread: null, portalThreads: [] };
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  async function api(path, { method = "GET", body, auth = true } = {}) {
    if (!apiBase || apiBase.includes("REPLACE-WITH")) throw new Error("Formularen og kundeportalen er ikke tilgængelig lige nu. Prøv igen senere.");
    const headers = { "Content-Type": "application/json" };
    if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;
    let response;
    try {
      response = await fetch(`${apiBase}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, mode: "cors", cache: "no-store" });
    } catch {
      throw new Error("Vi kunne ikke få forbindelse til formularen. Prøv igen om lidt.");
    }
    let data = {};
    try { data = await response.json(); } catch { /* Return a clear fallback below. */ }
    if (!response.ok) {
      if (response.status === 401) clearSession();
      throw new Error(data.error || "Noget gik galt. Prøv igen.");
    }
    return data;
  }
  window.dinitAdminRequest = (path, options = {}) => api(path, { ...options, auth: true });

  function saveSession(data) {
    state.token = data.token;
    state.user = data.user;
    sessionStorage.setItem(authKey, data.token);
  }
  function clearSession() {
    state.token = "";
    state.user = null;
    sessionStorage.removeItem(authKey);
  }

  function portalOverlay(title, body, compact = false) {
    document.getElementById("dinitPortalOverlay")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "dinitPortalOverlay";
    overlay.innerHTML = `<section class="dinit-dialog ${compact ? "compact" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="dinit-dialog-head"><h2>${esc(title)}</h2><button class="dinit-close" type="button" aria-label="Luk" data-close>×</button></header><div class="dinit-dialog-body">${body}</div></section>`;
    overlay.addEventListener("click", (event) => { if (event.target === overlay || event.target.closest("[data-close]")) overlay.remove(); });
    document.body.appendChild(overlay);
    return overlay;
  }

  function authView(mode, message = "") {
    const isRegister = mode === "register";
    const isVerify = mode === "verify";
    const title = isVerify ? "Bekræft din e-mail" : isRegister ? "Opret en bruger" : "Log ind";
    const fields = isVerify
      ? `<p class="dinit-muted">Vi har sendt en sekscifret kode til <b>${esc(state.pendingEmail)}</b>. Koden gælder i 15 minutter.</p><form class="dinit-form" id="dinitAuthForm"><label>Bekræftelseskode<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="123456"></label><button type="submit">Bekræft og fortsæt</button></form>`
      : `<div class="dinit-brand">Dinit<em>Web</em></div><p class="dinit-muted">${isRegister ? "Opret en konto for at følge dine henvendelser og svar." : "Log ind for at se dine henvendelser eller åbne admin-panelet."}</p><form class="dinit-form" id="dinitAuthForm">${isRegister ? `<label>Dit navn<input name="name" autocomplete="name" maxlength="100" required></label><label>Telefonnummer<input name="phone" type="tel" autocomplete="tel" maxlength="40" required></label>` : ""}<label>E-mail<input name="email" type="email" autocomplete="email" maxlength="190" required value="${isRegister ? "" : esc(state.pendingEmail)}"></label><label>Adgangskode<input name="password" type="password" autocomplete="${isRegister ? "new-password" : "current-password"}" minlength="${isRegister ? "12" : "1"}" maxlength="200" required placeholder="${isRegister ? "Mindst 12 tegn" : ""}"></label><button type="submit">${isRegister ? "Opret konto og send kode" : "Log ind"}</button></form>${isRegister ? `<p class="dinit-muted dinit-privacy-note">Vi bruger dine oplysninger til at oprette og administrere din konto og dine henvendelser. Læs vores <a href="privatlivspolitik.html" target="_blank" rel="noopener">privatlivspolitik</a>.</p>` : ""}<div class="dinit-links"><button type="button" data-mode="${isRegister ? "login" : "register"}">${isRegister ? "Jeg har allerede en bruger" : "Opret en ny bruger"}</button></div>`;
    const view = portalOverlay(title, `<div class="dinit-auth-content">${fields}${message ? `<p class="dinit-error" role="alert">${esc(message)}</p>` : ""}</div>`, true);
    view.querySelector("[data-mode]")?.addEventListener("click", (event) => authView(event.currentTarget.dataset.mode));
    view.querySelector("#dinitAuthForm")?.addEventListener("submit", (event) => submitAuth(event, mode));
  }

  async function submitAuth(event, mode) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      if (mode === "register") {
        state.pendingEmail = values.email.trim().toLowerCase();
        await api("/api/auth/register", { method: "POST", body: values, auth: false });
        authView("verify");
      } else if (mode === "verify") {
        const result = await api("/api/auth/verify", { method: "POST", body: { email: state.pendingEmail, code: values.code }, auth: false });
        saveSession(result);
        await routeUserAfterAuth();
      } else {
        state.pendingEmail = values.email.trim().toLowerCase();
        const result = await api("/api/auth/login", { method: "POST", body: values, auth: false });
        saveSession(result);
        await routeUserAfterAuth();
      }
    } catch (error) {
      authView(mode, error.message);
    }
  }

  async function routeUserAfterAuth() {
    if (state.user?.role === "admin" || state.user?.role === "staff") {
      document.getElementById("dinitPortalOverlay")?.remove();
      showAdmin();
      showInbox();
    } else {
      await customerPortal();
    }
  }

  window.openDinitPortal = async () => {
    if (!state.token) { authView("login"); return; }
    try {
      const result = await api("/api/me");
      state.user = result.user;
      await routeUserAfterAuth();
    } catch {
      clearSession();
      authView("login");
    }
  };

  async function logout() {
    try { await api("/api/auth/logout", { method: "POST" }); } catch { /* Local sign-out still clears the browser token. */ }
    clearSession();
    document.getElementById("dinitPortalOverlay")?.remove();
    showSite();
  }

  async function customerPortal() {
    const result = await api("/api/my-threads");
    state.portalThreads = result.threads || [];
    const rows = state.portalThreads.length ? state.portalThreads.map((thread) => `<button class="dinit-thread-row" data-thread="${esc(thread.id)}"><span class="dinit-thread-status ${thread.status === "closed" ? "closed" : ""}">${thread.status === "closed" ? "Lukket" : "Åben"}</span><strong>${esc(thread.subject)}</strong><small>${formatDate(thread.updated_at)}</small></button>`).join("") : `<div class="dinit-empty">Der er ingen henvendelser på din konto endnu.<br>Brug formularen på hjemmesiden, mens du er logget ind, så bliver beskeden knyttet til din konto.</div>`;
    const view = portalOverlay("Mine henvendelser", `<div class="dinit-portal-top"><div><div class="dinit-brand">Hej, ${esc(state.user.name)}</div><p>${esc(state.user.email)}</p></div><button class="dinit-logout" type="button" data-logout>Log ud</button></div><div class="dinit-thread-list">${rows}</div>`);
    view.querySelector("[data-logout]").addEventListener("click", logout);
    view.querySelectorAll("[data-thread]").forEach((button) => button.addEventListener("click", () => customerThread(button.dataset.thread)));
  }

  async function customerThread(id) {
    const result = await api(`/api/my-threads/${encodeURIComponent(id)}/messages`);
    const messages = (result.messages || []).map(messageMarkup).join("");
    const view = portalOverlay(result.thread.subject, `<button class="dinit-back" type="button" data-back>← Mine henvendelser</button><div class="dinit-contact-card"><b>Status:</b> ${result.thread.status === "closed" ? "Lukket" : "Åben"}</div><div class="dinit-conversation">${messages || `<div class="dinit-empty">Ingen beskeder endnu.</div>`}</div>${result.thread.status === "open" ? `<form class="dinit-form" id="dinitCustomerReply"><label>Svar på henvendelsen<textarea name="message" rows="3" maxlength="5000" required></textarea></label><button type="submit">Send svar</button><div class="dinit-message-status" role="status"></div></form>` : ""}`);
    view.querySelector("[data-back]").addEventListener("click", customerPortal);
    view.querySelector("#dinitCustomerReply")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector("button");
      button.disabled = true;
      try {
        const response = await api(`/api/my-threads/${encodeURIComponent(id)}/messages`, { method: "POST", body: { message: new FormData(form).get("message") } });
        await customerThread(id);
        if (!response.notified) toast("Beskeden er gemt, men e-mailnotifikationen blev ikke sendt.");
      } catch (error) { button.disabled = false; form.querySelector(".dinit-message-status").textContent = error.message; }
    });
  }

  function messageMarkup(message) {
    return `<article class="dinit-message ${message.author_role === "admin" ? "admin" : ""}"><strong>${esc(message.author_name)}${message.author_role === "admin" ? " · DinitWeb" : ""}</strong><time>${formatDate(message.created_at)}</time><p>${esc(message.body)}</p></article>`;
  }
  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  const inboxSection = `<section class="section-view" id="view-inbox"><div class="page-title"><div><h1>Henvendelser</h1><p>Læs og besvar beskeder fra kontaktformularen.</p></div><button class="action light" id="refreshDinitInbox">↻ Opdater</button></div><div class="admin-inbox"><aside class="admin-inbox-list"><h3>Indbakke</h3><div class="admin-inbox-items" id="adminInboxItems"><div class="empty-note">Henter henvendelser…</div></div></aside><section class="admin-inbox-detail" id="adminInboxDetail"><div class="admin-inbox-empty">Vælg en henvendelse for at læse og svare.</div></section></div></section>`;
  let activeThread = null;
  let cachedThreads = [];

  function installInbox() {
    const adminContent = document.querySelector(".admin-content");
    if (!adminContent || document.getElementById("view-inbox")) return;
    document.getElementById("view-customers")?.insertAdjacentHTML("afterend", inboxSection);
    const nav = document.createElement("button");
    nav.className = "side-link";
    nav.dataset.page = "inbox";
    nav.innerHTML = `<span class="ico">✉</span><span class="label">Henvendelser</span>`;
    const customersLink = document.querySelector('.side-link[data-page="customers"]');
    customersLink?.insertAdjacentElement("afterend", nav);
    nav.addEventListener("click", showInbox);
    document.getElementById("refreshDinitInbox")?.addEventListener("click", loadInbox);
    const topActions = document.querySelector(".admin-top .top-actions");
    if (topActions && !document.getElementById("dinitAdminLogout")) {
      const button = document.createElement("button");
      button.id = "dinitAdminLogout";
      button.className = "dinit-admin-logout";
      button.type = "button";
      button.textContent = "Log ud";
      button.addEventListener("click", logout);
      topActions.appendChild(button);
      const date = topActions.querySelector("span");
      if (date) date.textContent = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
    }
  }

  async function showInbox() {
    installInbox();
    document.querySelectorAll(".section-view").forEach((section) => section.classList.remove("active"));
    document.getElementById("view-inbox")?.classList.add("active");
    document.querySelectorAll(".side-link[data-page]").forEach((link) => link.classList.toggle("selected", link.dataset.page === "inbox"));
    const crumb = document.getElementById("crumb");
    if (crumb) crumb.textContent = "Henvendelser";
    await loadInbox();
  }

  async function loadInbox() {
    const list = document.getElementById("adminInboxItems");
    if (!list) return;
    list.innerHTML = `<div class="empty-note">Henter henvendelser…</div>`;
    try {
      const response = await api("/api/threads");
      cachedThreads = response.threads || [];
      list.innerHTML = cachedThreads.length ? cachedThreads.map((thread) => `<button class="admin-inbox-row ${activeThread === thread.id ? "selected" : ""}" data-thread="${esc(thread.id)}"><strong>${esc(thread.contact_name)} · ${esc(thread.subject)}</strong><small>${esc(thread.contact_email)} · ${esc(thread.contact_phone)} · ${formatDate(thread.updated_at)}</small><p>${esc(thread.last_message || "")}</p></button>`).join("") : `<div class="empty-note">Indbakken er tom endnu.</div>`;
      list.querySelectorAll("[data-thread]").forEach((button) => button.addEventListener("click", () => openAdminThread(button.dataset.thread)));
      if (activeThread && cachedThreads.some((thread) => thread.id === activeThread)) await openAdminThread(activeThread, false);
    } catch (error) { list.innerHTML = `<div class="dinit-error">${esc(error.message)}</div>`; }
  }

  async function openAdminThread(id, refreshList = true) {
    activeThread = id;
    if (refreshList) await loadInbox();
    const thread = cachedThreads.find((item) => item.id === id);
    if (!thread) return;
    try {
      const result = await api(`/api/threads/${encodeURIComponent(id)}/messages`);
      const detail = document.getElementById("adminInboxDetail");
      detail.innerHTML = `<div class="dinit-portal-top"><div><h3>${esc(thread.subject)}</h3><p>${esc(thread.contact_name)} · ${esc(thread.contact_email)}</p></div><div><button class="dinit-logout" type="button" id="dinitToggleStatus">${thread.status === "closed" ? "Genåbn" : "Luk henvendelse"}</button>${state.user?.isOwner ? ' <button class="dinit-logout" type="button" id="dinitDeleteThread">Slet</button>' : ""}</div></div><div class="dinit-contact-card"><b>Telefon:</b> ${esc(thread.contact_phone)}<br><b>E-mail:</b> ${esc(thread.contact_email)}<br><b>Modtaget:</b> ${formatDate(thread.created_at)}</div><div class="dinit-conversation">${(result.messages || []).map(messageMarkup).join("")}</div><form class="dinit-form" id="dinitAdminReply"><label>Svar kunden<textarea name="message" rows="4" maxlength="5000" required placeholder="Skriv dit svar her…"></textarea></label><button type="submit">Send svar og e-mail til kunden</button><div class="dinit-message-status" role="status"></div></form>`;
      detail.querySelector("#dinitToggleStatus").addEventListener("click", () => toggleThreadStatus(thread));
      detail.querySelector("#dinitDeleteThread")?.addEventListener("click", () => deleteThread(thread));
      detail.querySelector("#dinitAdminReply").addEventListener("submit", (event) => submitAdminReply(event, thread));
      const conversation = detail.querySelector(".dinit-conversation");
      conversation.scrollTop = conversation.scrollHeight;
    } catch (error) {
      document.getElementById("adminInboxDetail").innerHTML = `<div class="admin-inbox-empty">${esc(error.message)}</div>`;
    }
  }

  async function submitAdminReply(event, thread) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const result = await api(`/api/threads/${encodeURIComponent(thread.id)}/reply`, { method: "POST", body: { message: new FormData(form).get("message") } });
      await openAdminThread(thread.id);
      toast(result.message);
    } catch (error) { button.disabled = false; form.querySelector(".dinit-message-status").textContent = error.message; }
  }

  async function toggleThreadStatus(thread) {
    try {
      await api(`/api/threads/${encodeURIComponent(thread.id)}/status`, { method: "PATCH", body: { status: thread.status === "closed" ? "open" : "closed" } });
      await loadInbox();
    } catch (error) { toast(error.message); }
  }

  async function deleteThread(thread) {
    if (!window.confirm(`Slet henvendelsen fra ${thread.contact_name} og hele beskedtråden? Dette kan ikke fortrydes.`)) return;
    try {
      await api(`/api/threads/${encodeURIComponent(thread.id)}`, { method: "DELETE" });
      activeThread = null;
      document.getElementById("adminInboxDetail").innerHTML = `<div class="admin-inbox-empty">Vælg en henvendelse for at læse og svare.</div>`;
      await loadInbox();
      toast("Henvendelsen er slettet.");
    } catch (error) { toast(error.message); }
  }

  const contactForm = document.getElementById("dinitContactForm");
  contactForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    const status = document.getElementById("contactFormStatus");
    button.disabled = true;
    status.className = "form-status";
    status.textContent = "Sender din henvendelse…";
    const data = Object.fromEntries(new FormData(form));
    try {
      const result = await api("/api/contact", { method: "POST", body: { ...data, subject: "Henvendelse fra DinitWebs hjemmeside" }, auth: Boolean(state.token) });
      form.reset();
      status.className = "form-status success";
      status.textContent = result.message || "Tak for din henvendelse. Vi kontakter dig hurtigst muligt og senest inden for 3 arbejdsdage.";
      if (!result.notified) status.textContent += " Din henvendelse er gemt, men e-mailbeskeden til virksomheden kunne ikke sendes.";
      if (state.user?.role === "customer" && document.getElementById("dinitPortalOverlay")) await customerPortal();
    } catch (error) {
      status.className = "form-status error";
      status.textContent = error.message;
    } finally { button.disabled = false; }
  });

  installInbox();
  window.showAdmin = () => {
    if (state.user?.role !== "admin" && state.user?.role !== "staff") { window.openDinitPortal(); return; }
    window.dinitCurrentUser = state.user;
    document.getElementById("publicSite")?.classList.add("hidden");
    document.getElementById("adminApp")?.classList.add("active");
    history.replaceState(null, "", "#admin");
    window.dispatchEvent(new Event("dinit:admin-ready"));
  };

  const token = state.token;
  if (token) {
    api("/api/me").then(async ({ user }) => {
      state.user = user;
      if (location.hash === "#admin" && (user.role === "admin" || user.role === "staff")) { showAdmin(); await showInbox(); }
      else if (location.hash === "#admin") await customerPortal();
      else if (location.hash === "#portal") await routeUserAfterAuth();
    }).catch(() => { clearSession(); if (location.hash === "#admin") showSite(); });
  } else if (location.hash === "#admin") {
    showSite();
  }
})();

