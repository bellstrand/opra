var fs = require('fs');
var path = require('path');
var async = require('async');
var glob = require('glob');
var powerfs = require('powerfs');
var _ = require('underscore');

var helpers = require('./helpers.js');
var parse = require('./parse.js');
var read = exports;
var filters = require('./filters.js');
var build = exports;

var def = function(name, func) {
  exports[name] = func;
};
var propagate = function(callback, f) {
  return function(err) {
    if (err) {
      callback(err);
      return;
    }
    return f.apply(this, Array.prototype.slice.call(arguments, 1));
  };
};




def('filetype', function(filename, compiler) {
  return Object.keys(compiler).reduce(function(memo, type) {
    return _.endsWith(filename, '.' + type) ? compiler[type].target : memo;
  }, 'other');
});

def('resolveIndexFileDir', function(filename) {
  return path.resolve(process.cwd(), path.dirname(filename));
});
def('filePathToAbsolute', function(filename, assetRoot, indexFileDir) {
  return path.join(helpers.isPathAbsolute(filename) ? assetRoot : indexFileDir, filename);
});




def('transform', function(assetRoot, pars, encoding, indexFile, matches, content, callback) {



  async.reduce(matches, { cont: content, files: [] }, function(cc, d, callback) {
    var next_content = cc.cont;
    var old_outfiles = cc.files;

    var shouldConcat = _.contains(d.params, 'concat');

    var expandFilters = filters.expandFilters.concat([function(f, as, index, callback) {
      callback(null, f);
    }]);


    var then = function(expandedFiles) {

      var ps = {
        spaces: d.spaces,
        files: _.flatten(expandedFiles)
      };

      async.forEachSeries(filters.preprocFilters, function(filt, callback) {
        filt(ps.files, { assetRoot: assetRoot, indexFile: indexFile }, callback);
      }, function(err) {
        if (err) {
          callback(err);
          return;
        }

        read.filesToInlineBasic(pars, ps.files, {
          shouldConcat: shouldConcat,
          filename: d.filename,
          absolutePath: d.filename ? path.join(assetRoot, d.filename) : undefined,
          fileType: d.type
        }, function(err, data, outfiles) {
          if (err) {
            callback(err);
            return;
          }

          callback(err, {
            cont: helpers.safeReplace(next_content, d.match, data),
            files: old_outfiles.concat(outfiles || [])
          });
        });
      });

    };

    async.map(d.files, function(file, callback) {
      async.map(expandFilters, function(filter, callback) {
        filter(file, assetRoot, indexFile, callback);
      }, function(err, suggestions) {
        callback(err, _.compact(suggestions).first());
      });
    }, function(err, ex2) {
      // handle error
      then(ex2);
    });

  }, callback);

});

def('buildConstructor', function(dependencies) {
  return function(indexFile, settings, callback) {

    if (!callback && typeof settings == 'function') {
      callback = settings;
      settings = {};
    }
    settings = settings || {};

    var indexFileDir = build.resolveIndexFileDir(indexFile);
    var encoding = settings.encoding || 'utf8';
    var assetRoot = path.resolve(settings.assetRoot || indexFileDir);

    var globalFlags = {
      concat: settings.concat,
      inline: settings.inline,
      compress: settings.compress,
      paths: settings.paths,
      escape: settings.escape,
      ids: settings.ids
    };

    var compiler = {
      css: {
        target: 'css',
        compile: fs.readFile
      },
      js: {
        target: 'js',
        compile: fs.readFile
      },
      less: {
        target: 'css',
        compile: function(file, encoding, callback) {
          helpers.compileLess(file, [assetRoot], encoding, callback);
        }
      },
      coffee: {
        target: 'js',
        compile: helpers.compileCoffee
      },
      '.': {
        target: 'other',
        compile: fs.readFile
      }
    };

    var autoNumber = 0;

    parse.parseFile(assetRoot, globalFlags, indexFile, encoding, function(err, res) {
      if (err) {
        callback(err);
        return;
      }

      res.matches.forEach(function(match) {
        if (_.contains(match.params, 'concat') && !match.filename) {
          autoNumber++;
          match.filename = '__opra-concat-' + autoNumber;
          match.type = null;
        }
      });

      // Glob-preprocessing
      res.matches.forEach(function(match) {
        match.type = match.type || build.filetype(match.filename, compiler);
        match.files.forEach(function(file) {
          file.absolutePath = build.filePathToAbsolute(file.name, assetRoot, indexFileDir);
          file.encoding = encoding;
          file.type = build.filetype(file.name, compiler);
          file.globs = file.globs.map(function(x) {
            return {
              name: x,
              params: file.params,
              spaces: file.spaces,
              absolutePath: build.filePathToAbsolute(x, assetRoot, indexFileDir),
              encoding: encoding,
              type: build.filetype(x, compiler)
            };
          });
        });
      });

      build.transform(assetRoot, { compiler: compiler }, encoding, indexFile, res.matches, res.content, function(err, resa) {
        if (err) {
          callback(err);
          return;
        }

        var res = resa.cont;
        var outfiles = resa.files;

        async.forEach(outfiles || [], function(file, callback) {
          fs.writeFile(file.name, file.content, file.encoding || encoding, callback);
        }, function(err) {
          callback(err, res);
        });
      });
    });
  };
});


def('extend', function(f) {
  var h = {};
  f(h);

  Object.keys(h).forEach(function(key) {
    if (hooks[key]) {
      hooks[key].push(h[key]);
    }
  })
});

var hooks = {
  tag: [],
  postTag: [],
  file: [],
  preventContent: [],
  concatable: [],
  fileFetcher: [],
  data: []
};


var paramsToMediaType = exports.paramsToMediaType = function(params) {
  if (_.contains(params, 'screen')) {
    return 'screen';
  }
  if (_.contains(params, 'print')) {
    return 'print';
  }
  return undefined;
};


hooks.tag.push(function(file, tag) {
  var spaces = file.spaces.slice(2);


  if (tag.content && (!_.contains(file.params, 'compress') || file.type == 'other')) {
    tag.content = tag.content.trim().split('\n').map(function(s) {
      return file.spaces + s;
    }).join('\n');
    tag.content = "\n" + tag.content + "\n" + spaces;
  }

  return tag;
});
hooks.tag.push(function(file, tag) {
  var media = exports.paramsToMediaType(file.params);
  if (media) {
    tag.attributes.media = media;
  }
  return tag;
});
hooks.tag.push(function(file, tag) {
  if (file.type != 'js' && file.type != 'css' && _.contains(file.params, 'ids')) {
    tag.attributes.id = "opra-" + path.basename(file.name).split('.')[0];
  }
  return tag;
});
hooks.tag.push(function(file, tag) {
  if (_.contains(file.params, 'paths')) {
    tag.attributes['data-path'] = file.name
  }
  return tag;
});




hooks.file.push(function(tag, deps) {
  if (_.isUndefined(tag.content)) {
    return tag;
  }
  return {
    file: tag.file,
    content: tag.file.type == 'js' && _.contains(tag.file.params, 'escape') ? helpers.escapeInlineScript(tag.content) : tag.content
  };
});


hooks.preventContent.push(function(file, blockParams) {
  return _.contains(file.params, 'inline');
});
hooks.preventContent.push(function(file, blockParams) {
  return blockParams.shouldConcat && blockParams.outfilename;
});


hooks.concatable.push(function(file, content) {
  return paramsToMediaType(file.params);
});
hooks.concatable.push(function(file, content) {
  return _.contains(file.params, 'inline');
});
hooks.concatable.push(function(file, content) {
  return file.type;
});


hooks.fileFetcher.push(function(file, opraBlock, deps, callback) {
  if (_.contains(file.params, 'npm')) {
    fetchFileData(file, opraBlock, deps.compiler, callback);
  } else {
    callback();
  }
});









var tagify = exports.tagify = function(tags) {
  return tags.map(function(tag) {
    var file = tag.file;
    var content = tag.content;


    var tag = "";

    if (_.isUndefined(content)) {
      if (file.type == 'css') {
        tag = {
          name: 'link',
          attributes: { rel: 'stylesheet', type: 'text/css', href: file.name },
          content: null
        };
      } else if (file.type == 'js') {
        tag = {
          name: 'script',
          attributes: { type: 'text/javascript', src: file.name },
          content: ''
        };
      } else {
        return "";
      }
    } else {
      if (file.type == 'css') {
        tag = helpers.createTagData('style', {
          type: 'text/css',
        }, content);
      } else if (file.type == 'js') {
        tag = helpers.createTagData('script', {
          type: 'text/javascript'
        }, content);
      } else {
        tag = helpers.createTagData('script', {
          type: 'text/x-opra'
        }, content);
      }
    }

    hooks.tag.forEach(function(hook) {
      tag = hook(file, tag);
    });

    tag = helpers.createTagFromData(tag);

    hooks.postTag.forEach(function(hook) {
      tag = hook(file, tag);
    });

    return tag ? file.spaces.slice(2) + tag : '';

  }).filter(function(x) { return x; }).join('\n');
};

var fetchFileData = exports.fetchFileData = function(file, opraBlock, compiler, callback) {

  var shouldConcat = opraBlock.shouldConcat
  var outfilename = opraBlock.filename;

  var actualCallback = function(err, data) {
    callback(err, { file: file, content: data });
  };

  var anyTrue = hooks.preventContent.some(function(hook) {
    return hook(file, { shouldConcat: shouldConcat, outfilename: outfilename });
  });

  if (!anyTrue) {
    actualCallback(null, undefined);
  } else {
    var matchingCompiler = helpers.getValueForFirstKeyMatching(compiler, function(key) {
      return _.endsWith(file.name, '.' + key);
    });

    if (matchingCompiler) {
      matchingCompiler.compile(file.absolutePath, file.encoding, actualCallback);
    } else {
      compiler['.'].compile(file.absolutePath, file.encoding, actualCallback);
    }
  }
};





var filesToInlineBasic = exports.filesToInlineBasic = function(deps, files, opraBlock, callback) {

  var extendedFetchers = hooks.fileFetcher.concat([function(file, opraBlock, deps, callback) {
    var gfiles = file.globs.map(function(x) {
      return _.extend({}, x, {
        params: file.params,
        spaces: file.spaces
      });
    });

    async.mapSeries(gfiles, function(gfile, callback) {
      fetchFileData(gfile, opraBlock, deps.compiler, callback);
    }, callback);
  }]);

  async.mapSeries(files, function(file, callback) {
    helpers.firstNonNullSeries(extendedFetchers, function(hook, callback) {
      hook(file, opraBlock, deps, callback);
    }, callback);
  }, function(err, data) {
    if (err) {
      callback(err);
      return;
    }

    data = _.flatten(data);

    data = data.map(function(d) {
      hooks.file.forEach(function(hook) {
        d = hook(d, deps);
      });
      return d;
    });

    helpers.firstNonNullSeries(hooks.data, function(hook, callback) {
      hook(data, opraBlock, hooks.concatable, callback)
    }, function(err, value) {
      if (err) {
        callback(err);
        return;
      }

      if (!value) {
        callback(null, exports.tagify(data));
      } else {
        callback(err, exports.tagify(value.tags), value.outfiles);
      }
    });
  });
};

