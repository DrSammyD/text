/**
 * @license RequireJS text 2.0.13+ Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/requirejs/text for details
 */
/*jslint regexp: true */
/*global require, XMLHttpRequest, ActiveXObject,
  define, window, process, Packages,
  java, location, Components, FileUtils */

define(['module'], function (module) {
    'use strict';

    var text, fs, Cc, Ci, xpcIsWindows,
        progIds = ['Msxml2.XMLHTTP', 'Microsoft.XMLHTTP', 'Msxml2.XMLHTTP.4.0'],
        exportRegExp = /(<!--\s*?export\s+?name[\:\=]([\'\"])[a-zA-Z]+?[\w\.]*?\2\s*?-->)[\s\S]+?((?=<!--\s*?export(\s+?name[\:\=]([\'\"])[a-zA-Z]+?[\w\.]*?\5)?\s*?-->)|(?:(?![\S\s])))/g,
        xmlRegExp = /^\s*<\?xml(\s)+version=[\'\"](\d)*.(\d)*[\'\"](\s)*\?>/im,
        bodyRegExp = /<body[^>]*>\s*([\s\S]+)\s*<\/body>/im,
        hasLocation = typeof location !== 'undefined' && location.href,
        defaultProtocol = hasLocation && location.protocol && location.protocol.replace(/\:/, ''),
        defaultHostName = hasLocation && location.hostname,
        defaultPort = hasLocation && (location.port || undefined),
        buildMap = {},
        masterConfig = (module.config && module.config()) || {};
    var makeImportReplace = function(match, importName, importPath) {
        var imp= function(importedContent, content, includePath) {
            if (!includePath) {
                for (var i = 0; i < importPath.length; i++) {
                    importedContent = importedContent[importPath[i]];
                }
            }
            else{
                importedContent = importedContent+(importPath.length? ('.'+importPath.join('.')) : '')+'+\'';
            }
            return content.substring(0, match.index) + importedContent +content.substring(match[0].length+match.index);  
        };
        imp.importName=importName;
        return imp;
    };

    text = {
        version: '2.0.13+',

        strip: function (content) {
            //Strips <?xml ...?> declarations so that external SVG and XML
            //documents can be added to a document without worry. Also, if the string
            //is an HTML document, only the part inside the body tag is returned.
            if (content) {
                content = content.replace(xmlRegExp, "");
                var matches = content.match(bodyRegExp);
                if (matches) {
                    content = matches[1];
                }
            } else {
                content = "";
            }
            return content;
        },
        exp: function (content) {
            //finds all <!-- export name:"property" --> declarations so that
            //the module will export strings found until the next 
            //export comment or until the end of document with the 
            //name:"property" attribute being the property of the exported object
            //if no name attribute exists, then it will not be exported
            //so an empty export can be used to end a previous export
            //without creating a new one
            var exports = null;
            var objTraverse=null;
            if (content) {
                var matches = content.match(exportRegExp) || [],
                    match, _i, _len;
                exports = matches.length ? {} : null;
                for (_i = 0, _len = matches.length; _i < _len; _i++) {
                    match = matches[_i];
                    var exportName = match.match(/(<!--\s*?export\s*?name[\:\=](['"]))(.*?)\2\s*?-->/);
                    exportName = exportName.slice(-1)[0];
                    exportName = exportName.split('.');
                    objTraverse=exports;
                    for (var _in = 0; _in+1 < exportName.length; _in++) {
                        objTraverse=(objTraverse[exportName[_in]]=objTraverse[exportName[_in]]||{});
                    }
                    objTraverse[exportName[_in]]=objTraverse[exportName[_in]]=match.replace(/<!--\s*?export[^>]*>/, '');
                }
            }
            return exports;
        },
        imp: function (content) {
            //finds all <!-- import name:"text!stuff!export" --> declarations so that
            //the module will import modules with the name attribute
            //
            var imports = [];
            var impReg=/<!--\s*?import\s+?((name|path)[\:\=]([\'\"])).+?\3\s*?-->/g;
            var match;
            if (content) {
                while (match =impReg.exec(content)) {
                    var importName = /<!--\s*?import\s+?.*?((name)[\:\=]([\'\"]))(.+?)\3/.exec(match.toString()).slice(-1)[0];
                    var importPath = (/<!--\s*?import\s+?.*?((path)[\:\=]([\'\"]))(.+?)\3/.exec(match.toString())|| []).slice(-1)[0];
                    imports.push(makeImportReplace(match,importName,importPath?importPath.split('.'):[]));
                }
            }
            return imports;
        },

        jsEscape: function (content) {
            return content.replace(/(['\\])/g, '\\$1')
                .replace(/[\f]/g, "\\f")
                .replace(/[\b]/g, "\\b")
                .replace(/[\n]/g, "\\n")
                .replace(/[\t]/g, "\\t")
                .replace(/[\r]/g, "\\r")
                .replace(/[\u2028]/g, "\\u2028")
                .replace(/[\u2029]/g, "\\u2029");
        },

        createXhr: masterConfig.createXhr || function () {
            //Would love to dump the ActiveX crap in here. Need IE 6 to die first.
            var xhr, i, progId;
            if (typeof XMLHttpRequest !== "undefined") {
                return new XMLHttpRequest();
            } else if (typeof ActiveXObject !== "undefined") {
                for (i = 0; i < 3; i += 1) {
                    progId = progIds[i];
                    try {
                        xhr = new ActiveXObject(progId);
                    } catch (e) {}

                    if (xhr) {
                        progIds = [progId];  // so faster next time
                        break;
                    }
                }
            }

            return xhr;
        },

        /**
         * Parses a resource name into its component parts. Resource names
         * look like: module/name.ext!strip, where the !strip and !export part is
         * optional.
         * @param {String} name the resource name
         * @returns {Object} with properties "moduleName", "ext" and "extra"
         * where extra is an object with strip and exp as boolean properties.
         */
        parseName: function (name) {
            var modName, ext, temp,
                strip = false,
                index = name.lastIndexOf("."),
                isRelative = name.indexOf('./') === 0 ||
                             name.indexOf('../') === 0;

            if (index !== -1 && (!isRelative || index > 1)) {
                modName = name.substring(0, index);
                ext = name.substring(index + 1);
            } else {
                modName = name;
            }

            temp = ext || modName;
            index = temp.indexOf("!");
            
            var dontExp;
            dontExp = ((dontExp = temp.split('!export').join('')) == temp) ? temp : dontExp;
            if (dontExp != temp) {
                temp = dontExp;
                dontExp = false;
            }

            var dontStrip;
            dontStrip = ((dontStrip = temp.split('!strip').join('')) == temp) ? temp : dontStrip;
            if (dontStrip != temp) {
                temp = dontStrip;
                dontStrip = false;
            }

            if (!dontExp || !dontStrip) {
                if (ext) {
                    ext = temp;
                } else {
                    modName = temp;
                }
            }

            return {
                moduleName: modName,
                ext: ext,
                extra: { strip: !dontStrip, exp: !dontExp }
            };
        },

        xdRegExp: /^((\w+)\:)?\/\/([^\/\\]+)/,

        /**
         * Is an URL on another domain. Only works for browser use, returns
         * false in non-browser environments. Only used to know if an
         * optimized .js version of a text resource should be loaded
         * instead.
         * @param {String} url
         * @returns Boolean
         */
        useXhr: function (url, protocol, hostname, port) {
            var uProtocol, uHostName, uPort,
                match = text.xdRegExp.exec(url);
            if (!match) {
                return true;
            }
            uProtocol = match[2];
            uHostName = match[3];

            uHostName = uHostName.split(':');
            uPort = uHostName[1];
            uHostName = uHostName[0];

            return (!uProtocol || uProtocol === protocol) &&
                   (!uHostName || uHostName.toLowerCase() === hostname.toLowerCase()) &&
                   ((!uPort && !uHostName) || uPort === port);
        },

        finishLoad: function (name, extra, content, onLoad, req) {
            content = extra.strip ? text.strip(content) : content;
            var imports = text.imp(content);
            var keys=[];
            for (var i = 0; i <= imports.length - 1; i++) {
                keys.push(imports[i].importName);
            }
            req(keys,function(){
                if (keys.length && arguments[0]) {
                    for (var i = keys.length - 1; i >= 0; i--) {
                        content = imports[i](arguments[i], content);
                    }
                }
                var exports = extra.exp ? text.exp(content, name) : content;
                content = exports || content;
                if (masterConfig.isBuild) {
                    buildMap[name] = content;
                }
                onLoad(content);
                return content;

            });
        },

        load: function (name, req, onLoad, config) {
            //Name has format: some.module.filext!strip
            //The strip part is optional.
            //if strip is present, then that means only get the string contents
            //inside a body tag in an HTML string. For XML/SVG content it means
            //removing the <?xml ...?> declarations so the content can be inserted
            //into the current doc without problems.

            // Do not bother with the work if a build and text will
            // not be inlined.
            if (config && config.isBuild && !config.inlineText) {
                onLoad();
                return;
            }

            masterConfig.isBuild = config && config.isBuild;

            var parsed = text.parseName(name),
                nonStripName = parsed.moduleName +
                    (parsed.ext ? '.' + parsed.ext : ''),
                url = req.toUrl(nonStripName),
                useXhr = (masterConfig.useXhr) ||
                         text.useXhr;

            // Do not load if it is an empty: url
            if (url.indexOf('empty:') === 0) {
                onLoad();
                return;
            }

            //Load the text. Use XHR if possible and in a browser.
            if (!hasLocation || useXhr(url, defaultProtocol, defaultHostName, defaultPort)) {
                text.get(url, function (content) {
                    text.finishLoad(name, parsed.extra, content, onLoad,req);
                }, function (err) {
                    if (onLoad.error) {
                        onLoad.error(err);
                    }
                });
            } else {
                //Need to fetch the resource across domains. Assume
                //the resource has been optimized into a JS module. Fetch
                //by the module name + extension, but do not include the
                //!strip part to avoid file system issues.
                req([nonStripName], function (content) {
                    text.finishLoad(parsed.moduleName + '.' + parsed.ext,
                                    parsed.extra, content, onLoad, req);
                });
            }
        },
        write: function (pluginName, moduleName, write, config) {
            var keys;
            pluginName = pluginName.split('port').join('');
            if (buildMap.hasOwnProperty(moduleName)) {
                var content = buildMap[moduleName];
                if (typeof (content) != 'string') {
                    keys = Object.keys(content);
                    var key, _i, _len;

                    for (_i = 0, _len = keys.length; _i < _len; _i++) {
                        key = keys[_i];
                        content[key] = content[key];
                    }
                    content = JSON.stringify(content);
                }
                else {
                    content = text.jsEscape(content);
                }
                var imports = text.imp(content);
                keys=[];
                for (i = 0; i <= imports.length - 1; i++) {
                    keys.push(imports[i].importName);
                }
                if (keys.length && arguments[0]) {
                    for (i = keys.length - 1; i >= 0; i--) {
                        content = imports[i]("\'+arguments["+i+"]", content, true);
                    }
                }
                var doesExport = moduleName.indexOf('!export') != -1;
                var deps=keys.length?"['"+keys.join("','")+"'],":"";
                if (!doesExport) {
                    write.asModule(pluginName + "!" + moduleName,
                        "define("+deps+"function () { return '" +
                        content +
                        "';});\n");
                } else {
                    write.asModule(pluginName + "!" + moduleName,
                        "define("+deps+"function () { return " +
                        content +
                        ";});\n");

                }
            }
        },
        writeFile: function (pluginName, moduleName, req, write, config) {
            var parsed = text.parseName(moduleName),
                extPart = parsed.ext ? '.' + parsed.ext : '',
                nonStripName = parsed.moduleName + extPart,
                //Use a '.js' file name so that it indicates it is a
                //script that can be loaded across domains.
                fileName = req.toUrl(parsed.moduleName + extPart) + '.js';

            //Leverage own load() method to load plugin value, but only
            //write out values that do not have the strip argument,
            //to avoid any potential issues with ! in file names.
            text.load(nonStripName, req, function (value) {
                //Use own write() method to construct full module value.
                //But need to create shell that translates writeFile's
                //write() to the right interface.
                var textWrite = function (contents) {
                    return write(fileName, contents);
                };
                textWrite.asModule = function (moduleName, contents) {
                    return write.asModule(moduleName, fileName, contents);
                };

                text.write(pluginName, nonStripName, textWrite, config);
            }, config);
        }
    };

    if (masterConfig.env === 'node' || (!masterConfig.env &&
            typeof process !== "undefined" &&
            process.versions &&
            !!process.versions.node &&
            !process.versions['node-webkit'] &&
            !process.versions['atom-shell'])) {
        //Using special require.nodeRequire, something added by r.js.
        fs = require.nodeRequire('fs');

        text.get = function (url, callback, errback) {
            try {
                var file = fs.readFileSync(url, 'utf8');
                //Remove BOM (Byte Mark Order) from utf8 files if it is there.
                if (file[0] === '\uFEFF') {
                    file = file.substring(1);
                }
                callback(file);
            } catch (e) {
                if (errback) {
                    errback(e);
                }
            }
        };
    } else if (masterConfig.env === 'xhr' || (!masterConfig.env &&
            text.createXhr())) {
        text.get = function (url, callback, errback, headers) {
            var xhr = text.createXhr(), header;
            xhr.open('GET', url, true);

            //Allow plugins direct access to xhr headers
            if (headers) {
                for (header in headers) {
                    if (headers.hasOwnProperty(header)) {
                        xhr.setRequestHeader(header.toLowerCase(), headers[header]);
                    }
                }
            }

            //Allow overrides specified in config
            if (masterConfig.onXhr) {
                masterConfig.onXhr(xhr, url);
            }

            xhr.onreadystatechange = function (evt) {
                var status, err;
                //Do not explicitly handle errors, those should be
                //visible via console output in the browser.
                if (xhr.readyState === 4) {
                    status = xhr.status || 0;
                    if (status > 399 && status < 600) {
                        //An http 4xx or 5xx error. Signal an error.
                        err = new Error(url + ' HTTP status: ' + status);
                        err.xhr = xhr;
                        if (errback) {
                            errback(err);
                        }
                    } else {
                        callback(xhr.responseText);
                    }

                    if (masterConfig.onXhrComplete) {
                        masterConfig.onXhrComplete(xhr, url);
                    }
                }
            };
            xhr.send(null);
        };
    } else if (masterConfig.env === 'rhino' || (!masterConfig.env &&
            typeof Packages !== 'undefined' && typeof java !== 'undefined')) {
        //Why Java, why is this so awkward?
        text.get = function (url, callback) {
            var stringBuffer, line,
                encoding = "utf-8",
                file = new java.io.File(url),
                lineSeparator = java.lang.System.getProperty("line.separator"),
                input = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(file), encoding)),
                content = '';
            try {
                stringBuffer = new java.lang.StringBuffer();
                line = input.readLine();

                // Byte Order Mark (BOM) - The Unicode Standard, version 3.0, page 324
                // http://www.unicode.org/faq/utf_bom.html

                // Note that when we use utf-8, the BOM should appear as "EF BB BF", but it doesn't due to this bug in the JDK:
                // http://bugs.sun.com/bugdatabase/view_bug.do?bug_id=4508058
                if (line && line.length() && line.charAt(0) === 0xfeff) {
                    // Eat the BOM, since we've already found the encoding on this file,
                    // and we plan to concatenating this buffer with others; the BOM should
                    // only appear at the top of a file.
                    line = line.substring(1);
                }

                if (line !== null) {
                    stringBuffer.append(line);
                }

                while ((line = input.readLine()) !== null) {
                    stringBuffer.append(lineSeparator);
                    stringBuffer.append(line);
                }
                //Make sure we return a JavaScript string and not a Java string.
                content = String(stringBuffer.toString()); //String
            } finally {
                input.close();
            }
            callback(content);
        };
    } else if (masterConfig.env === 'xpconnect' || (!masterConfig.env &&
            typeof Components !== 'undefined' && Components.classes &&
            Components.interfaces)) {
        //Avert your gaze!
        Cc = Components.classes;
        Ci = Components.interfaces;
        Components.utils['import']('resource://gre/modules/FileUtils.jsm');
        xpcIsWindows = ('@mozilla.org/windows-registry-key;1' in Cc);

        text.get = function (url, callback) {
            var inStream, convertStream, fileObj,
                readData = {};

            if (xpcIsWindows) {
                url = url.replace(/\//g, '\\');
            }

            fileObj = new FileUtils.File(url);

            //XPCOM, you so crazy
            try {
                inStream = Cc['@mozilla.org/network/file-input-stream;1']
                           .createInstance(Ci.nsIFileInputStream);
                inStream.init(fileObj, 1, 0, false);

                convertStream = Cc['@mozilla.org/intl/converter-input-stream;1']
                                .createInstance(Ci.nsIConverterInputStream);
                convertStream.init(inStream, "utf-8", inStream.available(),
                Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

                convertStream.readString(inStream.available(), readData);
                convertStream.close();
                inStream.close();
                callback(readData.value);
            } catch (e) {
                throw new Error((fileObj && fileObj.path || '') + ': ' + e);
            }
        };
    }
    return text;
});
