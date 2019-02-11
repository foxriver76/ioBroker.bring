/*jshint -W061 */ // ignore "eval can be harmful"
'use strict';

const request = require('request-promise-native');

class Bring {
    constructor(options) {
        this.mail = options.mail;
        this.password = options.password;
        this.url = options.url || 'https://api.getbring.com/rest/';
        this.logger = options.logger;
    } // endConstructor

    async login() {
        let data;
        try {
            data = await request(`${this.url}bringlists?email=${this.mail}&password=${this.password}`);
        } catch (e) {
            throw `Cannot Login: ${e}`;
        } // endCatch

        data = JSON.parse(data);
        this.name = data.name;
        this.uuid = data.uuid;
        this.listUuid = data.bringListUUID;
        this.headers = {
            'X-BRING-API-KEY': 'cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp',
            'X-BRING-CLIENT': 'android',
            'X-BRING-USER-UUID': this.uuid,
            'X-BRING-VERSION': '303070050',
            'X-BRING-COUNTRY': 'de'
        };
        return Promise.resolve();
    } // endLogin

    /**
     *   Loads all shopping lists
     *
     *   @return {json}
     */
    async loadLists() {
        let data;
        try {
            data = await request(`${this.url}bringusers/${this.uuid}/lists`, {headers: this.headers});
            return Promise.resolve(JSON.parse(data));
        } catch (e) {
            return Promise.reject(`Cannot get lists: ${e}`);
        } // endCatch
    } // endLoadLists

    /**
     *   Get all items from the current selected shopping list
     *
     *   @return {json}
     */
    async getItems(listUuid) {
        let data;
        try {
            data = await request(`${this.url}bringlists/${listUuid}`, {headers: this.headers});
            return Promise.resolve(JSON.parse(data));
        } catch (e) {
            return Promise.reject(`Cannot get lists: ${e}`);
        } // endCatch
    } // endGetItems

    /**
     *   Save an item to your current shopping list
     *
     *   @param {string} itemName The name of the item you want to send to the bring server
     *   @param {string} specification The litte description under the name of the item
     *   @return should return an empty string and answerHttpStatus should contain 204. If not -> error
     */
    saveItem(itemName, specification) {

    }

    /**
     *   Search for an item
     *
     *   @param {string} search   The item you want to search
     *   @return {json} string or html code
     */
    searchItem(search) {

    }

    /**
     *   remove an item from your current shopping list
     *
     *   @param {string} itemName Name of the item you want to delete from you shopping list
     *   @return should return an empty string and $answerHttpStatus should contain 204. If not -> error
     */
    removeItem(itemName) {

    }

    /**
     *   Get all users from a shopping list
     *
     *   @param {string} listUuid The lisUUID you want to receive a list of users from.
     *   @return {json}
     */
    getAllUsersFromList(listUuid) {

    } // endGetAllUsersFromList


    /**
     *   @return json
     */
    getUserSettings() {

    } // endGetUserSettings

} // endClassBring

module.exports = Bring;