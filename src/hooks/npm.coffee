fs = require 'fs'
path = require 'path'
async = require 'async'
npm = require 'npm'
powerfs = require 'powerfs'
browserify = require 'browserify'
_ = require 'underscore'
helpers = require '../helpers'

propagate = helpers.propagate

buildNPM = (folder, packages, prelude, callback) ->
  powerfs.mkdirp folder, propagate callback, ->
    npm.load
      loglevel: 'silent'
    , propagate callback, ->
      npm.commands.install folder, packages, propagate callback, (data) ->
        cwd = process.cwd()
        process.chdir folder
        b = browserify()
        unless prelude
          b.files = []
          b.prepends = []

        allFiles = packages.map((x) -> x.split("@")[0])
        allFile = path.join(folder, '__my_package.js')

        outText = allFiles.map (x) ->
          "require('#{x}')"
        .join('\n')
        fs.writeFileSync(allFile, outText)

        b.require(allFile)

        output = b.bundle()
        process.chdir cwd
        callback null, output

filesFromNPM = (first, assetRoot, d, filename, aliases, callback) ->
  packages = [d]
  packageName = d.split("@")[0]
  packageVersion = d.split("@").slice(1)[0] || ''
  delayedCallback = _.after(2, callback)
  requireFile = path.join(filename, packageName + "-require.js")
  packageFile = path.join(filename, packageName + ".js")
  versionFile = path.join(filename, packageName + ".version")

  requireContent = aliases.map((alias) ->
    "window['" + alias + "'] = require('" + packageName + "');"
  ).join("\n")

  if requireContent
    powerfs.writeFile requireFile, requireContent, "utf8", delayedCallback
  else
    delayedCallback()

  updateFile = ->
    buildNPM filename, [ d ], first, propagate delayedCallback, (data) ->
      powerfs.writeFile versionFile, packageVersion, "utf8", propagate delayedCallback, ->
        powerfs.writeFile packageFile, data, "utf8", delayedCallback

  powerfs.fileExists versionFile, (exists) ->
    return updateFile() if !exists
    fs.readFile versionFile, "utf8", (err, data) ->
      if err || data != packageVersion
        updateFile()
      else
        delayedCallback()

filter3 = (files, meta, callback) ->
  assetRoot = meta.assetRoot
  globs = _.flatten(_.pluck(files, "globs"))
  async.forEachSeries globs, ((item, callback) ->
    type = null
    type = "js"  if _.endsWith(item.name, ".js")
    type = "coffee"  if _.endsWith(item.name, ".coffee")
    unless _.contains(item.params, "module")
      callback()
      return
    pathRelativeToRoot = path.relative(assetRoot, item.absolutePath)
    newName = "/" + path.join(".opra-cache", path.relative(assetRoot, item.absolutePath))
    r2 = path.join(assetRoot, newName)
    haveReplaced = false
    fs.readFile item.absolutePath, item.encoding, propagate callback, (data) ->
      newData = ""
      newData += "require.define('" + pathRelativeToRoot + "', function(require, module, exports, __dirname, __filename) {\n"  if type is "js"
      newData += "require.define '" + pathRelativeToRoot + "', (require, module, exports, __dirname, __filename) ->\n"  if type is "coffee"
      newData += data.split("\n").map((x) ->
        "  " + x
      ).join("\n")
      newData += "\n});"  if type is "js"
      powerfs.writeFile r2, newData, item.encoding, propagate callback, ->
        item.absolutePath = r2
        item.name = newName
        callback()
  ), (err) ->
    callback err, files

filter2 = (files, meta, callback) ->
  hasPreludedCommonJS = false
  assetRoot = meta.assetRoot
  npmreqs = files.filter((file) ->
    _.contains file.params, "npm"
  )
  async.forEachSeries npmreqs, ((item, callback) ->
    aliases = item.params.filter((xx) ->
      _.startsWith xx, "as:"
    ).map((xx) ->
      xx.slice 3
    )
    filesFromNPM not hasPreludedCommonJS, assetRoot, item.name, getNpmFolder(meta.assetRoot, meta.indexFile), aliases, (err) ->
      hasPreludedCommonJS = true
      callback err
  ), propagate callback, ->
    npmreqs.forEach (n) ->
      name = n.name
      n.absolutePath = path.join(getNpmFolder(meta.assetRoot, meta.indexFile), name.split("@")[0] + ".js")
      n.name = "/" + path.relative(assetRoot, n.absolutePath)
      n.type = "js"
      n.encoding = "utf8"

    callback null, files

getNpmFolder = (assetRoot, indexFile) ->
  r1 = path.relative(assetRoot, indexFile)
  r2 = path.join(assetRoot, ".opra-cache", r1)
  r3 = r2 + "-npm"
  r3

expandNPM = (file, assetRoot, indexFile, callback) ->
  if _.contains(file.params, "npm") and file.params.some((p) -> _.startsWith p, "as:")
    abs = path.join(getNpmFolder(assetRoot, indexFile), file.name.split("@")[0] + "-require.js")
    reqFile =
      absolutePath: abs
      name: "/" + path.relative(assetRoot, abs)
      type: "js"
      encoding: "utf8"
      globs: [
        absolutePath: abs
        name: "/" + path.relative(assetRoot, abs)
        type: "js"
        encoding: "utf8"
        spaces: file.spaces
        params: _.without(file.params, "npm")
      ]
      spaces: file.spaces
      params: _.without(file.params, "npm")

    callback null, [ file, reqFile ]
  else
    callback null

fetcher = (file, opraBlock, fetchFileData, callback) ->
  if _.contains(file.params, "npm")
    fetchFileData file, opraBlock, callback
  else
    callback()

module.exports = (hooks) ->
  hooks.preproc = [ filter2, filter3 ]
  hooks.expand = expandNPM
  hooks.fileFetcher = fetcher
