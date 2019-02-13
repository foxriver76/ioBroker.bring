/**
 * Bring! adapter
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

const utils = require(`@iobroker/adapter-core`);
const crypto = require(__dirname + `/lib/crypto`);
const Bring = require(__dirname + `/lib/bring`);
const tableify = require(`tableify`);
let adapter;

let mail;
let password;
let bring;
const polling = {};
let loginTimeout;

function startAdapter(options) {
    options = options || {};
    Object.assign(options, {
        name: `bring`
    });

    adapter = new utils.Adapter(options);

    adapter.on(`unload`, callback => {
        try {
            adapter.log.info(`[END] Stopping Bring! adapter...`);
            adapter.setState(`info.connection`, false, true);
            callback();
        } catch (e) {
            callback();
        } // endTryCatch
    });

    adapter.on(`ready`, () => {
        adapter.getForeignObjectAsync(`system.config`).then(obj => {
            if (obj && obj.native && obj.native.secret) {
                password = crypto.decrypt(obj.native.secret, adapter.config.password);
                mail = crypto.decrypt(obj.native.secret, adapter.config.mail);
            } else {
                password = crypto.decrypt(`Zgfr56gFe87jJOM`, adapter.config.password);
                mail = crypto.decrypt(`Zgfr56gFe87jJOM`, adapter.config.mail);
            } // endElse
            main();
        });
    });

    adapter.on(`stateChange`, async (id, state) => {
        if (!id || !state || state.ack) return;
        adapter.log.warn(`[STATE] Changed ${id} to ${state.val}`);
        const listId = id.split(`.`)[2];
        const method = id.split(`.`).pop();

        if (method === `removeItem`) {
            try {
                await bring.removeItem(listId, state.val);
                adapter.log.info(`[REMOVE] Removed ${state.val} from ${listId}`);
                adapter.setState(id, state.val, true);
            } catch (e) {
                adapter.log.warn(e);
            }
        } else if (method === `saveItem`) {
            try {
                const item = state.val.split(`,`)[0].trim() || state.val;
                const specification = state.val.includes(`,`) ? state.val.substring(state.val.indexOf(`,`) + 1).trim() : ``;
                await bring.saveItem(listId, item, specification);
                adapter.log.info(`[SAVE] Saved ${item} (${specification}) to ${listId}`);
                adapter.setState(id, state.val, true);
            } catch (e) {
                adapter.log.warn(e);
            }
        } // endElseIf

        if (!polling[listId]) polling[listId] = setTimeout(() => {
            pollList(listId);
            if (polling[listId]) clearTimeout(polling[listId]);
            polling[listId] = null;
        }, 5000);
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

    /*
    try {
        const res = await bring.getUserSettings();
        adapter.log.info(`[DATA] User settings loaded: ${JSON.stringify(res)}`);
    } catch (e) {
        adapter.log.warn(e);
    } // endTryCatch
    */
} // endMain

function pollList(listUuid) {
    adapter.log.debug(`[POLL] Poll specific list: ${listUuid}`);
    bring.getItems(listUuid).then(data => {
        adapter.log.debug(`[DATA] Items from ${listUuid} loaded: ${JSON.stringify(data)}`);
        adapter.setState(`${listUuid}.content`, JSON.stringify(data.purchase), true);
        adapter.setState(`${listUuid}.recentContent`, JSON.stringify(data.recently), true);
        adapter.setState(`${listUuid}.contentHtml`, tableify(data.purchase), true);
        adapter.setState(`${listUuid}.recentContentHtml`, tableify(data.recently), true);
        adapter.setState(`${listUuid}.count`, data.purchase.length, true);
    }).catch(e => {
        adapter.log.warn(e);
    });

    bring.getAllUsersFromList(listUuid).then(data => {
        adapter.log.debug(`[DATA] Users from ${listUuid} loaded: ${JSON.stringify(data)}`);
        adapter.setState(`${listUuid}.users`, JSON.stringify(data.users), true);
        adapter.setState(`${listUuid}.usersHtml`, tableify(data.users), true);
    }).catch(e => {
        adapter.log.warn(e);
    });
} // endPollList

async function pollAllLists() {
    adapter.log.debug(`[POLL] Poll all lists`);
    const bringLists = await bring.loadLists();

    adapter.log.debug(`[DATA] Lists loaded: ${JSON.stringify(bringLists)}`);

    for (const entry of bringLists.lists) {
        const promises = [];

        promises.push(adapter.setObjectNotExistsAsync(entry.listUuid, {
            type: `channel`,
            common: {
                name: entry.name
            },
            native: {}
        }));

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

        await Promise.all(promises);

        bring.getItems(entry.listUuid).then(data => {
            adapter.log.debug(`[DATA] Items from ${entry.listUuid} loaded: ${JSON.stringify(data)}`);
            adapter.setState(`${entry.listUuid}.content`, JSON.stringify(data.purchase), true);
            adapter.setState(`${entry.listUuid}.recentContent`, JSON.stringify(data.recently), true);
            adapter.setState(`${entry.listUuid}.contentHtml`, tableify(data.purchase), true);
            adapter.setState(`${entry.listUuid}.recentContentHtml`, tableify(data.recently), true);
            adapter.setState(`${entry.listUuid}.count`, data.purchase.length, true);
        }).catch(e => {
            adapter.log.warn(e);
        });

        bring.getAllUsersFromList(entry.listUuid).then(data => {
            adapter.log.debug(`[DATA] Users from ${entry.listUuid} loaded: ${JSON.stringify(data)}`);
            adapter.setState(`${entry.listUuid}.users`, JSON.stringify(data.users), true);
            adapter.setState(`${entry.listUuid}.usersHtml`, tableify(data.users), true);
        }).catch(e => {
            adapter.log.warn(e);
        });

        if (polling.all) clearTimeout(polling.all);
        polling.all = setTimeout(pollAllLists, 90000);
    }
} // endPollAllLists

async function tryLogin() {
    try {
        await bring.login();
        adapter.setState(`info.connection`, true, true);
        adapter.setState(`info.user`, bring.name, true);
        adapter.log.info(`[LOGIN] Successfully logged in as ${bring.name}`);
        await pollAllLists();
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
