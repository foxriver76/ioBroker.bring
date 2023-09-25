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
let adapter;

let mail;
let password;
/** @type {Bring} */
let bring;
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
                await saveItem(listId, state.val, false);
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
        await adapter.setState(`${listId}.${translate ? 'removeItemTranslated' : 'removeItem'}`, article, true);
    } catch (e) {
        adapter.setStateChanged(`info.connection`, false, true);
        adapter.log.warn(`Error removing item "${article}" from list "${listId}": ${e.message}`);
    }
}

/**
 * Saves item to list
 *
 * @param {string} listId
 * @param {string} articleWithDescription
 * @param {boolean} translate
 * @return {Promise<void>}
 */
async function saveItem(listId, articleWithDescription, translate) {
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
        await adapter.setState(
            `${listId}.${translate ? 'saveItemTranslated' : 'saveItem'}`,
            articleWithDescription,
            true
        );
    } catch (e) {
        adapter.setStateChanged(`info.connection`, false, true);
        adapter.log.warn(`Error saving item "${articleWithDescription}" to list "${listId}": ${e.message}`);
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
            article,
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
