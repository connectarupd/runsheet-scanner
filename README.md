# RunSheet Sorting & Putting — Free Starter

এই app-এর flow:

### Sorting
1. **Take Label Photo**
2. Label barcode থেকে **RunSheet ID** read হবে।
3. OCR থেকে label-এর লেখা **Sort Code** (যেমন `FK02`, `AJP1`, `TG1K`) detect হবে।
4. App Google Sheet-এর **GridMaster** tab থেকে সেই Sort Code-এর Grid No fetch করবে।
5. বড় **green bold** result-এ RunSheet ID, Sort Code এবং Master থেকে পাওয়া Grid No দেখাবে।
6. Sorting-এ Grid barcode scan হবে না।

### Putting
1. একইভাবে Label barcode → RunSheet ID এবং OCR → Sort Code।
2. Sort Code দিয়ে GridMaster থেকে Grid No fetch হবে।
3. তারপর **Grid Barcode Scan** খুলবে।
4. Master-এর Grid No যদি `B1` হয়, শুধু barcode value `B1` accept হবে।
5. অন্য barcode reject হবে।
6. Exact match হলে বড় green **MATCH** দেখাবে এবং Google Sheet-এর `Scans` tab-এ record যাবে।

### Grid Master
`GridMaster` tab-এ আপনি manually mapping রাখবেন:

| Sort Code | Grid No |
|---|---|
| FK02 | H1 |
| AJP1 | A1 |
| TG1K | B1 |

ভবিষ্যতে নতুন Sort Code/Sort Grid যোগ করতে শুধু `GridMaster` tab-এ নতুন row যোগ করবেন। App-এর code পরিবর্তন করার প্রয়োজন হবে না।

## কেন paid API লাগছে না?
- OCR: Tesseract.js, browser-এ চলে।
- Barcode: ZXing browser library, browser-এ চলে।
- Hosting: GitHub Pages ব্যবহার করা যায়।
- Database: Google Sheets + Google Apps Script.
- তাই normal usage-এ আলাদা OCR/API/hosting bill নেই। তবে Google/GitHub-এর service limits বা policy বদলালে “forever free” guarantee করা যায় না।

## GitHub Pages deploy
1. GitHub-এ নতুন public repository বানান।
2. এই ZIP-এর files upload করুন।
3. Settings → Pages → Deploy from branch → `main` / root select করুন।
4. যে `https://...github.io/...` URL পাবেন সেটি mobile Chrome-এ খুলুন।
5. Camera permission Allow করুন।

**Camera-এর জন্য HTTPS দরকার। GitHub Pages HTTPS দেয়।**

## Google Sheet setup
1. নতুন Google Sheet বানান।
2. Extensions → Apps Script.
3. `apps_script.gs`-এর code paste করুন।
4. Save.
5. Deploy → New deployment → Web app.
6. Execute as: **Me**
7. Who has access: **Anyone**
8. Deploy করুন।
9. `/exec` URL copy করে app-এর নিচের **Google Sheet Connection** box-এ paste করুন।
10. Save URL.

প্রথম test-এ একটি successful grid match করুন। Sheet-এর `Scans` tab-এ row তৈরি হবে।

## OCR accuracy
Label photo-তে text বড়, পরিষ্কার এবং আলো ভালো হলে accuracy বাড়বে। এই starter:
- `RUNSHEET ID`, `RS ID`, `SORT CODE`, `GRID`, `BIN`, `SLOT`-এর মতো labels চিনতে চেষ্টা করে।
- না থাকলে alphanumeric patterns থেকে Sort Code/Grid অনুমান করে।

আপনার label-এর exact format যদি যেমন হয়:
`RS ID: 123456 | SORT CODE: FK02 | GRID: H1`
তাহলে parser আরও নির্ভুলভাবে configure করা যাবে।

## গুরুত্বপূর্ণ security note
এই demo-তে Google Apps Script Web App “Anyone” access ব্যবহার করা হয়েছে, কারণ GitHub Pages থেকে সহজে data পাঠাতে হয়। যদি sensitive operational data থাকে, production version-এ authentication/token/allowlist যোগ করা উচিত।

## Files
- `index.html` — UI
- `style.css` — mobile UI
- `app.js` — OCR, barcode, validation, Google Sheet sending
- `apps_script.gs` — Google Sheet backend
- `manifest.json` — PWA metadata


## Final workflow rules
- Sorting এবং Putting **দুইটি আলাদা tab**।
- দুই tab-এই **Employee ID required**।
- দুই tab-এই Label barcode → RunSheet ID এবং OCR → Sort Code।
- Sort Code দিয়ে `GridMaster` থেকে Grid No fetch হবে।
- **Putting-এ শুধু Grid No fetch হওয়ার পর camera খুলবে**।
- Putting grid barcode-এর value অবশ্যই master-এর Grid No-এর exact match হতে হবে। যেমন `B1` → `B1`।
- প্রতিটি Sorting/Putting successful record-এ **timestamp + employee ID** থাকবে।
- OCR এবং barcode processing browser-side, তাই কোনো paid OCR API quota ব্যবহার করা হয় না।
- GitHub Pages HTTPS camera access-এর জন্য ব্যবহার করুন।
- এই project কোনো paid subscription/paid API key চায় না। তবে GitHub/Google-এর free service limits বা policy ভবিষ্যতে পরিবর্তিত হতে পারে।
