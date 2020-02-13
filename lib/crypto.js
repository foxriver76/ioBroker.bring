'use strict';
const crypto = require(`crypto`);

/**
 * encrypts a value by a given key
 *
 * @param {string} key
 * @param {string} value
 * @returns {string}
 */

function encryptLegacy(key, value) {
    let result = ``;
    for (let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}

/**
 * decrypts a value by a given key
 *
 * @param {string} key
 * @param {string} value
 * @returns {string}
 */

function decryptLegacy(key, value) {
    let result = ``;
    for (let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}

/**
 * encrypts a value by a given key via AES-256-CBC
 *
 * @param {string} key
 * @param {string} value
 * @returns {string}
 */

function encrypt(key, value) {
    if (key.length < 32) {
        // key is wrong for new encryption
        return encryptLegacy(key, value);
    }
    key = key.substr(0, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(`aes-256-cbc`, Buffer.from(key), iv);
    let encrypted = cipher.update(value);

    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return `$/aes-256-cbc:${iv.toString(`hex`)}:${encrypted.toString(`hex`)}`;
}

/**
 * encrypts a value by a given key via AES-256-CBC
 *
 * @param {string} key
 * @param {string} value
 * @returns {string}
 */

function decrypt(key, value) {
    if (!value.startsWith(`$/aes-256-cbc:`) || key.length < 32) {
        return decryptLegacy(key, value);
    }
    key = key.substr(0, 32);
    const textParts = value.split(`:`);
    const iv = Buffer.from(textParts[1], `hex`);
    const encryptedText = Buffer.from(textParts.pop(), `hex`);
    const decipher = crypto.createDecipheriv(`aes-256-cbc`, Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedText);

    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString();
}

exports.decrypt = decrypt;
exports.encrypt = encrypt;