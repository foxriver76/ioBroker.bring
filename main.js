/**
 * Bring! adapter
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

const utils = require(`@iobroker/adapter-core`);
const crypto = require(`${__dirname}/lib/crypto`);
const Bring = require(`bring-shopping`);
const tableify = require(`tableify`);
const i18nHelper = require(`${__dirname}/lib/i18nHelper`);
let adapter;

let mail;
let password;
let bring;
const polling = {};
const listLang = {};
let loginTimeout;
let lang;
let dict = {};

function startAdapter(options) {
    options = options || {};
    options = {...options, ...{name: `bring`}};

    adapter = new utils.Adapter(options);

    adapter.on(`message`, obj => {
        if (obj && obj.command === `getTelegramUsers`) {
            adapter.getForeignState(`${obj.message}.communicate.users`, (err, state) => {
                if (err) adapter.log.error(err);
                if (state && state.val) {
                    try {
                        adapter.sendTo(obj.from, obj.command, state.val, obj.callback);
                    } catch (err) {
                        adapter.log.error(err);
                        adapter.log.error(`Cannot parse stored user ID's from Telegram!`);
                    }
                }
            });
        }
    });

    adapter.on(`unload`, callback => {
        try {
            adapter.log.info(`[END] Stopping Bring! adapter...`);
            adapter.setState(`info.connection`, false, true);
            callback();
        } catch (e) {
            callback();
        } // endTryCatch
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
            } // endElse

            lang = (obj && obj.common && obj.common.language) ? obj.common.language : `en`;
        } catch (e) {
            lang = `en`;
            password = crypto.decrypt(`Zgfr56gFe87jJOM`, adapter.config.password);
            mail = crypto.decrypt(`Zgfr56gFe87jJOM`, adapter.config.mail);
        } // endTryCatch

        main();
    });

    adapter.on(`stateChange`, async (id, state) => {
        if (!id || !state || state.ack) return;
        adapter.log.debug(`[STATE] Changed ${id} to ${state.val}`);
        const listId = id.split(`.`)[2];
        const method = id.split(`.`).pop();

        if (method === `removeItem`) {
            try {
                await bring.removeItem(listId, state.val);
                adapter.setStateChanged(`info.connection`, true, true);
                adapter.log.info(`[REMOVE] Removed ${state.val} from ${listId}`);
                adapter.setState(id, state.val, true);
            } catch (e) {
                adapter.setStateChanged(`info.connection`, false, true);
                adapter.log.warn(e);
            }
        } else if (method === `saveItem`) {
            try {
                const item = state.val.split(`,`)[0].trim() || state.val;
                const specification = state.val.includes(`,`) ? state.val.substring(state.val.indexOf(`,`) + 1).trim() : ``;
                await bring.saveItem(listId, item, specification);
                adapter.setStateChanged(`info.connection`, true, true);
                adapter.log.info(`[SAVE] Saved ${item} (${specification}) to ${listId}`);
                adapter.setState(id, state.val, true);
            } catch (e) {
                adapter.setStateChanged(`info.connection`, false, true);
                adapter.log.warn(e);
            }
        } else if (method === `messageTrigger`) {
            let shoppingList = ``;
            try {
                let jsonShoppingList = await adapter.getStateAsync(`${adapter.namespace}.${listId}.content`);
                jsonShoppingList = JSON.parse(jsonShoppingList.val);
                for (const entry of jsonShoppingList) {
                    shoppingList = `${shoppingList}${entry.specification ? entry.specification : i18nHelper.noDescription[lang]} - ${dict[entry.name] ? dict[entry.name] : entry.name}\n`;
                } // endFor
            } catch (e) {
                adapter.log.error(`Error sending shopping list: ${e}`);
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
            } // endIf

            if (adapter.config.pushoverInstance) {
                try {
                    await adapter.sendToAsync(adapter.config.pushoverInstance, `send`,
                        {
                            message: shoppingList,
                            title: i18nHelper.shoppingList[lang],
                            device: adapter.config.pushoverDeviceID
                        });
                    adapter.log.info(`Sent shopping list to ${adapter.config.pushoverInstance}`);
                } catch (e) {
                    adapter.log.error(`Error sending shopping list to ${adapter.config.pushoverInstance}: ${e}`);
                }
            } // endIf

            if (adapter.config.emailInstance) {
                try {
                    await adapter.sendToAsync(adapter.config.emailInstance, `send`,
                        {
                            text: shoppingList,
                            subject: i18nHelper.shoppingList[lang],
                            to: adapter.config.emailReceiver,
                            from: adapter.config.emailSender
                        });
                    adapter.log.info(`Sent shopping list to ${adapter.config.emailInstance}`);
                } catch (e) {
                    adapter.log.error(`Error sending shopping list to ${adapter.config.emailInstance}: ${e}`);
                }
            } // endIf
        } else if (method === `moveToRecentContent`) {
            try {
                await bring.moveToRecentList(listId, state.val);
                adapter.setStateChanged(`info.connection`, true, true);
                adapter.log.info(`[MOVE] Moved ${state.val} to recent content of ${listId}`);
                adapter.setState(id, state.val, true);
            } catch (e) {
                adapter.setStateChanged(`info.connection`, false, true);
                adapter.log.warn(e);
            }
        } // endElseIf

        if (!polling[listId]) polling[listId] = setTimeout(() => {
            pollList(listId);
            if (polling[listId]) clearTimeout(polling[listId]);
            polling[listId] = null;
        }, 1000);
    });

    return adapter;
} // endStartAdapter


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
                adapter.log.debug(`[I18N] Saved ${list.usersettings[0].value} for ${list.listUuid} with: ${JSON.stringify(listLang[list.listUuid])}`);
            } // endIf
        } // endFor
    } catch (e) {
        adapter.log.warn(e);
    } // endTryCatch


    // Start polling, this goes endless
    pollAllLists();

} // endMain

function pollList(listUuid) {
    adapter.log.debug(`[POLL] Poll specific list: ${listUuid}`);

    bring.getItems(listUuid).then(data => {
        adapter.log.debug(`[DATA] Items from ${listUuid} loaded: ${JSON.stringify(data)}`);
        adapter.setState(`${listUuid}.content`, JSON.stringify(data.purchase), true);
        adapter.setState(`${listUuid}.recentContent`, JSON.stringify(data.recently), true);

        const contentHtml = tableify(data.purchase);
        const recentContentHtml = tableify(data.recently);

        // create na enumeration sentence e. g. for smart assistants
        let enumSentence = ``;

        data.purchase.forEach((value, index) => {
            if (index === data.purchase.length - 1 && data.purchase.length > 1) {
                enumSentence += ` ${i18nHelper.conjunction[lang]} ${value.name}`;
            } else if (index !== data.purchase.length - 2 && data.purchase.length > 1) {
                enumSentence += `${value.name}, `;
            } else {
                enumSentence += value.name;
            } // endElse
        });

        adapter.setState(`${listUuid}.enumSentence`, enumSentence, true);
        adapter.setState(`${listUuid}.contentHtml`, contentHtml, true);
        adapter.setState(`${listUuid}.contentHtmlNoHead`, contentHtml.includes(`</thead>`) ? `<table>${contentHtml.split(`</thead>`)[1]}` : contentHtml, true);
        adapter.setState(`${listUuid}.recentContentHtml`, recentContentHtml, true);
        adapter.setState(`${listUuid}.recentContentHtmlNoHead`, recentContentHtml.includes(`</thead>`) ? `<table>${recentContentHtml.split(`</thead>`)[1]}` : recentContentHtml, true);
        adapter.setState(`${listUuid}.count`, data.purchase.length, true);
    }).catch(e => {
        adapter.log.warn(e);
        adapter.setStateChanged(`info.connection`, false, true);
    });

    bring.getAllUsersFromList(listUuid).then(data => {
        adapter.setStateChanged(`info.connection`, true, true);
        adapter.log.debug(`[DATA] Users from ${listUuid} loaded: ${JSON.stringify(data)}`);
        adapter.setState(`${listUuid}.users`, JSON.stringify(data.users), true);

        const usersHtml = tableify(data.users);

        adapter.setState(`${listUuid}.usersHtml`, usersHtml, true);
        adapter.setState(`${listUuid}.usersHtmlNoHead`, `<table>${usersHtml.split(`</thead>`)[1]}`, true);
    }).catch(e => {
        adapter.log.warn(e);
        adapter.setStateChanged(`info.connection`, false, true);
    });

} // endPollList

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
                    promises.push(adapter.setObjectAsync(entry.listUuid, {
                        type: `channel`,
                        common: {
                            name: entry.name
                        },
                        native: {}
                    }));
                } // endIf
            } catch (e) {
                promises.push(adapter.setObjectNotExistsAsync(entry.listUuid, {
                    type: `channel`,
                    common: {
                        name: entry.name
                    },
                    native: {}
                }));
            } // endTryCatch

            promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.content`, {
                type: `state`,
                common: {
                    role: `list.json`,
                    name: `Content`,
                    desc: `Content of ${entry.name}`,
                    read: true,
                    write: false,
                    type: `string`,
                    def: `[]`
                },
                native: {}
            }));

            promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.recentContent`, {
                type: `state`,
                common: {
                    role: `list.json`,
                    name: `Recent Content`,
                    desc: `Recent Content of ${entry.name}`,
                    read: true,
                    write: false,
                    type: `string`,
                    def: `[]`
                },
                native: {}
            }));

            promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.users`, {
                type: `state`,
                common: {
                    role: `list.json`,
                    name: `Users`,
                    desc: `Users of ${entry.name}`,
                    read: true,
                    write: false,
                    type: `string`,
                    def: `[]`
                },
                native: {}
            }));

            promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.contentHtml`, {
                type: `state`,
                common: {
                    role: `list.html`,
                    name: `Content`,
                    desc: `Content of ${entry.name}`,
                    read: true,
                    write: false,
                    type: `string`,
                    def: `[]`
                },
                native: {}
            }));

            promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.recentContentHtml`, {
                type: `state`,
                common: {
                    role: `list.html`,
                    name: `Recent Content`,
                    desc: `Recent Content of ${entry.name}`,
                    read: true,
                    write: false,
                    type: `string`,
                    def: `[]`
                },
                native: {}
            }));

            promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.usersHtml`, {
                type: `state`,
                common: {
                    role: `list.html`,
                    name: `Users`,
                    desc: `Users of ${entry.name}`,
                    read: true,
                    write: false,
                    type: `string`,
                    def: `[]`
                },
                native: {}
            }));

            promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.contentHtmlNoHead`, {
                type: `state`,
                common: {
                    role: `list.html`,
                    name: `Content`,
                    desc: `Content of ${entry.name} w/o header`,
                    read: true,
                    write: false,
                    type: `string`,
                    def: `[]`
                },
                native: {}
            }));

            promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.recentContentHtmlNoHead`, {
                type: `state`,
                common: {
                    role: `list.html`,
                    name: `Recent Content`,
                    desc: `Recent Content of ${entry.name} w/o header`,
                    read: true,
                    write: false,
                    type: `string`,
                    def: `[]`
                },
                native: {}
            }));

            promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.usersHtmlNoHead`, {
                type: `state`,
                common: {
                    role: `list.html`,
                    name: `Users`,
                    desc: `Users of ${entry.name} w/o header`,
                    read: true,
                    write: false,
                    type: `string`,
                    def: `[]`
                },
                native: {}
            }));

            promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.removeItem`, {
                type: `state`,
                common: {
                    role: `text`,
                    name: `Remove Item`,
                    desc: `Remove item from List`,
                    read: true,
                    write: true,
                    type: `string`,
                    def: ``
                },
                native: {}
            }));

            promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.moveToRecentContent`, {
                type: `state`,
                common: {
                    role: `text`,
                    name: `Move to Recent List`,
                    desc: `Move or add item to Recent Content List`,
                    read: true,
                    write: true,
                    type: `string`,
                    def: ``
                },
                native: {}
            }));

            promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.saveItem`, {
                type: `state`,
                common: {
                    role: `text`,
                    name: `Save Item`,
                    desc: `Save item to List`,
                    read: true,
                    write: true,
                    type: `string`,
                    def: ``
                },
                native: {}
            }));

            promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.count`, {
                type: `state`,
                common: {
                    role: `indicator.count`,
                    name: `Count`,
                    desc: `Number of entrys in ${entry.name}`,
                    read: true,
                    write: false,
                    type: `number`,
                    def: ``
                },
                native: {}
            }));

            promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.messageTrigger`, {
                type: `state`,
                common: {
                    role: `button`,
                    name: `Message Trigger`,
                    desc: `Send Message to configured Instance`,
                    read: true,
                    write: true,
                    type: `boolean`
                },
                native: {}
            }));

            promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.enumSentence`, {
                type: `state`,
                common: {
                    role: `text`,
                    name: `Enum Sentence`,
                    desc: `A enum-like sentence containing the shopping list items`,
                    read: true,
                    write: false,
                    type: `string`
                },
                native: {}
            }));

            promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.translation`, {
                type: `state`,
                common: {
                    role: `json`,
                    name: `JSON dictionary`,
                    desc: `A dictionary to translate the swiss item names`,
                    read: true,
                    write: false,
                    type: `string`
                },
                native: {}
            }));

            await Promise.all(promises);

            dict = listLang[entry.listUuid] ? listLang[entry.listUuid] : await bring.loadTranslations(`de-DE`);
            await adapter.setStateAsync(`${entry.listUuid}.translation`, JSON.stringify(dict), true);

            bring.getItems(entry.listUuid).then(data => {
                adapter.log.debug(`[DATA] Items from ${entry.listUuid} loaded: ${JSON.stringify(data)}`);
                adapter.setState(`${entry.listUuid}.content`, JSON.stringify(data.purchase), true);
                adapter.setState(`${entry.listUuid}.recentContent`, JSON.stringify(data.recently), true);

                const contentHtml = tableify(data.purchase);
                const recentContentHtml = tableify(data.recently);

                // create na enumeration sentence e. g. for smart assistants
                let enumSentence = ``;

                data.purchase.forEach((value, index) => {
                    if (index === data.purchase.length - 1 && data.purchase.length > 1) {
                        enumSentence += ` ${i18nHelper.conjunction[lang]} ${dict[value.name] ? dict[value.name] : value.name}`;
                    } else if (index !== data.purchase.length - 2 && data.purchase.length > 1) {
                        enumSentence += `${dict[value.name] ? dict[value.name] : value.name}, `;
                    } else {
                        enumSentence += dict[value.name] ? dict[value.name] : value.name;
                    } // endElse
                });

                adapter.setState(`${entry.listUuid}.enumSentence`, enumSentence, true);
                adapter.setState(`${entry.listUuid}.contentHtml`, contentHtml, true);
                adapter.setState(`${entry.listUuid}.contentHtmlNoHead`, contentHtml.includes(`</thead>`) ? `<table>${contentHtml.split(`</thead>`)[1]}` : contentHtml, true);
                adapter.setState(`${entry.listUuid}.recentContentHtml`, recentContentHtml, true);
                adapter.setState(`${entry.listUuid}.recentContentHtmlNoHead`, recentContentHtml.includes(`</thead>`) ? `<table>${recentContentHtml.split(`</thead>`)[1]}` : recentContentHtml, true);
                adapter.setState(`${entry.listUuid}.count`, data.purchase.length, true);
            });

            bring.getAllUsersFromList(entry.listUuid).then(data => {
                adapter.log.debug(`[DATA] Users from ${entry.listUuid} loaded: ${JSON.stringify(data)}`);
                adapter.setState(`${entry.listUuid}.users`, JSON.stringify(data.users), true);

                const usersHtml = tableify(data.users);

                adapter.setState(`${entry.listUuid}.usersHtml`, usersHtml, true);
                adapter.setState(`${entry.listUuid}.usersHtmlNoHead`, `<table>${usersHtml.split(`</thead>`)[1]}`, true);
            }).catch(e => {
                adapter.log.warn(e);
                adapter.setStateChanged(`info.connection`, false, true);
            });
        } // endFor
    } catch (e) {
        adapter.setStateChanged(`info.connection`, false, true);
        adapter.log.warn(e);
        // Check if Access token no longer valid
        if (e.message.includes(`JWT access token is not valid`)) {
            tryLogin();
        } // endIf
    } // endTryCatch

    if (polling.all) clearTimeout(polling.all);
    polling.all = setTimeout(pollAllLists, 90000);
} // endPollAllLists

async function tryLogin() {
    try {
        await bring.login();
        adapter.setState(`info.connection`, true, true);
        adapter.setState(`info.user`, bring.name, true);
        adapter.log.info(`[LOGIN] Successfully logged in as ${bring.name}`);
        if (loginTimeout) clearTimeout(loginTimeout);
        return Promise.resolve();
    } catch (e) {
        adapter.log.warn(e);
        adapter.log.info(`[LOGIN] Reconnection in 30 seconds`);
        if (loginTimeout) clearTimeout(loginTimeout);
        loginTimeout = setTimeout(tryLogin, 30000);
    } // endCatch
} // endTryLogin

if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
} // endElse
