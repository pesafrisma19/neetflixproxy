const express = require('express');
const cors = require('cors');
const { gotScraping } = require('got-scraping');

const app = express();

// Izinkan akses dari semua domain (CORS Bypass)
app.use(cors());

app.get('/', (req, res) => {
    res.send('M3U8 Proxy is running!');
});

app.get('/m3u8-proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing url parameter');

    try {
        const isM3u8 = targetUrl.includes('.m3u8');
        
        // gotScraping dibuat khusus untuk meniru fingerprint browser asli,
        // sehingga sangat efektif menembus proteksi Cloudflare (halaman JS Challenge).
        const response = await gotScraping({
            url: targetUrl,
            responseType: isM3u8 ? 'text' : 'buffer',
            headers: {
                'Referer': 'https://cloud.hownetwork.xyz/',
                'Origin': 'https://cloud.hownetwork.xyz/'
            },
            throwHttpErrors: false // Jangan throw jika error 403, kita ingin handle sendiri
        });

        if (response.statusCode >= 400) {
             console.warn(`Gagal mengambil ${targetUrl}, status: ${response.statusCode}`);
             return res.status(response.statusCode).send(response.body);
        }

        if (isM3u8) {
            let m3u8Text = response.body;
            const baseUri = new URL(targetUrl);
            const basePath = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

            const lines = m3u8Text.split(/\r?\n/);
            const rewritten = lines.map(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) return line;
                
                let absoluteUrl = trimmed;
                if (!trimmed.startsWith('http')) {
                    if (trimmed.startsWith('/')) {
                        absoluteUrl = `${baseUri.origin}${trimmed}`;
                    } else {
                        absoluteUrl = `${basePath}${trimmed}`;
                    }
                }
                
                // Gunakan URL server ini sendiri sebagai proxy untuk chunk TS/.pict
                let proxyBase = '';
                if (req.headers["x-forwarded-host"]) {
                    proxyBase = `https://${req.headers["x-forwarded-host"]}/m3u8-proxy?url=`;
                } else {
                    proxyBase = `${req.protocol}://${req.get('host')}/m3u8-proxy?url=`;
                }
                
                return `${proxyBase}${encodeURIComponent(absoluteUrl)}`;
            });

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            return res.send(rewritten.join('\n'));
        } else {
            // Ini untuk .pict / .ts chunk
            res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp2t');
            return res.send(response.body);
        }
    } catch (err) {
        console.error("Proxy error:", err.message);
        res.status(500).send('Proxy error: ' + err.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy berjalan di port ${PORT}`));
