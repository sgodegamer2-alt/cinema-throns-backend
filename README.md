# Cinema Throns Backend

Backend بسيط يوفر مصادر فيديو وترجمات عربية لموقع Cinema Throns.

## Endpoints

- `GET /api/stream?tmdb_id=27205&type=movie` - كل مصادر الفيديو
- `GET /api/stream?tmdb_id=1399&type=tv&season=1&episode=1` - مصادر المسلسل
- `GET /api/subtitles?tmdb_id=27205&type=movie` - الترجمات العربية
- `GET /api/subtitle-download?file_id=xxx` - رابط تحميل الترجمة
- `GET /api/subtitle-proxy?url=xxx` - Proxy + تحويل SRT→VTT
- `GET /api/health` - فحص الحالة