const encoder = new TextEncoder();
const PBKDF2_ITERATIONS = 100_000;
const SESSION_DAYS = 7;
const MAX_BODY_BYTES = 20_000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((v) => v.trim()).filter(Boolean);
    if (origin && !allowed.includes(origin)) return json({ error: "Origin er ikke tilladt." }, 403);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";
      if (path === "/api/health" && request.method === "GET") return json({ ok: true, service: "DinitWeb" }, 200, origin);

      if (path === "/api/auth/register" && request.method === "POST") return await register(request, env, origin);
      if (path === "/api/auth/verify" && request.method === "POST") return await verifyEmail(request, env, origin);
      if (path === "/api/auth/login" && request.method === "POST") return await login(request, env, origin);
      if (path === "/api/auth/logout" && request.method === "POST") return await logout(request, env, origin);
      if (path === "/api/me" && request.method === "GET") {
        const user = await requireUser(request, env);
        return json({ user: await publicUser(user, env) }, 200, origin);
      }
      if (path === "/api/admin/staff" && request.method === "GET") {
        await requireOwner(request, env);
        const rows = await env.DB.prepare(`SELECT u.id, u.name, u.email, u.phone, u.email_verified_at, s.created_at
          FROM staff_accounts s JOIN users u ON u.id = s.user_id ORDER BY s.created_at DESC`).all();
        return json({ staff: rows.results }, 200, origin);
      }
      if (path === "/api/admin/staff" && request.method === "POST") {
        const owner = await requireOwner(request, env);
        const body = await readJson(request);
        const name = text(body.name, 100), email = normalizeEmail(body.email), phone = text(body.phone, 40);
        if (!name || !isEmail(email)) throw new ApiError("Udfyld navn og en gyldig e-mail.", 400, "invalid_staff");
        if (isOwnerEmail(email, env)) throw new ApiError("Ejerkontoen kan ikke oprettes som medarbejder.", 400, "owner_cannot_be_staff");
        let user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
        if (user && await env.DB.prepare("SELECT user_id FROM staff_accounts WHERE user_id = ?").bind(user.id).first()) {
          throw new ApiError("E-mailen er allerede tilknyttet en medarbejder.", 409, "staff_exists");
        }
        if (!user) {
          const id = crypto.randomUUID(), salt = randomHex(16), randomPassword = randomHex(32);
          const passwordHash = await hashPassword(randomPassword, salt);
          await env.DB.prepare(`INSERT INTO users (id, name, email, phone, password_hash, password_salt, role)
            VALUES (?, ?, ?, ?, ?, ?, 'customer')`).bind(id, name, email, phone, passwordHash, salt).run();
          user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
        }
        await env.DB.prepare(`INSERT INTO staff_accounts (user_id, created_by)
          VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING`).bind(user.id, owner.id).run();
        return json({ staff: { id: user.id, name: user.name, email: user.email, phone: user.phone || "", email_verified_at: user.email_verified_at }, message: "Medarbejderen er oprettet. Personen skal oprette adgangskode og bekræfte e-mailen via Opret bruger." }, 201, origin);
      }
      const staffDeleteMatch = path.match(/^\/api\/admin\/staff\/([a-f0-9-]+)$/i);
      if (staffDeleteMatch && request.method === "DELETE") {
        const owner = await requireOwner(request, env);
        const staffId = staffDeleteMatch[1];
        if (staffId === owner.id) throw new ApiError("Ejerkontoen kan ikke fjernes her.", 400, "cannot_remove_owner");
        const staff = await env.DB.prepare("SELECT user_id FROM staff_accounts WHERE user_id = ?").bind(staffId).first();
        if (!staff) throw new ApiError("Medarbejderen blev ikke fundet.", 404, "staff_not_found");
        await env.DB.batch([
          env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(staffId),
          env.DB.prepare("DELETE FROM staff_accounts WHERE user_id = ?").bind(staffId),
          env.DB.prepare("UPDATE users SET role = 'customer' WHERE id = ?").bind(staffId),
        ]);
        return json({ ok: true }, 200, origin);
      }
      if (path === "/api/contact" && request.method === "POST") return await createContact(request, env, origin);
      if (path === "/api/admin/customers" && request.method === "GET") {
        await requireAdmin(request, env);
        const rows = await env.DB.prepare(`SELECT c.*, (SELECT COUNT(*) FROM customer_notes n WHERE n.customer_id = c.id) AS note_count
          FROM customers c ORDER BY c.updated_at DESC LIMIT 500`).all();
        return json({ customers: rows.results }, 200, origin);
      }
      if (path === "/api/admin/customers" && request.method === "POST") {
        const admin = await requireAdmin(request, env);
        const body = await readJson(request);
        const companyName = text(body.company_name, 160);
        const contactName = text(body.contact_name, 120);
        const email = normalizeEmail(body.email);
        const phone = text(body.phone, 40);
        const service = text(body.service, 300);
        const status = text(body.status, 20) || "Lead";
        if (!companyName || !contactName || !isEmail(email) || !["Lead", "Aktiv", "Afventer", "Afsluttet"].includes(status)) {
          throw new ApiError("Udfyld firmanavn, kontaktperson og en gyldig e-mail.", 400, "invalid_customer");
        }
        const id = crypto.randomUUID();
        await env.DB.prepare(`INSERT INTO customers (id, company_name, contact_name, email, phone, service, status)
          VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, companyName, contactName, email, phone, service, status).run();
        const customer = await env.DB.prepare("SELECT * FROM customers WHERE id = ?").bind(id).first();
        return json({ customer, created_by: admin.name }, 201, origin);
      }
      const customerDeleteMatch = path.match(/^\/api\/admin\/customers\/([a-f0-9-]+)$/i);
      if (customerDeleteMatch && request.method === "DELETE") {
        await requireOwner(request, env);
        const result = await env.DB.prepare("DELETE FROM customers WHERE id = ?").bind(customerDeleteMatch[1]).run();
        if (!result.meta?.changes) throw new ApiError("Kundeprofilen blev ikke fundet.", 404, "customer_not_found");
        return json({ ok: true }, 200, origin);
      }
      const noteDeleteMatch = path.match(/^\/api\/admin\/customers\/([a-f0-9-]+)\/notes\/([a-f0-9-]+)$/i);
      if (noteDeleteMatch && request.method === "DELETE") {
        await requireOwner(request, env);
        const result = await env.DB.prepare("DELETE FROM customer_notes WHERE id = ? AND customer_id = ?").bind(noteDeleteMatch[2], noteDeleteMatch[1]).run();
        if (!result.meta?.changes) throw new ApiError("Journalnotatet blev ikke fundet.", 404, "note_not_found");
        await env.DB.prepare("UPDATE customers SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(noteDeleteMatch[1]).run();
        return json({ ok: true }, 200, origin);
      }
      if (path === "/api/admin/invoices" && request.method === "GET") {
        await requireAdmin(request, env);
        const rows = await env.DB.prepare(`SELECT i.*, c.company_name, c.contact_name, c.email, c.phone
          FROM invoices i JOIN customers c ON c.id = i.customer_id ORDER BY i.created_at DESC LIMIT 500`).all();
        return json({ invoices: rows.results }, 200, origin);
      }
      if (path === "/api/admin/invoices" && request.method === "POST") {
        await requireAdmin(request, env);
        const body = await readJson(request);
        const customerId = text(body.customer_id, 64);
        const description = text(body.description, 500);
        const amount = Number(body.amount_dkk);
        const dueDate = text(body.due_date, 10);
        const issueDate = text(body.issue_date, 10) || new Date().toISOString().slice(0, 10);
        if (!customerId || !description || !Number.isSafeInteger(amount) || amount < 1 || !isIsoDate(dueDate) || !isIsoDate(issueDate) || dueDate < issueDate) {
          throw new ApiError("Vælg en kunde, udfyld beskrivelsen, beløbet og gyldige fakturadatoer.", 400, "invalid_invoice");
        }
        if (!await env.DB.prepare("SELECT id FROM customers WHERE id = ?").bind(customerId).first()) throw new ApiError("Kunden blev ikke fundet.", 404, "customer_not_found");
        const id = crypto.randomUUID();
        const invoiceNumber = `DW-${new Date().getFullYear()}-${randomHex(4).toUpperCase()}`;
        await env.DB.prepare(`INSERT INTO invoices (id, invoice_number, customer_id, description, amount_dkk, issue_date, due_date)
          VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, invoiceNumber, customerId, description, amount, issueDate, dueDate).run();
        const invoice = await env.DB.prepare(`SELECT i.*, c.company_name, c.contact_name, c.email, c.phone FROM invoices i
          JOIN customers c ON c.id = i.customer_id WHERE i.id = ?`).bind(id).first();
        return json({ invoice }, 201, origin);
      }
      const invoiceMatch = path.match(/^\/api\/admin\/invoices\/([a-f0-9-]+)$/i);
      if (invoiceMatch) {
        if (request.method === "DELETE") {
          await requireOwner(request, env);
          const result = await env.DB.prepare("DELETE FROM invoices WHERE id = ?").bind(invoiceMatch[1]).run();
          if (!result.meta?.changes) throw new ApiError("Fakturaen blev ikke fundet.", 404, "invoice_not_found");
          return json({ ok: true }, 200, origin);
        }
        if (request.method === "PATCH") {
          await requireAdmin(request, env);
          const body = await readJson(request);
          if (!["Betalt", "Sendt"].includes(body.status)) throw new ApiError("Vælg betalt eller ikke betalt.", 400, "invalid_invoice_status");
          const result = await env.DB.prepare("UPDATE invoices SET status = ? WHERE id = ?").bind(body.status, invoiceMatch[1]).run();
          if (!result.meta?.changes) throw new ApiError("Fakturaen blev ikke fundet.", 404, "invoice_not_found");
          return json({ ok: true }, 200, origin);
        }
      }
      if (path === "/api/admin/contracts" && request.method === "GET") {
        await requireAdmin(request, env);
        const rows = await env.DB.prepare(`SELECT c.*, k.company_name, k.contact_name, k.email FROM contracts c
          JOIN customers k ON k.id = c.customer_id ORDER BY c.created_at DESC LIMIT 500`).all();
        return json({ contracts: rows.results }, 200, origin);
      }
      if (path === "/api/admin/contracts" && request.method === "POST") {
        await requireAdmin(request, env);
        const body = await readJson(request);
        const customerId = text(body.customer_id, 64);
        const title = text(body.title, 200);
        const contractBody = text(body.body, 12000);
        const startDate = text(body.start_date, 10);
        if (!customerId || !title || !contractBody || (startDate && !isIsoDate(startDate))) throw new ApiError("Vælg en kunde, og udfyld kontrakttitel og indhold.", 400, "invalid_contract");
        if (!await env.DB.prepare("SELECT id FROM customers WHERE id = ?").bind(customerId).first()) throw new ApiError("Kunden blev ikke fundet.", 404, "customer_not_found");
        const id = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO contracts (id, customer_id, title, body, start_date) VALUES (?, ?, ?, ?, ?)").bind(id, customerId, title, contractBody, startDate).run();
        const contract = await env.DB.prepare(`SELECT c.*, k.company_name, k.contact_name, k.email FROM contracts c
          JOIN customers k ON k.id = c.customer_id WHERE c.id = ?`).bind(id).first();
        return json({ contract }, 201, origin);
      }
      if (path === "/api/admin/employment-contracts" && request.method === "GET") {
        await requireAdmin(request, env);
        const rows = await env.DB.prepare("SELECT * FROM employment_contracts ORDER BY created_at DESC LIMIT 500").all();
        return json({ contracts: rows.results }, 200, origin);
      }
      if (path === "/api/admin/employment-contracts" && request.method === "POST") {
        const admin = await requireAdmin(request, env), body = await readJson(request);
        const employeeName = text(body.employee_name, 120), employeeEmail = normalizeEmail(body.employee_email);
        const employeePhone = text(body.employee_phone, 40), jobTitle = text(body.job_title, 160);
        const title = text(body.title, 200), contractBody = text(body.body, 12000), startDate = text(body.start_date, 10);
        if (!employeeName || !title || !jobTitle || !contractBody || (employeeEmail && !isEmail(employeeEmail)) || (startDate && !isIsoDate(startDate))) {
          throw new ApiError("Udfyld medarbejderens navn, stilling, titel og aftaletekst samt en gyldig e-mail/dato.", 400, "invalid_employment_contract");
        }
        const id = crypto.randomUUID();
        await env.DB.prepare(`INSERT INTO employment_contracts (id, employee_name, employee_email, employee_phone, job_title, title, body, start_date, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, employeeName, employeeEmail, employeePhone, jobTitle, title, contractBody, startDate, admin.id).run();
        const contract = await env.DB.prepare("SELECT * FROM employment_contracts WHERE id = ?").bind(id).first();
        return json({ contract }, 201, origin);
      }
      const employmentDeleteMatch = path.match(/^\/api\/admin\/employment-contracts\/([a-f0-9-]+)$/i);
      if (employmentDeleteMatch && request.method === "DELETE") {
        await requireOwner(request, env);
        const result = await env.DB.prepare("DELETE FROM employment_contracts WHERE id = ?").bind(employmentDeleteMatch[1]).run();
        if (!result.meta?.changes) throw new ApiError("Ansættelseskontrakten blev ikke fundet.", 404, "employment_contract_not_found");
        return json({ ok: true }, 200, origin);
      }
      const contractMatch = path.match(/^\/api\/admin\/contracts\/([a-f0-9-]+)$/i);
      if (contractMatch && request.method === "DELETE") {
        await requireOwner(request, env);
        const result = await env.DB.prepare("DELETE FROM contracts WHERE id = ?").bind(contractMatch[1]).run();
        if (!result.meta?.changes) throw new ApiError("Kontrakten blev ikke fundet.", 404, "contract_not_found");
        return json({ ok: true }, 200, origin);
      }
      if (path === "/api/admin/settings" && request.method === "GET") {
        await requireOwner(request, env);
        const settings = await env.DB.prepare("SELECT company_name, contact_email, phone, address, cvr, vat_registered FROM business_settings WHERE id = 1").first();
        return json({ settings }, 200, origin);
      }
      if (path === "/api/admin/settings" && request.method === "PATCH") {
        await requireOwner(request, env);
        const body = await readJson(request);
        const companyName = text(body.company_name, 160);
        const contactEmail = normalizeEmail(body.contact_email);
        const phone = text(body.phone, 40);
        const address = text(body.address, 300);
        const cvr = text(body.cvr, 20);
        const vatRegistered = body.vat_registered === "1" || body.vat_registered === 1 || body.vat_registered === true ? 1 : 0;
        if (!companyName || (contactEmail && !isEmail(contactEmail))) throw new ApiError("Udfyld et virksomhedsnavn og en gyldig e-mail.", 400, "invalid_settings");
        await env.DB.prepare(`UPDATE business_settings SET company_name = ?, contact_email = ?, phone = ?, address = ?, cvr = ?, vat_registered = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = 1`).bind(companyName, contactEmail, phone, address, cvr, vatRegistered).run();
        const settings = await env.DB.prepare("SELECT company_name, contact_email, phone, address, cvr, vat_registered FROM business_settings WHERE id = 1").first();
        return json({ settings }, 200, origin);
      }
      const customerNotesMatch = path.match(/^\/api\/admin\/customers\/([a-f0-9-]+)\/notes$/i);
      if (customerNotesMatch) {
        const admin = await requireAdmin(request, env);
        const customerId = customerNotesMatch[1];
        const customer = await env.DB.prepare("SELECT id FROM customers WHERE id = ?").bind(customerId).first();
        if (!customer) throw new ApiError("Kundeprofilen blev ikke fundet.", 404, "customer_not_found");
        if (request.method === "GET") {
          const rows = await env.DB.prepare("SELECT * FROM customer_notes WHERE customer_id = ? ORDER BY created_at DESC LIMIT 500").bind(customerId).all();
          return json({ notes: rows.results }, 200, origin);
        }
        if (request.method === "POST") {
          const body = await readJson(request);
          const title = text(body.title, 160);
          const noteBody = text(body.body, 5000);
          if (!title || !noteBody) throw new ApiError("Skriv en overskrift og et journalnotat.", 400, "invalid_note");
          const id = crypto.randomUUID();
          await env.DB.prepare("INSERT INTO customer_notes (id, customer_id, title, body, author_name) VALUES (?, ?, ?, ?, ?)")
            .bind(id, customerId, title, noteBody, admin.name).run();
          await env.DB.prepare("UPDATE customers SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(customerId).run();
          const note = await env.DB.prepare("SELECT * FROM customer_notes WHERE id = ?").bind(id).first();
          return json({ note }, 201, origin);
        }
      }
      if (path === "/api/my-threads" && request.method === "GET") {
        const user = await requireUser(request, env);
        const rows = await env.DB.prepare("SELECT * FROM contact_threads WHERE customer_id = ? ORDER BY updated_at DESC LIMIT 50").bind(user.id).all();
        return json({ threads: rows.results }, 200, origin);
      }
      const customerThreadMatch = path.match(/^\/api\/my-threads\/([a-f0-9-]+)\/messages$/i);
      if (customerThreadMatch) {
        const user = await requireUser(request, env);
        const thread = await env.DB.prepare("SELECT * FROM contact_threads WHERE id = ? AND customer_id = ?").bind(customerThreadMatch[1], user.id).first();
        if (!thread) return json({ error: "Henvendelsen blev ikke fundet." }, 404, origin);
        if (request.method === "GET") {
          const messages = await env.DB.prepare("SELECT id, author_role, author_name, body, created_at FROM contact_messages WHERE thread_id = ? ORDER BY created_at ASC").bind(thread.id).all();
          return json({ thread, messages: messages.results }, 200, origin);
        }
        if (request.method === "POST") return await customerReply(request, env, origin, user, thread);
      }
      if (path === "/api/threads" && request.method === "GET") {
        await requireAdmin(request, env);
        const rows = await env.DB.prepare(`
          SELECT t.*, COALESCE(u.name, t.contact_name) AS customer_name,
          (SELECT body FROM contact_messages WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message,
          (SELECT COUNT(*) FROM contact_messages WHERE thread_id = t.id) AS message_count
          FROM contact_threads t LEFT JOIN users u ON u.id = t.customer_id
          ORDER BY t.updated_at DESC LIMIT 200
        `).all();
        return json({ threads: rows.results }, 200, origin);
      }
      const threadMatch = path.match(/^\/api\/threads\/([a-f0-9-]+)(?:\/(messages|reply|status))?$/i);
      if (threadMatch) {
        const [, threadId, action] = threadMatch;
        if (!action && request.method === "DELETE") {
          await requireOwner(request, env);
          const result = await env.DB.prepare("DELETE FROM contact_threads WHERE id = ?").bind(threadId).run();
          if (!result.meta?.changes) throw new ApiError("Henvendelsen blev ikke fundet.", 404, "thread_not_found");
          return json({ ok: true }, 200, origin);
        }
        const admin = await requireAdmin(request, env);
        const thread = await env.DB.prepare("SELECT * FROM contact_threads WHERE id = ?").bind(threadId).first();
        if (!thread) return json({ error: "Henvendelsen blev ikke fundet." }, 404, origin);
        if ((!action || action === "messages") && request.method === "GET") {
          const rows = await env.DB.prepare("SELECT id, author_role, author_name, body, created_at FROM contact_messages WHERE thread_id = ? ORDER BY created_at ASC").bind(threadId).all();
          return json({ thread, messages: rows.results }, 200, origin);
        }
        if (action === "reply" && request.method === "POST") return await replyToContact(request, env, origin, admin, thread);
        if (action === "status" && request.method === "PATCH") return await updateThreadStatus(request, env, origin, thread);
      }
      return json({ error: "Ruten findes ikke." }, 404, origin);
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.message, code: error.code }, error.status, origin);
      console.error("DinitWeb API error", error);
      return json({ error: "Der opstod en fejl. Prøv igen senere." }, 500, origin);
    }
  },
};

async function register(request, env, origin) {
  await rateLimit(request, env, "register", 6, 60);
  const body = await readJson(request);
  const name = text(body.name, 100);
  const email = normalizeEmail(body.email);
  const phone = text(body.phone, 40);
  const password = String(body.password || "");
  if (!name || !isEmail(email) || !phone || password.length < 12 || password.length > 200) {
    throw new ApiError("Udfyld navn, telefon og en gyldig e-mail. Adgangskoden skal være mindst 12 tegn.", 400, "invalid_input");
  }
  const existing = await env.DB.prepare("SELECT id, email_verified_at FROM users WHERE email = ?").bind(email).first();
  if (existing?.email_verified_at) throw new ApiError("Der findes allerede en konto med den e-mailadresse. Log ind i stedet.", 409, "account_exists");

  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  const userId = existing?.id || crypto.randomUUID();
  if (existing) {
    await env.DB.prepare("UPDATE users SET name = ?, phone = ?, password_hash = ?, password_salt = ? WHERE id = ?").bind(name, phone, passwordHash, salt, userId).run();
  } else {
    await env.DB.prepare("INSERT INTO users (id, name, email, phone, password_hash, password_salt) VALUES (?, ?, ?, ?, ?, ?)").bind(userId, name, email, phone, passwordHash, salt).run();
  }
  const code = randomCode();
  await env.DB.prepare(`INSERT INTO verification_codes (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)
    ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0`).bind(email, await keyedHash(code, email, env.APP_SECRET), Date.now() + 15 * 60_000).run();
  await sendMail(env, { to: email, subject: "Bekræft din DinitWeb-konto", text: `Hej ${name}. Din bekræftelseskode er ${code}. Den udløber om 15 minutter.`, html: `<p>Hej ${escapeHtml(name)}.</p><p>Din bekræftelseskode til DinitWeb er <strong>${code}</strong>.</p><p>Koden udløber om 15 minutter.</p>` });
  return json({ message: "Vi har sendt en bekræftelseskode til din e-mail." }, 201, origin);
}

async function verifyEmail(request, env, origin) {
  await rateLimit(request, env, "verify", 8, 60);
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const code = String(body.code || "").trim();
  if (!isEmail(email) || !/^\d{6}$/.test(code)) throw new ApiError("Indtast e-mailadressen og den sekscifrede kode.", 400, "invalid_code");
  const record = await env.DB.prepare("SELECT * FROM verification_codes WHERE email = ?").bind(email).first();
  if (!record || record.expires_at < Date.now() || record.attempts >= 8) throw new ApiError("Koden er udløbet eller kan ikke bruges. Opret kontoen igen for at få en ny kode.", 400, "expired_code");
  const submitted = await keyedHash(code, email, env.APP_SECRET);
  if (submitted !== record.code_hash) {
    await env.DB.prepare("UPDATE verification_codes SET attempts = attempts + 1 WHERE email = ?").bind(email).run();
    throw new ApiError("Koden passer ikke. Prøv igen.", 400, "invalid_code");
  }
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  if (!user) throw new ApiError("Kontoen blev ikke fundet. Opret den igen.", 404, "account_missing");
  const isStaff = Boolean(await env.DB.prepare("SELECT user_id FROM staff_accounts WHERE user_id = ?").bind(user.id).first());
  const role = isOwnerEmail(email, env) ? "admin" : isStaff ? "staff" : "customer";
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET role = ?, email_verified_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(role, user.id),
    env.DB.prepare("DELETE FROM verification_codes WHERE email = ?").bind(email),
  ]);
  const token = await createSession(env, user.id);
  const updatedUser = { ...user, role, email_verified_at: new Date().toISOString() };
  return json({ token, user: await publicUser(updatedUser, env) }, 200, origin);
}

async function login(request, env, origin) {
  await rateLimit(request, env, "login", 10, 60);
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  const candidate = user ? await hashPassword(password, user.password_salt) : await hashPassword(password || "not-a-password", "dinitweb-dummy-salt");
  if (!user || candidate !== user.password_hash) throw new ApiError("E-mail eller adgangskode er forkert.", 401, "invalid_login");
  if (!user.email_verified_at) throw new ApiError("Bekræft først din e-mail. Vælg Opret bruger igen for at få en ny kode.", 403, "email_not_verified");
  const isStaff = Boolean(await env.DB.prepare("SELECT user_id FROM staff_accounts WHERE user_id = ?").bind(user.id).first());
  const role = isOwnerEmail(email, env) ? "admin" : isStaff ? "staff" : "customer";
  if (user.role !== role) {
    await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(role, user.id).run();
    user.role = role;
  }
  const token = await createSession(env, user.id);
  return json({ token, user: await publicUser(user, env) }, 200, origin);
}

async function logout(request, env, origin) {
  const token = bearerToken(request);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return json({ ok: true }, 200, origin);
}

async function createContact(request, env, origin) {
  await rateLimit(request, env, "contact", 5, 600);
  const body = await readJson(request);
  const name = text(body.name, 100);
  const email = normalizeEmail(body.email);
  const phone = text(body.phone, 40);
  const subject = text(body.subject || "Henvendelse fra hjemmesiden", 140);
  const message = text(body.message, 5000);
  if (!name || !isEmail(email) || !phone || message.length < 10) {
    throw new ApiError("Udfyld navn, telefonnummer, e-mail og en besked på mindst 10 tegn.", 400, "invalid_input");
  }
  let customerId = null;
  const token = bearerToken(request);
  if (token) {
    const user = await findUserByToken(token, env);
    if (user) customerId = user.id;
  }
  const threadId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const insert = await env.DB.batch([
    env.DB.prepare("INSERT INTO contact_threads (id, customer_id, contact_name, contact_email, contact_phone, subject) VALUES (?, ?, ?, ?, ?, ?)").bind(threadId, customerId, name, email, phone, subject),
    env.DB.prepare("INSERT INTO contact_messages (id, thread_id, author_id, author_role, author_name, body) VALUES (?, ?, ?, ?, ?, ?)").bind(messageId, threadId, customerId, customerId ? "customer" : "visitor", name, message),
  ]);
  const notified = await sendMailSafe(env, {
    to: env.OWNER_EMAIL,
    replyTo: email,
    subject: `Ny henvendelse fra ${name}: ${subject}`,
    text: `Ny henvendelse på dinitweb.dk\n\nNavn: ${name}\nTelefon: ${phone}\nE-mail: ${email}\nEmne: ${subject}\n\n${message}\n\nSvar direkte på denne mail for at skrive til kunden.`,
    html: `<h2>Ny henvendelse på DinitWeb</h2><p><b>Navn:</b> ${escapeHtml(name)}<br><b>Telefon:</b> ${escapeHtml(phone)}<br><b>E-mail:</b> ${escapeHtml(email)}<br><b>Emne:</b> ${escapeHtml(subject)}</p><p>${escapeHtml(message).replace(/\n/g, "<br>")}</p><p>Svar direkte på denne mail for at skrive til kunden.</p>`,
  });
  return json({ ok: true, threadId, notified, message: "Tak for din henvendelse. Vi kontakter dig hurtigst muligt og senest inden for 3 arbejdsdage." }, 201, origin);
}

async function replyToContact(request, env, origin, admin, thread) {
  const body = await readJson(request);
  const message = text(body.message, 5000);
  if (message.length < 1) throw new ApiError("Skriv et svar først.", 400, "empty_reply");
  const messageId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO contact_messages (id, thread_id, author_id, author_role, author_name, body) VALUES (?, ?, ?, 'admin', ?, ?)").bind(messageId, thread.id, admin.id, admin.name, message),
    env.DB.prepare("UPDATE contact_threads SET status = 'open', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(thread.id),
  ]);
  const notified = await sendMailSafe(env, {
    to: thread.contact_email,
    replyTo: env.OWNER_EMAIL,
    subject: `Svar fra DinitWeb: ${thread.subject}`,
    text: `Hej ${thread.contact_name}\n\n${message}\n\nDu kan svare direkte på denne e-mail.\n\nVenlig hilsen\nDinitWeb`,
    html: `<p>Hej ${escapeHtml(thread.contact_name)},</p><p>${escapeHtml(message).replace(/\n/g, "<br>")}</p><p>Du kan svare direkte på denne e-mail.</p><p>Venlig hilsen<br>DinitWeb</p>`,
  });
  return json({ ok: true, notified, message: notified ? "Svaret er sendt, og kunden har fået en e-mail." : "Svaret er gemt, men e-mailen kunne ikke sendes." }, 201, origin);
}

async function customerReply(request, env, origin, user, thread) {
  if (thread.status === "closed") throw new ApiError("Denne henvendelse er lukket. Opret en ny via kontaktformularen.", 409, "thread_closed");
  const body = await readJson(request);
  const message = text(body.message, 5000);
  if (!message) throw new ApiError("Skriv en besked først.", 400, "empty_reply");
  await env.DB.batch([
    env.DB.prepare("INSERT INTO contact_messages (id, thread_id, author_id, author_role, author_name, body) VALUES (?, ?, ?, 'customer', ?, ?)").bind(crypto.randomUUID(), thread.id, user.id, user.name, message),
    env.DB.prepare("UPDATE contact_threads SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(thread.id),
  ]);
  const notified = await sendMailSafe(env, {
    to: env.OWNER_EMAIL,
    replyTo: thread.contact_email,
    subject: `Nyt svar fra ${thread.contact_name}: ${thread.subject}`,
    text: `Nyt svar på henvendelsen "${thread.subject}" fra ${thread.contact_name} (${thread.contact_email}):\n\n${message}`,
    html: `<h2>Nyt svar fra ${escapeHtml(thread.contact_name)}</h2><p><b>Emne:</b> ${escapeHtml(thread.subject)}<br><b>E-mail:</b> ${escapeHtml(thread.contact_email)}</p><p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`,
  });
  return json({ ok: true, notified, message: notified ? "Beskeden er sendt." : "Beskeden er gemt, men e-mailnotifikationen kunne ikke sendes." }, 201, origin);
}

async function updateThreadStatus(request, env, origin, thread) {
  const body = await readJson(request);
  if (!["open", "closed"].includes(body.status)) throw new ApiError("Vælg åben eller lukket.", 400, "invalid_status");
  await env.DB.prepare("UPDATE contact_threads SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(body.status, thread.id).run();
  return json({ ok: true }, 200, origin);
}

async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (isOwnerEmail(user.email, env)) return { ...user, role: "admin", isOwner: true };
  const staff = await env.DB.prepare("SELECT user_id FROM staff_accounts WHERE user_id = ?").bind(user.id).first();
  if (!staff) throw new ApiError("Du har ikke adgang til admin-panelet.", 403, "admin_required");
  return { ...user, role: "staff", isOwner: false };
}

async function requireOwner(request, env) {
  const user = await requireUser(request, env);
  if (!isOwnerEmail(user.email, env)) throw new ApiError("Kun virksomhedens ejer kan udføre denne handling.", 403, "owner_required");
  return { ...user, role: "admin", isOwner: true };
}

function isOwnerEmail(email, env) {
  const owner = normalizeEmail(env.OWNER_EMAIL || "");
  const admins = (env.ADMIN_EMAILS || "").split(",").map(normalizeEmail).filter(Boolean);
  return owner ? email === owner : admins.includes(email);
}

async function requireUser(request, env) {
  const token = bearerToken(request);
  const user = token && await findUserByToken(token, env);
  if (!user) throw new ApiError("Log ind for at fortsætte.", 401, "login_required");
  return user;
}

async function findUserByToken(token, env) {
  const row = await env.DB.prepare(`SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).bind(await sha256(token)).first();
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return null;
  }
  return row;
}

async function createSession(env, userId) {
  const token = randomHex(32);
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(await sha256(token), userId, Date.now() + SESSION_DAYS * 86400_000).run();
  return token;
}

async function hashPassword(password, saltHex) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: hexBytes(saltHex), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, material, 256);
  return bytesHex(new Uint8Array(bits));
}

async function sha256(value) {
  return bytesHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function keyedHash(value, email, secret) {
  if (!secret) throw new ApiError("Serveren mangler APP_SECRET-konfiguration.", 503, "not_configured");
  return sha256(`${secret}:${email}:${value}`);
}

async function sendMail(env, message) {
  if (!env.RESEND_API_KEY || !env.OWNER_EMAIL || !env.MAIL_FROM || env.MAIL_FROM.includes("replace-with-your-domain")) {
    throw new ApiError("E-mailafsendelse er ikke sat op endnu.", 503, "email_not_configured");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: message.to,
      reply_to: message.replyTo,
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Resend rejected email", response.status, result?.message || result?.name || "unknown error");
    throw new ApiError("E-mailen kunne ikke sendes. Prøv igen senere.", 502, "email_send_failed");
  }
  return result;
}

async function sendMailSafe(env, message) {
  try {
    if (!message.to) throw new Error("OWNER_EMAIL is not configured");
    await sendMail(env, message);
    return true;
  } catch (error) {
    console.error("DinitWeb email notification failed", error);
    return false;
  }
}

async function rateLimit(request, env, action, maxHits, windowSeconds) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = `${action}:${ip}`;
  const start = Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds;
  await env.DB.prepare(`INSERT INTO rate_limits (bucket_key, window_start, hits) VALUES (?, ?, 1)
    ON CONFLICT(bucket_key, window_start) DO UPDATE SET hits = hits + 1`).bind(key, start).run();
  const row = await env.DB.prepare("SELECT hits FROM rate_limits WHERE bucket_key = ? AND window_start = ?").bind(key, start).first();
  if (row.hits > maxHits) throw new ApiError("Der er sendt mange forespørgsler. Prøv igen om lidt.", 429, "rate_limited");
  if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(start - 3600).run();
}

async function readJson(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > MAX_BODY_BYTES) throw new ApiError("Forespørgslen er for stor.", 413, "too_large");
  try { return await request.json(); } catch { throw new ApiError("Ugyldige formulardata.", 400, "invalid_json"); }
}

function text(value, max) { return String(value ?? "").trim().slice(0, max); }
function normalizeEmail(value) { return String(value || "").trim().toLowerCase(); }
function isEmail(value) { return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,30}$/.test(value); }
function isIsoDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(value + "T00:00:00Z"); return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value; }
function bearerToken(request) { const header = request.headers.get("Authorization") || ""; return header.startsWith("Bearer ") ? header.slice(7).trim() : ""; }
function randomHex(bytes) { const value = crypto.getRandomValues(new Uint8Array(bytes)); return bytesHex(value); }
function randomCode() { const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000; return String(n).padStart(6, "0"); }
function hexBytes(hex) { return Uint8Array.from(hex.match(/.{2}/g) || [], (byte) => parseInt(byte, 16)); }
function bytesHex(bytes) { return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function publicUser(user, env) {
  const isOwner = isOwnerEmail(user.email, env);
  const staff = !isOwner && Boolean(await env.DB.prepare("SELECT user_id FROM staff_accounts WHERE user_id = ?").bind(user.id).first());
  return { id: user.id, name: user.name, email: user.email, phone: user.phone, role: isOwner ? "admin" : staff ? "staff" : "customer", isOwner };
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function corsHeaders(origin) {
  const headers = new Headers({ "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "86400", "Vary": "Origin", "Cache-Control": "no-store" });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}
function json(data, status = 200, origin) {
  const headers = corsHeaders(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(data), { status, headers });
}

class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

