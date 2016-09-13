"use strict";
var fs = require("fs");
exports.isLogEnabled = process.env["TSS_LOG"];
var LoggerImpl = (function () {
    function LoggerImpl(logFilename, level) {
        this.logFilename = logFilename;
        this.level = level;
        this.fd = -1;
        this.seq = 0;
        this.inGroup = false;
        this.firstInGroup = true;
    }
    LoggerImpl.padStringRight = function (str, padding) {
        return (str + padding).slice(0, padding.length);
    };
    LoggerImpl.prototype.close = function () {
        if (this.fd >= 0) {
            fs.close(this.fd);
        }
    };
    LoggerImpl.prototype.perftrc = function (s) {
        this.msg(s, "Perf");
    };
    LoggerImpl.prototype.info = function (s) {
        this.msg(s, "Info");
    };
    LoggerImpl.prototype.startGroup = function () {
        this.inGroup = true;
        this.firstInGroup = true;
    };
    LoggerImpl.prototype.endGroup = function () {
        this.inGroup = false;
        this.seq++;
        this.firstInGroup = true;
    };
    LoggerImpl.prototype.loggingEnabled = function () {
        return !!this.logFilename;
    };
    LoggerImpl.prototype.isVerbose = function () {
        return this.loggingEnabled() && (this.level == "verbose");
    };
    LoggerImpl.prototype.msg = function (s, type) {
        if (type === void 0) { type = "Err"; }
        if (this.fd < 0) {
            if (this.logFilename) {
                try {
                    this.fd = fs.openSync(this.logFilename, "w");
                }
                catch (e) {
                    serverLogger(e.message + " " + e.stack);
                    this.logFilename = null;
                }
            }
        }
        if (this.fd >= 0) {
            s = s + "\n";
            var prefix = LoggerImpl.padStringRight(type + " " + this.seq.toString(), "          ");
            if (this.firstInGroup) {
                s = prefix + s;
                this.firstInGroup = false;
            }
            if (!this.inGroup) {
                this.seq++;
                this.firstInGroup = true;
            }
            var buf = new Buffer(s);
            fs.writeSync(this.fd, buf, 0, buf.length, null);
        }
    };
    return LoggerImpl;
}());
function parseLoggingEnvironmentString(logEnvStr) {
    var logEnv = {};
    var args = logEnvStr.split(" ");
    for (var i = 0, len = args.length; i < (len - 1); i += 2) {
        var option = args[i];
        var value = args[i + 1];
        if (option && value) {
            switch (option) {
                case "-file":
                    logEnv.file = value;
                    break;
                case "-level":
                    logEnv.detailLevel = value;
                    break;
            }
        }
    }
    return logEnv;
}
function createLoggerFromEnv() {
    var fileName = undefined;
    var detailLevel = "normal";
    if (exports.isLogEnabled) {
        try {
            var logEnv = parseLoggingEnvironmentString(exports.isLogEnabled);
            if (logEnv.file) {
                fileName = logEnv.file;
            }
            else {
                fileName = process.cwd() + "/.log" + process.pid.toString();
            }
            if (logEnv.detailLevel) {
                detailLevel = logEnv.detailLevel;
            }
        }
        catch (e) {
            serverLogger(e.message + " " + e.stack);
        }
    }
    return new LoggerImpl(fileName, detailLevel);
}
exports.createLoggerFromEnv = createLoggerFromEnv;
function serverLogger(message) {
    if (exports.isLogEnabled) {
        console.error("TS Process: " + message);
    }
}
exports.serverLogger = serverLogger;
