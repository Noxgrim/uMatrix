/*******************************************************************************

    uMatrix - a browser extension to block requests.
    Copyright (C) 2014-2017 The uMatrix/uBlock Origin authors

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uMatrix
*/

/* jshint esnext: true */
/* global addMessageListener, removeMessageListener, sendAsyncMessage */

// For non background pages

'use strict';

/******************************************************************************/

(function(self) {

/******************************************************************************/

// https://bugs.chromium.org/p/project-zero/issues/detail?id=1225&desc=6#c10
if ( self.vAPI === undefined || self.vAPI.uMatrix !== true ) {
    self.vAPI = { uMatrix: true };
}

var vAPI = self.vAPI;
vAPI.firefox = true;
vAPI.sessionId = String.fromCharCode(Date.now() % 25 + 97) +
    Math.random().toString(36).slice(2);

/******************************************************************************/

vAPI.setTimeout = vAPI.setTimeout || function(callback, delay) {
    return setTimeout(function() { callback(); }, delay);
};

/******************************************************************************/

vAPI.shutdown = (function() {
    var jobs = [];

    var add = function(job) {
        jobs.push(job);
    };

    var exec = function() {
        //console.debug('Shutting down...');
        var job;
        while ( (job = jobs.pop()) ) {
            job();
        }
    };

    return {
        add: add,
        exec: exec
    };
})();

/******************************************************************************/

var messagingConnector = function(response) {
    if ( !response ) {
        return;
    }

    var channels = vAPI.messaging.channels;
    var channel, listener;

    if ( response.broadcast && !response.channelName ) {
        for ( channel in channels ) {
            if ( channels.hasOwnProperty(channel) === false ) {
                continue;
            }
            listener = channels[channel].listener;
            if ( typeof listener === 'function' ) {
                listener(response.msg);
            }
        }
        return;
    }

    if ( response.requestId ) {
        listener = vAPI.messaging.listeners[response.requestId];
        delete vAPI.messaging.listeners[response.requestId];
        delete response.requestId;
    }

    if ( !listener ) {
        channel = channels[response.channelName];
        listener = channel && channel.listener;
    }

    if ( typeof listener === 'function' ) {
        listener(response.msg);
    }
};

/******************************************************************************/

vAPI.messaging = {
    channels: {},
    listeners: {},
    requestId: 1,

    setup: function() {
        this.connector = function(msg) {
            messagingConnector(JSON.parse(msg));
        };

        addMessageListener(this.connector);

        this.channels.vAPI = {
            listener: function(msg) {
                if ( typeof msg.cmd === 'string' && msg.cmd === 'injectScript' ) {
                    var details = msg.details;
                    if ( !details.allFrames && window !== window.top ) {
                        return;
                    }
                    self.injectScript(details.file);
                }
            }
        };
    },

    close: function() {
        if ( !this.connector ) {
            return;
        }

        removeMessageListener();
        this.connector = null;
        this.channels = {};
        this.listeners = {};
    },

    channel: function(channelName, callback) {
        if ( !channelName ) {
            return;
        }

        this.channels[channelName] = {
            channelName: channelName,
            listener: typeof callback === 'function' ? callback : null,
            send: function(message, callback) {
                if ( !vAPI.messaging.connector ) {
                    vAPI.messaging.setup();
                }

                message = {
                    channelName: self._sandboxId_ + '|' + this.channelName,
                    msg: message
                };

                if ( callback ) {
                    message.requestId = vAPI.messaging.requestId++;
                    vAPI.messaging.listeners[message.requestId] = callback;
                }

                sendAsyncMessage('umatrix:background', message);
            },
            close: function() {
                delete vAPI.messaging.channels[this.channelName];
            }
        };

        return this.channels[channelName];
    },

    toggleListener: function({type, persisted}) {
        if ( !vAPI.messaging.connector ) {
            return;
        }

        if ( type === 'pagehide' ) {
            removeMessageListener();
            return;
        }

        if ( persisted ) {
            addMessageListener(vAPI.messaging.connector);
        }
    }
};

window.addEventListener('pagehide', vAPI.messaging.toggleListener, true);
window.addEventListener('pageshow', vAPI.messaging.toggleListener, true);

/******************************************************************************/

// No need to have vAPI client linger around after shutdown if
// we are not a top window (because element picker can still
// be injected in top window).
if ( window !== window.top ) {
    // Can anything be done?
}

/******************************************************************************/

})(this);

/******************************************************************************/
