'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
// Optional, explicit image-source permissions. Never grant LAN/filesystem access by default.
const BASE_DIR = (process.env.IOBROKER_BRING_IMAGE_BASE_DIR || '').trim();
const LAN_ALLOWLIST = String(process.env.IOBROKER_BRING_IMAGE_LAN_ALLOWLIST || '')
    .split(',').map(value => value.trim()).filter(Boolean);
const MAX_SIZE = 5 * 1024 * 1024;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function inspectBringStoredImage(imageUrl) {
    try {
        const url = new URL(imageUrl);

        if (url.protocol !== 'https:' ||
            url.hostname !== 'bring-production.s3.amazonaws.com' ||
            !url.pathname.startsWith('/bring/listitemdetail/')) {
            throw new Error('Unerwartete Bring-Bildadresse');
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: { Range: 'bytes=0-31' },
            redirect: 'error',
            signal: AbortSignal.timeout(15000)
        });

        if (!response.ok) {
            throw new Error('Bildabruf HTTP ' + response.status);
        }

        if (!response.body) {
            throw new Error('Bilddatei leer');
        }

        const reader = response.body.getReader();
        let head = Buffer.alloc(0);

        try {
            while (head.length < 12) {
                const { value, done } = await reader.read();
                if (done) break;

                head = Buffer.concat([
                    head,
                    Buffer.from(value).subarray(
                        0, 32 - head.length
                    )
                ]);
            }
        } finally {
            await reader.cancel().catch(() => {});
            reader.releaseLock();
        }

        const jpeg = head[0] === 0xff &&
            head[1] === 0xd8 &&
            head[2] === 0xff;

        const png = head.subarray(0, 8).equals(
            Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
        );

        if (!jpeg && !png) {
            throw new Error(
                'Keine gueltigen Bilddaten. Dateianfang: ' +
                head.subarray(0, 8).toString('hex')
            );
        }

        return {
            ok: true,
            mime: png ? 'image/png' : 'image/jpeg',
            contentType: response.headers.get('content-type') || null
        };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

function validateImage(image) {
    if (!Buffer.isBuffer(image) || image.length < 10 || image.length > MAX_SIZE) {
        throw new Error('Ungueltige Bildgroesse (maximal 5 MiB)');
    }
    const jpeg = image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
    const png = image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!jpeg && !png) {
        throw new Error('Nur JPEG/PNG wird unterstuetzt (kein WebP/HTML)');
    }
    return image;
}

async function loadLocalImage(filePath) {
    if (!BASE_DIR) throw new Error('Lokale Bilddateien sind nicht freigegeben');
    const allowed = await fs.realpath(BASE_DIR);
    const file = await fs.realpath(filePath);
    if (file !== allowed && !file.startsWith(allowed + path.sep)) {
        throw new Error('Bilddatei muss innerhalb von ' + BASE_DIR + ' liegen');
    }
    const stats = await fs.stat(file);
    if (!stats.isFile() || stats.size < 10 || stats.size > MAX_SIZE) {
        throw new Error('Ungueltige Dateigroesse (maximal 5 MiB)');
    }
    return validateImage(await fs.readFile(file));
}

// Remote images: public HTTPS by default. Explicitly allowlisted LAN origins
// may also use HTTP. DNS is checked at connection time to prevent rebinding.
// No redirects, authentication in URLs, or other content types are accepted.
function isPrivateLanIPv4(address) {
    const net = require('node:net');
    if (net.isIP(address) !== 4) return false;
    const [a, b] = address.split('.').map(Number);
    return a === 10 || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168);
}

function isAllowedLanOrigin(url) {
    return LAN_ALLOWLIST.some(value => {
        try {
            const allowed = new URL(value);
            return (allowed.protocol === 'http:' || allowed.protocol === 'https:') &&
                allowed.origin === url.origin && allowed.pathname === '/' &&
                !allowed.username && !allowed.password && !allowed.search &&
                !allowed.hash;
        } catch {
            return false;
        }
    });
}
function isPublicIPv4(address) {
    const net = require('node:net');
    if (net.isIP(address) !== 4) return false;
    const [a, b, c] = address.split('.').map(Number);
    return !(
        a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && (b === 168 || b === 0)) ||
        (a === 192 && b === 88 && c === 99) ||
        (a === 192 && b === 0 && c === 2) ||
        (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
        (a === 203 && b === 0 && c === 113)
    );
}

async function loadRemoteImage(source) {
    if (typeof source !== 'string' || source.length > 4096) {
        throw new Error('Bild-URL ungueltig oder zu lang');
    }
    let url;
    try {
        url = new URL(source);
    } catch {
        throw new Error('Ungueltige Bild-URL');
    }
    const net = require('node:net');
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    const internal = !host.includes('.') || host === 'localhost' ||
        ['.localhost', '.local', '.internal', '.home.arpa', '.lan', '.test', '.invalid']
            .some(suffix => host.endsWith(suffix));
    const allowlistedLan = isAllowedLanOrigin(url);
    const publicHttps = url.protocol === 'https:' && !internal &&
        net.isIP(host) === 0 && (!url.port || url.port === '443');
    if ((!allowlistedLan && !publicHttps) || !host ||
        url.username || url.password || url.hash) {
        throw new Error('Nur oeffentliche HTTPS-Quellen oder freigegebene LAN-Origins erlaubt');
    }
    if (!url.pathname || url.pathname === '/') {
        throw new Error('Kein konkreter Bildpfad in der URL');
    }

    const transport = url.protocol === 'http:' ? require('node:http') : require('node:https');
    const dns = require('node:dns');
    return await new Promise((resolve, reject) => {
        const req = transport.request(url, {
            method: 'GET',
            headers: { Accept: 'image/jpeg,image/png;q=0.9' },
            // DNS beim Verbindungsaufbau absichern: kein DNS-Rebinding auf LAN-Ziele.
            lookup(hostname, options, callback) {
                dns.lookup(hostname, { family: 4, all: true }, (error, addresses) => {
                    if (error) return callback(error);
                    if (!Array.isArray(addresses) || addresses.length === 0 ||
                        addresses.some(entry => !(allowlistedLan
                            ? isPrivateLanIPv4(entry.address)
                            : isPublicIPv4(entry.address)))) {
                        return callback(new Error('Bildserver hat keine erlaubte IPv4-Adresse'));
                    }
                    // Node.js 20+/22 fordert bei autoSelectFamily mit options.all
                    // ein Array von {address, family}; ein String fuehrt zu
                    // "Invalid IP address: undefined".
                    if (options && options.all === true) {
                        return callback(null, addresses.map(entry => ({
                            address: entry.address, family: 4
                        })));
                    }
                    return callback(null, addresses[0].address, 4);
                });
            }
        }, response => {
            const status = response.statusCode || 0;
            if (status < 200 || status >= 300) {
                response.resume();
                reject(new Error('Bilddownload HTTP ' + status + ' (Weiterleitungen nicht erlaubt)'));
                return;
            }
            const type = String(response.headers['content-type'] || '').toLowerCase();
            if (type && !type.startsWith('image/png') && !type.startsWith('image/jpeg') &&
                !type.startsWith('application/octet-stream')) {
                response.resume();
                reject(new Error('Bildquelle liefert kein JPEG/PNG: ' + type.slice(0, 80)));
                return;
            }
            const declared = Number(response.headers['content-length']);
            if (Number.isFinite(declared) && declared > MAX_SIZE) {
                response.resume();
                reject(new Error('Bild zu gross (maximal 5 MiB)'));
                return;
            }
            const chunks = [];
            let received = 0;
            response.on('data', chunk => {
                received += chunk.length;
                if (received > MAX_SIZE) {
                    req.destroy(new Error('Bild zu gross (maximal 5 MiB)'));
                    return;
                }
                chunks.push(chunk);
            });
            response.on('end', () => {
                try {
                    resolve(validateImage(Buffer.concat(chunks, received)));
                } catch (error) {
                    reject(error);
                }
            });
            response.on('error', reject);
        });
        req.setTimeout(20000, () => req.destroy(new Error('Bilddownload Timeout')));
        req.on('error', reject);
        req.end();
    });
}
function createBringImageUpload(adapter, getBring, getNativeList) {
    async function finish(listId, payload) {
        await adapter.setStateAsync(
            `${listId}.imageLastResult`,
            JSON.stringify({ ...payload, timestamp: new Date().toISOString() }),
            true
        );
    }

    return async function saveItemImage(listId, raw) {
        let name = '';
        let itemCreated = false;
        try {
            if (typeof raw !== 'string') throw new Error('JSON-Zeichenkette erwartet');
            const data = JSON.parse(raw);
            if (!data || typeof data !== 'object' || Array.isArray(data)) {
                throw new Error('JSON-Objekt erwartet');
            }
            name = String(data.name || '').trim();
            if (!name || name.length > 200) throw new Error('Ungueltiger Artikelname');
            if (data.overwrite !== undefined && typeof data.overwrite !== 'boolean') {
                throw new Error('overwrite muss true oder false sein');
            }
            const hasPath = typeof data.path === 'string' && data.path.length > 0;
            const hasUrl = typeof data.url === 'string' && data.url.length > 0;
            if (hasPath === hasUrl) {
                throw new Error('Genau eines von path oder url angeben');
            }

            // The existing Bring shopping list must contain the item already.
            const bring = getBring();
            if (!bring?.headers?.Authorization) {
                throw new Error('Bring-Adapter ist nicht angemeldet');
            }
            let matches = (await getNativeList(listId))?.purchase?.filter(
                item => item.itemId === name
            ) || [];
            let preparedImage = null;

            if (data.createIfMissing !== undefined &&
                typeof data.createIfMissing !== 'boolean') {
                throw new Error('createIfMissing muss true oder false sein');
            }

            if (data.specification !== undefined &&
                typeof data.specification !== 'string') {
                throw new Error('specification muss Text sein');
            }

            if (matches.length === 0 && data.createIfMissing === true) {

                // Bild zuerst pruefen
                preparedImage = hasUrl
                    ? await loadRemoteImage(data.url)
                    : await loadLocalImage(data.path);

                const createHeaders = new Headers(bring.headers);
                createHeaders.delete('content-length');
                createHeaders.set(
                    'content-type',
                    'application/x-www-form-urlencoded; charset=UTF-8'
                );

                const createResponse = await fetch(
                    'https://api.getbring.com/rest/v2/bringlists/' +
                    encodeURIComponent(listId),
                    {
                        method: 'PUT',
                        headers: createHeaders,
                        body: new URLSearchParams({
                            purchase: name,
                            recently: '',
                            specification: data.specification || '',
                            remove: '',
                            sender: 'null'
                        }),
                        signal: AbortSignal.timeout(20000)
                    }
                );

                if (!createResponse.ok) {
                    const msg = (await createResponse.text()).slice(0, 300);
                    throw new Error(
                        'Bring-Artikelanlage HTTP ' +
                        createResponse.status + ': ' + msg
                    );
                }

                itemCreated = true;

                // Artikel nach Anlage erneut abrufen
                for (let attempt = 0; attempt < 10; attempt++) {
                    matches = (await getNativeList(listId))?.purchase?.filter(
                        item => item.itemId === name
                    ) || [];

                    if (matches.length > 0) break;

                    if (attempt < 9) await sleep(450);
                }
            }

            if (matches.length !== 1 || !matches[0].uuid) {
                throw new Error(
                    'Artikel nicht eindeutig auf der Einkaufsliste vorhanden'
                );
            }
            const uuid = matches[0].uuid;
            const getDetail = async () => {
                const details = await bring.getItemsDetails(listId);
                if (!Array.isArray(details)) {
                    throw new Error('Bring-Artikeldetails ungueltig');
                }
                const matching = details.filter(item => item && item.itemId === name);
                if (matching.length > 1) {
                    throw new Error('Artikeldetails fuer ' + name + ' nicht eindeutig');
                }
                return matching[0] || null;
            };
            let previous = await getDetail();
            let detailCreated = false;

            // Create missing item detail only for explicitly requested image uploads
            if (!previous) {
                const fields = {
                    listUuid: listId,
                    itemId: name,
                    userIconItemId: String(
                        data.iconItemId ?? matches[0].userIconItemId ?? ''
                    ),
                    userSectionId: String(
                        data.categoryId ?? matches[0].userSectionId ?? ''
                    ),
                    assignedTo: ''
                };

                if (Object.values(fields).some(v => /[\r\n]/.test(v))) {
                    throw new Error('Ungueltiger Zeilenumbruch in Artikeldetails');
                }

                if (Array.from(name).some(c => c.codePointAt(0) > 255)) {
                    throw new Error('Artikelname ist nicht Latin-1-kompatibel');
                }

                const boundary = '----iobroker-bring-' +
                    require('node:crypto').randomUUID();

                const chunks = [];

                for (const [key, value] of Object.entries(fields)) {
                    chunks.push(
                        Buffer.from(
                            '--' + boundary + '\r\n' +
                            'Content-Disposition: form-data; name="' +
                            key + '"\r\n\r\n',
                            'ascii'
                        ),
                        Buffer.from(value, 'latin1'),
                        Buffer.from('\r\n', 'ascii')
                    );
                }

                chunks.push(
                    Buffer.from('--' + boundary + '--\r\n', 'ascii')
                );

                const detailHeaders = new Headers(bring.headers);
                detailHeaders.delete('content-length');
                detailHeaders.set(
                    'content-type',
                    'multipart/form-data; boundary=' + boundary
                );

                const detailResponse = await fetch(
                    'https://api.getbring.com/rest/v2/bringlistitemdetails/',
                    {
                        method: 'POST',
                        headers: detailHeaders,
                        body: Buffer.concat(chunks),
                        signal: AbortSignal.timeout(20000)
                    }
                );

                if (!detailResponse.ok) {
                    const message = (await detailResponse.text()).slice(0, 350);
                    throw new Error(
                        'Bring-Detailanlage HTTP ' +
                        detailResponse.status +
                        (message ? ': ' + message : '')
                    );
                }

                // Detail-UUID frisch von Bring abrufen
                for (let attempt = 0; attempt < 8; attempt++) {
                    previous = await getDetail();

                    if (previous?.uuid) break;

                    if (attempt < 7) await sleep(450);
                }

                if (!previous?.uuid) {
                    throw new Error(
                        'Detailanlage angenommen, aber keine UUID zurueckgelesen'
                    );
                }

                detailCreated = true;

                adapter.log.info(
                    '[IMAGE] Artikeldetails automatisch erstellt: ' + name
                );
            }
            // Bildendpunkt erwartet eine existierende Detail-UUID,
            // niemals die UUID des Einkaufslisteneintrags.
            const uploadDetailUuid = typeof previous?.uuid === 'string'
                ? previous.uuid.trim() : '';
            if (!uploadDetailUuid) {
                throw new Error(
                    'Kein Bring-Artikeldetail fuer "' + name + '" vorhanden. ' +
                    'Zuerst ein Icon in der Bring-App zuweisen.'
                );
            }
            if (previous?.imageUrl && data.overwrite !== true) {
                throw new Error('Bild bereits vorhanden; overwrite:true erforderlich');
            }

            // Download only after validating item, permissions and overwrite flag.
            const image = preparedImage || (hasUrl
                ? await loadRemoteImage(data.url)
                : await loadLocalImage(data.path));

            // Bild als echte Binaerdatei hochladen
            const imageMime = image[0] === 0xff
                ? 'image/jpeg' : 'image/png';

            const form = new FormData();
            form.append(
                'imageData',
                new Blob([image], { type: imageMime }),
                imageMime === 'image/jpeg'
                    ? 'produkt.jpg' : 'produkt.png'
            );

            // Multipart-Boundary automatisch setzen lassen
            const uploadHeaders = new Headers(bring.headers);
            uploadHeaders.delete('content-type');
            uploadHeaders.delete('content-length');

            const response = await fetch(
                'https://api.getbring.com/rest/v2/bringlistitemdetails/' +
                    encodeURIComponent(uploadDetailUuid) + '/image',
                {
                    method: 'PUT',
                    headers: uploadHeaders,
                    body: form,
                    signal: AbortSignal.timeout(30000)
                }
            );
            if (!response.ok) {
                const body = (await response.text())
                    .slice(0, 350)
                    .replace(/[\r\n\t]+/g, ' ');

                throw new Error(
                    'Bring-Bildupload HTTP ' +
                    response.status +
                    (body ? ': ' + body : '')
                );
            }
            let imageUrl = null;
            try {
                const answer = await response.text();
                if (answer) imageUrl = JSON.parse(answer).imageUrl || null;
            } catch {
                // Some Bring responses are empty/204.
            }
            let confirmed = false;
            let imageCheck = {
                ok: false,
                error: 'Bildadresse noch nicht verfuegbar'
            };

            for (let i = 0; i < 5; i++) {
                const after = await getDetail();

                if (after?.uuid === uploadDetailUuid && after?.imageUrl) {
                    imageUrl = after.imageUrl;

                    // Bei Ueberschreiben auf neue URL warten
                    if (previous?.imageUrl &&
                        imageUrl === previous.imageUrl &&
                        i < 4) {
                        await sleep(550);
                        continue;
                    }

                    imageCheck = await inspectBringStoredImage(imageUrl);
                    confirmed = imageCheck.ok;
                    break;
                }

                if (i < 4) await sleep(550);
            }
            await finish(listId, {
                ok: true,
                status: confirmed ? 'verified' : 'accepted_unconfirmed',
                detailUuid: uploadDetailUuid,
                detailCreated,
                confirmed,
                name,
                uuid,
                itemCreated,
                source: hasUrl ? 'url' : 'path',
                imageUrl,
                imageCheck
            });
            await adapter.setStateAsync(`${listId}.saveItemImage`, '', true);
            adapter.log.info(
                `[IMAGE] ${hasUrl ? 'Bild-URL' : 'Datei'} fuer "${name}" in ${listId} hochgeladen` +
                (confirmed ? '' : ' (Bring-Details noch nicht aktualisiert)')
            );
        } catch (err) {
            adapter.log.warn('[IMAGE] Bild-Upload fehlgeschlagen: ' + err.message);
            await finish(listId, { ok: false, name, itemCreated, error: err.message });
            // Fehler bleibt in imageLastResult sichtbar, Befehlseingang ist wieder leer.
            try {
                const current = await adapter.getStateAsync(`${listId}.saveItemImage`);
                if (current?.val === raw) {
                    await adapter.setStateAsync(`${listId}.saveItemImage`, '', true);
                }
            } catch (clearErr) {
                adapter.log.warn('[IMAGE] Eingabe leeren: ' + clearErr.message);
            }
        }
    };
}

module.exports = { createBringImageUpload };
