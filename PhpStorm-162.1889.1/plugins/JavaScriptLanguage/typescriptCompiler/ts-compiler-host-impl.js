var ts;
var typeScriptServiceDirectory;

var logDebugData = true;
var sys;
var storeFactory;

var compilers = {};
var compilerFactory;

function initProcess(lPathToTypeScriptService, lSessionId) {
  ts = initServicesContext(lPathToTypeScriptService).ts;
  sys = ts.sys;
  if (typeof sys === "undefined") {
    return new Error('Cannot init sys');
  }
  if (typeof sys.useCaseSensitiveFileNames === "undefined") {
    return new Error('Cannot init sys properties');
  }

  typeScriptServiceDirectory = ts.normalizePath(lPathToTypeScriptService);
  compilerFactory = require('./compilerFactory.js');
  storeFactory = require('./store.js');

  return null;
}

function compileFile(sentObject) {
  var compilerId = sentObject.compilerId;

  var compiler = getCompiler(compilerId);

  if (compiler == null) {
    var resultObject = {}
    resultObject.command = 'compile';
    if (compilerId == 'default') {
      if (logDebugData) console.log("Cannot find config for id " + compilerId);

      sentObject.filesToCompile.forEach(function (file) {
        var diagnostic = {};
        diagnostic.filename = file;
        diagnostic.category = "warning";
        diagnostic.message = "File was not compiled because there is no a reference from tsconfig.json";
        if (resultObject.dataArray && resultObject.dataArray.length > 0) {
          resultObject['dataArray'].unshift(diagnostic);
        }
        else {
          resultObject['dataArray'] = [diagnostic];
        }
      });
    } else {
      resultObject.noInfo = true;
    }
    return JSON.stringify(resultObject);
  }
  return compiler.compileFile(sentObject);
}

function clean(sentObject) {
  var compilerId = sentObject.compilerId;
  if (compilerId) {
    if (compilers[compilerId]) {
      if (compilerId == "default") {
        compilers[compilerId].resetStore(sentObject);
      }
      else {
        if (logDebugData) {
          console.log("delete config " + compilerId);
        }
        delete compilers[compilerId];
      }
    }
  }
  else {
    if (sentObject.all) {
      if (logDebugData) console.log("Clean all configs")
      defaultCompiler = compilers["default"];

      compilers = {}

      if (defaultCompiler) {
        defaultCompiler.resetStore(sentObject);
        compilers["default"] = defaultCompiler;
      }

    } else {
      Object.keys(compilers).forEach(function (v) {
        compilers[v].resetStore(sentObject);
      })
    }
  }
}

function createCompiler(id, params, args) {
  var compiler = compilers[id];
  //noinspection EqualityComparisonWithCoercionJS
  if (compiler != null) {
    return compiler;
  }

  if (logDebugData) console.log("Create compiler subprocess for id " + id);

  compiler = compilerFactory.createCompiler(sys,
                                            ts,
                                            typeScriptServiceDirectory,
                                            storeFactory,
                                            args,
                                            params,
                                            id);
  compilers[id] = compiler;

  return compiler;
}

function getCompiler(id) {
  var compiler = compilers[id];
  if (compiler != null) {
    return compiler;
  }

  if (id == "default") {
    //get any
    Object.keys(compilers).forEach(function (curr) {
      if (compiler == null) {
        compiler = compilers[curr];
      }
    });
  }

  return compiler;
}

function initServicesContext(lPathToTypeScriptService) {

  var serviceLoader = require('./typescript/service-loader');
  var service = serviceLoader.getService(lPathToTypeScriptService, true);

  if (!service) {
    throw new Error('ERROR_BRIDGE: Cannot find typescript service implementation in the file ' + pathToServicesFile);
  }
  var context = service.context;

  commandLine(context.ts);
  return context;
}


var commandLine = (function (ts) {
  ts.optionDeclarationsInner = [
    {
      name: "charset",
      type: "string"
    },
    {
      name: "codepage",
      type: "number"
    },
    {
      name: "declaration",
      shortName: "d",
      type: "boolean",
      description: ts.Diagnostics.Generates_corresponding_d_ts_file
    },
    {
      name: "diagnostics",
      type: "boolean"
    },
    {
      name: "emitBOM",
      type: "boolean"
    },
    {
      name: "help",
      shortName: "h",
      type: "boolean",
      description: ts.Diagnostics.Print_this_message
    },
    {
      name: "locale",
      type: "string"
    },
    {
      name: "mapRoot",
      type: "string",
      description: ts.Diagnostics.Specifies_the_location_where_debugger_should_locate_map_files_instead_of_generated_locations,
      paramType: ts.Diagnostics.LOCATION
    },
    {
      name: "module",
      shortName: "m",
      type: {
        "commonjs": 1 /* CommonJS */,
        "amd": 2 /* AMD */
      },
      description: ts.Diagnostics.Specify_module_code_generation_Colon_commonjs_or_amd,
      paramType: ts.Diagnostics.KIND,
      error: ts.Diagnostics.Argument_for_module_option_must_be_commonjs_or_amd
    },
    {
      name: "noEmitOnError",
      type: "boolean",
      description: ts.Diagnostics.Do_not_emit_outputs_if_any_type_checking_errors_were_reported
    },
    {
      name: "noImplicitAny",
      type: "boolean",
      description: ts.Diagnostics.Warn_on_expressions_and_declarations_with_an_implied_any_type
    },
    {
      name: "noLib",
      type: "boolean"
    },
    {
      name: "noLibCheck",
      type: "boolean"
    },
    {
      name: "noResolve",
      type: "boolean"
    },
    {
      name: "out",
      type: "string",
      description: ts.Diagnostics.Concatenate_and_emit_output_to_single_file,
      paramType: ts.Diagnostics.FILE
    },
    {
      name: "outDir",
      type: "string",
      description: ts.Diagnostics.Redirect_output_structure_to_the_directory,
      paramType: ts.Diagnostics.DIRECTORY
    },
    {
      name: "preserveConstEnums",
      type: "boolean",
      description: ts.Diagnostics.Do_not_erase_const_enum_declarations_in_generated_code
    },
    {
      name: "removeComments",
      type: "boolean",
      description: ts.Diagnostics.Do_not_emit_comments_to_output
    },
    {
      name: "sourceMap",
      type: "boolean",
      description: ts.Diagnostics.Generates_corresponding_map_file
    },
    {
      name: "sourceRoot",
      type: "string",
      description: ts.Diagnostics.Specifies_the_location_where_debugger_should_locate_TypeScript_files_instead_of_source_locations,
      paramType: ts.Diagnostics.LOCATION
    },
    {
      name: "suppressImplicitAnyIndexErrors",
      type: "boolean",
      description: ts.Diagnostics.Suppress_noImplicitAny_errors_for_indexing_objects_lacking_index_signatures
    },
    {
      name: "target",
      shortName: "t",
      type: {"es3": 0 /* ES3 */, "es5": 1 /* ES5 */, "es6": 2 /* ES6 */},
      description: ts.Diagnostics.Specify_ECMAScript_target_version_Colon_ES3_default_ES5_or_ES6_experimental,
      paramType: ts.Diagnostics.VERSION,
      error: ts.Diagnostics.Argument_for_target_option_must_be_es3_es5_or_es6
    },
    {
      name: "version",
      shortName: "v",
      type: "boolean",
      description: ts.Diagnostics.Print_the_compiler_s_version
    },
    {
      name: "watch",
      shortName: "w",
      type: "boolean",
      description: ts.Diagnostics.Watch_input_files
    }
  ];
  var shortOptionNames = {};
  var optionNameMap = {};
  ts.forEach(ts.optionDeclarationsInner, function (option) {
    optionNameMap[option.name.toLowerCase()] = option;
    if (option.shortName) {
      shortOptionNames[option.shortName] = option.name;
    }
  });
  function parseCommandLineHost(commandLine) {
    // Set default compiler option values
    var options = {
      target: 0 /* ES3 */,
      module: 0 /* None */
    };
    var errors = [];
    parseStrings(commandLine);
    return {
      options: options,
      errors: errors
    };
    function parseStrings(args) {
      var i = 0;
      while (i < args.length) {
        var s = args[i++];
        if (s.charCodeAt(0) === 64 /* at */) {
          parseResponseFile(s.slice(1));
        }
        else if (s.charCodeAt(0) === 45 /* minus */) {
          s = s.slice(s.charCodeAt(1) === 45 /* minus */ ? 2 : 1).toLowerCase();
          if (ts.hasProperty(shortOptionNames, s)) {
            s = shortOptionNames[s];
          }
          if (ts.hasProperty(optionNameMap, s)) {
            var opt = optionNameMap[s];
            if (!args[i] && opt.type !== "boolean") {
              errors.push(ts.createCompilerDiagnostic(ts.Diagnostics.Compiler_option_0_expects_an_argument, opt.name));
            }
            switch (opt.type) {
              case "number":
                options[opt.name] = parseInt(args[i++]);
                break;
              case "boolean":
                options[opt.name] = true;
                break;
              case "string":
                options[opt.name] = args[i++] || "";
                break;
              default:
                var value = (args[i++] || "").toLowerCase();
                if (ts.hasProperty(opt.type, value)) {
                  options[opt.name] = opt.type[value];
                }
                else {
                  errors.push(ts.createCompilerDiagnostic(opt.error));
                }
            }
          }
          else {
            if (s == "project" ||
                s == "p") {
              throw new Error('Typescript 1.4 does not have tsconfig.json support');
            }
            //if option is unknown we cannot report error (may be a new parameter)
            if (args[i] && args[i].charCodeAt(0) !== 45) {
              options[s] = args[i++];
            }
            else {
              options[s] = true;
            }
          }
        }
      }
    }

    function parseResponseFile(filename) {
      var text = sys.readFile(filename);
      if (!text) {
        errors.push(ts.createCompilerDiagnostic(ts.Diagnostics.File_0_not_found, filename));
        return;
      }
      var args = [];
      var pos = 0;
      while (true) {
        while (pos < text.length && text.charCodeAt(pos) <= 32 /* space */) {
          pos++;
        }
        if (pos >= text.length) {
          break;
        }
        var start = pos;
        if (text.charCodeAt(start) === 34 /* doubleQuote */) {
          pos++;
          while (pos < text.length && text.charCodeAt(pos) !== 34 /* doubleQuote */) {
            pos++;
          }
          if (pos < text.length) {
            args.push(text.substring(start + 1, pos));
            pos++;
          }
          else {
            errors.push(ts.createCompilerDiagnostic(ts.Diagnostics.Unterminated_quoted_string_in_response_file_0, filename));
          }
        }
        else {
          while (text.charCodeAt(pos) > 32 /* space */) {
            pos++;
          }
          args.push(text.substring(start, pos));
        }
      }
      parseStrings(args);
    }
  }

  ts.parseCommandLineHost = parseCommandLineHost;
});


exports.initProcess = initProcess;
exports.getCompiler = getCompiler;
exports.createCompiler = createCompiler;
exports.compileFile = compileFile;
exports.clean = clean;
