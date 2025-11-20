# YouTube Music Discord Bot (Node, بدون تسجيل دخول)

بوت ديسكورد يشغّل صوت يوتيوب عبر `yt-dlp` و`ffmpeg` بدون أي تسجيل دخول أو مفاتيح Google. الأوامر Slash `/play`, `/skip`, `/stop`, `/queue`, `/ping`.

## المتطلبات
- Node 18+
- `ffmpeg` في الـ PATH (Ubuntu: `sudo apt install ffmpeg`)
- `yt-dlp` في الـ PATH (Ubuntu: `sudo apt install yt-dlp` أو `pip install -U yt-dlp`)
- متغيرات البيئة:
  - `DISCORD_TOKEN` توكن البوت (ضروري)
  - `CLIENT_ID` (اختياري؛ يستخدم لتسجيل الأوامر، وإلا يؤخذ من العميل بعد تسجيل الدخول)
  - `GUILD_ID` (اختياري لتسجيل الأوامر فورًا على خادم واحد؛ بدونها يتم التسجيل عالميًا وقد يتأخر بضع دقائق)
  - `YTDLP_BIN` (اختياري) مسار تنفيذي yt-dlp إذا لم يكن في PATH أو عند التشغيل عبر systemd/pm2.
  - `YTDLP_PLAYER_CLIENT` (اختياري) يغيّر عميل يوتيوب المستخدم من yt-dlp (الافتراضي `android`).
  - `YTDLP_COOKIES` أو `YTDLP_COOKIES_FROM_BROWSER` أو `YTDLP_EXTRA_ARGS` لإعطاء yt-dlp كوكيز أو أعلام إضافية عند الحاجة (انظر أدناه).

تجاوز طلبات تسجيل الدخول:
- الإعداد الافتراضي يستخدم `--extractor-args youtube:player_client=android` لتجنب "Sign in to confirm you’re not a bot".
- إذا استمر الخطأ، حدّث yt-dlp (`pip install -U yt-dlp`) أو مرّر كوكيز متصفح عبر yt-dlp (راجع الروابط في رسالة الخطأ). في حالات نادرة يمكن ضبط `YTDLP_BIN` لتشير إلى نسخة محلية محدثة.
- يمكن تمرير الكوكيز تلقائيًا عبر متغير بيئة:
  - `YTDLP_COOKIES=<مسار_ملف_cookies.txt>` أو
  - `YTDLP_COOKIES_FROM_BROWSER="chrome"` (أو firefox، مع بروفايل افتراضي).
  - أعلام إضافية (مثل `--force-ipv4` مضافة تلقائيًا) يمكن تمريرها في `YTDLP_EXTRA_ARGS`.

## التثبيت
```bash
npm install
```

## التشغيل
```bash
set DISCORD_TOKEN=توكنك
set CLIENT_ID=ايديي_التطبيق   # اختياري
set GUILD_ID=ايديي_الخادم     # اختياري للتسجيل الفوري
npm start
```
على لينكس/ماك استخدم `export VAR=value` بدل `set`.

## الاختبارات
```bash
npm test
```
الاختبارات تتحقق من:
- أعلام `yt-dlp` الآمنة (منع البلاي ليست، عدم طلب تسجيل أو كوكيز).
- سلوك البحث مقابل الرابط المباشر.
- منطق قائمة الانتظار في الجلسة مع محاكاة voice (بدون تشغيل صوت فعلي).

## ملاحظات
- الصوت يُبث عبر `ffmpeg` باستخدام رابط البث من `yt-dlp` فقط، لا حاجة لتسجيل دخول أو ملفات كوكيز.
- أعط البوت صلاحية `Connect` و`Speak` في الخادم.
- يمكن تشغيله كخدمة على VPS باستخدام systemd أو pm2. كرر `npm test` بعد أي تعديل لضمان بقاء الإعدادات ضد مشاكل التحقق.
