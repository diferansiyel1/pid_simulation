## Bioprocess Control Animations (Manim)

### Kurulum

1. Python 3.10+ önerilir.
2. Sanal ortam oluşturun ve etkinleştirin.
3. Bağımlılıkları kurun:

```bash
pip install -r requirements.txt
```

4. Manim için FFMPEG ve LaTeX (opsiyonel ama tavsiye edilir) kurulu olmalıdır.
- Windows: `choco install ffmpeg` veya FFMPEG resmi kurulumu.

### Çalıştırma

Aşağıdaki komutlar, her sahneyi 720p olarak hızlı önizleme üretir. `-p` oynatır, `-q l` düşük kalite, `-q h` yüksek kalite içindir.

```bash
manim -p -q l src/animations.py NegativeFeedbackScene
manim -p -q l src/animations.py PIDScene
manim -p -q l src/animations.py CascadeControlScene
manim -p -q l src/animations.py FeedforwardControlScene
```

Üretim kalitesi (1080p):

```bash
manim -q h -r 1920,1080 src/animations.py NegativeFeedbackScene
```

### Tıkla-Çalıştır GUI

Windows'ta arayüzü doğrudan başlatmak için kök dizindeki `run_gui.bat` dosyasına çift tıklayın.

- İlk çalıştırmada gerekli paketleri yükler.
- Üstten kaliteyi seçin, `Render ALL` ile tüm sahneleri veya ilgili düğmelerle tek tek sahneleri MP4 olarak oluşturun.
- Çıktılar varsayılan olarak `media/gui/` altına yazılır.

### Dosya Yapısı
- `src/animations.py`: Dört eğitim sahnesi (Negative Feedback, PID, Cascade, Feedforward)
- `src/gui.py`: Tkinter tabanlı tıkla-çalıştır arayüz
- `requirements.txt`: Gerekli Python paketleri
 - `run_gui.bat`: Windows için GUI başlatma dosyası

## Web PID Visualizer

Modern HTML/CSS/JS ile tarayıcıdan etkileşimli PID görselleştirici eklendi.

### Çalıştırma

1. `web/index.html` dosyasını çift tıklayın veya bir yerel sunucuda açın.
2. Kp, Ki, Kd, setpoint, bozucu büyüklüğü/zamanı, örnekleme aralığı gibi parametreleri ayarlayın.
3. P/I/D/u eğrilerini aç/kapa; anti-windup ve gürültüyü deneyin.

### Dosyalar
- `web/index.html`: Arayüz ve düzen
- `web/style.css`: Modern koyu tema stil
- `web/app.js`: PID simülasyonu ve çizimler (Canvas)

### Notlar
- LaTeX metinleri için sisteminizde LaTeX dağıtımı yoksa, `Tex` yerine `MarkupText` kullanılabilir. Mevcut sahneler `Tex` ile çalışır.
- Render süreleri donanımınıza bağlı değişir.
