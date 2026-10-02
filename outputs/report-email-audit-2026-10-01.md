# Kontrolli i raporteve me email — 01.10.2026

U kontrolluan kodi i të gjitha rrjedhave të email-it, konfigurimi i deploy/PM2/Celery dhe tabelat e historikut në databazën e serverit `192.168.10.8`. Lidhja e kontrollit ishte vetëm për lexim. Nuk u dërguan email dhe nuk u ndryshuan të dhënat e serverit.

## Shkaku i verifikuar

Të dhjetë llojet e raporteve kalojnë përmes `GmailService`, me dërgues `130primex.eu@gmail.com`. Që nga 21.09.2026 ka dështime të përsëritura gjatë autentikimit SMTP: `535 / 5.7.8 Username and Password not accepted / BadCredentials`. Gjithashtu regjistrohen `Connection unexpectedly closed` dhe, në disa tentativa, `Missing email configuration: EMAIL_PASSWORD`.

Gabimi 535 vërteton refuzimin e autentikimit nga Gmail. Historiku nuk përcakton nëse App Password është revokuar, është ndryshuar apo i përket një llogarie tjetër. Mungesa e EMAIL_PASSWORD tregon se disa tentativa janë ekzekutuar pa kredencialin e nevojshëm; identiteti i procesit burim nuk ruhet në këto tabela.

Përdoruesi konfirmoi gjatë kontrollit se kredencialet janë ndryshuar. Kjo përputhet me refuzimet e autentikimit pas 18.09. Nëse është ndryshuar fjalëkalimi kryesor i Google, App Password i vjetër revokohet; nëse është ndryshuar vetë App Password, duhet përdorur vlera aktuale në proceset dërguese.

## Rezultatet sipas raportit

| Raporti | Evidenca në databazë |
| --- | --- |
| M1 / Morning | Pa `sent_at` për 21.09–01.10; sot `BadCredentials`; sukses i fundit i regjistruar 18.09. |
| M2 / After Break | Pa `sent_at` për 21.09–01.10; 30.09 mungon `EMAIL_PASSWORD`; sukses i fundit i regjistruar 18.09. |
| M3 / Meetings | Pa `sent_at` për 21.09–30.09; `BadCredentials`/lidhje e mbyllur; sukses i fundit i regjistruar 18.09. |
| End Week BZ | 25.09 pa `sent_at`, `BadCredentials`; 18.09 `SENT`. |
| PrimeFlow 1H | 53 rreshta `FAILED_EMAIL` në historikun nga 18.09 deri në kontroll; 6 `SENT`, të fundit më 18.09. |
| RLZ Daily Control | 8 rreshta `FAILED_EMAIL` në të njëjtën periudhë; një `SENT` më 18.09. |
| SHTYPI Sot | 9 rreshta `FAILED` për 21.09–01.10; sot `BadCredentials`; 18.09 `SENT`. |
| SHTYPI Nesër | 7 rreshta `FAILED` për 21.09–29.09; 30.09 `SENT` me `sent_at`, por edhe `Missing email configuration: EMAIL_PASSWORD`. Gjendje kontradiktore, kërkon verifikim të tentativave/proceseve dhe email-it real. |
| PX JAV javor | 3 rreshta `FAILED_EMAIL` në historikun nga 18.09; dërgimi më i fundit i këtyre rreshtave 25.09. |
| Weekly Planning Audit | 10 tentativa dërgimi `FAILED` nga 18.09; tentativa të fundit më 25.09 me `BadCredentials`. |

Numrat më sipër janë rreshta/tentativa të ruajtura, jo numri i të gjitha lidhjeve SMTP: disa scheduler-a provojnë përsëri dhe përditësojnë të njëjtin rresht. `SENT` është regjistrim i aplikacionit dhe nuk është provë e dorëzimit në inbox.

Konfigurimet e kontrolluara për Morning, After Break, Meetings, End Week BZ, SHTYPI Sot/Nesër dhe oraret aktive 1H/RLZ janë aktive. RLZ PRECHECK dhe CORRECTION janë joaktive; FINAL është aktiv. Ka tentativa që vërtetojnë se proceset kanë ekzekutuar dërgime, por nuk u inspektua drejtpërdrejt gjendja aktuale e PM2 në server.

## Konfigurimi dhe kufijtë e kontrollit

- Workflow i deploy merr `EMAIL_USER` dhe `EMAIL_PASSWORD` nga GitHub Actions Secrets, i shkruan në `backend/.env` dhe i kalon në proceset PM2. Workflow aktual kërkon që këto secrets të mos jenë bosh; nuk teston vlefshmërinë e tyre në Gmail.
- Kodi PM2 ia kalon të njëjtin konfigurim SMTP API-së, scheduler-ave dhe Celery. API publik ka ende të aktivizuara disa cikle raportesh; proceset e shumëfishta mund të konkurrojnë. Kjo është çështje shtesë e konfigurimit, jo shpjegim për refuzimin 535 nga Gmail.
- `backend/.env` lokal lidhet me databazën e serverit, por nuk ka `EMAIL_USER`/`EMAIL_PASSWORD` ose `REPORT_SCHEDULERS_ENABLED=false`. Nisja e një API-je lokale me këto vlera mund të shkruajë gabime konfigurimi në historikun e përbashkët. Nuk u vërtetua se cilat tentativa erdhën nga një proces lokal.
- Nuk janë të disponueshme kredencialet SMTP të serverit në këtë workspace. Nuk u krye autentikim real SMTP ose ndryshim i secrets.

## Hapat e nevojshëm për rikthim

### Përditësimi gjatë seancës

App Password-i i dhënë nga përdoruesi kaloi autentikimin real STARTTLS/SMTP në Gmail për `130primex.eu@gmail.com`; nuk u dërgua email. U përditësuan dhe u verifikuan `EMAIL_USER` dhe `EMAIL_PASSWORD` në skedarin real `backend/.env` të serverit. Kredenciali nuk u shkrua në skedarët e versionuar të projektit.

U kopjuan në server `scripts/check_report_email.py` dhe `scripts/restart_report_email.ps1`. Rinisja mbetet për t'u ekzekutuar në server: WinRM refuzon lidhjen e administrimit me `ServerNotTrusted` dhe kontrolli DCOM dështon. Nuk u ndryshuan cilësimet e sigurisë. Proceset ekzistuese dhe GitHub Actions Secret mund të kenë ende kredencialin e vjetër.

Në PowerShell të serverit, nga dosja `C:\actions-runner\_work\Primex-TaskManager\Primex-TaskManager\backend`, ekzekuto `./scripts/restart_report_email.ps1`. Skripti lexon kredencialin nga `.env`, kontrollon autentikimin, rinis proceset e njohura dërguese që janë të pranishme me `--update-env` dhe ruan konfigurimin PM2. Duhet përditësuar veçmas GitHub Actions Secret `EMAIL_PASSWORD` përpara deploy-it tjetër.

1. Verifiko ose krijo App Password për **130primex.eu@gmail.com**. Fjalëkalimi duhet t'i përkasë kësaj llogarie. Google i revokon App Passwords kur ndryshohet fjalëkalimi i llogarisë: https://support.google.com/accounts/answer/185833.
2. Vendos `EMAIL_USER=130primex.eu@gmail.com` dhe App Password te `EMAIL_PASSWORD` në GitHub Actions Secrets dhe konfigurimin që përdorin proceset e serverit. Mos e vendos kredencialin në git ose në chat.
3. Nga dosja backend, në të njëjtin mjedis si secili proces dërgues, ekzekuto `python -m scripts.check_report_email`. Kontrolli kryen vetëm STARTTLS/login/logout; nuk dërgon email dhe nuk printon fjalëkalimin.
4. Rinis proceset dërguese me konfigurimin e përditësuar: API, scheduler 1H/RLZ, scheduler SHTYPI Nesër dhe Celery worker/beat. Verifiko një pronar të vetëm për çdo scheduler.
5. Për zhvillimin lokal që përdor databazën e serverit, ndiq README dhe çaktivizo scheduler-at lokalë. Flag-u API nuk çaktivizon standalone scheduler/Celery.
6. Pas autentikimit të suksesshëm, dërgo një raport të kontrolluar me autorizim dhe verifiko marrjen në inbox. Rishiko veçmas raportet e humbura dhe rreshtin kontradiktor të 30.09, përpara ridërgimit.
