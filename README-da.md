# DinitWeb — hjemmeside, kontaktformular og portal

`index.html` er hjemmesidens indgangsside til GitHub Pages. `studie-nord-admin.html` er samme side med det oprindelige filnavn. Logoets mørke og blå udtryk er bevaret på det mørke tema i `dinitweb-logo.png` og `dinitweb-wordmark.png`.

Kontaktformularen kræver navn, telefonnummer, e-mail og en beskrivelse. Når API'et er sat op, gemmes henvendelsen i Cloudflare D1, DinitWeb får en e-mailbesked, og kunden ser: “Tak for din henvendelse. Vi kontakter dig hurtigst muligt og senest inden for 3 arbejdsdage.” Admins kan læse og besvare henvendelser i indbakken; svaret sendes også til kundens e-mail.

Brugere kan oprette konto med e-mailbekræftelse. Adminadgang gives kun til verificerede e-mailadresser, der er skrevet ind i Cloudflare-hemmeligheden `ADMIN_EMAILS`. Hvis du vil bruge den oplyste modtageradresse som første admin, skal samme adresse sættes som `OWNER_EMAIL` og i `ADMIN_EMAILS`.

## Trin-for-trin opsætning

Hjemmesidens filer og GitHub Pages-workflow ligger allerede i repository’et. Cloudflare API’et er endnu ikke sat op. Du skal bruge din Cloudflare-konto, Node.js og et domæne, som Cloudflare kan sende e-mail fra.

### A. Læg hjemmesiden i GitHub

1. Filerne ligger allerede i `fivem2024/Dinitweb` på branch `main`; du skal ikke kopiere dem ind igen.
2. I GitHub: åbn repository’ets **Settings → Pages** og vælg **GitHub Actions** som kilde.
3. Åbn **Actions**, og kontrollér at workflowet **Deploy DinitWeb to GitHub Pages** kører færdigt.
4. Find hjemmesidens origin. For `https://fivem2024.github.io/Dinitweb/` er origin `https://fivem2024.github.io` — uden `/Dinitweb/`. Skriv den ned til Cloudflare-konfigurationen.
5. Workflowet udgiver kun hjemmesidens offentlige filer; Worker-kildekoden bliver i repository’et, men ikke på hjemmesiden.

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
