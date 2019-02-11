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
                password = decrypt(obj.native.secret, adapter.config.password);
                mail = decrypt(obj.native.secret, adapter.config.mail);
            } else {
                password = decrypt('Zgfr56gFe87jJOM', adapter.config.password);
                mail = decrypt('Zgfr56gFe87jJOM', adapter.config.mail);
            } // endElse
            main();
        });
    });

    return adapter;
} // endStartAdapter


function main() {
    adapter.subscribeStates('*');
    bring = new Bring({
        logger: adapter.log,
        mail: mail,
        password: password
    });
} // endMain

if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}
