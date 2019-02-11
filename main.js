/**
 * Bring! adapter
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

const utils = require('@iobroker/adapter-core');
const request = require('request-promise-native');
let adapter;

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

    adapter.on('ready', main);

    return adapter;
} // endStartAdapter


function main() {
    adapter.subscribeStates('*');
} // endMain

if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}
