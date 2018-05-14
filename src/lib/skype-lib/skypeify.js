const striptags = require('striptags');
const {AllHtmlEntities: Entities} = require('html-entities');
const entities = new Entities();

const replacer = (match, href) => `<a href="${href}">${href}</a>`;
const regExpr = /(https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}[-a-zA-Z0-9@:%_\+.~#?&//=]*)/gi;
const REPLACEMENTS = [
    ['&', '&amp;'],
    ['>', '&gt;'],
    ['<', '&lt;'],
    ['"', '&quot;'],
    [regExpr, replacer],
];

const skypeify = str =>
    REPLACEMENTS.reduce((newStr, item) =>
        newStr.replace(...item), str);

const deskypeify = str => {
    if (!str) {
        return str;
    }
    const edit = str.match(/<e_m[^>]*>\s*$/i) !== null || str.match(/<e_m[^>]*>\s*<[^>]*e_m[^>]*>\s*$/i) !== null;
    const result = entities.decode(striptags(str));
    /* istanbul ignore next */
    return edit ? `[edit] ${result}` : result;
};

module.exports = {skypeify, deskypeify, replacer};
