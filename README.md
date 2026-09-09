# AI Data Analyst

Ask questions about a CSV or JSON file in plain language and get an answer that is grounded in statistics computed from the whole file — not guessed from a handful of rows.

**Language / Dil:** [English](#english) · [Türkçe](#türkçe)

---

<a name="english"></a>
## English

Load a data file, and the browser parses it and profiles every column: type, missing values, distinct count, min/max/mean/median/sum for numbers, date ranges, most frequent categories. You then ask a question, and the model receives that profile plus a small sample of rows and interprets it.

The point of the split is accuracy. Sending a language model a few rows of a spreadsheet and asking for "the total" invites a confident wrong number. Here every figure the model can quote has already been computed over the full dataset by ordinary code, and the model's job is explaining what the numbers mean.

### How it works

```
  Browser                                   API server              Anthropic API
 ┌──────────────────────────────┐         ┌──────────────┐
 │ parse CSV/JSON               │         │              │
 │ profile every column ────────┼────────▶│ build prompt ├────────▶ claude-opus-5
 │ sample 12 rows               │  JSON   │ hold the key │            │
 │                              │         │              │◀───────────┘
 │ render answer ◀──────────────┼─────────┤ stream (SSE) │
 └──────────────────────────────┘         └──────────────┘
```

The file never leaves your machine. What crosses the network is the column profile, twelve sample rows, and your question.

### Design decisions

- **The API key lives on the server.** The browser talks only to the local API server. A frontend-only build would have to ship the key in the bundle, where anyone can read it — which is why `.env.example` warns against a `VITE_` prefix, since Vite inlines those variables into client code.
- **Statistics are computed locally, over every row.** The model interprets numbers; it does not produce them. It is explicitly instructed never to present a figure derived from the sample as a dataset total.
- **The sample is drawn from the start, middle and end.** Data files are often sorted, and the first twelve rows of a sorted file misrepresent everything below them.
- **The profile is cached on the prompt.** It is identical for every question about a given file, so follow-up questions re-read it from cache instead of paying for it again. The token counts shown under each answer include the cached portion.
- **Parsing handles real files.** Quoted fields containing the delimiter, escaped `""` quotes, newlines inside quotes, delimiter detection across `,` `;` tab `|`, duplicate and empty header names, and both `1.234,56` and `1,234.56` decimal conventions.
- **Answers stream.** Server-Sent Events, so text appears as it is generated rather than after a long pause. Navigating away aborts the request instead of paying for output nobody will read.

### Requirements

- Node.js 22 or newer
- An [Anthropic API key](https://console.anthropic.com/settings/keys)

### Getting started

```bash
npm install
cp .env.example .env     # then put your key in it
npm run dev
```

This starts the API server on port 8787 and the web app on port 5173. Open http://localhost:5173 and drop in `sample/sales-sample.csv` to try it.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API server and web app together, both watching for changes |
| `npm test` | Unit tests for parsing and profiling (23 tests, no network) |
| `npm run typecheck` | `tsc --noEmit` across client, server and tests |
| `npm run build` | Type-check, then build the frontend into `dist/` |

### Project layout

```
index.html
src/
  main.ts        UI wiring and application state
  parse.ts       CSV/JSON parsing, delimiter detection, type coercion
  profile.ts     column statistics and row sampling
  ui.ts          table rendering, suggested questions
  api.ts         SSE client for the API server
  style.css
server/
  index.ts       Express app, streaming endpoint, error mapping
  prompt.ts      system and user prompt construction
test/            parsing and profiling tests
sample/          an example CSV to try
```

### Limitations

- The model sees summary statistics, not the raw data, so it cannot answer questions that need a calculation nobody computed — a correlation between two specific columns, for example. When that happens it is instructed to say so rather than guess.
- Everything is held in memory, so very large files are limited by the browser tab.
- There is no chat history: each question is answered on its own.

---

<a name="türkçe"></a>
## Türkçe

Bir CSV veya JSON dosyası yükleyin, doğal dilde soru sorun; yanıt, dosyanın **tamamı** üzerinden hesaplanmış istatistiklere dayanır — birkaç satıra bakıp tahmin edilmez.

Dosya tarayıcıda ayrıştırılır ve her sütun profillenir: tip, eksik değer sayısı, farklı değer sayısı, sayısal sütunlar için min/maks/ortalama/medyan/toplam, tarih aralıkları, en sık görülen kategoriler. Sorduğunuz soru bu profil ve küçük bir satır örneklemiyle birlikte modele gider.

Bu ayrımın sebebi doğruluk. Bir dil modeline tablonun birkaç satırını verip "toplam kaç" diye sormak, kendinden emin ama yanlış bir sayı almanın en kısa yoludur. Burada modelin aktarabileceği her rakam, veri kümesinin tamamı üzerinden sıradan kodla önceden hesaplanmıştır; modelin işi sayıları üretmek değil, yorumlamaktır.

### Nasıl çalışır?

Dosya bilgisayarınızdan çıkmaz. Ağdan geçen tek şey sütun profili, on iki örnek satır ve sorunuzdur.

### Tasarım kararları

- **API anahtarı sunucuda durur.** Tarayıcı yalnızca yerel API sunucusuyla konuşur. Yalnızca frontend'den oluşan bir yapı, anahtarı paketin içine gömmek zorunda kalırdı ve orada anahtarı herkes okuyabilir. `.env.example` bu yüzden `VITE_` önekine karşı uyarır: Vite bu önekli değişkenleri istemci koduna gömer.
- **İstatistikler yerelde, tüm satırlar üzerinden hesaplanır.** Model sayıları yorumlar, üretmez. Örneklemden çıkardığı bir değeri veri kümesinin toplamıymış gibi sunmaması açıkça talimatlandırılmıştır.
- **Örneklem baştan, ortadan ve sondan alınır.** Veri dosyaları çoğu zaman sıralıdır; sıralı bir dosyanın ilk on iki satırı altındaki her şeyi yanlış temsil eder.
- **Profil prompt önbelleğine alınır.** Bir dosyayla ilgili her soruda profil aynı olduğu için, sonraki sorular onu önbellekten okur ve tekrar ücretlendirilmez. Yanıtın altındaki jeton sayıları önbellekten okunan kısmı da gösterir.
- **Ayrıştırıcı gerçek dosyalarla başa çıkar.** Ayraç içeren tırnaklı alanlar, `""` ile kaçırılmış tırnaklar, tırnak içinde satır sonu, `,` `;` sekme ve `|` arasından ayraç tespiti, yinelenen ve boş sütun adları, hem `1.234,56` hem `1,234.56` ondalık biçimi.
- **Yanıtlar akar.** Server-Sent Events ile metin üretildikçe görünür. Sayfadan ayrılırsanız istek iptal edilir, kimsenin okumayacağı çıktı için ödeme yapılmaz.

### Gereksinimler

- Node.js 22 veya üzeri
- Bir [Anthropic API anahtarı](https://console.anthropic.com/settings/keys)

### Kurulum

```bash
npm install
cp .env.example .env     # içine anahtarınızı yazın
npm run dev
```

API sunucusu 8787, web uygulaması 5173 portunda başlar. http://localhost:5173 adresini açıp `sample/sales-sample.csv` dosyasını sürükleyerek deneyebilirsiniz.

### Komutlar

| Komut | İşlevi |
|---|---|
| `npm run dev` | API sunucusu ve web uygulaması birlikte, değişiklikleri izleyerek |
| `npm test` | Ayrıştırma ve profilleme testleri (23 test, ağ gerekmez) |
| `npm run typecheck` | İstemci, sunucu ve testler için `tsc --noEmit` |
| `npm run build` | Tip kontrolü, ardından frontend'i `dist/` altına derler |

### Sınırlar

- Model ham veriyi değil özet istatistikleri görür; bu yüzden kimsenin hesaplamadığı bir işlemi gerektiren soruları — örneğin iki sütun arasındaki korelasyonu — yanıtlayamaz. Böyle bir durumda tahmin yürütmek yerine bunu söylemesi talimatlandırılmıştır.
- Her şey bellekte tutulur, çok büyük dosyalarda sınır tarayıcı sekmesidir.
- Sohbet geçmişi yoktur; her soru kendi başına yanıtlanır.

---

## License

MIT — see [LICENSE](LICENSE). © 2026 Alperen Akın Işgın.
