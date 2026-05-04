import { RUNTIME, dispatchSKEvent, runtime } from './common/runtime.js';
import Mode from './common/mode.js';
import createNormal from './common/normal.js';
import startScrollNodeObserver from './common/observer.js';
import createInsert from './common/insert.js';
import createVisual from './common/visual.js';
import createHints from './common/hints.js';
import createClipboard from './common/clipboard.js';
import {
    applyUserSettings,
    createElementWithContent,
    generateQuickGuid,
    getBrowserName,
    getRealEdit,
    htmlEncode,
    initL10n,
    isInUIFrame,
    reportIssue,
    setSanitizedContent,
    showBanner,
} from './common/utils.js';
import createFront from './front.js';
import createAPI from './common/api.js';
import createDefaultMappings from './common/default.js';

import KeyboardUtils from './common/keyboardUtils';

let surfingkeysContentReady = false;
let surfingkeysSnippetsExpected = false;
let surfingkeysSnippetsLoaded = false;
let surfingkeysFocusOnLoadHandled = false;
runtime.bookMessage('surfingkeysContentPing', function(msg, sender, response) {
    response && response({
        alive: true,
        ready: surfingkeysContentReady,
        snippetsExpected: surfingkeysSnippetsExpected,
        snippetsLoaded: surfingkeysSnippetsLoaded
    });
});
document.addEventListener("surfingkeys:userScriptLoaded", () => {
    surfingkeysSnippetsLoaded = true;
});
document.addEventListener("surfingkeys:settingsFromSnippetsLoaded", () => {
    surfingkeysSnippetsLoaded = true;
});

/*
 * Apply custom key mappings for basic users, the input is like
 * {"a": "b", "b": "a", "c": "d"}
 */
function applyBasicMappings(api, normal, mappings) {
    const originKeys = new Set(Object.keys(mappings));
    const originMappings = {};
    for (const originKey in mappings) {
        const newKey = mappings[originKey];
        // current new key is one original key that will be overrode later
        // we need save it some where first, since current map will lose it,
        // such as the `a` in above example.
        if (originKeys.has(newKey)) {
            const target = normal.mappings.find(newKey);
            if (target) {
                originMappings[newKey] = target.meta;
            }
        }
        if (newKey === "") {
            normal.mappings.remove(originKey);
        } else if (originMappings.hasOwnProperty(originKey)) {
            normal.mappings.add(newKey, originMappings[originKey]);
        } else {
            api.map(newKey, originKey);
        }
    }
}

function ensureRegex(regexName) {
    const r = runtime.conf[regexName]
    if (r && r.source && !(r instanceof RegExp)) {
        runtime.conf[regexName] = new RegExp(r.source, r.flags);
    }
}

function applyRuntimeConf(normal) {
    ensureRegex("prevLinkRegex");
    ensureRegex("nextLinkRegex");
    ensureRegex("clickablePat");
    RUNTIME('getState', {
        blocklistPattern: runtime.conf.blocklistPattern ? runtime.conf.blocklistPattern : undefined,
        lurkingPattern: runtime.conf.lurkingPattern ? runtime.conf.lurkingPattern : undefined
    }, function (resp) {
        let state = resp.state;
        if (state === "disabled") {
            normal.disable();
            dispatchSKEvent("front", ['showStatus', [undefined, undefined, undefined, ""]]);
        } else if (state === "lurking") {
            state = normal.startLurk();
        } else {
            if (document.contentType === "application/pdf" && !resp.noPdfViewer) {
                _browser.usePdfViewer();
            } else {
                normal.enable();
                if (!Mode.getCurrent() || Mode.getCurrent().name !== "PassThrough") {
                    normal.enter();
                }
            }
            Mode.showStatus();
        }

        if (window === top) {
            RUNTIME('setSurfingkeysIcon', {
                status: state
            });
            var proxyMode = "";
            if (state === "enabled" && runtime.conf.showProxyInStatusBar && resp.proxyMode) {
                proxyMode = resp.proxyMode;
                if (["byhost", "always"].indexOf(resp.proxyMode) !== -1) {
                    proxyMode = "{0}: {1}".format(resp.proxyMode, resp.proxy);
                }
            }
            dispatchSKEvent("front", ['showStatus', [undefined, undefined, undefined, proxyMode]]);
        }
        maybeStealFocusOnLoad(state);
    });
}

function maybeStealFocusOnLoad(state) {
    if (surfingkeysFocusOnLoadHandled || state !== "enabled"
        || surfingkeysSnippetsExpected && !surfingkeysSnippetsLoaded
        || Mode.getCurrent() && Mode.getCurrent().name === "PassThrough") {
        return;
    }
    surfingkeysFocusOnLoadHandled = true;
    if (runtime.conf.stealFocusOnLoad && !isInUIFrame()
        && document.body && document.body.childElementCount > 1) {
        var elm = getRealEdit();
        elm && elm.blur();
    }
}

function applyRuntimeConfAfterSnippets(normal) {
    let applied = false;
    const applyOnce = () => {
        if (!applied) {
            applied = true;
            applyRuntimeConf(normal);
        }
    };
    document.addEventListener("surfingkeys:settingsFromSnippetsLoaded", applyOnce, {once: true});
    document.addEventListener("surfingkeys:userScriptLoaded", applyOnce, {once: true});
}

function applySettings(api, normal, rs) {
    for (var k in rs) {
        if (runtime.conf.hasOwnProperty(k)) {
            runtime.conf[k] = rs[k];
        }
    }
    if ('findHistory' in rs) {
        runtime.conf.lastQuery = rs.findHistory.length ? rs.findHistory[0] : "";
    }
    if (!rs.showAdvanced) {
        if (rs.basicMappings) {
            applyBasicMappings(api, normal, rs.basicMappings);
        }
        if (rs.disabledSearchAliases) {
            for (const key in rs.disabledSearchAliases) {
                api.removeSearchAlias(key);
            }
        }
    } else if (!rs.isMV3 && rs.snippets && !document.location.href.startsWith(chrome.runtime.getURL("/"))) {
        var settings = {}, error = "";
        try {
            (new Function('settings', 'api', rs.snippets))(settings, api);
        } catch (e) {
            error = e.toString();
        }
        applyUserSettings({settings, error});
    }

    const waitForSnippets = rs.isMV3 && rs.showAdvanced && rs.snippets && !surfingkeysSnippetsLoaded;
    if (waitForSnippets) {
        applyRuntimeConfAfterSnippets(normal);
    } else {
        applyRuntimeConf(normal);
        document.addEventListener("surfingkeys:settingsFromSnippetsLoaded", () => {
            applyRuntimeConf(normal);
        }, {once: true});
    }
}

function ensureSettingsSnippetsLoaded() {
    if (window === top && surfingkeysSnippetsExpected && !surfingkeysSnippetsLoaded) {
        setTimeout(() => {
            if (surfingkeysSnippetsExpected && !surfingkeysSnippetsLoaded) {
                RUNTIME('ensureSettingsSnippets');
            }
        }, 500);
    }
}

function _initModules() {
    const clipboard = createClipboard();
    const insert = createInsert();
    const normal = createNormal(insert);
    startScrollNodeObserver(normal);
    const hints = createHints(insert, normal, clipboard);
    const visual = createVisual(clipboard, hints);
    const front = createFront(insert, normal, hints, visual, _browser);

    const api = createAPI(clipboard, insert, normal, hints, visual, front, _browser);
    createDefaultMappings(api, clipboard, insert, normal, hints, visual, front, _browser);
    if (typeof(_browser.plugin) === "function") {
        _browser.plugin({ front });
    }

    dispatchSKEvent('defaultSettingsLoaded', {normal, api});
    RUNTIME('getSettings', null, function(response) {
        var rs = response.settings;
        surfingkeysSnippetsExpected = !!(rs.isMV3 && rs.showAdvanced && rs.snippets);
        if (!surfingkeysSnippetsExpected) {
            surfingkeysSnippetsLoaded = true;
        }
        applySettings(api, normal, rs);
        const disabledSearchAliases = rs.disabledSearchAliases;
        const getUsage = front.getUsage;
        const frontCommand = front.command;
        dispatchSKEvent('userSettingsLoaded', {settings: rs, disabledSearchAliases, getUsage, frontCommand});
        surfingkeysContentReady = true;
        ensureSettingsSnippetsLoaded();
    });
    return {
        normal,
        front,
        api,
    };
}


function _initContent(modes) {
    window.frameId = generateQuickGuid();
    runtime.on('settingsUpdated', response => {
        var rs = response.settings;
        applySettings(modes.api, modes.normal, rs);
    });

}

window.getFrameId = function () {
    if (!window.frameId && window.innerWidth > 16 && window.innerHeight > 16
        && document.body && document.body.childElementCount > 0
        && runtime.conf.ignoredFrameHosts.indexOf(window.origin) === -1
        && (!window.frameElement || (parseInt("0" + getComputedStyle(window.frameElement).zIndex) >= 0
            && window.frameElement.offsetWidth > 16 && window.frameElement.offsetWidth > 16))
    ) {
        _initContent(_initModules());

        // Only used to load user script for iframes in MV3
        setTimeout(() => {
            dispatchSKEvent('user', ["runUserScript"]);
        }, 100);
    }
    return window.frameId;
};
Mode.init(window === top ? undefined : ()=> {
    window.addEventListener("focus", () => {
        getFrameId();
    }, {once: true});
});

let _browser;
function start(browser) {
    _browser = browser || {
        usePdfViewer: () => {},
        readText: () => {},
    };
    if (window === top) {
        new Promise((r, j) => {
            if (window.location.href === chrome.runtime.getURL("/pages/options.html")) {
                import(/* webpackIgnore: true */ './pages/options.js').then((optionsLib) => {
                    optionsLib.default(
                        RUNTIME,
                        KeyboardUtils,
                        Mode,
                        createElementWithContent,
                        getBrowserName,
                        htmlEncode,
                        initL10n,
                        reportIssue,
                        setSanitizedContent,
                        showBanner);
                    r(_initModules());
                });
            } else {
                r(_initModules());
            }
        }).then((modes) => {
            _initContent(modes);
            const titleManager = (function() {
                var tabIndex = 0,
                    titleOverride = null,
                    originalTitle = document.title,
                    applyingTitle = false,
                    titleObserver;

                function getTitleNode() {
                    var titleNode = document.querySelector("title");
                    if (!titleNode && document.head) {
                        titleNode = document.createElement("title");
                        document.head.appendChild(titleNode);
                    }
                    return titleNode;
                }

                function formatTitle(title) {
                    return tabIndex > 0 ? tabIndex + runtime.conf.tabIndicesSeparator + title : title;
                }

                function applyTitle() {
                    if (titleOverride === null && tabIndex <= 0) {
                        return;
                    }
                    var title = formatTitle(titleOverride !== null ? titleOverride : originalTitle);
                    if (document.title === title) {
                        applyingTitle = false;
                        return;
                    }
                    applyingTitle = true;
                    document.title = title;
                }

                function observeTitle() {
                    if (titleObserver) {
                        return;
                    }
                    var titleNode = getTitleNode();
                    if (!titleNode) {
                        document.addEventListener("DOMContentLoaded", observeTitle, {once: true});
                        return;
                    }
                    titleObserver = new MutationObserver(function() {
                        if (applyingTitle) {
                            applyingTitle = false;
                            if (titleOverride !== null) {
                                applyTitle();
                            }
                        } else if (titleOverride !== null) {
                            applyTitle();
                        } else {
                            originalTitle = document.title;
                            applyTitle();
                        }
                    });
                    titleObserver.observe(titleNode, { childList: true });
                }

                return {
                    apply: applyTitle,
                    init: function(resp) {
                        tabIndex = resp.index || 0;
                        if (resp.titleOverride !== undefined && resp.titleOverride !== null) {
                            titleOverride = resp.titleOverride.toString();
                        }
                        if (titleOverride !== null || tabIndex > 0) {
                            observeTitle();
                            applyTitle();
                        }
                    },
                    rename: function(title) {
                        titleOverride = title == null ? "" : title.toString();
                        observeTitle();
                        applyTitle();
                    },
                    updateIndex: function(index) {
                        if (index !== tabIndex) {
                            tabIndex = index;
                            applyTitle();
                        }
                    }
                };
            })();
            runtime.on('titleChanged', function() {
                Mode.checkEventListener(() => {
                    modes.front.detach();
                    modes = _initModules();
                    _initContent(modes);
                    modes.front.attach();
                    titleManager.apply();
                });
            });
            runtime.on('tabActivated', function() {
                modes.front.attach();
            });
            runtime.on('tabDeactivated', function() {
                modes.front.detach();
            });
            runtime.on('setScrollPos', function(msg, sender, response) {
                setTimeout(() => {
                    document.scrollingElement.scrollLeft = msg.scrollLeft;
                    document.scrollingElement.scrollTop = msg.scrollTop;
                }, 1000);
            });
            runtime.on('showBanner', function(msg, sender, response) {
                showBanner(msg.message, 3000);
            });
            runtime.on('chooseTab', function() {
                modes.front.attach();
                modes.front.chooseTab();
            });
            runtime.on('copyCurrentTabUrl', function() {
                modes.api.copyCurrentTabUrl();
            });
            runtime.on('renameDocumentTitle', function() {
                modes.front.attach();
                modes.front.showEditor("", function(data) {
                    modes.api.renameDocumentTitle(data);
                }, 'input', false, {startInsert: true});
            });
            document.addEventListener("surfingkeys:documentTitleRenamed", function(evt) {
                titleManager.rename(evt.detail.title);
            });
            document.addEventListener("surfingkeys:ensureFrontEnd", function(evt) {
                modes.front.attach();
            });

            RUNTIME('tabURLAccessed', {
                title: document.title,
                url: window.location.href
            }, function (resp) {

                titleManager.init(resp);
                runtime.on('tabIndexChange', function(msg, sender, response) {
                    titleManager.updateIndex(msg.index);
                });
            });

        });
    } else {
        document.addEventListener("surfingkeys:iframeBoot", () => {
            _initContent(_initModules());
        }, {once: true});
    }
}

export { start };
