/**
 * Bring! adapter
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

const utils = require('@iobroker/adapter-core');
const request = require('request-promise-native');
const crypto = require(__dirname + '/lib/crypto');
const Bring = require(__dirname + '/lib/bring');
let adapter;

let mail;
let password;
let bring;

function startAdapter(options) {
    options = options || {};
    Object.assign(options, {
        name: 'bring'
    });

    adapter = new utils.Adapter(options);

    adapter.on('unload', callback => {
        try {
            adapter.log.info('[END] Stopping Bring! adapter...');
            adapter.setState('info.connection', false, true);
            callback();
        } catch (e) {
            callback();
        } // endTryCatch
    });

    adapter.on('ready', () => {
        adapter.getForeignObjectAsync('system.config').then(obj => {
            if (obj && obj.native && obj.native.secret) {
                password = crypto.decrypt(obj.native.secret, adapter.config.password);
                mail = crypto.decrypt(obj.native.secret, adapter.config.mail);
            } else {
                password = crypto.decrypt('Zgfr56gFe87jJOM', adapter.config.password);
                mail = crypto.decrypt('Zgfr56gFe87jJOM', adapter.config.mail);
            } // endElse
            main();
        });
    });

    return adapter;
} // endStartAdapter


async function main() {
    adapter.subscribeStates('*');

    bring = new Bring({
        logger: adapter.log,
        mail: mail,
        password: password
    });


    await tryLogin();

    const bringLists = await bring.loadLists();

    adapter.log.warn(`[DATA] Lists loaded: ${JSON.stringify(bringLists)}`);

    for (const entry of bringLists.lists) {
        const promises = [];

        promises.push(adapter.setObjectNotExistsAsync(entry.listUuid, {
            type: 'channel',
            'common': {
                'name': entry.name,
            },
            'native': {}
        }));

        promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.content`, {
            type: 'state',
            common: {
                role: 'list',
                name: 'Content',
                desc: `Content of ${entry.name}`,
                read: true,
                write: false,
                def: []
            },
            native: {}
        }));

        await Promise.all(promises);

        bring.getItems(entry.listUuid).then(data => {
            adapter.log.warn(`[DATA] Items loaded: ${JSON.stringify(data)}`);
        }).catch((e) => {
            adapter.log.warn(e);
        });
    } // endFor
} // endMain

async function tryLogin() {
    try {
        await bring.login();
        adapter.setState('info.connection', true, true);
        return Promise.resolve();
    } catch (e) {
        adapter.log.warn(e);
        adapter.log.info('[LOGIN] Reconnection in 30 seconds');
        setTimeout(tryLogin, 30000);
    } // endCatch
} // endTryLogin

if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
} // endElse
