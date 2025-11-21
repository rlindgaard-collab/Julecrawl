# Bodega Crawl Control Center

En React/Vite-app der samler de vigtigste værktøjer til en pubcrawl: login, øl-tracking, live ranking, ruteoversigt, fælles timer og “næste omgang”-lotteri. Alt kører lokalt med mock-data, så vi hurtigt kan iterere på UX inden Firebase kobles på.

## Funktioner
- Login/oprettelse og deltagervælger så hver deltager kan logge egne øl.
- Beer tracker med aktivitetshistorik og live leaderboard.
- Rutevisning hvor man kan markere stop som gennemført og sætte aktiv destination.
- Delbar timer med hurtigstart-knapper og mulighed for at forlænge +5 min.
- Random “næste omgang”-generator som sikrer at alle er med før cyklussen nulstilles.

## Kom godt i gang
```bash
npm install
npm run dev
```
Byg til produktion med `npm run build`.

## Klar til Firebase
1. **Opret projektet** i Firebase Console, aktiver Authentication, Firestore (eller Realtime Database) og evt. Hosting.
2. **Authentication**: enable email/password og evt. social login. Erstat lokal login med `signInWithEmailAndPassword` / `createUserWithEmailAndPassword`, og gem `uid` + display name på brugeren.
3. **Data-model (Firestore)**:
   - `users/{uid}` – navn, avatar, totalBeers, totalRoundsPaid.
   - `crawls/{crawlId}` – metadata (titel, start/slut, aktivt stop-id, timer-state).
   - `crawls/{crawlId}/participants/{uid}` – status + seneste check-in.
   - `crawls/{crawlId}/drinks/{drinkId}` – `userId`, `timestamp`, `count`.
   - `crawls/{crawlId}/route/{order}` – navn, adresse, note, completed.
   - `crawls/{crawlId}/rounds/{roundId}` – hvem giver næste omgang.
4. **Realtime**: brug Firestore `onSnapshot` til ranking, route, timer og round-picker, så alle enheder opdateres synkront.
5. **Cloud Functions**: callable functions til (a) logning af øl (validering + atomiske writes), (b) timer-udløb/push-notifikationer, (c) fair randomisering af “næste omgang”.
6. **Security Rules**: giv kun læse-/skriveadgang hvis brugeren er deltager på crawl’en. Begræns hvem der må tweake rute og timer.

Når backend er klar, kan mock-state i `src/App.tsx` skiftes ud med hooks der læser/skrives til Firestore. De eksisterende komponenter matcher allerede de datafelter, Firebase skal levere. Ping når du er klar til integration, så tager vi næste skridt.
