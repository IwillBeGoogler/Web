![image](/api/uploads/d0ffdb84b3a1214d091f24254f16edc9.webp)




Tasavvur qiling: bir ko'chada bir xil o'lchamdagi `100 million` ta uy qatorasiga qurilgan. Birinchi uyning raqami `1000`, har bir uy `4` metr kenglikda. Sizdan birinchi uydan `7` uy nariga joylashgan uyni topish so'ralsa, eshiklarni birma-bir taqillatib sanab chiqmaysiz. Hisoblaysiz: `1000 + 7 × 4`, tamom, manzil tayyor. Birinchi uydan `99 999 999` uy narida turgan uyni topish ham xuddi shunday bitta hisob.

![image](/api/uploads/065f6dac8907adb02b873a7d3b4704cb.webp)


`Static array` aynan shunday ko'cha. Kompyuter xotirasida `arr[i]` ifodasi sizni "sanab yurish"ga majburlamaydi. U manzilni **formula bilan hisoblaydi**. Shuning uchun `10` ta elementli massivdan ham, `100 million` ta elementli massivdan ham element o'qish bir xil tez. Buni dasturchilar "$O(1)$" deb ataydi.

> **$O(1)$ ("o-bir", *constant time*)** — operatsiya vaqti ma'lumot hajmiga bog'liq emasligini bildiruvchi belgi. Element `10` ta bo'lsa ham, `10` milliard bo'lsa ham, qadamlar soni bir xil.

Bu maqolada ushbu "ko'cha"ning qurilishini pastdan yuqoriga ko'ramiz: bayt va manzillar, protsessor bu manzilni qanday hisoblashi, operatsion tizim uni qanday aldashi va buni Go da o'z ko'zingiz bilan tekshirish.

> **Ta'rif.** `Static array` — hajmi yaratilganda qat'iy belgilanadigan, bir xil turdagi elementlarni xotiraning **uzluksiz** (*contiguous*) blokida saqlaydigan ma'lumotlar tuzilmasi. Elementlar orasida bo'shliq ham, ularni bog'lovchi *pointer* yoki metadatalar ham yo'q.

---

## Bu maqolada nimalarni o'rganasiz

Maqolani o'qib bo'lgach siz quyidagilarni bilasiz va boshqalarga tushuntira olasiz:

- **O'lchov birliklari:** bit, bayt, o'n oltilik yozuv (`0x1000`) va asosiy turlarning (`int8` dan `int64` gacha) bayt o'lchami.
- **Massiv RAM da qanday yotadi:** elementlar bayt va manzillar darajasida, `contiguous` joylashuv, massivning ikki xususiyati: `Zero Metadata Overhead` va `Rigid Capacity`.
- **`Base` va uzunlik qayerda saqlanadi:** nega elementlar ichida emas; register, cache va RAM vazifalari; stack, heap va global massivlarning farqi.
- **Nega `arr[i]` — `O(1)`:** manzil formulasi `Base + i × ElementSize` va nega indeks `0` dan boshlanadi.
- **Protsessor buni qanday bajaradi:** `SIB` nega kerak va u qanday kodlanadi, `Scale` va `ElementSize` aloqasi, `AGU`, element o'lchami `1, 2, 4, 8` bo'lmaganda `lea` ning roli.
- **Virtual xotira:** `page`, `frame`, `page table`, `MMU`. `arr[1500]` ning virtual manzili fizik manzilga qadam-baqadam qanday o'giriladi va nega uzluksiz massiv RAM da sochilgan bo'lishi mumkin.
- **Go da formulani tekshirish:** `unsafe` va `uintptr` bilan manzillarni ko'rish, `padding` va `alignment`.

**Oldindan kerakli bilim:** o'zgaruvchi, funksiya va massiv tushunchalari. Assembly va o'n oltilik tizimni bilish shart emas: kerakli narsa maqolaning o'zida tushuntiriladi.

---

## 1. Avval o'lchov birliklari haqida tanishib olaylik

Ko'chada uyning kengligini bilmay turib hisob qilib bo'lmaydi. Xotirada ham shunday: avval o'lchovni kelishib olamiz.

- **Bit** — eng kichik birlik, `0` yoki `1`.
- **Bayt** (*byte*) — `8` bit. Xotira manzillari aynan **baytlarni** sanaydi: `0x1000`, `0x1001`, `0x1002`, ...
- **`0x` prefiksi** — son o'n oltilik (*hexadecimal*) tizimda yozilganini bildiradi. Masalan, `0x1000` o'nlik tizimda `4096`.

Tur nomlaridagi sonlar (`int32`, `int64`) esa **bit** soni. Baytga o'tkazish uchun `8` ga bo'linadi:

![image](/api/uploads/59a5a408b837f6bcbcf333c1cb3eab92.webp)


> **Pointer** — boshqa xotira katagining manzilini o'zida saqlaydigan o'zgaruvchi. 64-bit tizimda manzil `8` bayt joy oladi.

Demak, `1000` ta `int64` elementli massiv xotirada roppa-rosa `1000 × 8 = 8000` bayt egallaydi.

## 2. Xotirada qanday ko'rinadi

![image](/api/uploads/6cbdc6f10e2354ee968a0e8de9cda7fa.webp)

Operativ xotirani (*RAM* — Random Access Memory) har biri `1` bayt bo'lgan katakchalar qatori deb tasavvur qiling. Birinchi katakning manzili `0x1000`, keyingisiniki `0x1001`, va hokazo.

Endi `5` ta `int32` dan iborat `[42, 17, 99, -5, 64]` massivini shu qatorning `0x1000` joyiga qo'yamiz. Har bir `int32` — `4` bayt, ya'ni bitta element **4 ta qo'shni katakni** egallaydi:

![image](/api/uploads/cd222837adf0271e40eae09d93d88975.webp)


**Nega baytlar teskari tartibda?** Jadvalga qarang: `42` = `0x0000002A`, lekin xotirada `2A 00 00 00` turibdi. Son o'n oltilikda `00 00 00 2A` deb yoziladi, xotirada esa baytlar **teskari** joylashgan: eng kichik bayt (`2A`) eng kichik manzilga (`0x1000`), eng katta bayt (`00`) eng katta manzilga (`0x1003`) tushgan. Bu tartib **Little-Endian** deyiladi (*little end first*: "kichik uch birinchi").

Misol: `0x12345678` soni (`int32`) `0x1000` manzildan boshlab shunday yotadi:

```
Manzil:  0x1000  0x1001  0x1002  0x1003
Little:    78      56      34      12      ← kichik bayt birinchi
Big:       12      34      56      78      ← katta bayt birinchi
```

x86-64 (Intel va AMD) va ARM64 (telefonlar, Apple M-seriya) protsessorlari Little-Endian da ishlaydi. Qarama-qarshi tartib **Big-Endian** deyiladi: u odam o'qishiga qulay va tarmoq protokollarida standart (*network byte order*).

Little-Endian ning bitta amaliy afzalligi: sonning kichik qismi doim bir xil manzilda turadi. `42` ni `int32` sifatida `0x1000` ga yozsak, uning quyi `8` bitini (`int8`) o'qish uchun ham manzil `0x1000` qoladi, shuning uchun sonni qisqartirganda manzilni o'zgartirish shart emas. Aslida bu tarixiy va apparat qulayligi masalasi: ikkala tartib ham ishlaydi, faqat hamma bir xil tanlashi kerak.

Esda tuting: **baytlar** tartibi teskari bo'ladi, bayt ichidagi bitlar emas (`2A` baribir `2A`). Tarmoqdan kelgan Big-Endian ma'lumotni o'qiganda baytlar tartibini almashtirish kerak bo'ladi.

Hammasi bo'lib `5 × 4 = 20` bayt RAM da joy ajratiladi, datalar `0x1000..0x1013` oralig'ida bo'ladi. E'tibor bering: bu `20` bayt ichida massivning **boshlang'ich manzili (Base)** (`0x1000`) ham, **uzunligi** (`5`) ham yozilmagan. Elementlarda faqat ma'lumotning o'zi bor.

### Bu tuzilmaning ikki xususiyati

1. **Zero Metadata Overhead** (nol qo'shimcha xarajat). *Linked list* da har bir element o'zi bilan `next` pointer ini (`8` bayt) olib yuradi. Massivda bunday narsa yo'q: ajratilgan xotiraning deyarli hammasi foydali ma'lumot.
2. **Rigid Capacity** (kengaytirib bo'lmaydi). Ko'chaning oxirida allaqachon boshqa uylar (boshqa o'zgaruvchilar, *stack frame* lar, obyektlar) qurilgan. Massivni "o'ngga cho'zish" mumkin emas. Chegaradan chiqib yozilsa, qo'shni ma'lumot buziladi. Bu **Buffer Overflow**.

## 2.1. Data RAM da, control data registerda

Yuqorida ko'rdik: `20` baytlik elementlar RAM da, `Base` va uzunlik esa ularning ichida yo'q. Ular qayerda saqlanadi? Buni tushunish uchun protsessor xotirasining uch darajasini ko'rib chiqamiz.

**Register** — protsessor yadrosining (*core*) **ichiga**, hisoblash bloki (ALU) yonida o'rnatilgan juda kichik va juda tez xotira katagi. U RAM kabi alohida platada emas, protsessor kristalining o'zida, shuning uchun unga murojaat odatda bir clock cycle ichida bajariladi. Registerda protsessor **hozir ishlatayotgan** qiymat turadi: ma'lumot (`42`), manzil (`Base`) yoki oxirgi amal natijasi. Registerlar juda kam: x86-64 da atigi `16` ta umumiy register (jami `128` bayt), shuning uchun u RAM o'rnini bosa olmaydi, faqat uning "ish stoli".

**Cache** — RAM bilan register orasidagi kichik, lekin RAM dan ancha tez oraliq xotira. U ham protsessor ichida turadi, lekin registerdan farqi: dasturchi uni boshqarmaydi, protsessor o'zi avtomatik ishlatadi. RAM dan o'qilgan ma'lumot cache da nusxalanadi, keyingi safar shu ma'lumot kerak bo'lsa RAM ga bormasdan olinadi. Kerakli ma'lumot cache da bo'lsa **cache hit** (tez), bo'lmasa **cache miss** (RAM dan keltiriladi, sekin). Cache baytma-bayt emas, **cache line** (odatda `64` bayt) bilan ishlaydi: `arr[0]` ni o'qisangiz, u turgan `64` baytlik line to'liq keladi. Massiv line boshidan boshlangan bo'lsa, `int32` massivda bu `arr[0..15]`. Prefetcher esa ketma-ket o'qishni sezib, keyingi line larni oldindan keltiradi. Shuning uchun massivni ketma-ket o'qish eng tez naqsh, *linked list* da esa `next` xotiraning tasodifiy joyiga yo'naltirgani uchun bu foyda yo'qoladi.

Qiyos: register — qo'lingizdagi qiymat, cache — stol ustidagi hujjatlar, RAM — arxiv shkafi.

**Fon Neyman modeli.** Dastur kodi ham, ma'lumot ham bitta RAM da turadi. Hisoblashni esa protsessor registerlarda bajaradi. Shuning uchun har qanday amal uch bosqichdan o'tadi: RAM dan registerga **yuklash** (*load*), registerda **hisoblash**, natijani RAM ga **yozish** (*store*). ARM64 kabi *load/store* arxitekturalarda bu uch bosqich alohida instruksiyalar. x86-64 esa `add [mem], reg` kabi xotiradagi operandni ham qabul qiladi, lekin protsessor ichida u baribir shu uch bosqichga bo'linadi.

**`arr[i]` o'qilganda nima bo'ladi?**

1. `Base` (massiv boshi, `0x1000`) registerga yuklanadi.
2. Indeks `i` boshqa registerda turadi.
3. Chegara tekshiradigan tillarda (Go, Rust, Java) uzunlik `n` ham registerga yuklanadi: `i < n` ekanini tekshirish uchun. C/C++ da esa `arr[i]` chegarani tekshirmaydi, `n` umuman ishlatilmaydi.
4. Protsessor `Base + i × ElementSize` manzilini hisoblaydi va faqat shundan keyin cache yoki RAM dan **bitta** o'qish bajariladi.

Ya'ni `Base`, `i` (va tekshiruv bo'lsa `n`) ishlatilayotgan paytda registerda turadi, elementning o'zi esa RAM (yoki cache) da yotadi.

**`Base` va uzunlik doimiy qayerda saqlanadi?** Registerlar kam, shuning uchun ular registerda doimiy turmaydi: kerak bo'lganda registerga yuklanadi, qolgan vaqtda quyidagi joylarda saqlanadi (qaysi biri ekanini kompilyator tanlaydi):

| Massiv qayerda | Misol | `Base` qayerda saqlanadi | Elementlar qayerda yotadi | Registerga qanday tushadi |
|---|---|---|---|---|
| **Stack** (lokal massiv) | `int arr[4];` funksiya ichida | Alohida o'zgaruvchi **yo'q**: kompilyator `Base` ni *stack frame* ichidagi qat'iy *offset* sifatida mashina kodiga yozib qo'yadi | *Stack frame* ning o'zida | `Base = RBP − 16` (frame boshiga nisbatan) |
| **Heap** (`malloc`, `new`, `make`) | `int *arr = malloc(...)` | `8` baytli *pointer* o'zgaruvchisida (odatda stack da), masalan `ptr = 0x6000` | Heap da, pointer ko'rsatgan manzilda (`0x6000`) | Pointer registerga yuklanadi: `Base = ptr` |
| **Global / `static`** | `static int arr[4];` | Statik binar manzil: `.data` yoki `.bss` segmentida, dastur yuklanganda aniqlanadi (masalan `0x404000`) | `.data` / `.bss` segmentida | Manzil registerga to'g'ridan-to'g'ri yoki joriy instruksiyaga nisbatan yuklanadi |

**Uzunlik** esa ikki xil bo'ladi: **doimiy** (`int a[5]`, Go da `[5]int32`) bo'lsa kompilyatsiya vaqtida ma'lum va hech qayerda saqlanmaydi, kompilyator uni kodning ichiga yozib qo'yadi. **Dinamik** (`slice`, `std::vector`, argument sifatida uzatilgan `len`) bo'lsa alohida o'zgaruvchida (*header* ichida) saqlanadi va kerak bo'lganda registerga yuklanadi.

**Xulosa.** Elementlar — RAM da. Hisoblash uchun zarur qiymatlar (`Base`, `i`, uzunlik) — ishlatilayotgan paytda registerda, doimiy esa mashina kodida yoki stack/`.data` da. Massivning o'zi o'z manzili va uzunligini "bilmaydi": buni dastur va kompilyator biladi.

Terminlar izohi:

- **Stack** — funksiya chaqirilganda ochiladigan, tugagach avtomatik yig'ishtiriladigan tez xotira zonasi. Lokal o'zgaruvchilar shu yerda.
- **Stack frame** — bitta funksiya chaqiruviga ajratilgan stack bo'lagi: lokal o'zgaruvchilar, argumentlar va **return address**.
- **Heap** — dastur ishlash paytida so'rab olinadigan, umri funksiyaga bog'liq bo'lmagan xotira zonasi.
- **`.data` / `.bss`** — global o'zgaruvchilar segmentlari. `.data` da boshlang'ich qiymat bor, `.bss` da yo'q (hammasi nolga to'ldiriladi).
- **Offset** — boshdan qancha nariga ekanini bildiruvchi masofa, baytlarda.

---

## 3. $O(1)$ ning siri: manzil formulasi

[Interaktiv O(1) Indexing animatsiyasi](assets/static_array_indexing.html) | [Address Formula kalkulyatori](assets/address_formula_calculator.html)

Ko'chadagi misolga qaytamiz: birinchi uydan `7` uy nariga joylashgan uyni topish uchun `1000 + 7 × 4` ni hisobladik. Massivda ham formula xuddi shu:

$$\text{Address}(i) = \text{Base} + (i \times \text{ElementSize})$$

Bu yerda `Base` — massiv boshi, `ElementSize` — bitta elementning baytlardagi o'lchami, `i` — indeks.

Tekshiramiz. Yuqoridagi jadvalda `arr[3]` qayerda? $\texttt{0x1000} + 3 \times 4 = \texttt{0x100C}$. Jadvalga qarang: aynan `0x100C` dan `FB FF FF FF` (`-5`) boshlanadi. Formula to'g'ri.

Formulada sikl ham, tarmoqlanish ham yo'q. Bitta ko'paytirish, bitta qo'shish. `i = 3` bo'lsa ham, `i = 99 999 999` bo'lsa ham, ish miqdori bir xil. **$O(1)$ aynan shundan.**

### Nega indeks `0` dan boshlanadi?

Chunki indeks aslida **masofa**: "boshlang'ich manzildan necha element nariga". Birinchi element boshlanishning o'zida turadi, masofa `0`:

$$\text{Address}(0) = \text{Base} + 0 \times \text{ElementSize} = \text{Base}$$

Ko'p joyda "1-dan boshlansa, har safar ortiqcha ayirish kerak bo'lardi" deb yoziladi. Zamonaviy kompilyatorlar uchun bu deyarli to'g'ri emas: doimiy ayirmani ular instruksiyaga bepul qo'shib yuboradi. Haqiqiy sabab soddaroq: indeks masofa, masofa esa nol bilan boshlanadi. Bundan tashqari, `0`-based indekslash yarim ochiq `[0, n)` oraliqni qulay qiladi: uning uzunligi aynan `n`, ikkita oraliqni ulashda ortiqcha `±1` kerak emas.

---

## 4. Protsessor buni qanday bajaradi

3-bo'limdagi formula (`Base + i × ElementSize`) dasturda alohida ko'paytirish va qo'shish qadamlari bo'lib bajarilmaydi. x86-64 protsessorida manzil hisoblash **xotiradan o'qish instruksiyasining ichiga** o'rnatilgan: instruksiya manzilni `[Base + Index × Scale]` ko'rinishida oladi va hisoblashni o'zi bajaradi. Masalan, `arr[i]` uchun mashina kodi `[rdi + rsi*4]` kabi yoziladi, bu yerda `rdi` — massiv boshi (`Base`) turgan register, `rsi` — indeks `i` turgan register, `4` — `int` ning o'lchami. (`RDI` va `RSI` — x86-64 dagi umumiy registerlar: System V ABI kelishuviga ko'ra funksiyaning 1- va 2-argumentlari shularda keladi.) ARM64 da ham shunga o'xshash adreslash rejimi bor, faqat yozilishi boshqacha.

### SIB nega kerak?

`arr[i]` ni o'qish uchun uchta ish kerak: indeksni baytga aylantirish (ko'paytirish), massiv boshiga qo'shish va hosil bo'lgan manzildan o'qish. **SIB bo'lmasa** bu uch qadam alohida instruksiyalar bo'lardi:

1. `i × 4` ni hisoblash (ko'paytirish yoki bitlarni siljitish instruksiyasi, `shl`).
2. Natijani `Base` ga qo'shish (qo'shish instruksiyasi).
3. Hosil bo'lgan manzildan o'qish (xotiraga murojaat instruksiyasi).

**SIB bilan** uchalasi bitta instruksiyaga (`mov`) sig'adi, chunki `Base`, `Index` va `Scale` bitta baytda kodlanadi. Shu sababli massivga har bir murojaat:

- **qisqa** — bitta instruksiya, mashina kodi kichik;
- **tez** — manzilni AGU hisoblaydi, ALU band bo'lmaydi va boshqa ish bilan shug'ullanib turadi;
- **massivga mos** — `Base + Index × Scale` aynan `Address(i) = Base + i × ElementSize` formulasi, SIB uning apparatga o'rnatilgan shakli.

### SIB: bitta bayt ichidagi formula

`[rdi + rsi*4]` ifodasi mashina kodida **SIB** (*Scale-Index-Base*) deb ataladigan bitta bayt bilan kodlanadi (instruksiyada u yolg'iz emas: oldidagi **ModRM** bayti protsessorga "keyingi bayt SIB" deb aytadi, masalan `mov eax, [rdi + rsi*4]` = `8B 04 B7`). Uning `8` biti uch qismga bo'lingan:

![image](/api/uploads/70e8bc46152c95f376ee811da1b8c6ce.webp)


- **Base** — massiv boshi turgan register kodi. `RDI` uchun `111`.
- **Index** — indeks turgan register kodi. `RSI` uchun `110`.
- **Scale** — indeksni baytga aylantiruvchi ko'paytuvchi. U formuladagi **`ElementSize`** (bitta elementning bayt o'lchami) bilan bir narsa, faqat nomi boshqa: formulada `i × ElementSize`, mashina instruksiyasida esa `Index × Scale`. Biz "3-element" deymiz, RAM esa elementlarni bilmaydi, unda faqat baytlar bor. Shuning uchun "3-element" ni "boshdan nechanchi bayt" ga aylantirish kerak: `int32` massivda `arr[3]` boshdan `3 × 4 = 12` bayt narida. Bu yerda `3` — indeks, `4` — `Scale`.

`Scale` uchun atigi `2` bit ajratilgan, shuning uchun faqat to'rt qiymat mumkin (`×1, ×2, ×4, ×8`).

**Misol: `arr[3]` ni o'qiymiz** (`int32` massiv, 2-bo'limdagi `[42, 17, 99, -5, 64]`).

1. Registerlarda: `RDI = 0x1000` (massiv boshi), `RSI = 3` (indeks). Element `int32`, ya'ni `4` bayt, shuning uchun `Scale = ×4`.
2. Kompilyator SIB baytini yig'adi: `Scale` = `10` (`×4`), `Index` = `110` (`RSI`), `Base` = `111` (`RDI`). Ketma-ket yozilsa `10 110 111`, ya'ni `0xB7`.
3. Protsessor `0xB7` ni bitlarga ajratib o'qiydi (*decode*): yuqori `2` bit (`10`) — `Scale`, o'rtadagi `3` bit (`110`) — `Index`, pastki `3` bit (`111`) — `Base`. Har bir kod jadvaldan topiladi: `10` → `×4`, `110` → `RSI` registeri, `111` → `RDI` registeri. Natija: "manzil = `RDI` + `RSI` × `4`".
4. Protsessor ikkala registerning **ichidagi qiymatni** oladi (`RDI` ichida `0x1000`, `RSI` ichida `3`) va manzilni hisoblaydi (buni AGU bajaradi, pastda): avval indeksni baytga aylantiradi, `3 × 4 = 12` (`0xC`), keyin massiv boshiga qo'shadi, `0x1000 + 0xC = 0x100C`. Bu manzil xotiraga murojaat uchun ishlatiladi.
5. `0x100C` dan `4` bayt o'qiladi: `FB FF FF FF`, ya'ni `-5`. Bu aynan `arr[3]`.

Ya'ni `0xB7` — "`RDI + RSI × 4`" formulasining bitta baytga siqilgan yozuvi.

`×1, ×2, ×4, ×8` to'plami tasodif emas. Bular asosiy sonli turlarning (`int8` dan `int64` / `double` gacha) o'lchamlari. Apparat eng ko'p uchraydigan holatni bitta instruksiyaga sig'dirib qo'ygan.

### Manzilni kim hisoblaydi?

Protsessor yadrosida manzil hisoblashga ixtisoslashgan alohida bloklar bor: **AGU** (*Address Generation Unit*). Ular asosiy arifmetik blok **ALU** (*Arithmetic Logic Unit*) dan mustaqil ishlaydi. Shuning uchun `sum += arr[i]` siklida ALU yig'indini qo'shayotganda, AGU keyingi elementning manzilini tayyorlab turadi. (Bloklar soni protsessor modeliga qarab farq qiladi, lekin g'oya umumiy.) Xulosa: **indekslash asosiy hisoblash pipeline ini band qilmaydi.**

### Element o'lchami `1, 2, 4, 8` bo'lmasa-chi?

Aytaylik, element `24` baytlik `struct`. `Scale = 24` kodlab bo'lmaydi, chunki SIB faqat to'rt qiymatni biladi. Kompilyator ishni ikki qadamga bo'ladi va `lea` instruksiyasidan foydalanadi.

**`lea`** (*Load Effective Address*) — x86-64 instruksiyasi. U `mov` ga o'xshab `[...]` ichida manzil formulasini yozadi, lekin **xotiradan o'qimaydi**: formulani hisoblab, natijani (manzilning o'zini) registerga yozadi. Ya'ni `lea` — arzon arifmetika kalkulyatori.

```c
struct P { int x, y, z, w, u, v; };   // sizeof = 24
int get_x(const struct P *p, size_t i) { return p[i].x; }
```

$24 = 3 \times 8$: avval `lea` bilan `i × 3` hisoblanadi, keyin SIB ning `×8` si ishlaydi: `(i × 3) × 8 = i × 24`. Hammasi baribir ikki arzon instruksiyada. Shu sababli element o'lchamini ikkining darajasiga (*padding* bilan) yaqinlashtirish ba'zan foydali: kod soddalashadi va element *cache line* chegarasini kesib o'tmaydi.

---

## 5. Virtual xotira: 1 million elementli massiv RAM da qanday yotadi

Bu bo'limda bitta massivni boshidan oxirigacha kuzatamiz: dastur uni qanday ko'radi, RAM da u haqiqatda qayerda yotadi va ikkisini nima bog'laydi.

### 1-qadam. Dastur nimani ko'radi

Siz `1 000 000` ta `int64` sig'adigan global massiv yaratdingiz: `static int64_t arr[1000000];` (funksiya ichida lokal e'lon qilinsa, `8 MB` stack ga sig'masligi mumkin). Hajmi `1 000 000 × 8 = 8 000 000` bayt, ya'ni taxminan `8 MB`. Dasturingiz uchun hammasi oddiy: `arr[0]` dan `arr[999999]` gacha **bitta uzluksiz (contiguous) blok**, manzillar ketma-ket o'sib boradi. Aytaylik, massiv boshi (`Base`) `0x10000000` manzilda.

### 2-qadam. RAM nimani ko'radi

Fizik RAM `4 KB` (`4096` bayt) li teng bo'laklarga bo'lingan. Bu bo'laklar **frame** (fizik bo'lak) deyiladi. `8 000 000` baytni sig'dirish uchun `8 000 000 / 4096 ≈ 1954` ta frame kerak.

Lekin RAM da `1954` ta **yonma-yon** bo'sh frame topilishi shart emas: RAM da boshqa dasturlar ham ishlayapti, bo'sh frame lar sochilib yotadi. Operatsion tizim (OS) bo'sh frame larni **qayerda bo'lsa o'sha yerdan** topib beradi. Masalan, massivning 1-bo'lagi `812`-frame da, 2-bo'lagi `17`-frame da, 3-bo'lagi `5230`-frame da bo'lishi mumkin.

### 3-qadam. Virtual xotira ikkisini bog'laydi

Dastur uchun massiv uzluksiz, RAM da esa sochilgan. Dastur buni sezmasligi uchun OS dasturga **virtual address space** beradi: faqat shu dasturga tegishli "xayoliy", uzluksiz manzillar maydoni. Dastur `0x10000000` kabi **virtual manzillar** bilan ishlaydi, haqiqiy joy (**fizik manzil**) esa undan yashirin.

Virtual manzillar maydoni ham RAM kabi `4 KB` li bo'laklarga bo'linadi. Virtual bo'lak **page**, fizik bo'lak **frame** deyiladi, ikkalasi bir xil o'lchamda (`4096` bayt). Bitta page bitta frame ga mos keladi.

### 4-qadam. Page table: moslik jadvali

Qaysi page qaysi frame da ekanini **page table** saqlaydi: OS tuzadigan "virtual page → fizik frame" jadvali. Massivimizning birinchi uchta page i uchun u shunday ko'rinishda bo'ladi (bitta page ga `4096 / 8 = 512` ta `int64` sig'adi):

![image](/api/uploads/5ad1765cc8fd774553af7ef77f47356b.webp)


### 5-qadam. MMU manzilni o'giradi

**MMU** (*Memory Management Unit*) — protsessor ichidagi blok. Dastur xotiraga murojaat qilganda MMU virtual manzilni fizik manzilga o'giradi. Har safar page table ni o'qimaydi: avval **TLB** (*Translation Lookaside Buffer*, yaqinda ishlatilgan tarjimalar cache i) ni tekshiradi, page table ga faqat TLB da topilmasa murojaat qiladi.

Misol: `arr[1500]` ni o'qiymiz.

**1. Virtual manzilni hisoblaymiz.** `arr[1500]` massiv boshidan `1500 × 8 = 12 000` bayt narida (`8` — bitta `int64` ning bayt o'lchami). Virtual manzil: `0x10000000 + 12 000 = 0x10002EE0`. (O'n oltilik tizimda `12 000 = 0x2EE0`.)
**2. Manzilni ikki qismga ajratamiz:** "qaysi page" va "page ichida qayerda". Oddiy hisobda: `12 000 / 4096 = 2` (qoldiq `3808`). Ya'ni element massivning `2`-raqamli page ida (3-page), page boshidan `3808` bayt narida. O'n oltilikda xuddi shu narsa manzilning yozuvida ko'rinadi: oxirgi `3` raqam (`EE0`) — page ichidagi joy (**offset**, `0xEE0 = 3808`), qolgan boshi (`0x10002`) — **page raqami**. Nega aynan oxirgi `3` raqam? Chunki page o'lchami `4096 = 0x1000` va u `3` ta o'n oltilik raqamga teng.

Page ichidagi joylashuv va fizik manzilga o'girilish quyidagi diagrammada ko'rsatilgan (`arr[1500]` page `0x10002` da, boshidan `3808` bayt narida):

![image](/api/uploads/3255092f9315f49d5bacee88e7679871.webp)


**3. Page table dan frame topamiz.** Jadvalda `0x10002` qatoriga qaraymiz: u `5230`-frame ga bog'langan.

**4. Fizik manzilni yig'amiz.** `5230`-frame RAM da `5230 × 4096 = 0x146E000` manzildan boshlanadi. Unga page ichidagi joyni (offset `0xEE0`) qo'shamiz: `0x146E000 + 0xEE0 = 0x146EEE0` (`21 425 888`).

**5. O'qiymiz.** RAM dan (yoki cache dan) shu fizik manzildan `8` bayt o'qiladi.

Muhim: offset (`0xEE0`) o'zgarmaydi, almashadigan faqat page raqami (`0x10002` → frame `0x146E`). Dastur uchun esa baribir shunchaki `Base + 12 000`: formula (3-bo'lim) buzilmaydi, MMU hamma ishni jimgina bajaradi.

Massiv **virtual manzillarda** uzluksiz, fizik RAM da esa `1954` ta frame ga bo'linib, har tarafda yotgan bo'lishi mumkin. Ularni bog'laydigan zanjir: **virtual manzil** → (page raqami + offset) → **page table** → **frame** → **fizik manzil**.

- **Virtual address space** — jarayonga OS beradigan, faqat o'ziga tegishli "xayoliy" uzluksiz manzillar maydoni.
- **Page** — virtual xotiraning teng o'lchamli bo'lagi (odatda `4 KB`).
- **Frame** — fizik RAM ning shu o'lchamdagi bo'lagi.
- **Page table** — OS saqlaydigan "page → frame" jadvali.
- **MMU** — virtual manzilni fizik manzilga o'giruvchi protsessor bloki.
- **Offset** — manzilning page ichidagi qismi (pastki `12` bit).

---

## 6. Amaliyot: Go da formulani o'zingiz tekshiring

Go da `[N]T` turi massivni **qiymat** sifatida saqlaydi (elementlar uzluksiz yotadi). Quyidagi dastur formulani to'g'ridan-to'g'ri sinab ko'radi:

```go
package main

import (
	"fmt"
	"unsafe"
)

type Record struct {
	Flag uint8  // 1 bayt (+ 3 bayt padding)
	ID   uint32 // 4 bayt -> jami 8 bayt
}

func main() {
	records := [4]Record{
		{Flag: 1, ID: 100},
		{Flag: 0, ID: 200},
		{Flag: 1, ID: 300},
		{Flag: 1, ID: 400},
	}

	elemSize := unsafe.Sizeof(Record{})
	base := uintptr(unsafe.Pointer(&records[0]))
	fmt.Printf("sizeof(Record) = %d bayt\n", elemSize)

	for i := 0; i < len(records); i++ {
		addr := uintptr(unsafe.Pointer(&records[i]))
		calc := base + uintptr(i)*elemSize
		fmt.Printf("index=%d | addr=0x%x | calc=0x%x | id=%d\n",
			i, addr, calc, records[i].ID)
	}
}
```

Chiqish (manzillar har ishga tushirishda o'zgaradi, lekin `addr` va `calc` doim teng):

```
sizeof(Record) = 8 bayt
index=0 | addr=0x14000104ea0 | calc=0x14000104ea0 | id=100
index=1 | addr=0x14000104ea8 | calc=0x14000104ea8 | id=200
index=2 | addr=0x14000104eb0 | calc=0x14000104eb0 | id=300
index=3 | addr=0x14000104eb8 | calc=0x14000104eb8 | id=400
```

Kodda ikki yangi tushuncha bor:

- **Padding** — kompilyator maydonlar orasiga qo'shadigan bo'sh baytlar. `Flag` (`1` bayt) dan keyin `3` bayt bo'sh joy qoladi, chunki `uint32` maydon `4` ga karrali manzilda turishi kerak. Bu **alignment** (tekislash) talabi: protsessor tekislangan manzildan tezroq o'qiydi. Shu sababli `sizeof(Record) = 8`, `1 + 4 = 5` emas.
- **`unsafe.Pointer` / `uintptr`** — Go ning xavfsizlik to'siqlarini chetlab, manzilga oddiy son sifatida qarash vositasi. Faqat o'rganish va past darajali kod uchun.
