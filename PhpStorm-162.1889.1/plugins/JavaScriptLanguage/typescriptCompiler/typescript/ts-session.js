"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var logger_impl_1 = require("./logger-impl");
var compile_info_holder_1 = require("./compile-info-holder");
/**
 * Default tsserver implementation doesn't return response in most cases ("open", "close", etc.)
 * we want to override the behaviour and send empty-response holder
 */
var doneRequest = {
    responseRequired: true,
    response: "done"
};
function getSession(ts_impl, logger) {
    var TypeScriptSession = ts_impl.server.Session;
    var TypeScriptProjectService = ts_impl.server.ProjectService;
    var TypeScriptCommandNames = ts_impl.server.CommandNames;
    TypeScriptCommandNames.IDEChangeFiles = "ideChangeFiles";
    TypeScriptCommandNames.IDECompile = "ideCompile";
    TypeScriptCommandNames.IDEGetErrors = "ideGetErr";
    TypeScriptCommandNames.IDEGetErrors = "ideGetErr";
    TypeScriptCommandNames.IDECompletions = "ideCompletions";
    // var 
    var IDESession = (function (_super) {
        __extends(IDESession, _super);
        function IDESession(host, byteLength, hrtime, logger) {
            _super.call(this, host, byteLength, hrtime, logger);
            this._host = host;
            var handler = this.projectService.eventHandler;
            //reuse handler
            this.projectService = new IDEProjectService(host, logger, handler);
        }
        IDESession.prototype.send = function (msg) {
            var json = JSON.stringify(msg);
            this._host.write(json + "\n");
        };
        IDESession.prototype.executeCommand = function (request) {
            if (TypeScriptCommandNames.Open == request.command) {
                //use own implementation
                var openArgs = request.arguments;
                this.openClientFileExt(openArgs);
                return doneRequest;
            }
            else if (TypeScriptCommandNames.ReloadProjects == request.command) {
                this.getIDEProjectService().projectEmittedWithAllFiles = {};
                return _super.prototype.executeCommand.call(this, request);
            }
            else if (TypeScriptCommandNames.IDEChangeFiles == request.command) {
                var updateFilesArgs = request.arguments;
                return this.updateFilesExt(updateFilesArgs);
            }
            else if (TypeScriptCommandNames.IDECompile == request.command) {
                var fileArgs = request.arguments;
                return this.compileFileExt(fileArgs);
            }
            else if (TypeScriptCommandNames.Close == request.command) {
                _super.prototype.executeCommand.call(this, request);
                return doneRequest;
            }
            else if (TypeScriptCommandNames.IDEGetErrors == request.command) {
                var args = request.arguments;
                return { response: { infos: this.getDiagnosticsExt(args.files) }, responseRequired: true };
            }
            else if (TypeScriptCommandNames.IDECompletions == request.command) {
                var result = _super.prototype.executeCommand.call(this, {
                    command: TypeScriptCommandNames.Completions,
                    arguments: request.arguments,
                    seq: request.seq,
                    type: request.type
                });
                var args = request.arguments;
                var response = result.response;
                return {
                    response: this.getIDECompletions(args, response),
                    responseRequired: true
                };
            }
            return _super.prototype.executeCommand.call(this, request);
        };
        IDESession.prototype.updateFilesExt = function (args) {
            var updated = false;
            var files = args.files;
            for (var fileName in files) {
                if (files.hasOwnProperty(fileName)) {
                    var content = files[fileName];
                    if (content) {
                        this.changeFileExt(fileName, content);
                        updated = true;
                    }
                }
            }
            if (args.filesToReloadContentFromDisk) {
                for (var _i = 0, _a = args.filesToReloadContentFromDisk; _i < _a.length; _i++) {
                    var fileName = _a[_i];
                    if (!fileName) {
                        continue;
                    }
                    var file = ts_impl.normalizePath(fileName);
                    this.projectService.closeClientFile(file);
                    logger_impl_1.serverLogger("Reload file from disk " + file);
                    updated = true;
                }
            }
            if (updated) {
                this.updateProjectStructureExt();
            }
            return doneRequest;
        };
        IDESession.prototype.updateProjectStructureExt = function () {
            var _this = this;
            var mySeq = this.getChangeSeq();
            var matchSeq = function (n) { return n === mySeq; };
            setTimeout(function () {
                if (matchSeq(_this.getChangeSeq())) {
                    _this.projectService.updateProjectStructure();
                }
            }, 1500);
        };
        IDESession.prototype.getChangeSeq = function () {
            var anyThis = this;
            var superClassSeq = anyThis.changeSeq;
            if (typeof superClassSeq !== "undefined") {
                return superClassSeq;
            }
            return this._mySeq;
        };
        IDESession.prototype.openClientFileExt = function (openArgs) {
            var fileName = openArgs.file;
            var fileContent = openArgs.fileContent;
            var configFile = openArgs.tsConfig;
            var file = ts_impl.normalizePath(fileName);
            return this.projectService.openClientFileExt(file, fileContent, configFile);
        };
        IDESession.prototype.changeFileExt = function (fileName, content, tsconfig) {
            var file = ts_impl.normalizePath(fileName);
            var project = this.projectService.getProjectForFile(file);
            if (project) {
                var compilerService = project.compilerService;
                var scriptInfo = compilerService.host.getScriptInfo(file);
                if (scriptInfo != null) {
                    scriptInfo.svc.reload(content);
                    logger_impl_1.serverLogger("Reload content from text " + file);
                }
                else {
                    logger_impl_1.serverLogger("ScriptInfo is null " + file);
                }
            }
            else {
                logger_impl_1.serverLogger("Cannot find project for " + file);
                this.openClientFileExt({
                    file: fileName,
                    fileContent: content,
                    tsConfig: tsconfig
                });
            }
        };
        IDESession.prototype.compileFileExt = function (req) {
            var _this = this;
            var startCompile = this.getTime();
            var compileExactFile = req.file != null;
            if (!compileExactFile && !req.tsConfig) {
                return doneRequest;
            }
            var requestedFile = ts_impl.normalizePath(req.file ? req.file : req.tsConfig);
            var project = null;
            if (req.file) {
                project = this.projectService.getProjectForFile(requestedFile);
            }
            else {
                this.projectService.openOrUpdateConfiguredProjectForFile(requestedFile);
                project = this.projectService.findConfiguredProjectByConfigFile(requestedFile);
            }
            logger_impl_1.serverLogger("Get project end time: " + (this.getTime() - startCompile));
            var outFiles = [];
            var diagnostics = req.includeErrors ? [] : undefined;
            if (project) {
                var projectFilename = project.projectFilename;
                var languageService = project.compilerService.languageService;
                var program_1 = languageService.getProgram();
                if (logger_impl_1.isLogEnabled) {
                    logger_impl_1.serverLogger("Get source files end time " + program_1.getSourceFiles().length + "(count): " + (this.getTime() - startCompile) + "ms");
                }
                var compileInfoHolder_1 = this.getIDEProjectService().projectEmittedWithAllFiles[projectFilename];
                compileExactFile = compileExactFile && compileInfoHolder_1 == null;
                if (!compileInfoHolder_1) {
                    compileInfoHolder_1 = new compile_info_holder_1.CompileInfoHolder(ts_impl);
                    this.getIDEProjectService().projectEmittedWithAllFiles[projectFilename] = compileInfoHolder_1;
                }
                if (projectFilename && !compileExactFile) {
                    var toUpdateFiles_1 = [];
                    var rawSourceFiles = program_1.getSourceFiles();
                    rawSourceFiles.forEach(function (val) {
                        if (compileInfoHolder_1.checkUpdateAndAddToCache(val)) {
                            toUpdateFiles_1.push(val);
                        }
                    });
                    var fileWriteCallback_1 = this.getFileWrite(project, outFiles);
                    var compilerOptions = program_1.getCompilerOptions();
                    var useOutFile = compilerOptions && (compilerOptions.outFile || compilerOptions.out);
                    if (toUpdateFiles_1.length > 0) {
                        if (toUpdateFiles_1.length == rawSourceFiles.length || useOutFile) {
                            var emitResult = program_1.emit(undefined, fileWriteCallback_1);
                            diagnostics = this.appendEmitDiagnostics(project, emitResult, diagnostics);
                        }
                        else {
                            toUpdateFiles_1.forEach(function (el) {
                                var emitResult = program_1.emit(el, fileWriteCallback_1);
                                diagnostics = _this.appendEmitDiagnostics(project, emitResult, diagnostics);
                            });
                        }
                    }
                    logger_impl_1.serverLogger("End emit files: " + (this.getTime() - startCompile));
                }
                else {
                    var sourceFile = program_1.getSourceFile(requestedFile);
                    if (sourceFile) {
                        if (compileInfoHolder_1.checkUpdateAndAddToCache(sourceFile)) {
                            var emitResult = project.program.emit(sourceFile, this.getFileWrite(project, outFiles));
                            diagnostics = this.appendEmitDiagnostics(project, emitResult, diagnostics);
                        }
                    }
                    else {
                        logger_impl_1.serverLogger("Can't find source file: shouldn't be happened");
                    }
                }
            }
            else {
                logger_impl_1.serverLogger("Can't find project: shouldn't be happened");
            }
            if (diagnostics !== undefined) {
                diagnostics = diagnostics.concat(compileExactFile ?
                    this.getDiagnosticsExt([requestedFile], project) :
                    this.getProjectDiagnosticsExt(project));
            }
            logger_impl_1.serverLogger("End get diagnostics stage: " + (this.getTime() - startCompile));
            return { response: { generatedFiles: outFiles, infos: diagnostics }, responseRequired: true };
        };
        IDESession.prototype.getIDEProjectService = function () {
            return this.projectService;
        };
        IDESession.prototype.getTime = function () {
            return new Date().getTime();
        };
        IDESession.prototype.appendEmitDiagnostics = function (project, emitResult, diagnostics) {
            if (diagnostics !== undefined && emitResult && emitResult.diagnostics) {
                var emitDiagnostics = emitResult.diagnostics;
                return diagnostics.concat(emitDiagnostics.map(function (el) {
                    return { file: el.file.fileName, diagnostics: [formatDiagnostic(el.file.fileName, project, el)] };
                }));
            }
            return diagnostics;
        };
        IDESession.prototype.getFileWrite = function (project, outFiles) {
            var _this = this;
            return function (fileName, data, writeByteOrderMark, onError, sourceFiles) {
                var normalizedName = ts_impl.normalizePath(fileName);
                _this.ensureDirectoriesExist(ts_impl.getDirectoryPath(normalizedName));
                _this._host.writeFile(normalizedName, data, writeByteOrderMark, onError, sourceFiles);
                outFiles.push(normalizedName);
            };
        };
        IDESession.prototype.logError = function (err, cmd) {
            var typedErr = err;
            logger_impl_1.serverLogger("Error processing message: " + err.message + " " + typedErr.stack);
            _super.prototype.logError.call(this, err, cmd);
        };
        IDESession.prototype.getIDECompletions = function (req, entries) {
            if (!entries) {
                return entries;
            }
            var file = ts_impl.normalizePath(req.file);
            var project = this.projectService.getProjectForFile(file);
            if (!project) {
                logger_impl_1.serverLogger("Can't find project: shouldn't be happened");
                return entries;
            }
            var compilerService = project.compilerService;
            var position = compilerService.host.lineOffsetToPosition(file, req.line, req.offset);
            var count = 0;
            return entries.reduce(function (accum, entry) {
                if (count++ > 20) {
                    accum.push(entry);
                }
                else {
                    var details = compilerService.languageService.getCompletionEntryDetails(file, position, entry.name);
                    if (details) {
                        details.sortText = entry.sortText;
                        accum.push(details);
                    }
                }
                return accum;
            }, []);
        };
        /**
         * Possible we can remove the implementation if we will use 'pull' events
         * now just for test we use 'blocking' implementation
         * to check speed of processing
         * todo use 'pull' implementation
         */
        IDESession.prototype.getDiagnosticsExt = function (fileNames, commonProject) {
            var _this = this;
            var checkList = fileNames.reduce(function (accumulator, fileName) {
                fileName = ts_impl.normalizePath(fileName);
                if (commonProject) {
                    accumulator.push({ fileName: fileName, project: commonProject });
                }
                else {
                    var project = _this.projectService.getProjectForFile(fileName);
                    if (project) {
                        accumulator.push({ fileName: fileName, project: project });
                    }
                }
                return accumulator;
            }, []);
            var result = [];
            if (checkList.length > 0) {
                var _loop_1 = function(checkSpec) {
                    var file = checkSpec.fileName;
                    var project = checkSpec.project;
                    if (project.getSourceFileFromName(file, true)) {
                        var diagnostics = [];
                        var syntacticDiagnostics = project.compilerService.languageService.getSyntacticDiagnostics(file);
                        if (syntacticDiagnostics) {
                            var bakedDiagnostics = syntacticDiagnostics.map(function (el) { return formatDiagnostic(file, checkSpec.project, el); });
                            diagnostics = diagnostics.concat(bakedDiagnostics);
                        }
                        var semanticDiagnostics = project.compilerService.languageService.getSemanticDiagnostics(file);
                        if (semanticDiagnostics) {
                            var bakedSemanticDiagnostics = semanticDiagnostics.map(function (el) { return formatDiagnostic(file, checkSpec.project, el); });
                            diagnostics = diagnostics.concat(bakedSemanticDiagnostics);
                        }
                        result.push({
                            file: file,
                            diagnostics: diagnostics
                        });
                    }
                };
                for (var _i = 0, checkList_1 = checkList; _i < checkList_1.length; _i++) {
                    var checkSpec = checkList_1[_i];
                    _loop_1(checkSpec);
                }
            }
            return result;
        };
        IDESession.prototype.getProjectDiagnosticsExt = function (project) {
            if (!project) {
                return [];
            }
            return this.getDiagnosticsExt(project.getFileNames(), project);
        };
        IDESession.prototype.ensureDirectoriesExist = function (directoryPath) {
            if (directoryPath.length > ts_impl.getRootLength(directoryPath) && !this._host.directoryExists(directoryPath)) {
                var parentDirectory = ts_impl.getDirectoryPath(directoryPath);
                this.ensureDirectoriesExist(parentDirectory);
                this._host.createDirectory(directoryPath);
            }
        };
        return IDESession;
    }(TypeScriptSession));
    var IDEProjectService = (function (_super) {
        __extends(IDEProjectService, _super);
        function IDEProjectService(host, psLogger, eventHandler) {
            _super.call(this, host, psLogger, eventHandler);
            this.projectEmittedWithAllFiles = {};
        }
        IDEProjectService.prototype.openClientFileExt = function (fileName, fileContent, configFileName) {
            if (configFileName) {
                logger_impl_1.serverLogger("Open for specified tsconfig");
                this.openOrUpdateConfiguredProjectForFile(ts_impl.normalizePath(configFileName));
            }
            else {
                logger_impl_1.serverLogger("Try to find tsconfig");
                this.openOrUpdateConfiguredProjectForFile(fileName);
            }
            var info = this.openFile(fileName, /*openedByClient*/ true, fileContent);
            this.addOpenFile(info);
            return info;
        };
        IDEProjectService.prototype.watchedProjectConfigFileChanged = function (project) {
            var projectFilename = project.projectFilename;
            _super.prototype.watchedProjectConfigFileChanged.call(this, project);
            if (projectFilename) {
                this.projectEmittedWithAllFiles[projectFilename] = null;
            }
        };
        IDEProjectService.prototype.configFileToProjectOptions = function (configFilename) {
            function getBaseFileName(path) {
                if (path === undefined) {
                    return undefined;
                }
                var i = path.lastIndexOf(ts_impl.directorySeparator);
                return i < 0 ? path : path.substring(i + 1);
            }
            var configFileToProjectOptions = _super.prototype.configFileToProjectOptions.call(this, configFilename);
            if (configFileToProjectOptions && configFileToProjectOptions.projectOptions) {
                var projectOptions = configFileToProjectOptions.projectOptions;
                var files = projectOptions.files;
                if (files) {
                    var compilerOptions = projectOptions.compilerOptions;
                    var extensions = ts_impl.getSupportedExtensions(compilerOptions);
                    var newFiles = [];
                    l: for (var _i = 0, files_1 = files; _i < files_1.length; _i++) {
                        var file = files_1[_i];
                        var fileName = getBaseFileName(file);
                        for (var _a = 0, extensions_1 = extensions; _a < extensions_1.length; _a++) {
                            var extension = extensions_1[_a];
                            if (fileName.lastIndexOf(extension) > 0) {
                                newFiles.push(file);
                                continue l;
                            }
                        }
                        for (var _b = 0, extensions_2 = extensions; _b < extensions_2.length; _b++) {
                            var extension = extensions_2[_b];
                            if (this.host.fileExists(file + extension)) {
                                newFiles.push(file + extension);
                                continue l;
                            }
                        }
                        newFiles.push(file);
                    }
                    var newOptions = {
                        succeeded: configFileToProjectOptions.succeeded,
                        projectOptions: {
                            compilerOptions: compilerOptions,
                            files: newFiles
                        }
                    };
                    if (configFileToProjectOptions.error) {
                        newOptions.error = configFileToProjectOptions.error;
                    }
                    return newOptions;
                }
            }
            return configFileToProjectOptions;
        };
        return IDEProjectService;
    }(TypeScriptProjectService));
    /**
     * copy formatDiag method (but we use 'TS' prefix)
     */
    function formatDiagnostic(fileName, project, diagnostic) {
        return {
            start: project.compilerService.host.positionToLineOffset(fileName, diagnostic.start),
            end: project.compilerService.host.positionToLineOffset(fileName, diagnostic.start + diagnostic.length),
            text: "TS" + diagnostic.code + ":" + ts_impl.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
        };
    }
    return new IDESession(ts_impl.sys, Buffer.byteLength, process.hrtime, logger);
}
exports.getSession = getSession;
