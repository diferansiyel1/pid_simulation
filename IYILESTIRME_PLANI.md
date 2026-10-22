# PID Simülasyonları — Ders Materyali İyileştirme Planı

Hazırlanma tarihi: 22.10.2026
Kapsam: `web/` altındaki üç etkileşimli sayfa (Simülatör, Kaskad DO, Uygulama Örnekleri) ve `src/animations.py` içindeki dört Manim sahnesi.
Öncelik: yerleşim ve görünüm; ardından öğretici içerik.

Durum (22.10.2026): Faz 0 ve Faz 1 uygulandı. Bunlara ek olarak kaskad şemasına iç geri besleme ve bozucu girişi çizildi (Faz 3.2'nin bir kısmı), bozucu etiketi fiziksel konumuna göre düzeltildi (Faz 3.3'ün etiket kısmı) ve grafiklere fareyle değer okuma eklendi. Kalan: Faz 2, Faz 3'ün geri kalanı, Faz 4. Kaskad şeması dar ekranda küçük kalıyor; dikey bir şema düzeni Faz 3.2'ye eklenmeli.

Durum (22.10.2026, ikinci güncelleme): Faz 2 (2.1–2.13) uygulandı. Senaryo kartlarındaki her sayısal gözlem simülasyonla doğrulandı. Metrik tanımları ders kitabı standardına göre: yükselme süresi, aşım ve yerleşme süresi kalıcı son değere göre; kalıcı hata ve IAE ayar noktasına göre. Kazanç etkisi laboratuvarında her kazanç için, ders kitabı eğilimini net gösteren bir “önerilen örnek süreç” seçildi: Kp için yalnız P ve θ = 0,5 s; Ki için Kp = 1 ve θ = 0,3 s; Kd için Kp = 3, Ki = 1 ve θ = 0,6 s. Ayar noktası basamağı artık t = 1 s'de uygulanıyor; varsayılan planlı bozucu 20 s'de. Kalan: Faz 3'ün geri kalanı ve Faz 4.

---

## 1. Hedef kullanım senaryoları

Plan üç kullanım biçimi düşünülerek hazırlandı:

| Senaryo | Ekran | Beklenti |
|---|---|---|
| Derste projeksiyon | 1280×720 / 1366×768, uzaktan izleme | Grafikler kaydırma olmadan tek ekranda, büyük yazı, yüksek kontrast |
| Laboratuvar / ödev | Öğrenci dizüstü bilgisayarı | Parametreleri değiştirip sonucu ölçebilme, rapora alabilme |
| Hızlı göz atma | Telefon | Taşma olmadan okunabilir, grafik önce |

---

## 2. Mevcut durum özeti

Üç sayfa da bağımlılıksız (saf HTML/CSS/JS), çift tıkla açılıyor. Bu, sınıfta çevrimdışı kullanım için büyük bir avantaj ve korunmalı.
Konsol hatası yok. Simülasyon çekirdeği (birinci derece süreç + PID + anti-windup) doğru çalışıyor.

Masaüstü (1440 px), projeksiyon (1280×720) ve telefon (390 px) genişliklerinde ekran görüntüleri alınarak incelendi. Bulgular aşağıda.

---

## 3. Tespit edilen sorunlar

### 3.1 Yerleşim

1. **Projeksiyonda grafikler ekrana sığmıyor.** 1280×720'de ikinci grafiğin yarısı ve kontrol çıkışı göstergesi ekran dışında; parametre sütunu ise 1100 px uzunluğunda.
2. **Parametre satırları dağınık.** `style.css:24` etiketleri iki sütunlu ızgaraya koyuyor; kaydırıcı alt satıra düşüp sütunun yarısını kaplıyor, onay kutuları metinden kopuk hizalanıyor.
3. **Moda bağlı alanlar hep görünür.** PID modunda ON‑OFF histerezis/u_high/u_low kaydırıcıları da görünüyor (`index.html:39-47`); öğrenci hangisinin etkili olduğunu bilemiyor.
4. **Sağ sütun boş alan bırakıyor.** “PID Açıklamaları” kartı kısa; altında geniş boşluk kalıyor, grafikler bu yüzden daralıyor.
5. **Telefon görünümünde yatay taşma.** Canvas'ların iç genişliği (940 px) ızgara öğesini daraltmıyor (`min-width:0` eksik); sayfa yana kayıyor.
6. **Logo gezinme bağlantılarının üstüne biniyor.** Sabit konumlu logo (`style.css:16`), Kaskad ve Örnekler sayfalarında sağ üstteki bağlantıları örtüyor.
7. **Sayfalar arası gezinme tutarsız.** Ana sayfada bağlantılar varsayılan mavi altı çizili (`.badge` sınıfı `style.css`'te tanımlı değil); diğer iki sayfada rozet biçiminde ve farklı konumda.

### 3.2 Görünüm ve okunabilirlik

1. **Grafiklerde eksen değerleri ve başlıkları yok.** Ne zaman ekseninde saniye ne de y ekseninde değer var; öğrenci aşımı, yerleşme süresini okuyamıyor. Ders materyali için en kritik eksik bu.
2. **Eğri etiketleri kesiliyor.** `r(t)`, `y(t)`, `y2`, `r1` etiketleri sağ kenarın dışına taşıyor (`app.js:127-130` ve kopyaları).
3. **Renkler birbirine çok yakın.** r (#fb7185) ile P (#f472b6) pembe, D (#c084fc) ile u (#8b5cf6) mor tonları; projeksiyonda ve renk körlüğünde ayırt edilemiyor.
4. **Koyu tema projeksiyonda düşük kontrastlı.** Lacivert ızgara çizgileri ve mor arka plan projektörde kayboluyor.
5. **Grafikler Retina/yüksek çözünürlükte bulanık.** Canvas `devicePixelRatio` hesaba katmıyor.
6. **Eğriler çizim alanının dışına taşıyor.** Alt grafikte ±5 dışına çıkan türev sıçraması başlık boşluğuna çiziliyor (kırpma yok).
7. **Dil karışık.** “output”, “setpoint”, “Outer PID”, “Mixer/Airflow”, “disturbance”, “Inner SP” gibi İngilizce terimler Türkçe metinle karışık; Manim sahneleri tamamen İngilizce.
8. **Form elemanları biçimsiz.** Mod seçimi beyaz varsayılan `select`, kaydırıcılar tarayıcı varsayılanı mavi; koyu temayla uyumsuz.

### 3.3 Öğretimi zorlaştıran teknik sorunlar

1. **Süreç modeli metindeki kuralları doğrulamıyor.** Süreç saf birinci derece, ölü zamansız (`app.js:32-45`). Bu modelde PI kapalı döngüsü hiçbir kazançta kararsız olmaz ve Kp artırıldıkça sönüm *artar* (karakteristik denklem 1,8·s² + (1+Kp)·s + Ki = 0). Yani açıklama panelindeki “Kp ↑ → aşım riski ↑” cümlesinin tersi gözleniyor; salınım yalnızca yüksek Ki ile çıkıyor.
2. **“Örnekleme (ms)” simülasyon hızını da değiştiriyor.** Her animasyon karesinde tek adım atılıyor (`app.js:237-269`); 5 ms seçildiğinde simülasyon üç kat yavaşlıyor. Örnekleme etkisi ile oynatma hızı birbirine karışıyor.
3. **Türev tepmesi (derivative kick).** Başlangıçta hata 0→1 sıçradığı için D terimi `Kd/h` kadar sıçrıyor (≈12,5); alt grafiği ilk saniyede bozuyor. Türevin ölçüm üzerinden alınması seçeneği hem sorunu çözer hem de öğretici bir konu olur.
4. **Kontrol çıkışı göstergesi yanıltıcı.** u, −5…+5 aralığı 0–100 %'e eşleniyor (`app.js:166-183`); u = 0 iken gösterge %50 diyor.
5. **Varsayılan yanıt anti-windup hatası yüzünden yanlış (kritik).** İlk adımda türev tepmesi u'yu +5'te doyuruyor; anti-windup (`app.js:62-67`) fazlalığın tamamını (8,7) integralden düşüyor, oysa fazlalığın kaynağı integral değil D terimi. Sonuç (varsayılan Kp=1,2, Ki=0,4, Kd=0,2, anti-windup açık; sayfayla aynı kodla ayrıca koşturuldu):

   | t (s) | y — anti-windup açık | y — anti-windup kapalı |
   |---|---|---|
   | 1 | −1,21 | 0,44 |
   | 4 | −0,79 | 0,81 |
   | 8 | 0,24 | 0,93 |
   | 16 | 0,92 | 1,03 |

   Öğrencinin sayfayı açınca gördüğü ilk yanıt ters yönde başlıyor ve setpoint'e çok geç ulaşıyor; “anti-windup iyi bir şeydir” mesajıyla çelişiyor. Ayrıca normal çalışmada doyuma hiç girilmediği için anti-windup'ın asıl işlevi hiç görülemiyor.
6. **Kaskad sayfasında kazançlar canlı uygulanmıyor.** Kaydırıcılar `state`'i güncelliyor ama PID nesneleri kazançları kapanışta (closure) sabitliyor (`cascade.js:20,35`); değişiklik ancak “Baştan Başlat” ile etkili oluyor. Öğrenci kaydırıcının işe yaramadığını düşünüyor.
7. **Bozucu bir kez oluyor, sonra kayboluyor.** Bozucu mutlak zamana bağlı; pencere kaydıktan sonra (özellikle Örnekler sayfasında) grafikler düz çizgi olarak sonsuza kadar akıyor, gösterilecek bir olay kalmıyor.
8. **Kaskad şemasında iç geri besleme yok.** `cascade.html:84-135` şemasında y2→C2 iç döngü geri beslemesi çizilmemiş; kaskadın özü olan “iki iç içe döngü” görünmüyor. Ayrıca bozucunun nereden girdiği gösterilmiyor, kutu metinleri okların altında kalıyor, “Bozucu (oxygen demand)” yazısı kesiliyor.
9. **Bozucu konumu ile etiketi çelişiyor.** Modelde bozucu hızlı iç döngüye (y2) giriyor, ama “oksijen talebi” olarak etiketlenmiş; oksijen talebi fiziksel olarak DO'yu (y1) etkiler.
10. **Örnekler sayfasında karşılaştırma yok.** Üç demo da yalnızca kaskad yanıtını gösteriyor; “tek döngülü PID'e göre ne kazandık?” sorusu cevapsız. Ayrıca üç ayrı `requestAnimationFrame` döngüsü sürekli çalışıyor.
11. **Kod tekrarları.** `Plot` sınıfı üç dosyada ayrı ayrı yazılmış; sayfa içi `<style>` blokları ve satır içi stiller tekrarlanıyor. Bir görsel düzeltmenin üç yerde yapılması gerekiyor.

### 3.4 Manim sahneleri

1. Metinler İngilizce; web arayüzü Türkçe.
2. Renkler web arayüzüyle farklı (Manim'de P kırmızı, I yeşil; web'de P pembe, I camgöbeği). Aynı derste iki farklı renk kodu öğrenciyi şaşırtır.
3. Eğriler simülasyon değil, elle yazılmış analitik fonksiyonlar; web simülatörüyle aynı sayılar çıkmıyor.
4. Tüm metinler `Tex` kullandığı için LaTeX zorunlu (bkz. Bölüm 9).

---

## 4. Tasarım ilkeleri

1. **Grafik önce.** Ekranın en büyük alanı grafiklere; parametreler yan panelde, açıklamalar ihtiyaç anında.
2. **Tek renk kodu, her yerde.** Web sayfaları, Manim videoları ve ders slaytları aynı renkleri kullanır.
3. **Okunabilir sayılar.** Her grafikte eksen değerleri, birimler, setpoint ve bozucu işaretleri.
4. **Gözle, ölç, karşılaştır.** Öğrencinin bir değişikliğin etkisini sayısal olarak görebilmesi (metrikler) ve önceki denemeyle üst üste karşılaştırabilmesi.
5. **Bağımlılıksız kalsın.** Derleme adımı ve CDN yok; dosya çift tıkla açılmaya devam etsin (sınıfta internet olmayabilir).
6. **Tamamen Türkçe arayüz,** terimlerin İngilizcesi ilk geçtiği yerde parantez içinde: “Ayar noktası (setpoint)”.

---

## 5. Önerilen yeni yerleşim

### 5.1 Simülatör sayfası (≥1200 px)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [logo] PID Kontrol Laboratuvarı    [Simülatör] [Kaskad] [Örnekler]  [☀/☾] │
├───────────────────┬────────────────────────────────────────────────────────┤
│ SENARYO           │  Aşım 12 %  │ Yükselme 1,8 s │ Yerleşme 6,2 s │ e∞ 0   │
│ [Sadece P     ▾]  ├────────────────────────────────────────────────────────┤
│ “Kalıcı hatayı    │  Süreç çıkışı y(t) ve ayar noktası r(t)                 │
│  gözlemleyin”     │  1,2 ┤      ╭─╮                                         │
│                   │  1,0 ┤- - -╱- -╰──────────────── r                       │
│ KONTROLÖR  [PID▾] │  0,5 ┤   ╱              ┆bozucu                         │
│ Kp ━━━●━━━ 1,20   │    0 ┼──┴────┬────┬────┬────┬──  zaman (s)              │
│ Ki ━●━━━━━ 0,40   ├────────────────────────────────────────────────────────┤
│ Kd ━●━━━━━ 0,20   │  Kontrol sinyali ve P / I / D katkıları                 │
│                   │  (aynı zaman ekseni, eksen değerleri, kırpılmış)        │
│ SÜREÇ        [▸]  ├────────────────────────────────────────────────────────┤
│ BOZUCU       [▸]  │ u(t) = 1,20·e + 0,40·∫e dt + 0,20·de/dt = 0,97          │
│ GÖRÜNÜM      [▸]  │ [▶ Oynat] [⏸] [⏭ Adım] Hız [1× ▾] [⚡ Bozucu uygula]    │
│                   │ [👻 Önceki denemeyi göster] [⤓ PNG] [⤓ CSV]            │
├───────────────────┴────────────────────────────────────────────────────────┤
│ ▸ Bu deneyde ne gözlemlemeli?  (açılır panel: kısa teori + sorular)        │
└────────────────────────────────────────────────────────────────────────────┘
```

Temel kararlar:

1. Sol panel 300 px; bölümler katlanabilir (“Kontrolör” açık, “Süreç”, “Bozucu”, “Görünüm” kapalı başlar). Böylece 1280×720'de kaydırma gerekmez.
2. Sağdaki “PID Açıklamaları” sütunu kaldırılır; içerik alttaki açılır “Bu deneyde ne gözlemlemeli?” paneline ve senaryo kartına taşınır. Grafikler yaklaşık %30 genişler.
3. İki grafik aynı zaman eksenini paylaşır, üst üste hizalı durur.
4. Metrik şeridi grafiklerin hemen üstünde, büyük rakamlarla.
5. <900 px: tek sütun, sıra grafik → metrikler → kontroller; kontroller alt çekmece (drawer) olarak açılır.

### 5.2 Kaskad sayfası

```
┌──────────────┬─────────────────────────────────────────────────────────────┐
│ Dış döngü C1 │  Şema (canlı değerlerle): r1 → C1 → r2 → C2 → u → Aktüatör  │
│ Kp1 Ki1 Kd1  │        ↑ y1 (DO) ←── Yavaş süreç ←── y2 ←──┘   ↑ y2 iç g.b. │
│ İç döngü C2  ├─────────────────────────────────────────────────────────────┤
│ Kp2 Ki2 Kd2  │  y1 (DO): kaskad  ─── vs.  tek döngülü PID  - - -           │
│ Bozucu yeri: ├─────────────────────────────────────────────────────────────┤
│ (•) iç döngü │  y2 ve u (iç döngü)                                         │
│ ( ) dış dön. ├─────────────────────────────────────────────────────────────┤
│ [x] Tek döngü│  Metrikler: maks. sapma, toparlanma süresi (kaskad / tek)   │
│   karşılaştır│                                                             │
└──────────────┴─────────────────────────────────────────────────────────────┘
```

### 5.3 Uygulama Örnekleri sayfası

Her örnek kartı: solda kısa açıklama ve mini blok şema, sağda **kaskad ve tek döngü yanıtının üst üste çizildiği** küçük grafik ve “Tekrar oynat” düğmesi. Animasyon yalnızca kart ekrandayken çalışır (IntersectionObserver), bozucu sonrası birkaç saniye bekleyip durur. “Bu örneği Kaskad sayfasında aç” bağlantısı ilgili parametrelerle kaskad sayfasını yükler.

---

## 6. Renk ve tipografi önerisi

Renk körlüğüne dayanıklı Okabe–Ito paletinden türetilmiş, açık ve koyu temada test edilecek öneri:

| Sinyal | Renk | Çizgi |
|---|---|---|
| r — ayar noktası | gri | kesikli, 2 px |
| y — süreç çıkışı | mavi `#0072B2` | düz, 3 px |
| u — kontrol sinyali | siyah / koyu temada beyaz | düz, 3 px |
| P | turuncu `#E69F00` | düz, 2 px |
| I | yeşil `#009E73` | düz, 2 px |
| D | eflatun `#CC79A7` | düz, 2 px |
| y2 — iç döngü | kızıl `#D55E00` | düz, 2 px |
| Bozucu anı | gri dikey kesikli çizgi + etiket | |
| Önceki deneme | aynı renk, %35 opaklık | |

Tipografi: sistem yazı tipi yığını korunur (çevrimdışı çalışma için), temel boyut 16 px, eksen etiketleri 13 px, metrik rakamları 28 px ve `font-variant-numeric: tabular-nums`. “Sunum modu” düğmesi tüm boyutları 1,25 kat büyütür.

Tema: projeksiyon için **açık tema varsayılan**, koyu tema düğmeyle ve `prefers-color-scheme` ile. Tüm renkler `:root` değişkenleri olarak tek dosyada.

---

## 7. Uygulama planı (fazlar)

Efor: S = birkaç saat, M = yaklaşık bir gün, L = birkaç gün.

### Faz 0 — Kritik hata düzeltmeleri (önce, küçük)

| # | İş | Çözdüğü sorun | Efor |
|---|---|---|---|
| 0.1 | Anti-windup'ı yalnızca integral payına uygula (koşullu integrasyon veya kazançlı geri hesaplama) | 3.3-5 | S |
| 0.2 | Türevi ölçüm üzerinden al (varsayılan), ilk adımda `prevE` başlatma | 3.3-3 | S |
| 0.3 | Kaskad kazançlarının canlı uygulanması | 3.3-6 | S |

Bu üç düzeltme görünümden bağımsız ve simülasyonun anlattığı fiziği doğru hale getiriyor; diğer işlerden önce yapılmalı.

### Faz 1 — Görünüm ve yerleşim temeli (öncelikli)

| # | İş | Çözdüğü sorun | Efor |
|---|---|---|---|
| 1.1 | Ortak `theme.css`: renk değişkenleri, açık/koyu tema, form elemanı stilleri, ortak başlık/gezinme | 3.1-6, 3.1-7, 3.2-3, 3.2-4, 3.2-8 | M |
| 1.2 | Ortak `plot.js`: DPR desteği, eksen değerleri ve başlıkları, birimler, kırpma, kenara taşmayan etiketler, bozucu/setpoint işaretleri, gösterge (legend) | 3.2-1, 3.2-2, 3.2-5, 3.2-6, 3.3-11 | M |
| 1.3 | Simülatör sayfasının yeni yerleşimi: katlanabilir sol panel, moda bağlı alanlar, sağ sütunun kaldırılması, 1280×720'e sığma | 3.1-1…4 | M |
| 1.4 | Duyarlı yerleşim: `min-width:0`, <900 px tek sütun, kontrol çekmecesi | 3.1-5 | S |
| 1.5 | Tüm metinlerin Türkçeleştirilmesi ve terim sözlüğü | 3.2-7 | S |
| 1.6 | Kaskad ve Örnekler sayfalarının ortak tema ve `plot.js`'e geçirilmesi | 3.3-11 | S |

Faz 1 sonunda: üç sayfa aynı görünüme sahip, grafikler okunabilir, projeksiyonda ve telefonda düzgün.

### Faz 2 — Öğretici katman

| # | İş | Neden | Efor |
|---|---|---|---|
| 2.1 | Süreç paneli: K, τ ve **ölü zaman θ** kaydırıcıları, G(s) = K·e^(−θs)/(τs+1) gösterimi | Salınım ve kararsızlığı gösterebilmek (3.3-1) | S |
| 2.2 | Performans metrikleri: yükselme süresi, aşım %, yerleşme süresi (±%2), kalıcı hata, IAE | “Kp artınca ne oldu?” sorusuna sayısal cevap | M |
| 2.3 | “Önceki denemeyi göster” (hayalet eğri) | Parametre etkisini doğrudan karşılaştırma | S |
| 2.4 | Senaryo/deney kartları (aşağıdaki liste) | Ders akışını yönlendirmek | M |
| 2.5 | Canlı denklem satırı: u(t) = Kp·e + Ki·∫e + Kd·de/dt, anlık sayılarla | Formül ile grafiği bağlamak | S |
| 2.6 | Oynatma kontrolleri: hız (0,5×/1×/2×/5×), tek adım; örnekleme süresi oynatma hızından ayrılır | 3.3-2 | S |
| 2.7 | “Bozucu uygula” düğmesi (zaman kaydırıcısı yerine veya yanında) | Derste anında gösterim (3.3-7) | S |
| 2.8 | Türev seçeneği arayüzde: hata üzerinden / ölçüm üzerinden; D filtresi | Türev tepmesini önce göstermek, sonra çözmek (3.3-3) | S |
| 2.9 | Ayarlanabilir doyum sınırları (u_min/u_max) ve doğru ölçeklenmiş gösterge | Windup'ı görünür kılmak (3.3-4, 3.3-5) | S |
| 2.10 | PNG ve CSV dışa aktarma | Laboratuvar raporu | S |
| 2.11 | **Kazanç etkisi laboratuvarı**: seçilen kazanç (Kp, Ki veya Kd) dört değerde, diğerleri sabitken anında simüle edilir; yanıtlar aynı grafikte açıktan koyuya, metrikleri tabloda | Her terimin yanıtı nasıl değiştirdiğini tek bakışta görmek | M |
| 2.12 | **“Kazanç artınca ne olur?” tablosu**: ders kitabındaki kurallar ile o anki model üzerinde hesaplanan değişimler yan yana, oklarla; ikisi farklıysa nedeni yazılır (ör. ölü zaman yokken Kp aşımı artırmaz) | Kuralı ezberlemek yerine modele bağlı olduğunu anlamak | S |
| 2.13 | **Anlık katkı ayrıştırması**: P, I ve D'nin u'ya katkısı sıfır merkezli çubuklar ve formülleriyle; her terim için “şu an ne yapıyor” cümlesi (ör. “Çıkış hızla yükseliyor; D frenliyor”) | Terimlerin işlevini simülasyon akarken okumak (2.5 ile birleşik) | M |

P, I ve D etkilerinin anlaşılması için 2.11–2.13 birlikte çalışır: 2.13 bir terimin o anda ne yaptığını, 2.11 kazancı değişince yanıtın bütününün nasıl değiştiğini, 2.12 bu değişimin genel kural ile karşılaştırmasını gösterir.

Önerilen senaryo kartları:

1. Sadece P: kalıcı hata neden oluşur?
2. P + I: kalıcı hata kaybolur, aşım başlar.
3. Yüksek Kp ve ölü zaman: salınım ve kararsızlık sınırı.
4. D eklemek: aşımın sönümlenmesi; gürültü açıkken D'nin bedeli.
5. Integral windup: dar doyum sınırı, anti-windup açık/kapalı karşılaştırması.
6. ON‑OFF ve PID: histerezis bandı, salınım genliği, aktüatör aşınması.
7. Örnekleme süresi: çok büyük örneklemenin kararlılığa etkisi.

Her kart: amaç (1 cümle), hazır parametreler, “şunu gözlemleyin”, 1–2 kontrol sorusu.

### Faz 3 — Kaskad ve örnekler

| # | İş | Efor |
|---|---|---|
| 3.2 | Şemanın yeniden çizimi: iki döngü açıkça, iç geri besleme, bozucu girişleri, canlı sinyal değerleri | M |
| 3.3 | Bozucunun nereden gireceği seçimi (iç döngü / dış döngü); etiketlerin fiziksel anlamla eşleşmesi (3.3-9). Kaskadın yalnızca iç döngü bozucusunda avantaj sağladığını göstermek başlı başına güçlü bir ders | S |
| 3.4 | Tek döngülü PID ile üst üste karşılaştırma ve metrikleri | M |
| 3.5 | Örnekler sayfası: karşılaştırmalı mini grafikler, “Tekrar oynat”, ekranda değilken durma, kaskad sayfasına parametreli bağlantı | M |

### Faz 4 — Manim videoları (isteğe bağlı)

| # | İş | Efor |
|---|---|---|
| 4.1 | Türkçe metinler ve web ile aynı renk paleti | S |
| 4.2 | Eğrilerin web simülatörüyle aynı model ve parametrelerden üretilmesi (ortak Python simülasyon fonksiyonu) | M |
| 4.3 | LaTeX gerektirmeyen `Text` seçeneği (LaTeX'siz makinelerde de render) | S |
| 4.4 | Yeni sahne: türev tepmesi ve windup gösterimi | M |
| 4.5 | macOS/Linux için `run_gui.sh` ve README güncellemesi | S |

---

## 8. Kabul ölçütleri

1. 1280×720 ekranda Simülatör sayfasında iki grafik, metrikler ve temel kontroller kaydırmadan görünür.
2. 390 px genişlikte yatay kaydırma yoktur.
3. Her grafikte eksen değerleri, birimler ve okunabilir etiketler vardır; etiketler kenarda kesilmez.
4. Tüm sinyal renkleri renk körlüğü simülasyonunda ayırt edilebilir; metin kontrastı WCAG AA'yı karşılar.
5. Arayüzde İngilizce terim yalnızca parantez içinde geçer.
6. Senaryo kartlarındaki her gözlem simülasyonda gerçekten görülebilir (örneğin yüksek Kp + ölü zaman ile salınım).
7. Sayfalar internet bağlantısı olmadan, çift tıklayarak açılır.

---

## 9. Ortam notu: BasicTeX kurulumu

Manim videolarını render etmek için denenen BasicTeX kurulumu **disk alanı yetersizliği** nedeniyle başarısız oldu:

> Error: Not enough disk space to extract … mactex-basictex-20260301.pkg

Başlangıç diskinde yalnızca yaklaşık 3 GB boş alan var (%99 dolu). Daha önceki kurulum denemelerinin sonuçsuz kalmasının nedeni de büyük olasılıkla bu. Yer açıldıktan sonra kurulum aynı komutla tekrarlanabilir. Alternatif olarak Faz 4.3 uygulanırsa videolar LaTeX olmadan da üretilebilir.

---

## 10. Karar bekleyen sorular

1. **Tema:** Projeksiyon için açık tema varsayılan olsun mu, yoksa mevcut koyu mor kimlik mi korunsun (açık tema yalnızca düğmeyle)?
2. **Kapsam:** Manim videoları (Faz 4) bu çalışmaya dahil mi, yoksa web sayfalarına mı odaklanalım?
3. **Hedef ekran:** Sınıftaki projektörün çözünürlüğü nedir (1280×720, 1366×768, 1920×1080)?
4. **Kurumsal kimlik:** Pikolab logosu ve MCBÜ ibaresi aynı biçimde kalsın mı; bölüm logosu da eklenecek mi?
5. **Ders içeriği:** Senaryo kartlarındaki sorular dersin mevcut müfredatına göre mi uyarlanmalı (örneğin Ziegler–Nichols ayarı işleniyorsa bir kart eklenebilir)?
