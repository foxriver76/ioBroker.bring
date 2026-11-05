/**
 * Get static objects for a single list
 *
 * @param entry {import('bring-shopping').LoadListsEntry} entry
 * @return {Record<string, ioBroker.StateObject>}
 */
function getStaticObjects(entry) {
    return {
        content: {
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
        },

        contentWithAttributes: {
            type: 'state',
            common: {
                role: 'list.json',
                name: 'Content With Attributes',
                desc: 'Shopping items with native Bring labels',
                read: true,
                write: false,
                type: 'string',
                def: '[]'
            },
            native: {}
        },
        recentContentWithAttributes: {
            type: 'state',
            common: {
                role: 'list.json',
                name: 'Recent Content With Attributes',
                desc: 'Recent items with native Bring labels',
                read: true,
                write: false,
                type: 'string',
                def: '[]'
            },
            native: {}
        },
        recentContent: {
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
        },
        users: {
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
        },
        contentHtml: {
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
        },
        recentContentHtml: {
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
        },
        usersHtml: {
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
        },
        contentHtmlNoHead: {
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
        },
        recentContentHtmlNoHead: {
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
        },
        usersHtmlNoHead: {
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
        },
        removeItem: {
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
        },
        removeItemTranslated: {
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
        },
        moveToRecentContent: {
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
        },
        moveToRecentContentTranslated: {
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
        },
        saveItem: {
            type: `state`,
            common: {
                role: `text`,
                name: `Save Item`,
                desc: `Save item to list (text or JSON with purchase labels)`,
                read: true,
                write: true,
                type: `string`,
                def: ``
            },
            native: {}
        },
        saveItemLastResult: {
            type: 'state',
            common: {
                name: 'Last saveItem result',
                desc: 'Erfolg/Fehler des letzten saveItem-Befehls (requestId, timestamp)',
                role: 'json', type: 'string', read: true, write: false, def: '{}'
            },
            native: {}
        },
        saveItemSpecial: {
            type: 'state',
            common: {
                name: 'Save item special (text or JSON, quantities/variants/labels)',
                desc: 'Mengen/Varianten zusammenfuehren; Text oder JSON mit Labels',
                role: 'text', type: 'string', read: true, write: true, def: ''
            },
            native: {}
        },
        specialLastResult: {
            type: 'state',
            common: {
                name: 'Last Bring special operation',
                role: 'json',
                type: 'string',
                read: true,
                write: false,
                def: '{}'
            },
            native: {}
        },
        saveItemImage: {
            type: 'state',
            common: {
                name: 'Upload a product image to Bring (JSON)',
                desc: 'JSON: {"name":"...","url":"https://img.rewe-static.de/...png","overwrite":false} oder path',
                role: 'json',
                type: 'string',
                read: true,
                write: true,
                def: ''
            },
            native: {}
        },
        imageLastResult: {
            type: 'state',
            common: {
                name: 'Last product image upload result',
                role: 'json',
                type: 'string',
                read: true,
                write: false,
                def: '{}'
            },
            native: {}
        },
        saveItemTranslated: {
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
        },
        count: {
            type: `state`,
            common: {
                role: `indicator.count`,
                name: `Count`,
                desc: `Number of entrys in ${entry.name}`,
                read: true,
                write: false,
                type: `number`
            },
            native: {}
        },
        messageTrigger: {
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
        },
        enumSentence: {
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
        },
        translation: {
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
        }
    };
}

module.exports = {
    getStaticObjects
};
