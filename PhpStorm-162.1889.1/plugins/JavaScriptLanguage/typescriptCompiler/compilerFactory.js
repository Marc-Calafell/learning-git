var logDebugData = true;

function createCompiler(sys, ts, serviceDirectory, storeFactory, args, params, sessionId) {


  var firstCreatedCompilerHost;
  var program;
  var compiledFileList;
  var cachedFileList;
  var contentRoot = null;
  var sourceRoot = null;
  var forceCompilation = null;
  var mainFile;
  var configState;
  var options;
  var currentDirectory;
  var pathProcessor;

  function getCurrentDirectory() {
    if (!currentDirectory) {
      currentDirectory = sys.getCurrentDirectory();
    }
    return currentDirectory;
  }

  function normalizePathIfNeed(file) {
    if (0 === ts.getRootLength(file)) {
      return ts.getNormalizedAbsolutePath(file, getCurrentDirectory());
    }

    return file;
  }

  function resetStore(options) {
    if (configState && configState.lastMod) {
      configState.lastMod = -1;
    }
    store.reset(options);
  }


  function getSourceCommon(filename, languageVersion, onError, sourceFiles) {
    if (compiledFileList) {
      compiledFileList.push(normalizePathIfNeed(filename));
    }
    var sourceFile = store.getSourceFile(filename, languageVersion, onError, sourceFiles);
    if (sourceFile && sourceFile.cacheMarker) {
      cachedFileList.push(sourceFile.file);

      return sourceFile.file;
    }

    return sourceFile;
  }

  function createCompilerHost(options, sourceFiles) {
    var existingDirectories = {};


    function writeFile(fileName, data, writeByteOrderMark, onError) {
      if (logDebugData) {
        console.log('Default file path ' + fileName);
      }
      function directoryExists(directoryPath) {
        if (ts.hasProperty(existingDirectories, directoryPath)) {
          return true;
        }
        if (sys.directoryExists(directoryPath)) {
          existingDirectories[directoryPath] = true;
          return true;
        }
        return false;
      }

      function ensureDirectoriesExist(directoryPath) {
        if (directoryPath.length > ts.getRootLength(directoryPath) && !directoryExists(directoryPath)) {
          var parentDirectory = ts.getDirectoryPath(directoryPath);
          ensureDirectoriesExist(parentDirectory);
          sys.createDirectory(directoryPath);
        }
      }

      //noinspection AssignmentToFunctionParameterJS
      fileName = fixNameWithProcessor(fileName, onError);

      try {
        ensureDirectoriesExist(ts.getDirectoryPath(ts.normalizePath(fileName)));
        if (emitFilesArray) {
          emitFilesArray.push(normalizePathIfNeed(fileName));
        }
        if (logDebugData) {
          console.log('Write file ' + fileName);
        }
        sys.writeFile(fileName, data, writeByteOrderMark);
      }
      catch (e) {
        if (onError) {
          onError(e.message);
        }
      }
    }

    function fixNameWithProcessor(filename, onError) {
      if (pathProcessor) {
        //noinspection AssignmentToFunctionParameterJS
        filename = pathProcessor.getExpandedPath(filename, contentRoot, sourceRoot, onError);
      }
      return filename;
    }

    var compilerHost = ts.createCompilerHost ? ts.createCompilerHost({}) : {};
    compilerHost.getSourceFile = function (filename, languageVersion, onError) {
      return getSourceCommon(filename, languageVersion, onError, sourceFiles);
    }
    compilerHost.getDefaultLibFileName = function () {
      return ts.combinePaths(ts.normalizePath(serviceDirectory), options.target === 2 /* ES6 */ ? "lib.es6.d.ts" : "lib.d.ts");
    }
    compilerHost.getNewLine = function () {
      if (ts.getNewLineCharacter) {
        return ts.getNewLineCharacter(options);
      }

      return sys.newLine;
    }
    compilerHost.getDefaultLibLocation = function () {
      return ts.normalizePath(serviceDirectory)
    }
    compilerHost.useCaseSensitiveFileNames = function () {
      return sys.useCaseSensitiveFileNames;
    }
    compilerHost.writeFile = writeFile;
    compilerHost.getCurrentDirectory = getCurrentDirectory;
    compilerHost.getCanonicalFileName = getCanonicalFileName;
    compilerHost.fileExists = function (filename) {
      return sys.fileExists(filename);
    }
    compilerHost.readFile = function (filename) {
      return sys.readFile(filename);
    }
    return compilerHost;
  }

  function getCanonicalFileName(fileName) {
    return sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase();
  }

  function compileFile(sentObject) {
    if (currentDirectory && (process.cwd() != currentDirectory)) {
      if (logDebugData) {
        console.log("changed dir to " + currentDirectory);
      }

      process.chdir(currentDirectory);
    }
    compiledFileList = [];
    cachedFileList = [];
    var filesToCompile = sentObject.filesToCompile;
    var sourceFiles = sentObject.unsavedFilesContent;
    contentRoot = sentObject.contentRoot;
    sourceRoot = sentObject.sourceRoot;
    forceCompilation = (sentObject.sendCompileFiles) ? true : false;
    if (filesToCompile === null) {
      return JSON.stringify({command: 'compile'});
    }

    if (filesToCompile.length == 0 &&
        (!(sentObject.compilerId) || sentObject.compilerId == "default")) {
      return JSON.stringify({command: 'compile'});
    }

    var paths;
    if (mainFile) {
      paths = [mainFile];
    }
    else if (configState) {
      if (configState.lastMod) {
        var lastModified = storeFactory.getLastModified(configState.config);
        if (lastModified) {
          if (configState.lastMod != lastModified) {
            configState = getConfigState(sys, ts, storeFactory, configState.config);
          }
        }
      }
      paths = configState.parseResult.fileNames;
    }
    else {
      paths = filesToCompile;
    }

    var normalizedSourceFiles = {};
    Object.keys(sourceFiles).forEach(function (v) {
      normalizedSourceFiles[ts.normalizePath(v)] = sourceFiles[v];
    });

    var resultObject;
    //noinspection EqualityComparisonWithCoercionJS
    if (program == null) {
      var createdHost = createCompilerHost(options, normalizedSourceFiles);
      program = ts.createProgram(paths, options, createdHost);
      firstCreatedCompilerHost = createdHost;
      resultObject = processResult(options);
    }
    else {
      resultObject = recompile(paths, normalizedSourceFiles);
    }

    if ((mainFile || configState) && compiledFileList) {

      filesToCompile.forEach(function (currentFile) {
        var normalizedCurrentPath = ts.normalizePath(currentFile);
        //there is emit file
        var exist = false;
        compiledFileList.forEach(function (v) {
          var path = normalizePathIfNeed(ts.normalizePath(v));

          if (normalizedCurrentPath == path) {
            exist = true;
          }
        });

        if (!exist) {
          var diagnostic = {};
          diagnostic.filename = currentFile;
          diagnostic.category = "warning";
          diagnostic.message =
              "File was not compiled because there is no a reference" + (mainFile ? " from main file" : " from tsconfig.json");
          if (resultObject.dataArray && resultObject.dataArray.length > 0) {
            resultObject['dataArray'].unshift(diagnostic);
          }
          else {
            resultObject['dataArray'] = [diagnostic];
          }
        }
      });
    }
    if (sentObject.sendCompileFiles) {
      resultObject.compiledFiles = compiledFileList;
    }

    compiledFileList = [];
    cachedFileList = [];
    return JSON.stringify(resultObject);
  }

  function recompile(changedFiles, sourceFiles) {
    var newCompilerHost = ts.clone(firstCreatedCompilerHost);
    newCompilerHost.getSourceFile = function (filename, languageVersion, onError) {
      return getSourceCommon(filename, languageVersion, onError, sourceFiles);
    };

    program = ts.createProgram(changedFiles, options, newCompilerHost);
    return processResult(options);
  }


  function init() {
    var parseResult;

    //compatibility 1.4-> 1.5 flag
    var newConfig = false;
    if (ts.parseCommandLine) {
      parseResult = ts.parseCommandLine(args);
      newConfig = true;
    }
    else {
      parseResult = ts.parseCommandLineHost(args);
    }
    options = parseResult.options;

    currentDirectory = params.projectPath;

    if (newConfig) {
      configState = getConfig(sys, ts, storeFactory, parseResult);
    }

    if (configState) {

      options = ts.extend(options, configState.parseResult.options);
    }

    store = storeFactory.getStore(ts, sys, options, getCurrentDirectory);

    mainFile = params.mainFilePath;
    if (params.outPath) {
      var getPathProcessor = require('./out-path-process.js').getPathProcessor;
      pathProcessor = getPathProcessor(ts, sys, params);
    }

    if (parseResult.errors.length > 0) {
      return parseResult.errors;
    }

    return null;
  }


  function processResult(compilerOptions) {
    var result = {};
    result.dataArray = [];
    result.command = 'compile';
    var startTime;
    if (logDebugData) {
      startTime = Date.now();
    }
    var emitFiles;
    emitFilesArray = [];
    var diagnostics = [];
    var syntax = program.getSyntacticDiagnostics();
    if (syntax) {
      diagnostics = diagnostics.concat(syntax);
    }

    // If we didn't have any syntactic errors, then also try getting the global and
    // semantic errors.
    var global = program.getGlobalDiagnostics();
    if (global) {
      diagnostics = diagnostics.concat(global);
    }
    var semantic = program.getSemanticDiagnostics();
    if (semantic) {
      diagnostics = diagnostics.concat(semantic);
    }

    if (logDebugData) {
      console.log("Diagnostic time " + (Date.now() - startTime));
    }

    // If the user doesn't want us to emit, then we're done at this point.
    if (compilerOptions.noEmit ||
        (compilerOptions.ws_compileOnSave === false) && !forceCompilation) {
      if (logDebugData) {
        console.log("Skip emit files")
      }
      reportDiagnostics(result, ts.sortAndDeduplicateDiagnostics(diagnostics));
      return result;
    }

    ts.forEach(program.getSourceFiles(), function (sourceFile) {
      if (cachedFileList.indexOf(sourceFile) == -1) {
        var outResult = program.emit(sourceFile);
        diagnostics = diagnostics.concat(outResult.diagnostics);
      }
      else {
        if (logDebugData) {
          console.log("No emit for file " + sourceFile.fileName);
        }
      }
    });

    reportDiagnostics(result, ts.sortAndDeduplicateDiagnostics(diagnostics));

    emitFiles = emitFilesArray;
    emitFilesArray = null;


    result.emitFiles = emitFiles;
    if (logDebugData) {
      console.log('Total process result time ' + (Date.now() - startTime));
    }
    return result;
  }


  function reportDiagnostics(resultObject, diagnostics) {
    if (diagnostics != null) {
      for (var i = 0; i < diagnostics.length; i++) {
        var diagnostic = diagnostics[i];
        var resultDiagnostic = {};
        if (diagnostic.file) {
          var file = diagnostic.file;

          //ts 1.4 filename ts 1.5 fileName
          if (file.filename) {
            resultDiagnostic.filename = normalizePathIfNeed(file.filename);
          }
          else {
            resultDiagnostic.filename = normalizePathIfNeed(file.fileName);
          }
          var loc;
          if (file.getLineAndCharacterFromPosition) {
            loc = file.getLineAndCharacterFromPosition(diagnostic.start);
            resultDiagnostic.line = loc.line;
            resultDiagnostic.column = loc.character;
          }
          else {
            loc = ts.getLineAndCharacterOfPosition(file, diagnostic.start);
            resultDiagnostic.line = loc.line + 1;
            resultDiagnostic.column = loc.character + 1;
          }
        }
        resultDiagnostic.category = ts.DiagnosticCategory[diagnostic.category].toLowerCase();
        var textMessage = "";
        if (typeof diagnostic.messageText === "string") {
          textMessage = diagnostic.messageText;
        }
        else {
          //noinspection EqualityComparisonWithCoercionJS
          if (diagnostic.messageText != null && diagnostic.messageText.messageText != null) {
            textMessage = getTextFromMessageTextJson(diagnostic.messageText);

          }
        }

        resultDiagnostic.message = "TS" + diagnostic.code + ": " + textMessage;
        resultObject.dataArray.push(resultDiagnostic);
      }
    }
    return resultObject;
  }


  if (logDebugData) console.log("Start initialization")
  init();
  if (logDebugData) console.log("End initialization")

  return {
    compileFile: compileFile,
    resetStore: resetStore
  }
}

function getConfigState(sys, ts, storeRequire, configFileName) {
  var result = ts.readConfigFile(configFileName, sys.readFile);
  if (result.error) {
    throw new Error("Cannot read tsconfig " + JSON.stringify(result.error));
  }

  var configParseResult;
  var configObject;
  //ts1.5beta - result , ts1.5 - result.config
  if (result.config) {
    configObject = result.config;
    if (ts.parseConfigFile) {
      //ts1.5-1.7
      configParseResult = ts.parseConfigFile(configObject, sys, ts.getDirectoryPath(configFileName));
    }
    else {
      //ts1.8
      configParseResult = ts.parseJsonConfigFileContent(configObject, sys, ts.getDirectoryPath(configFileName), null, configFileName);
      if (configObject &&
          configObject.hasOwnProperty("compileOnSave") &&
          configParseResult.options) {
        configParseResult.options.ws_compileOnSave = configObject["compileOnSave"];
      }
    }
  }
  else {
    configObject = result;
    configParseResult = ts.parseConfigFile(configObject, ts.getDirectoryPath(configFileName));
  }
  if (configParseResult.errors && configParseResult.errors.length > 0) {
    throw new Error("Parse tsconfig error " + JSON.stringify(configParseResult.errors));
  }


  return {
    config: configFileName,
    parseResult: configParseResult,
    lastMod: storeRequire.getLastModified(configFileName)
  }
}


function getConfig(sys, ts, storeRequire, parseResult) {

  if (logDebugData) {
    console.log("Start parse config");
  }

  if (parseResult.options.project) {
    var configFileName = "tsconfig.json";
    if (parseResult.options.project != "tsconfig.json") {
      configFileName = ts.normalizePath(ts.combinePaths(parseResult.options.project, "tsconfig.json"));
    }

    return getConfigState(sys, ts, storeRequire, configFileName);
  }

  return null;
}

function getTextFromMessageTextJson(jsonText) {
  var result = "";
  var first = true;

  //noinspection EqualityComparisonWithCoercionJS
  while (jsonText != null) {
    if (jsonText.messageText) {
      if (first) {
        result += jsonText.messageText;
        first = false;
      }
      else {
        result += '\n ' + jsonText.messageText;
      }
    }
    jsonText = jsonText.next;
  }

  return result;
}

exports.createCompiler = createCompiler;





