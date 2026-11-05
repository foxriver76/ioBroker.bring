'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getStaticObjects } = require('../lib/utils');
const { parseCommand, merge } = require('../lib/bringSpecial');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bring-test-'));
const file = path.join(dir, 'image.jpg');
const jpeg = Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1]);
fs.writeFileSync(file, jpeg);
const oldBase = process.env.IOBROKER_BRING_IMAGE_BASE_DIR;
const oldAllow = process.env.IOBROKER_BRING_IMAGE_LAN_ALLOWLIST;
process.env.IOBROKER_BRING_IMAGE_BASE_DIR = dir;
delete process.env.IOBROKER_BRING_IMAGE_LAN_ALLOWLIST;
// The adapter may have loaded this module before the test's environment was set.
delete require.cache[require.resolve('../lib/bringImageUpload')];
const { createBringImageUpload } = require('../lib/bringImageUpload');
const imageUrl = 'https://bring-production.s3.amazonaws.com/bring/listitemdetail/list/detail';

function mockImage({ previous = null, onPut = null } = {}) {
    const state = new Map();
    const requests = [];
    const adapter = {
        log: { info() {}, warn() {} },
        async getStateAsync(id) { return { val: state.get(id) }; },
        async setStateAsync(id, val) { state.set(id, val); }
    };
    const bring = {
        headers: { Authorization: 'Bearer fake-test-token' },
        async getItemsDetails() {
            return [{ uuid: 'detail', itemId: 'Milk', imageUrl: previous }];
        }
    };
    const upload = createBringImageUpload(
        adapter,
        () => bring,
        async () => ({ purchase: [{ itemId: 'Milk', uuid: 'purchase' }] })
    );
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
        requests.push(String(url));
        if (String(url).startsWith('https://api.getbring.com/') && options?.method === 'PUT') {
            if (onPut) onPut(state);
            if (!previous) previous = imageUrl;
            return new Response('', { status: 200 });
        }
        if (String(url) === imageUrl) {
            return new Response(jpeg, { status: 206, headers: { 'content-type': 'image/jpeg' } });
        }
        throw new Error('Unexpected request: ' + url);
    };
    return {
        state,
        requests,
        upload,
        restore() { global.fetch = originalFetch; },
        lastResult() { return JSON.parse(state.get('list.imageLastResult')); }
    };
}

describe('Bring! JSON, special items and image upload', () => {
    after(() => {
        fs.rmSync(dir, { recursive: true, force: true });
        if (oldBase === undefined) delete process.env.IOBROKER_BRING_IMAGE_BASE_DIR;
        else process.env.IOBROKER_BRING_IMAGE_BASE_DIR = oldBase;
        if (oldAllow === undefined) delete process.env.IOBROKER_BRING_IMAGE_LAN_ALLOWLIST;
        else process.env.IOBROKER_BRING_IMAGE_LAN_ALLOWLIST = oldAllow;
    });

    it('exposes separate command and result states', () => {
        const obj = getStaticObjects({ name: 'Shopping' });
        for (const name of ['saveItem', 'saveItemSpecial', 'saveItemImage']) {
            assert.equal(obj[name].common.write, true);
        }
        for (const name of ['saveItemLastResult', 'specialLastResult', 'imageLastResult']) {
            assert.equal(obj[name].common.write, false);
        }
    });

    it('parses special items as text or JSON and merges quantities', () => {
        assert.deepEqual(parseCommand('Milk, 2', false).parts, ['2']);
        const json = parseCommand('{"name":"Milk","specification":"3","urgent":true}', true);
        assert.equal(json.labels.urgent, true);
        assert.deepEqual(json.parts, ['3']);
        assert.equal(merge({ specification: '2' }, ['3']), '5');
    });

    it('confirms a newly attached image and clears its own command', async () => {
        const m = mockImage();
        const raw = JSON.stringify({ name: 'Milk', path: file });
        m.state.set('list.saveItemImage', raw);
        try {
            await m.upload('list', raw);
            assert.equal(m.lastResult().status, 'verified');
            assert.equal(m.state.get('list.saveItemImage'), '');
        } finally {
            m.restore();
        }
    });

    it('does not erase another command that arrives during the upload', async () => {
        const m = mockImage({ onPut(state) { state.set('list.saveItemImage', 'new-command'); } });
        const raw = JSON.stringify({ name: 'Milk', path: file });
        m.state.set('list.saveItemImage', raw);
        try {
            await m.upload('list', raw);
            assert.equal(m.lastResult().status, 'verified');
            assert.equal(m.state.get('list.saveItemImage'), 'new-command');
        } finally {
            m.restore();
        }
    });

    it('does not verify a previously existing URL after overwrite', async () => {
        const m = mockImage({ previous: imageUrl });
        const raw = JSON.stringify({ name: 'Milk', path: file, overwrite: true });
        m.state.set('list.saveItemImage', raw);
        try {
            await m.upload('list', raw);
            assert.equal(m.lastResult().status, 'accepted_unconfirmed');
            assert.equal(m.lastResult().imageCheck.ok, false);
            assert.equal(m.requests.includes(imageUrl), false);
        } finally {
            m.restore();
        }
    });

    it('rejects local files outside the permitted base directory', async () => {
        const m = mockImage();
        const raw = JSON.stringify({ name: 'Milk', path: __filename });
        m.state.set('list.saveItemImage', raw);
        try {
            await m.upload('list', raw);
            assert.equal(m.lastResult().ok, false);
            assert.match(m.lastResult().error, /innerhalb von/);
        } finally {
            m.restore();
        }
    });

    it('rejects private network sources unless explicitly allowlisted', async () => {
        const m = mockImage();
        const raw = JSON.stringify({ name: 'Milk', url: 'http://192.168.1.20:8080/image.jpg' });
        m.state.set('list.saveItemImage', raw);
        try {
            await m.upload('list', raw);
            assert.equal(m.lastResult().ok, false);
            assert.equal(m.requests.length, 0);
        } finally {
            m.restore();
        }
    });
});
