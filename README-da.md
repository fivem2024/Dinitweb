# DinitWeb — hjemmeside, kontaktformular og portal

`index.html` er hjemmesidens indgangsside til GitHub Pages. `studie-nord-admin.html` er samme side med det oprindelige filnavn. Logoets mørke og blå udtryk er bevaret på det mørke tema i `dinitweb-logo.png` og `dinitweb-wordmark.png`.

Kontaktformularen kræver navn, telefonnummer, e-mail og en beskrivelse. Når API'et er sat op, gemmes henvendelsen i Cloudflare D1, DinitWeb får en e-mailbesked, og kunden ser: “Tak for din henvendelse. Vi kontakter dig hurtigst muligt og senest inden for 3 arbejdsdage.” Admins kan læse og besvare henvendelser i indbakken; svaret sendes også til kundens e-mail.

Brugere kan oprette konto med e-mailbekræftelse. Adminadgang gives kun til verificerede e-mailadresser, der er skrevet ind i Cloudflare-hemmeligheden `ADMIN_EMAILS`. Hvis du vil bruge den oplyste modtageradresse som første admin, skal samme adresse sættes som `OWNER_EMAIL` og i `ADMIN_EMAILS`.

## Trin-for-trin opsætning

Dette er en deployklar startpakke, men den er endnu ikke koblet til et live GitHub-repository eller Cloudflare-projekt. Du skal bruge dine GitHub- og Cloudflare-konti, Node.js og et domæne, som Cloudflare kan sende e-mail fra.

### A. Læg hjemmesiden i GitHub

1. Opret eller åbn repository'et, som skal være hjemmesiden.
2. Kopiér indholdet af `outputs/` ind i repository'ets rodmappe. Sørg for også at kopiere den skjulte mappe `.github/` og dens `workflows/pages.yml`.
3. Find hjemmesidens origin: Hvis adressen er `https://ditnavn.github.io/min-side/`, er origin `https://ditnavn.github.io` — uden `/min-side/`. Skriv den ned.
4. Push ændringerne til branch `main`. Hvis repository'et bruger en anden standardbranch, så ret `branches: [main]` i `.github/workflows/pages.yml` til den branch.
5. I GitHub: åbn repository'ets **Settings → Pages** og vælg **GitHub Actions** som kilde. Workflowet udgiver kun hjemmesidens offentlige filer, ikke Worker-kildekoden.

### B. Gør Cloudflare klar

6. I Cloudflare Email Service skal du onboarde et afsenderdomæne under **Compute → Email Service → Email Sending**. Følg Cloudflares DNS-vejledning, og vent til domænet er godkendt. Afsenderadressen (`MAIL_FROM`) skal være på dette domæne; din Gmail-adresse kan modtage beskederne, men bruges ikke som afsender.
7. Åbn Windows Terminal i mappen `outputs/dinitweb-api/` og kør:

```powershell
npm install
npx wrangler login
```

8. Opret D1-databasen:

```powershell
npx wrangler d1 create dinitweb --jurisdiction eu
```

Kopiér database-id'et fra terminalen ind i `wrangler.toml` ved `database_id`.

9. I `wrangler.toml` skal du udfylde:
   - `ALLOWED_ORIGINS` med origin fra trin 3, fx `https://ditnavn.github.io`.
   - `MAIL_FROM` med din godkendte Cloudflare-afsender, fx `DinitWeb <mail@ditdomæne.dk>`.

10. Opret tabellerne i D1:

```powershell
npx wrangler d1 migrations apply dinitweb --remote
```

11. Opret Worker-hemmelighederne. Wrangler beder dig indtaste værdien efter hver kommando:

```powershell
npx wrangler secret put APP_SECRET
npx wrangler secret put OWNER_EMAIL
npx wrangler secret put ADMIN_EMAILS
```

   - `APP_SECRET`: lav en tilfældig værdi med `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, og indsæt resultatet.
   - `OWNER_EMAIL`: indtast den ønskede indbakkeadresse.
   - `ADMIN_EMAILS`: indtast din egen admin-e-mail. For din første admin skal den være den samme adresse, du bruger til kontoen.

12. Udgiv API'et:

```powershell
npx wrangler deploy
```

Kopiér Worker-adressen fra resultatet, fx `https://dinitweb-api.<konto>.workers.dev`.

### C. Forbind siden, og giv dig selv adminadgang

13. Åbn `dinitweb-config.js`, og erstat eksempeladressen med din Worker-adresse:

```js
window.DINITWEB_CONFIG = {
  apiUrl: "https://dinitweb-api.<konto>.workers.dev",
};
```

Gem filen, push den til `main`, og vent på at **Actions → Deploy DinitWeb to GitHub Pages** bliver grøn.

14. Åbn den live hjemmeside. Vælg **Kundeportal → Opret en ny bruger**. Opret kontoen med e-mailadressen, du lagde i `ADMIN_EMAILS`, og bekræft den med koden fra din indbakke. Adminrollen gives til bekræftede adresser på listen.

15. Log ind via **Kundeportal**. Admins får adminpanelet med **Henvendelser** i menuen. Her kan du åbne en besked, svare kunden og lukke/genåbne henvendelsen.

16. Send en prøvehenvendelse fra kontaktformularen med en anden e-mailadresse. Du bør se bekræftelsen på hjemmesiden, modtage en notifikation i `OWNER_EMAIL`-indbakken og kunne svare under **Henvendelser**. Kundens e-mail får dit svar.

## Sikkerhed og funktioner

- Login kræver bekræftet e-mail og adgangskode; sessionstoken ligger kun i fanens `sessionStorage`.
- Admin-API-ruter kontrollerer adminrollen server-side; det er ikke nok at åbne adminvisningen i browseren.
- Adgangskoder hashes i Worker, sessionsnøgler hashes i D1, og beskeder indsættes med parameteriserede databaseforespørgsler.
- API'et begrænser CORS til de origins, der står i `ALLOWED_ORIGINS`, og har enkel rate limiting på formular og login.
- Kontaktformularen kan bruges uden konto. Hvis en bruger er logget ind, knyttes henvendelsen til kontoen, så samtalen kan ses i kundeportalen.
- Fakturaer, projekter og kundekartotek i det ældre adminpanel er stadig demonstrationsdata; denne pakke kobler den nye indbakke, brugere og kontaktformular til D1.

Cloudflare D1 bruger versionsstyrede SQL-migrationer; behold migrationerne i `dinitweb-api/migrations/` fremover.
