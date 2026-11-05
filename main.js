/**
 * Bring! adapter
 */

'use strict';

const utils = require(`@iobroker/adapter-core`);
const crypto = require(`./lib/crypto`);
const Bring = require(`bring-shopping`);
const tableify = require(`tableify`);
const i18nHelper = require(`./lib/i18nHelper`);
const { getStaticObjects } = require(`./lib/utils`);
const { createBringImageUpload } = require('./lib/bringImageUpload');
const { createBringSpecial } = require('./lib/bringSpecial');
let bringSpecial;
let adapter;

let mail;
let password;
/** @type {Bring} */
let bring;
let bringImageUpload;
const polling = {};
const listLang = {};
let loginTimeout;
let lang;
let dict = {};
let invertedDict = {};

function startAdapter(options) {
    options = options || {};
    options = { ...options, ...{ name: `bring` } };

    adapter = new utils.Adapter(options);

    adapter.on(`message`, async obj => {
        if (obj && obj.command === `getTelegramUsers`) {
            try {
                const state = await adapter.getForeignStateAsync(`${obj.message}.communicate.users`);
                if (state?.val) {
                    adapter.sendTo(obj.from, obj.command, state.val, obj.callback);
                }
            } catch (e) {
                adapter.log.error(`Cannot parse stored user ID's from Telegram!`);
                adapter.log.error(e.message);
            }
        }
    });

    adapter.on(`unload`, callback => {
        try {
            if (bringSpecial) bringSpecial.stop();
            adapter.log.info(`[END] Stopping Bring! adapter...`);
            adapter.setState(`info.connection`, false, true);
            callback();
        } catch {
            callback();
        }
    });

    adapter.on(`ready`, async () => {
        try {
            const obj = await adapter.getForeignObjectAsync(`system.config`);
            if (obj && obj.native && obj.native.secret) {
                password = crypto.decrypt(obj.native.secret, adapter.config.password);
                mail = crypto.decrypt(obj.native.secret, adapter.config.mail);
            } else {
                password = crypto.decrypt(`Zgfr56gFe87jJOM`, adapter.config.password);
                mail = crypto.decrypt(`Zgfr56gFe87jJOM`, adapter.config.mail);
            }

            lang = obj && obj.common && obj.common.language ? obj.common.language : `en`;
        } catch {
            lang = `en`;
            password = crypto.decrypt(`Zgfr56gFe87jJOM`, adapter.config.password);
            mail = crypto.decrypt(`Zgfr56gFe87jJOM`, adapter.config.mail);
        }

        main();
    });

    adapter.on(`stateChange`, async (id, state) => {
        if (!id || !state || state.ack) {
            return;
        }
        adapter.log.debug(`[STATE] Changed ${id} to ${state.val}`);
        if (typeof state.val === 'string' && !state.val.trim()) return;
        const listId = id.split(`.`)[2];
        const method = id.split(`.`).pop();

        switch (method) {
            case 'removeItem':
                await removeItem(listId, state.val, false);
                break;
            case 'removeItemTranslated':
                await removeItem(listId, state.val, true);
                break;
            case 'saveItem':
                await handleUnifiedSaveItem(listId, state.val);
                break;
            case 'saveItemWithAttributes':
                await saveItemWithAttributes(
                    listId, state.val, 'saveItemWithAttributes'
                );
                break;
            case 'setItemAttributes':
                await saveItemWithAttributes(
                    listId, state.val, 'setItemAttributes'
                );
                break;
            case 'saveItemTranslated':
                await saveItem(listId, state.val, true);
                break;
            case 'moveToRecentContent':
                await moveToRecentContent(listId, state.val, false);
                break;
            case 'moveToRecentContentTranslated':
                await moveToRecentContent(listId, state.val, false);
                break;
            case 'saveItemSpecial':
            // Kompatibilitaet mit bereits vorhandenen alten Datenpunkten.
            case 'addItemSpecial':
            case 'addItemSpecialWithAttributes':
                if (!bringSpecial) {
                    bringSpecial = createBringSpecial(
                        adapter,
                        () => bring,
                        saveItemWithAttributes
                    );
                }
                bringSpecial.enqueue(
                    listId, state.val, method
                );
                break;
            case 'saveItemImage':
                if (!bringImageUpload) {
                    bringImageUpload = createBringImageUpload(
                        adapter,
                        () => bring,
                        bringAttributeListeLesen
                    );
                }
                await bringImageUpload(listId, state.val);
                break;
            case 'messageTrigger':
                await sendShoppingList(listId);
                break;
        }

        if (!polling[listId]) {
            polling[listId] = setTimeout(() => {
                pollList(listId);
                if (polling[listId]) {
                    clearTimeout(polling[listId]);
                }
                polling[listId] = null;
            }, 1000);
        }
    });

    return adapter;
}

async function main() {
    adapter.subscribeStates(`*`);

    bring = new Bring({
        mail: mail,
        password: password
    });

    await tryLogin();

    try {
        const res = await bring.getUserSettings();
        adapter.log.debug(`[DATA] User settings loaded: ${JSON.stringify(res)}`);
        for (const list of res.userlistsettings) {
            // save the translation
            if (list.usersettings[0].key === `listArticleLanguage`) {
                adapter.log.debug(`[DATA] List settings: ${JSON.stringify(list)}`);
                listLang[list.listUuid] = await bring.loadTranslations(list.usersettings[0].value);
                adapter.log.debug(
                    `[I18N] Saved ${list.usersettings[0].value} for ${list.listUuid} with: ${JSON.stringify(
                        listLang[list.listUuid]
                    )}`
                );
            }
        }
    } catch (e) {
        adapter.log.warn(`Error loading translations: ${e.message}`);
    }

    // Start polling, this goes endless
    pollAllLists();
}


// Native Bring!-Attribute auslesen.
// Die normalen content-Datenpunkte bleiben unveraendert.

let bringAttrHeaders = null;
let bringAttrAuthUntil = 0;
let bringAttrLoginPromise = null;
const bringAttrWarnings = new Map();

async function bringAttributeLogin(force = false) {
    if (
        !force &&
        bringAttrHeaders &&
        Date.now() < bringAttrAuthUntil
    ) {
        return bringAttrHeaders;
    }

    if (!force && bringAttrLoginPromise) {
        return bringAttrLoginPromise;
    }

    const promise = (async () => {
        const apiKey =
            bring?.headers?.['X-BRING-API-KEY'];

        if (!apiKey) {
            throw new Error('Bring API-Key fehlt');
        }

        const response = await fetch(
            'https://api.getbring.com/rest/v2/bringauth',
            {
                method: 'POST',
                body: new URLSearchParams({
                    email: mail,
                    password
                })
            }
        );

        if (!response.ok) {
            throw new Error(
                'Bring Login HTTP ' + response.status
            );
        }

        const login = await response.json();

        if (!login.uuid || !login.access_token) {
            throw new Error(
                'Bring Login unvollstaendig'
            );
        }

        const headers = {
            Authorization:
                (login.token_type || 'Bearer') +
                ' ' + login.access_token,
            'X-BRING-API-KEY': apiKey,
            'X-BRING-CLIENT': 'android',
            'X-BRING-APPLICATION': 'bring',
            'X-BRING-COUNTRY': 'DE',
            'X-BRING-USER-UUID': login.uuid
        };

        if (login.publicUuid) {
            headers['X-BRING-PUBLIC-USER-UUID'] =
                login.publicUuid;
        }

        bringAttrHeaders = headers;

        // Sitzung wiederverwenden statt
        // bei jedem Polling neu einzuloggen.
        bringAttrAuthUntil =
            Date.now() + 30 * 60 * 1000;

        return headers;
    })();

    bringAttrLoginPromise = promise;

    try {
        return await promise;
    } finally {
        if (bringAttrLoginPromise === promise) {
            bringAttrLoginPromise = null;
        }
    }
}

async function bringAttributeListeLesen(listId) {
    const url =
        'https://api.getbring.com/rest/v2/bringlists/' +
        encodeURIComponent(listId);

    for (let versuch = 0; versuch < 2; versuch++) {
        const headers = await bringAttributeLogin(
            versuch > 0
        );

        const response = await fetch(url, {
            method: 'GET',
            headers
        });

        if (
            response.status === 401 &&
            versuch === 0
        ) {
            bringAttrHeaders = null;
            continue;
        }

        if (!response.ok) {
            throw new Error(
                'Bring Artikel HTTP ' + response.status
            );
        }

        const data = await response.json();

        if (
            !Array.isArray(data?.items?.purchase) ||
            !Array.isArray(data?.items?.recently)
        ) {
            throw new Error(
                'Unerwartetes Bring Artikel-JSON'
            );
        }

        return data.items;
    }

    throw new Error(
        'Bring Sitzung nicht autorisiert'
    );
}

// API-Artikel in ein lesbares JSON umwandeln.
function bringAttributeArtikel(item) {
    const attrs = Array.isArray(item.attributes)
        ? item.attributes
        : [];

    const label = attrs.find(
        a => a.type === 'PURCHASE_CONDITIONS'
    )?.content || {};

    return {
        ...item,
        name: item.itemId,
        itemId: item.itemId,
        specification: item.specification || '',
        uuid: item.uuid || null,

        // Direkt auswertbare Labels
        discounted: label.discounted === true,
        urgent: label.urgent === true,
        convenient: label.convenient === true,

        // Alle Originalattribute behalten
        attributes: attrs
    };
}

// Neue Lese-Datenpunkte aktualisieren.
async function pollBringAttributes(listId) {
    try {
        const items =
            await bringAttributeListeLesen(listId);

        // Benutzerbilder und angepasste Icons
        // liegen im separaten Bring-Details-Endpunkt.
        let details = [];

        try {
            const response =
                await bring.getItemsDetails(listId);

            if (!Array.isArray(response)) {
                throw new Error(
                    'Details-Antwort ist kein Array'
                );
            }

            details = response;

        } catch (e) {
            // Bei einem Bildfehler bleiben die
            // normalen Artikelattribute nutzbar.
            adapter.log.debug(
                '[LABELS] Bilddetails nicht verfuegbar: ' +
                e.message
            );
        }

        const detailByUuid = new Map();
        for (const d of details) {
            if (d?.uuid) detailByUuid.set(d.uuid, d);
        }
        const detailMap = new Map();

        for (const d of details) {
            if (!d || !d.itemId) continue;

            const key = String(d.itemId)
                .trim()
                .toLocaleLowerCase('de-DE');

            // Bei mehrdeutigen Eintraegen kein
            // fremdes Bild zuweisen.
            if (detailMap.has(key)) {
                detailMap.set(key, null);
            } else {
                detailMap.set(key, d);
            }
        }

        const withDetails = item => {
            const base = bringAttributeArtikel(item);

            const key = String(item.itemId || '')
                .trim()
                .toLocaleLowerCase('de-DE');

            const detail =
                (item.uuid && detailByUuid.get(item.uuid)) ||
                detailMap.get(key);

            return {
                ...base,
                imageUrl: detail?.imageUrl || null,
                userIconItemId:
                    detail?.userIconItemId || null,
                userSectionId:
                    detail?.userSectionId || null,
                assignedTo:
                    detail?.assignedTo || null,
                // Raw detail JSON: do not discard new Bring fields.
                details: detail ? { ...detail } : null
            };
        };

        const aktiv = items.purchase.map(
            withDetails
        );

        const zuletzt = items.recently.map(
            withDetails
        );

        await adapter.setStateAsync(
            `${listId}.contentWithAttributes`,
            JSON.stringify(aktiv),
            true
        );

        await adapter.setStateAsync(
            `${listId}.recentContentWithAttributes`,
            JSON.stringify(zuletzt),
            true
        );

        bringAttrWarnings.delete(listId);

        adapter.log.debug(
            `[LABELS] ${listId}: ` +
            `${aktiv.length} Artikel mit Attributen geladen`
        );

    } catch (e) {
        // Fehler beim neuen Abruf duerfen das
        // bisherige content nicht beeintraechtigen.
        const message = e.message || String(e);
        const previous = bringAttrWarnings.get(listId);

        if (
            !previous ||
            previous.message !== message ||
            Date.now() - previous.at > 30 * 60 * 1000
        ) {
            adapter.log.warn(
                `[LABELS] Attribute fuer ${listId} ` +
                `nicht geladen: ${message}`
            );

            bringAttrWarnings.set(listId, {
                message,
                at: Date.now()
            });
        }
    }
}

/**
 * Polls specific list from API
 *
 * @param {string} listUuid
 * @return {Promise<void>}
 */
async function pollList(listUuid) {
    adapter.log.debug(`[POLL] Poll specific list: ${listUuid}`);
    try {
        const data = await bring.getItems(listUuid);
        adapter.log.debug(`[DATA] Items from ${listUuid} loaded: ${JSON.stringify(data)}`);
        await adapter.setState(`${listUuid}.content`, JSON.stringify(data.purchase), true);
        await adapter.setState(`${listUuid}.recentContent`, JSON.stringify(data.recently), true);

        const contentHtml = tableify(translateItemsArray(data.purchase));
        const recentContentHtml = tableify(translateItemsArray(data.recently));

        // create na enumeration sentence e. g. for smart assistants
        const enumSentence = createSentence(data.purchase);

        await adapter.setState(`${listUuid}.enumSentence`, enumSentence, true);
        await adapter.setState(`${listUuid}.contentHtml`, contentHtml, true);
        await adapter.setState(
            `${listUuid}.contentHtmlNoHead`,
            contentHtml.includes(`</thead>`) ? `<table>${contentHtml.split(`</thead>`)[1]}` : contentHtml,
            true
        );
        await adapter.setState(`${listUuid}.recentContentHtml`, recentContentHtml, true);
        await adapter.setState(
            `${listUuid}.recentContentHtmlNoHead`,
            recentContentHtml.includes(`</thead>`)
                ? `<table>${recentContentHtml.split(`</thead>`)[1]}`
                : recentContentHtml,
            true
        );
        await adapter.setState(`${listUuid}.count`, data.purchase.length, true);
        await pollBringAttributes(listUuid);
    } catch (e) {
        adapter.log.warn(`Error polling items for list "${listUuid}": ${e.message}`);
        adapter.setStateChanged(`info.connection`, false, true);
    }

    const data = await bring.getAllUsersFromList(listUuid);
    try {
        adapter.setStateChanged(`info.connection`, true, true);
        adapter.log.debug(`[DATA] Users from ${listUuid} loaded: ${JSON.stringify(data)}`);
        await adapter.setState(`${listUuid}.users`, JSON.stringify(data.users), true);

        const usersHtml = tableify(data.users);

        await adapter.setState(`${listUuid}.usersHtml`, usersHtml, true);
        await adapter.setState(`${listUuid}.usersHtmlNoHead`, `<table>${usersHtml.split(`</thead>`)[1]}`, true);
    } catch (e) {
        adapter.log.warn(`Error getting users from list "${listUuid}": ${e.message}`);
        adapter.setStateChanged(`info.connection`, false, true);
    }
}

/**
 * Polls all lists from API
 *
 * @return {Promise<void>}
 */
async function pollAllLists() {
    adapter.log.debug(`[POLL] Poll all lists`);

    try {
        const bringLists = await bring.loadLists();

        adapter.log.debug(`[DATA] Lists loaded: ${JSON.stringify(bringLists)}`);

        adapter.setStateChanged(`info.connection`, true, true);

        for (const entry of bringLists.lists) {
            const promises = [];

            try {
                const existingList = await adapter.getObjectAsync(entry.listUuid);

                // Lists can change name in the App
                if (existingList.common.name !== entry.name) {
                    promises.push(
                        adapter.setObjectAsync(entry.listUuid, {
                            type: `channel`,
                            common: {
                                name: entry.name
                            },
                            native: {}
                        })
                    );
                }
            } catch {
                promises.push(
                    adapter.setObjectNotExistsAsync(entry.listUuid, {
                        type: `channel`,
                        common: {
                            name: entry.name
                        },
                        native: {}
                    })
                );
            }

            const objects = getStaticObjects(entry);

            for (const [id, obj] of Object.entries(objects)) {
                promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.${id}`, obj));
            }

            await Promise.all(promises);

            dict = listLang[entry.listUuid] ? listLang[entry.listUuid] : await bring.loadTranslations(`de-DE`);
            invertedDict = invertObject(dict);
            await adapter.setStateAsync(`${entry.listUuid}.translation`, JSON.stringify(dict), true);

            const data = await bring.getItems(entry.listUuid);
            adapter.log.debug(`[DATA] Items from ${entry.listUuid} loaded: ${JSON.stringify(data)}`);
            await adapter.setState(`${entry.listUuid}.content`, JSON.stringify(data.purchase), true);
            await adapter.setState(`${entry.listUuid}.recentContent`, JSON.stringify(data.recently), true);

            const contentHtml = tableify(translateItemsArray(data.purchase));
            const recentContentHtml = tableify(translateItemsArray(data.recently));

            // create na enumeration sentence e. g. for smart assistants
            const enumSentence = createSentence(data.purchase);

            await adapter.setState(`${entry.listUuid}.enumSentence`, enumSentence, true);
            await adapter.setState(`${entry.listUuid}.contentHtml`, contentHtml, true);
            await adapter.setState(
                `${entry.listUuid}.contentHtmlNoHead`,
                contentHtml.includes(`</thead>`) ? `<table>${contentHtml.split(`</thead>`)[1]}` : contentHtml,
                true
            );
            await adapter.setState(`${entry.listUuid}.recentContentHtml`, recentContentHtml, true);
            await adapter.setState(
                `${entry.listUuid}.recentContentHtmlNoHead`,
                recentContentHtml.includes(`</thead>`)
                    ? `<table>${recentContentHtml.split(`</thead>`)[1]}`
                    : recentContentHtml,
                true
            );
            await adapter.setState(`${entry.listUuid}.count`, data.purchase.length, true);
            await pollBringAttributes(entry.listUuid);

            const usersData = await bring.getAllUsersFromList(entry.listUuid);
            adapter.log.debug(`[DATA] Users from ${entry.listUuid} loaded: ${JSON.stringify(usersData)}`);
            await adapter.setState(`${entry.listUuid}.users`, JSON.stringify(usersData.users), true);

            const usersHtml = tableify(usersData.users);

            await adapter.setState(`${entry.listUuid}.usersHtml`, usersHtml, true);
            await adapter.setState(
                `${entry.listUuid}.usersHtmlNoHead`,
                `<table>${usersHtml.split(`</thead>`)[1]}`,
                true
            );
        }
    } catch (e) {
        adapter.setStateChanged(`info.connection`, false, true);
        adapter.log.warn(`Error polling all lists: ${e.message}`);
        // Check if Access token no longer valid
        if (e.message.includes(`JWT access token is not valid`)) {
            tryLogin();
        }
    }

    if (polling.all) {
        clearTimeout(polling.all);
    }
    polling.all = setTimeout(pollAllLists, 90_000);
}

async function tryLogin() {
    try {
        await bring.login();
        await adapter.setState(`info.connection`, true, true);
        await adapter.setState(`info.user`, bring.name ?? '', true);
        adapter.log.info(`[LOGIN] Successfully logged in as ${bring.name ? bring.name : 'unknown'}`);
        if (loginTimeout) {
            clearTimeout(loginTimeout);
        }
        return Promise.resolve();
    } catch (e) {
        adapter.log.warn(`Error on login: ${e.message}`);
        adapter.log.info(`[LOGIN] Reconnection in 30 seconds`);
        if (loginTimeout) {
            clearTimeout(loginTimeout);
        }
        loginTimeout = setTimeout(tryLogin, 30_000);
    }
}

/**
 *  Translates array of items via global dict
 *
 * @param {import('bring-shopping').GetItemsResponseEntry[]} purchaseData
 * @return {import('bring-shopping').GetItemsResponseEntry[]}
 */
function translateItemsArray(purchaseData) {
    purchaseData.map(entry => {
        entry.name = dict[entry.name] ? dict[entry.name] : entry.name;
        return entry;
    });

    return purchaseData;
}

/**
 * Builds up translated enumSentence for smart speakers etc
 *
 * @param {import('bring-shopping').GetItemsResponseEntry[]} purchaseData
 * @return {string}
 */
function createSentence(purchaseData) {
    let enumSentence = '';
    purchaseData.forEach((value, index) => {
        if (index === purchaseData.length - 1 && purchaseData.length > 1) {
            enumSentence += ` ${i18nHelper.conjunction[lang]} ${dict[value.name] ? dict[value.name] : value.name}`;
        } else if (index !== purchaseData.length - 2 && purchaseData.length > 1) {
            enumSentence += `${dict[value.name] ? dict[value.name] : value.name}, `;
        } else {
            enumSentence += dict[value.name] ? dict[value.name] : value.name;
        }
    });

    return enumSentence;
}

/**
 * Swap key and value
 * @param {Record<string, string>} obj
 * @return {Record<string, string>}
 */
function invertObject(obj) {
    const ret = {};
    for (const key in obj) {
        ret[obj[key]] = key;
    }
    return ret;
}

/**
 * Removes item from list
 *
 * @param {string} listId
 * @param {string} article
 * @param {boolean} translate
 * @return {Promise<void>}
 */
async function removeItem(listId, article, translate) {
    try {
        if (translate) {
            await bring.removeItem(listId, typeof invertedDict[article] === 'string' ? invertedDict[article] : article);
        } else {
            await bring.removeItem(listId, article);
        }
        adapter.setStateChanged(`info.connection`, true, true);
        adapter.log.info(`[REMOVE] Removed ${article} from ${listId}`);
        await adapter.setState(`${listId}.${translate ? 'removeItemTranslated' : 'removeItem'}`, '', true);
    } catch (e) {
        adapter.setStateChanged(`info.connection`, false, true);
        adapter.log.warn(`Error removing item "${article}" from list "${listId}": ${e.message}`);
    }
}


/**
 * Local test: native Bring! purchase labels.
 *
 * JSON in saveItem or saveItemWithAttributes:
 * {
 *   "name": "Bacon",
 *   "specification": "",
 *   "discounted": true
 * }
 *
 * setItemAttributes changes only existing articles.
 */

async function saveItemWithAttributes(listId, raw, stateName, options = {}) {
    try {
        if (typeof raw !== 'string') {
            throw new Error('JSON string expected');
        }

        const data = JSON.parse(raw);

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error('JSON object expected');
        }

        const name = String(data.name || '').trim();

        if (!name || name.length > 200) {
            throw new Error('Missing or invalid name');
        }

        const hasSpecification =
            Object.prototype.hasOwnProperty.call(
                data, 'specification'
            );

        const specification = hasSpecification
            ? data.specification
            : '';

        if (
            typeof specification !== 'string' ||
            specification.length > 500
        ) {
            throw new Error(
                'specification must be a string (max 500 chars)'
            );
        }

        const keys = [
            'discounted',
            'urgent',
            'convenient'
        ];

        const givenFlags = keys.filter(k =>
            Object.prototype.hasOwnProperty.call(data, k)
        );

        for (const k of givenFlags) {
            if (typeof data[k] !== 'boolean') {
                throw new Error(k + ' must be true or false');
            }
        }

        if (stateName === 'setItemAttributes') {
            if (hasSpecification) {
                throw new Error(
                    'Use saveItemWithAttributes to update specification'
                );
            }

            if (!givenFlags.length) {
                throw new Error('At least one label required');
            }
        }

        const apiKey = bring?.headers?.['X-BRING-API-KEY'];

        if (!apiKey) {
            throw new Error('Bring API key unavailable');
        }

        const loginRes = await fetch(
            'https://api.getbring.com/rest/v2/bringauth',
            {
                method: 'POST',
                body: new URLSearchParams({
                    email: mail,
                    password
                })
            }
        );

        if (!loginRes.ok) {
            throw new Error(
                'Bring login HTTP ' + loginRes.status
            );
        }

        const login = await loginRes.json();

        if (!login.uuid || !login.access_token) {
            throw new Error('Incomplete Bring login');
        }

        const headers = {
            Authorization:
                (login.token_type || 'Bearer') +
                ' ' + login.access_token,
            'X-BRING-API-KEY': apiKey,
            'X-BRING-CLIENT': 'android',
            'X-BRING-APPLICATION': 'bring',
            'X-BRING-COUNTRY': 'DE',
            'X-BRING-USER-UUID': login.uuid
        };

        if (login.publicUuid) {
            headers['X-BRING-PUBLIC-USER-UUID'] =
                login.publicUuid;
        }

        const listUrl =
            'https://api.getbring.com/rest/v2/bringlists/' +
            encodeURIComponent(listId);

        const itemUrl = listUrl + '/items';

        const position = {
            accuracy: '0.0',
            altitude: '0.0',
            latitude: '0.0',
            longitude: '0.0'
        };

        async function readItems() {
            const response = await fetch(
                listUrl,
                { headers }
            );

            if (!response.ok) {
                throw new Error(
                    'Bring read HTTP ' + response.status
                );
            }

            const result = await response.json();

            if (!Array.isArray(result?.items?.purchase)) {
                throw new Error(
                    'Unexpected Bring list response'
                );
            }

            return result.items.purchase;
        }

        async function writeChanges(changes) {
            const response = await fetch(
                itemUrl,
                {
                    method: 'PUT',
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        changes,
                        sender: ''
                    })
                }
            );

            if (!response.ok) {
                throw new Error(
                    'Bring update HTTP ' + response.status
                );
            }
        }

        const find = items =>
            items.filter(p => p.itemId === name);

        let matches = find(await readItems());

        if (matches.length > 1) {
            throw new Error(
                'Multiple articles with identical name'
            );
        }

        if (
            matches.length === 0 &&
            stateName === 'setItemAttributes'
        ) {
            throw new Error(
                'Article does not exist on the list'
            );
        }

        // Alte Labels sichern, bevor eine Beschreibung
        // geaendert wird.
        const previousLabels = matches.length === 1
            ? (matches[0].attributes || []).find(
                a => a.type === 'PURCHASE_CONDITIONS'
              )?.content
            : null;

        const desiredLabels = {};

        for (const k of keys) {
            desiredLabels[k] =
                Object.prototype.hasOwnProperty.call(
                    data, k
                )
                    ? data[k]
                    : previousLabels?.[k] === true;
        }

        const newArticle = matches.length === 0;

        if (newArticle) {
            // Neuen Artikel anlegen.
            await writeChanges([{
                ...position,
                itemId: name,
                spec: specification,
                uuid: null,
                operation: 'TO_PURCHASE'
            }]);

        } else if (
            hasSpecification &&
            matches[0].specification !== specification
        ) {
            // Beschreibung eines vorhandenen Artikels
            // aktualisieren, UUID beibehalten.
            await writeChanges([{
                ...position,
                itemId: matches[0].itemId,
                uuid: matches[0].uuid,
                spec: specification,
                operation: 'TO_PURCHASE'
            }]);
        }

        // Sicherstellen, dass Artikel und Beschreibung
        // wirklich in Bring! gespeichert sind.
        let item = null;

        for (let i = 0; i < 6; i++) {
            const current = find(await readItems());

            if (current.length > 1) {
                throw new Error('Article now ambiguous');
            }

            if (
                current.length === 1 &&
                current[0].uuid &&
                (
                    !hasSpecification ||
                    current[0].specification === specification
                )
            ) {
                item = current[0];
                break;
            }

            await new Promise(
                resolve => setTimeout(resolve, 450)
            );
        }

        if (!item) {
            throw new Error(
                'Article or specification could not be verified'
            );
        }

        // Labels schreiben und dabei vorherige Flags
        // erhalten, falls diese nicht angegeben wurden.
        const needsLabelWrite =
            givenFlags.length > 0 ||
            (hasSpecification && previousLabels != null);

        if (needsLabelWrite) {
            await writeChanges([{
                ...position,
                uuid: item.uuid,
                itemId: item.itemId,
                spec: item.specification || '',
                operation: 'ATTRIBUTE_UPDATE',
                attribute: {
                    type: 'PURCHASE_CONDITIONS',
                    content: desiredLabels
                }
            }]);

            let confirmed = false;

            for (let i = 0; i < 6; i++) {
                const current = find(await readItems());

                const labels =
                    (current[0]?.attributes || []).find(
                        a => a.type === 'PURCHASE_CONDITIONS'
                    )?.content || {};

                if (
                    current.length === 1 &&
                    keys.every(
                        k => labels[k] === desiredLabels[k]
                    ) &&
                    (
                        !hasSpecification ||
                        current[0].specification === specification
                    )
                ) {
                    confirmed = true;
                    break;
                }

                await new Promise(
                    resolve => setTimeout(resolve, 450)
                );
            }

            if (!confirmed) {
                throw new Error(
                    'Bring labels could not be verified'
                );
            }
        }

        // Erst nach erfolgreicher Verifizierung quittieren.
        if (options.acknowledge !== false) {
            await adapter.setStateAsync(`${listId}.${stateName}`, raw, true);
        }

        adapter.log.info(
            `[LABELS] Saved "${name}" in ${listId}: ` +
            JSON.stringify({
                specification: hasSpecification
                    ? specification
                    : '(unchanged)',
                ...Object.fromEntries(
                    givenFlags.map(k => [k, data[k]])
                )
            })
        );

        adapter.setStateChanged(
            'info.connection',
            true,
            true
        );
        return true;

    } catch (e) {
        adapter.log.warn(
            `[LABELS] ${stateName} failed: ${e.message}`
        );
        if (options.throwOnError) throw e;
        return false;
    }
}

/**
 * Vereinheitlichter normaler Bring!-Eingang.
 * saveItem: Text ("Milch, 2 Liter") ODER JSON mit name/specification/Labels.
 * Leeren und Ergebnis nach jedem verarbeiteten Befehl; bei Fehler Ergebnis behalten.
 * requestId dient dem gemeinsamen BringManager als eindeutige Bestaetigung.
 */
async function handleUnifiedSaveItem(listId, raw) {
    const stateId = `${listId}.saveItem`;
    const resultId = `${listId}.saveItemLastResult`;
    if (typeof raw !== 'string' || !raw.trim()) {
        await adapter.setStateAsync(stateId, '', true);
        return;
    }

    let ok = false;
    let name = '';
    let requestId = null;
    let error = null;
    try {
        const input = raw.trim();
        if (input.startsWith('{') || input.startsWith('[')) {
            const data = JSON.parse(input);
            if (!data || typeof data !== 'object' || Array.isArray(data)) {
                throw new Error('JSON-Objekt erwartet');
            }
            name = String(data.name || '').trim();
            requestId = typeof data.requestId === 'string' ? data.requestId : null;
            await saveItemWithAttributes(listId, raw, 'saveItem', {
                acknowledge: false,
                throwOnError: true
            });
        } else {
            name = input.split(',')[0].trim();
            if (!name || name.length > 200) {
                throw new Error('Ungueltiger Artikelname');
            }
            await saveItem(listId, raw, false, {
                acknowledge: false,
                throwOnError: true
            });
        }
        ok = true;
    } catch (e) {
        error = e.message || String(e);
        adapter.log.warn('[SAVE] ' + name + ': ' + error);
    }
    // Keine neuen, zwischenzeitlich geschriebenen Befehle loeschen.
    try {
        const current = await adapter.getStateAsync(stateId);
        if (current?.val === raw) {
            await adapter.setStateAsync(stateId, '', true);
        }
    } catch (e) {
        adapter.log.warn('[SAVE] Eingabe konnte nicht geleert werden: ' + e.message);
    }
    await adapter.setStateAsync(resultId, JSON.stringify({
        ok, name, requestId, error, timestamp: new Date().toISOString()
    }), true);
}

/**
 * Saves item to list
 *
 * @param {string} listId
 * @param {string} articleWithDescription
 * @param {boolean} translate
 * @return {Promise<void>}
 */
async function saveItem(listId, articleWithDescription, translate, options = {}) {
    try {
        const item = articleWithDescription.split(`,`)[0].trim() || articleWithDescription;
        const specification = articleWithDescription.includes(`,`)
            ? articleWithDescription.substring(articleWithDescription.indexOf(`,`) + 1).trim()
            : ``;
        if (translate) {
            await bring.saveItem(
                listId,
                typeof invertedDict[item] === 'string' ? invertedDict[item] : item,
                specification
            );
        } else {
            await bring.saveItem(listId, item, specification);
        }
        adapter.setStateChanged(`info.connection`, true, true);
        adapter.log.info(`[SAVE] Saved ${item} (${specification}) to ${listId}`);
        if (options.acknowledge !== false) {
            await adapter.setState(
                `${listId}.${translate ? 'saveItemTranslated' : 'saveItem'}`,
                '', true
            );
        }
        return true;
    } catch (e) {
        adapter.setStateChanged(`info.connection`, false, true);
        adapter.log.warn(`Error saving item "${articleWithDescription}" to list "${listId}": ${e.message}`);
        if (options.throwOnError) throw e;
        return false;
    }
}

/**
 * Move item from list to recent list
 *
 * @param {string} listId
 * @param {string} article
 * @param {boolean} translate
 * @return {Promise<void>}
 */
async function moveToRecentContent(listId, article, translate) {
    try {
        if (translate) {
            await bring.moveToRecentList(
                listId,
                typeof invertedDict[article] === 'string' ? invertedDict[article] : article
            );
        } else {
            await bring.moveToRecentList(listId, article);
        }

        adapter.setStateChanged(`info.connection`, true, true);
        adapter.log.info(`[MOVE] Moved ${article} to recent content of ${listId}`);
        await adapter.setState(
            `${listId}.${translate ? 'moveToRecentContentTranslated' : 'moveToRecentContent'}`,
            '',
            true
        );
    } catch (e) {
        adapter.setStateChanged(`info.connection`, false, true);
        adapter.log.warn(`Error moving article "${article}" on list "${listId}" to recent content ${e.message}`);
    }
}

/**
 * Send shopping list to configured receivers
 *
 * @param {string} listId
 * @return {Promise<void>}
 */
async function sendShoppingList(listId) {
    let shoppingList = ``;
    try {
        let jsonShoppingList = await adapter.getStateAsync(`${adapter.namespace}.${listId}.content`);
        jsonShoppingList = JSON.parse(jsonShoppingList.val);
        for (const entry of jsonShoppingList) {
            shoppingList = `${shoppingList}${
                entry.specification ? entry.specification : i18nHelper.noDescription[lang]
            } - ${dict[entry.name] ? dict[entry.name] : entry.name}\n`;
        }
    } catch (e) {
        adapter.log.error(`Error sending shopping list: ${e.message}`);
        return;
    }

    if (adapter.config.telegramInstance) {
        try {
            if (adapter.config.telegramReceiver === `allTelegramUsers`) {
                await adapter.sendToAsync(adapter.config.telegramInstance, `send`, {
                    text: `*${i18nHelper.shoppingList[lang]}*\n${shoppingList}`,
                    parse_mode: `Markdown`
                });
            } else {
                await adapter.sendToAsync(adapter.config.telegramInstance, `send`, {
                    user: adapter.config.telegramReceiver,
                    text: `*${i18nHelper.shoppingList[lang]}*\n${shoppingList}`,
                    parse_mode: `Markdown`
                });
            }
            adapter.log.info(`Sent shopping list to ${adapter.config.telegramInstance}`);
        } catch (e) {
            adapter.log.error(`Error sending shopping list to ${adapter.config.telegramInstance}: ${e}`);
        }
    }

    if (adapter.config.pushoverInstance) {
        try {
            await adapter.sendToAsync(adapter.config.pushoverInstance, `send`, {
                message: shoppingList,
                title: i18nHelper.shoppingList[lang],
                device: adapter.config.pushoverDeviceID
            });
            adapter.log.info(`Sent shopping list to ${adapter.config.pushoverInstance}`);
        } catch (e) {
            adapter.log.error(`Error sending shopping list to ${adapter.config.pushoverInstance}: ${e}`);
        }
    }

    if (adapter.config.emailInstance) {
        try {
            await adapter.sendToAsync(adapter.config.emailInstance, `send`, {
                text: shoppingList,
                subject: i18nHelper.shoppingList[lang],
                to: adapter.config.emailReceiver,
                from: adapter.config.emailSender
            });
            adapter.log.info(`Sent shopping list to ${adapter.config.emailInstance}`);
        } catch (e) {
            adapter.log.error(`Error sending shopping list to ${adapter.config.emailInstance}: ${e}`);
        }
    }
}

if (require.main === module) {
    startAdapter();
} else {
    // compact mode
    module.exports = startAdapter;
}
