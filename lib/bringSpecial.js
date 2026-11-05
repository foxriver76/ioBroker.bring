'use strict';

// Bring Spezial: Mengen/Varianten zusammenfuehren.
// Eine eigene Warteschlange pro Einkaufsliste.

const PENDING_MS = 60000;
const REFRESH_TIMEOUT_MS = 150000;
const NUM = '\\d+(?:[.,]\\d+)?';
const UNIT = '[a-zA-ZäöüÄÖÜ]+';
const VARIANT = new RegExp(
    '^(?:(.*?)\\s+)?(' + NUM + ')\\s*(' + UNIT + ')$'
);

const isNum = s => /^\d+$/.test(s);
const norm = s => String(s || '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseVariant(str) {
    const s = String(str).trim();
    const m = VARIANT.exec(s);
    if (!m) {
        const c = /^(.*\S)\s+(\d+)$/.exec(s);
        if (c) {
            return {
                text: c[1].trim(),
                v: null, u: '', n: Number(c[2])
            };
        }
        return { text: s, v: null, u: '', n: 1 };
    }
    return {
        text: (m[1] || '').trim(),
        v: parseFloat(m[2].replace(',', '.')),
        u: m[3], n: 1
    };
}

const fmtQty = (v, u) =>
    String(Math.round(v * 1000) / 1000) + u;

const variantStr = x =>
    x.v == null
        ? x.text + (x.n > 1 ? ' ' + x.n : '')
        : (x.text ? x.text + ' ' : '') + fmtQty(x.v, x.u);

function partsToVariants(parts, glue = true) {
    const out = [];
    let cur = '';
    let buf = [];

    for (const p of parts) {
        if (isNum(p)) continue;
        const pieces = p.split(
            /\s+\/\s+|\s*(?:\+|%2B)\s*/i
        ).filter(Boolean);
        let chain = '';

        pieces.forEach((piece, idx) => {
            if (!glue) {
                const x = parseVariant(piece);
                if (!x.text && x.v != null && idx > 0) {
                    x.text = chain;
                }
                if (idx === 0) chain = x.text;
                out.push(x);
            } else if (VARIANT.test(piece)) {
                const x = parseVariant(
                    idx === 0
                        ? [...buf, piece].join(' ')
                        : piece
                );
                if (!x.text) {
                    x.text = idx === 0 ? cur : chain;
                }
                if (idx === 0) chain = x.text;
                out.push(x);
                if (idx === 0) buf = [];
            } else if (idx === 0) {
                buf.push(piece);
                cur = buf.join(' ');
            }
        });
    }
    for (const b of buf) out.push(parseVariant(b));
    return out;
}

function uniqueVariants(list) {
    const seen = new Set();
    return list.filter(x => {
        if (x.v != null) return true;
        const k = x.text.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

const sameText = (a, b) =>
    a.text.toLowerCase() === b.text.toLowerCase();

const sameUnit = (a, b) =>
    a.v != null && b.v != null &&
    a.u.toLowerCase() === b.u.toLowerCase();

function findMatch(olds, nv, taken) {
    return olds.findIndex(
        (o, k) =>
            !taken.has(k) &&
            sameText(o, nv) &&
            (
                (o.v == null && nv.v == null) ||
                sameUnit(o, nv)
            )
    );
}

function formatSpec(count, vars) {
    const sorted = [
        ...vars.filter(x => x.v == null),
        ...vars.filter(x => x.text && x.v != null),
        ...vars.filter(x => !x.text && x.v != null)
    ];
    const parts = [];
    const groups = new Map();

    for (const x of sorted) {
        if (x.text && x.v != null) {
            const k = x.text.toLowerCase();
            if (groups.has(k)) {
                groups.get(k).qs.push(fmtQty(x.v, x.u));
                continue;
            }
            const g = {
                text: x.text,
                qs: [fmtQty(x.v, x.u)]
            };
            groups.set(k, g);
            parts.push(g);
        } else {
            parts.push(variantStr(x));
        }
    }
    for (let i = 0; i < parts.length; i++) {
        if (typeof parts[i] !== 'string') {
            parts[i] =
                parts[i].text + ' ' +
                parts[i].qs.join(' + ');
        }
    }
    return [
        ...(count != null ? [count] : []),
        ...parts
    ].join(', ');
}

function itemSpec(it) {
    return String(
        it.specification ??
        it.spec ??
        it.description ??
        ''
    ).trim();
}

function merge(existing, newParts) {
    const nums = newParts.filter(isNum);
    const newNum = nums.length
        ? String(nums.reduce(
            (a, n) => a + Number(n), 0
        ))
        : undefined;
    const newVars = uniqueVariants(
        partsToVariants(newParts)
    );

    if (!existing) {
        return formatSpec(
            newNum != null ? Number(newNum) : null,
            newVars
        );
    }

    const oldParts = itemSpec(existing)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    const hasOldNum = oldParts.some(isNum);
    let count = Number(
        oldParts.find(isNum) ||
        (oldParts.length ? 0 : 1)
    );

    const olds = uniqueVariants(
        partsToVariants(oldParts, false)
    );
    const vars = olds.map(x => ({ ...x }));
    const taken = new Set();
    let added = false;
    let summed = false;

    for (const nv of newVars) {
        const i = nv.v == null
            ? findMatch(olds, nv, taken)
            : -1;

        if (nv.v != null) {
            vars.push(nv);
            added = true;
            continue;
        }
        if (i < 0) {
            vars.push(nv);
            added = true;
            continue;
        }

        taken.add(i);
        if (nv.v == null) {
            vars[i].n += nv.n;
            summed = true;
            continue;
        }
        const o = vars[i];

        if (!newNum) {
            o.v += nv.v;
            summed = true;
        } else if (o.v !== nv.v) {
            vars.push(nv);
            added = true;
        }
    }

    let bumped = false;
    let plainOnQty = false;

    if (newNum) {
        count += Number(newNum);
    } else if (
        newVars.length === 0 &&
        olds.length > 0 &&
        !hasOldNum
    ) {
        plainOnQty = true;
        count = 1;
    } else if (
        newVars.length === 0 ||
        (!added && !summed)
    ) {
        count += 1;
        bumped = true;
    }

    const showCount =
        hasOldNum ||
        Boolean(newNum) ||
        bumped ||
        plainOnQty ||
        oldParts.length === 0;

    return formatSpec(
        showCount ? count : null,
        vars
    );
}

function parseCommand(input, withAttrs) {
    if (!withAttrs) {
        if (
            typeof input !== 'string' ||
            !input.trim()
        ) {
            throw new Error('Leere Spezial-Eingabe');
        }
        const comma = input.indexOf(',');
        const name = (
            comma < 0
                ? input
                : input.slice(0, comma)
        ).trim();
        const spec = comma < 0
            ? ''
            : input.slice(comma + 1);

        if (!name || name.length > 200) {
            throw new Error('Ungueltiger Artikelname');
        }
        return {
            name,
            parts: spec.split(',')
                .map(s => s.trim())
                .filter(Boolean),
            labels: null,
            requestId: null
        };
    }

    const value = JSON.parse(input);
    if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value)
    ) {
        throw new Error('JSON-Objekt erforderlich');
    }

    const name = String(value.name || '').trim();
    if (!name || name.length > 200) {
        throw new Error('Ungueltiger Artikelname');
    }
    const spec = value.specification ?? '';
    if (
        typeof spec !== 'string' ||
        spec.length > 500
    ) {
        throw new Error(
            'specification muss Text sein'
        );
    }

    const labels = {};
    for (const key of [
        'discounted',
        'urgent',
        'convenient'
    ]) {
        if (
            Object.prototype.hasOwnProperty.call(
                value, key
            )
        ) {
            if (typeof value[key] !== 'boolean') {
                throw new Error(
                    key + ' muss true oder false sein'
                );
            }
            labels[key] = value[key];
        }
    }

    return {
        name,
        parts: spec.split(',')
            .map(s => s.trim())
            .filter(Boolean),
        labels,
        requestId: typeof value.requestId === 'string' ? value.requestId : null
    };
}

function createBringSpecial(
    adapter,
    getBring,
    saveWithAttributes
) {
    const contexts = new Map();
    let stopped = false;

    function context(listId) {
        if (!contexts.has(listId)) {
            contexts.set(listId, {
                queue: [],
                working: false,
                pending: new Map(),
                expected: new Map(),
                lastWriteAt: 0
            });
        }
        return contexts.get(listId);
    }

    async function readItems(listId) {
        const bring = getBring();
        if (!bring) {
            throw new Error(
                'Bring noch nicht eingeloggt'
            );
        }
        const data = await bring.getItems(listId);
        if (!Array.isArray(data?.purchase)) {
            throw new Error(
                'Bring Liste ungueltig'
            );
        }
        return data.purchase;
    }

    async function waitForRefresh(listId, ctx) {
        if (!ctx.expected.size || stopped) return;
        const start = Date.now();

        while (!stopped) {
            try {
                const items = await readItems(listId);
                const updated =
                    ctx.expected.size &&
                    [...ctx.expected].every(
                        ([key, spec]) => {
                            const it = items.find(
                                x => norm(x.name) === key
                            );
                            return it &&
                                norm(itemSpec(it)) === norm(spec);
                        }
                    );

                if (updated) {
                    ctx.expected.clear();
                    return;
                }

                if (
                    Date.now() - ctx.lastWriteAt > 3000
                ) {
                    adapter.log.debug(
                        '[SPECIAL] Liste gelesen; ' +
                        'neue Werte noch nicht bestaetigt'
                    );
                    ctx.expected.clear();
                    return;
                }
            } catch (err) {
                adapter.log.debug(
                    '[SPECIAL] Refresh: ' + err.message
                );
            }

            if (
                Date.now() - start >
                REFRESH_TIMEOUT_MS
            ) {
                adapter.log.warn(
                    '[SPECIAL] Refresh-Timeout nach 150 s'
                );
                ctx.expected.clear();
                return;
            }
            await sleep(500);
        }
    }

    async function result(
        listId, ok, name, spec, error, requestId = null
    ) {
        try {
            await adapter.setStateAsync(
                `${listId}.specialLastResult`,
                JSON.stringify({
                    ok,
                    name,
                    specification: spec ?? null,
                    error: error ?? null,
                    requestId,
                    timestamp: new Date().toISOString(),
                    zeitpunkt:
                        new Date().toISOString()
                }),
                true
            );
        } catch (e) {
            adapter.log.warn(
                '[SPECIAL] Ergebnisfehler: ' +
                e.message
            );
        }
    }

    async function clearSpecial(listId, command) {
        if (command.stateName !== 'saveItemSpecial') return;
        const id = `${listId}.saveItemSpecial`;
        const current = await adapter.getStateAsync(id);
        if (current?.val === command.raw) {
            await adapter.setStateAsync(id, '', true);
        }
    }

    async function process(listId, ctx, command) {
        const parsed = parseCommand(
            command.raw,
            command.withAttrs
        );
        const key = norm(parsed.name);
        const cached = ctx.pending.get(key);
        const live = ctx.snapshotItems || await readItems(listId);
        const current = live.find(
            it => norm(it.name) === key
        );

        if (
            cached &&
            Date.now() - cached.at >= PENDING_MS
        ) {
            ctx.pending.delete(key);
        }

        if (cached && current) {
            cached.seenOnce = true;
        }
        if (
            cached &&
            !current &&
            cached.seenOnce
        ) {
            ctx.pending.delete(key);
        }

        const nowCached = ctx.pending.get(key);
        const fresh =
            nowCached &&
            Date.now() - nowCached.at < PENDING_MS
                ? nowCached
                : null;

        const existing = fresh
            ? {
                name: fresh.name,
                specification: fresh.spec
            }
            : current;

        const spec = merge(
            existing,
            parsed.parts
        );
        const name = existing
            ? String(existing.name).trim()
            : parsed.name;

        if (command.withAttrs) {
            const success =
                await saveWithAttributes(
                    listId,
                    JSON.stringify({
                        name,
                        specification: spec,
                        ...parsed.labels
                    }),
                    command.stateName,
                    command.stateName === 'saveItemSpecial'
                        ? { acknowledge: false, throwOnError: true }
                        : {}
                );

            if (success !== true) {
                throw new Error(
                    'Bring-Attributschreiben ' +
                    'nicht bestaetigt'
                );
            }
        } else {
            await getBring().saveItem(
                listId,
                name,
                spec.replace(/\+/g, '%2B')
            );

            if (command.stateName !== 'saveItemSpecial') {
                await adapter.setStateAsync(
                    `${listId}.${command.stateName}`,
                    command.raw,
                    true
                );
            }
        }

        ctx.pending.set(key, {
            name,
            spec,
            at: Date.now(),
            seenOnce: Boolean(current)
        });
        ctx.lastWriteAt = Date.now();
        // Nach jedem Schreiben lokal fortschreiben.
        // Kein Warten auf ein neues Bring-Polling.
        if (ctx.snapshotItems) {
            ctx.snapshotItems = ctx.snapshotItems.filter(
                it => norm(it.name) !== norm(name)
            );
            ctx.snapshotItems.push({
                name,
                specification: spec
            });
        }

        try {
            await clearSpecial(listId, command);
        } catch (clearErr) {
            adapter.log.warn('[SPECIAL] Leeren: ' + clearErr.message);
        }
        await result(
            listId, true, name, spec, null, parsed.requestId
        );

        adapter.log.info(
            '[SPECIAL] ' +
            name +
            (spec ? ' -> ' + spec : '') +
            (
                command.withAttrs
                    ? ' (mit Labels)'
                    : ''
            )
        );
    }

    async function drain(listId) {
        const ctx = context(listId);
        if (ctx.working) return;
        ctx.working = true;

        try {
            while (
                !stopped &&
                ctx.queue.length
            ) {
                ctx.snapshotItems = await readItems(listId);
                const batch = ctx.queue.splice(0);

                for (const command of batch) {
                    if (stopped) break;

                    try {
                        await process(
                            listId,
                            ctx,
                            command
                        );
                    } catch (e) {
                        adapter.log.warn(
                            '[SPECIAL] Fehler: ' +
                            e.message
                        );
                        try {
                            await clearSpecial(listId, command);
                        } catch (clearErr) {
                            adapter.log.warn('[SPECIAL] Leeren: ' + clearErr.message);
                        }
                        await result(
                            listId,
                            false,
                            '',
                            null,
                            e.message,
                            command.requestId || null
                        );
                    }

                }
            }
        } finally {
            ctx.working = false;
        }
    }

    return {
        enqueue(listId, raw, stateName) {
            if (stopped) return;
            const ctx = context(listId);
            ctx.queue.push({
                raw,
                stateName,
                withAttrs:
                    stateName === 'addItemSpecialWithAttributes' ||
                    (typeof raw === 'string' && raw.trimStart().startsWith('{')),
                requestId: (() => {
                    try {
                        const parsed = JSON.parse(raw);
                        return typeof parsed?.requestId === 'string' ? parsed.requestId : null;
                    } catch { return null; }
                })()
            });
            void drain(listId);
        },
        stop() {
            stopped = true;
            contexts.clear();
        }
    };
}

module.exports = {
    createBringSpecial,
    merge,
    parseCommand
};
