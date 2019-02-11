/*jshint -W061 */ // ignore "eval can be harmful"
'use strict';

const request = require('request-promise-native');

class Bring {
    constructor(options) {
        this.mail = options.mail;
        this.password = options.password;
        this.url = options.url || 'https://api.getbring.com/rest/';

        this.logger = options.logger; //testdebug
        this.login();
    }

    async login() {
        let data;
        try {
            data = await request(`${this.url}bringlists?email=${this.mail}&password=${this.password}`);
        } catch (e) {
            this.logger.error(e);
            //throw `Cannot Login: ${e}`;
        } // endCatch
        this.logger.warn(JSON.parse(data));
    } // endLogin

} // endClassBring

module.exports = Bring;