import {
    getVisibleElements,
    initSKFunctionListener,
} from './utils.js';

import Mode from './mode';

function getParentElementAcrossShadowRoot(elm) {
    if (elm.parentElement) {
        return elm.parentElement;
    }
    const rootNode = elm.getRootNode && elm.getRootNode();
    return rootNode && rootNode.host && rootNode.host.nodeType === Node.ELEMENT_NODE ? rootNode.host : null;
}

export function isElementPositionRelative(elm) {
    while (elm && elm !== document.body) {
        if (elm.nodeType !== Node.ELEMENT_NODE) {
            elm = getParentElementAcrossShadowRoot(elm);
            continue;
        }
        if (getComputedStyle(elm).position === "relative") {
            return true;
        }
        elm = getParentElementAcrossShadowRoot(elm);
    }
    return false;
}

function startScrollNodeObserver(normal) {
    var pendingUpdater = undefined, DOMObserver = new MutationObserver(function (mutations) {
        var addedNodes = [];
        for (var m of mutations) {
            for (var n of m.addedNodes) {
                if (n.nodeType === Node.ELEMENT_NODE && !n.fromSurfingKeys) {
                    n.newlyCreated = true;
                    addedNodes.push(n);
                }
            }
        }

        if (addedNodes.length) {
            if (pendingUpdater) {
                clearTimeout(pendingUpdater);
                pendingUpdater = undefined;
            }
            pendingUpdater = setTimeout(function() {
                var possibleModalElements = getVisibleElements(function(e, v) {
                    var br = e.getBoundingClientRect();
                    if (br.width > 300 && br.height > 300
                        && br.width <= window.innerWidth && br.height <= window.innerHeight
                        && br.top >= 0 && br.left >= 0
                        && Mode.hasScroll(e, 'y', 16)
                        && isElementPositionRelative(e)
                    ) {
                        v.push(e);
                    }
                });

                if (possibleModalElements.length) {
                    normal.addScrollableElement(possibleModalElements[0]);
                }
            }, 200);
        }
    });
    DOMObserver.isConnected = false;

    initSKFunctionListener("observer", {
        turnOn: () => {
            if (!DOMObserver.isConnected) {
                DOMObserver.observe(document, { childList: true, subtree:true });
                DOMObserver.isConnected = true;
            }
        },
        turnOff: () => {
            if (DOMObserver.isConnected) {
                DOMObserver.disconnect();
                DOMObserver.isConnected = false;
            }
        },
    });
}

export default startScrollNodeObserver;
