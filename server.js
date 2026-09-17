/**
 * Cinema Throns Backend v4.0
 * سيرفرات مُختبرة في العراق: MultiEmbed + VidLink
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OPENSUBTITLES_API_KEY = process.env.OPENSUBTITLES_API_KEY || 'Vdr9xOiX4VhM2nIfAsoHrUw2FwSo2b5B';

const cache = new Map();
const TTL = 6 * 60 * 60 * 1000;
function setC(k, v) { cache.set(k, { v, e: Date.now() + TTL }); }
function getC(k) { const i = cache.get(k); if (!i) return null; if (Date.now() > i.e) { cache.delete(k); return null; } return i.v; }

// ========== سيرفران فقط (المختبران) ==========
const SOURCES = {
    multiembed: {
        name: 'MultiEmbed',
        supportsArabic: false,
        build: (id, tv, s, e) => tv
            ? `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`
            : `https://multiembed.mov/?video_id=${id}&tmdb=1`
    },
    vidlink: {
        name: 'VidLink',
        supportsArabic: true,
        build: (id, tv, s, e) => tv
            ? `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=dc2626&autoplay=true`
            : `https://vidlink.pro/movie/${id}?primaryColor=dc2626&autoplay=true`
    }
};

// ========== OpenSubtitles ==========
async function searchArabicSubs(tmdbId, isTv, season, episode) {
    try {
        const params = {
            tmdb_id: tmdbId,
            languages: 'ar',
            type: isTv ? 'episode' : 'movie'
        };
        if (isTv) {
            params.season_number = season;
            params.episode_number = episode;
        }

        const r = await axios.get('https://api.opensubtitles.com/api/v1/subtitles', {
            params,
            headers: {
                'Api-Key': OPENSUBTITLES_API_KEY,
                'User-Agent': 'CinemaThrons v4',
                'Accept': 'application/json'
            },
            timeout: 12000
        });

        const subs = r.data?.data || [];
        if (!subs.length) return [];

        return subs.map(s => {
            const a = s.attributes || {};
            const file = a.files?.[0] || {};
            return {
                fileId: file.file_id,
                fileName: file.file_name,
                language: a.language,
                downloads: a.download_count || 0,
                rating: a.ratings || 0,
                release: a.release || a.feature_details?.title || '',
                fps: a.fps || 0
            };
        }).sort((a, b) => b.downloads - a.downloads);
    } catch (e) {
        console.error('OpenSubtitles search error:', e.response?.status, e.message);
        return [];
    }
}

async function getSubtitleDownloadLink(fileId) {
    try {
        const r = await axios.post('https://api.opensubtitles.com/api/v1/download',
            { file_id: fileId },
            {
                headers: {
                    'Api-Key': OPENSUBTITLES_API_KEY,
                    'User-Agent': 'CinemaThrons v4',
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 12000
            }
        );
        return r.data?.link || null;
    } catch (e) {
        console.error('OpenSubtitles download error:', e.response?.status, e.message);
        return null;
    }
}

// ========== Routes ==========
app.get('/', (req, res) => {
    res.json({
        name: 'Cinema Throns Backend',
        version: '4.0',
        status: 'online',
        sources: Object.keys(SOURCES),
        endpoints: {
            stream: '/api/stream?tmdb_id=27205&type=movie',
            tv_stream: '/api/stream?tmdb_id=1399&type=tv&season=1&episode=1',
            subtitles: '/api/subtitles?tmdb_id=27205&type=movie',
            health: '/api/health'
        }
    });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', cacheSize: cache.size, uptime: process.uptime() });
});

app.get('/api/stream', (req, res) => {
    const { tmdb_id, type = 'movie', season = 1, episode = 1 } = req.query;
    if (!tmdb_id) return res.status(400).json({ error: 'tmdb_id required' });

    const isTv = type === 'tv';
    const cacheKey = `s:${tmdb_id}:${isTv}:${season}:${episode}`;
    const cached = getC(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    const sources = [];
    for (const key of Object.keys(SOURCES)) {
        const s = SOURCES[key];
        sources.push({
            key,
            name: s.name,
            url: s.build(tmdb_id, isTv, season, episode),
            supportsArabic: s.supportsArabic
        });
    }

    const result = {
        success: true,
        tmdb_id,
        type: isTv ? 'tv' : 'movie',
        season: isTv ? Number(season) : null,
        episode: isTv ? Number(episode) : null,
        sources,
        primary: sources[0]
    };

    setC(cacheKey, result);
    res.json(result);
});

app.get('/api/subtitles', async (req, res) => {
    const { tmdb_id, type = 'movie', season = 1, episode = 1 } = req.query;
    if (!tmdb_id) return res.status(400).json({ error: 'tmdb_id required' });

    const isTv = type === 'tv';
    const cacheKey = `sub:${tmdb_id}:${isTv}:${season}:${episode}`;
    const cached = getC(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    const subs = await searchArabicSubs(tmdb_id, isTv, season, episode);
    const result = { success: true, tmdb_id, count: subs.length, subtitles: subs };

    setC(cacheKey, result);
    res.json(result);
});

app.get('/api/subtitle-download', async (req, res) => {
    const { file_id } = req.query;
    if (!file_id) return res.status(400).json({ error: 'file_id required' });

    const link = await getSubtitleDownloadLink(parseInt(file_id));
    if (!link) return res.status(404).json({ error: 'Download link not found' });

    res.json({ success: true, downloadUrl: link });
});

app.get('/api/subtitle-proxy', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('url required');

    try {
        const r = await axios.get(url, { responseType: 'text', timeout: 15000 });
        let text = r.data;

        if (text.trim().startsWith('WEBVTT')) {
            res.set('Content-Type', 'text/vtt; charset=utf-8');
            res.set('Access-Control-Allow-Origin', '*');
            return res.send(text);
        }

        text = text.replace(/\r+/g, '').replace(/^\uFEFF/, '');
        text = text.replace(/^\d+\s*$/gm, '');
        text = text.replace(/(\d{1,2}:\d{2}:\d{2})[,.](\d{1,3})/g, (m, t, ms) => `${t}.${ms.padEnd(3, '0').slice(0, 3)}`);
        const vtt = 'WEBVTT\n\n' + text.trim();

        res.set('Content-Type', 'text/vtt; charset=utf-8');
        res.set('Access-Control-Allow-Origin', '*');
        res.send(vtt);
    } catch (e) {
        res.status(500).send('Proxy error: ' + e.message);
    }
});

module.exports = app;

if (require.main === module) {
    app.listen(PORT, () => console.log(`✅ Cinema Throns Backend v4 on port ${PORT}`));
}
Use tested sources: MultiEmbed + VidLink
