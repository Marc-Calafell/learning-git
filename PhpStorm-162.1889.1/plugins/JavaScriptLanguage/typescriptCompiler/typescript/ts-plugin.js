/**
 * Entry point for the TypeScript plugin
 */
"use strict";
var service_loader_1 = require('./service-loader');
var ts_session_1 = require("./ts-session");
var logger_impl_1 = require("./logger-impl");
var TypeScriptLanguagePlugin = (function () {
    function TypeScriptLanguagePlugin(state) {
        var loggerImpl = logger_impl_1.createLoggerFromEnv();
        var serviceInfo = service_loader_1.getService(state.serverFolderPath);
        var serviceContext = serviceInfo.context;
        var serverFilePath = serviceInfo.serverFilePath;
        var tsImpl = serviceContext.ts;
        overrideSysDefaults(tsImpl, serverFilePath);
        this._session = ts_session_1.getSession(tsImpl, loggerImpl);
    }
    TypeScriptLanguagePlugin.prototype.onMessage = function (p) {
        this._session.onMessage(p);
    };
    return TypeScriptLanguagePlugin;
}());
var TypeScriptLanguagePluginFactory = (function () {
    function TypeScriptLanguagePluginFactory() {
    }
    TypeScriptLanguagePluginFactory.prototype.create = function (state) {
        return new TypeScriptLanguagePlugin(state);
    };
    return TypeScriptLanguagePluginFactory;
}());
function overrideSysDefaults(ts_impl, serverFolderPath) {
    var pending = [];
    var canWrite = true;
    function writeMessage(s) {
        if (!canWrite) {
            pending.push(s);
        }
        else {
            canWrite = false;
            process.stdout.write(new Buffer(s, "utf8"), setCanWriteFlagAndWriteMessageIfNecessary);
        }
    }
    function setCanWriteFlagAndWriteMessageIfNecessary() {
        canWrite = true;
        if (pending.length) {
            writeMessage(pending.shift());
        }
    }
    // Override sys.write because fs.writeSync is not reliable on Node 4
    ts_impl.sys.write = function (s) { return writeMessage(s); };
    //ts 2.0 compatibility
    ts_impl.sys.setTimeout = setTimeout;
    ts_impl.sys.clearTimeout = clearTimeout;
    ts_impl.sys.getExecutingFilePath = function () {
        return serverFolderPath;
    };
}
var typescriptLanguagePluginFactory = new TypeScriptLanguagePluginFactory();
exports.typescriptLanguagePluginFactory = typescriptLanguagePluginFactory;
