should = require 'should'
helpers = require '../../src/helpers.js'

describe 'helpers.uglify', ->
  it 'should compress code', ->
    helpers.uglifier('1 + x').should.equal('1+x')
    helpers.uglifier('1 + 1').should.equal('2')
    helpers.uglifier('').should.equal('')
  it 'should default to an empty string', ->
    helpers.uglifier().should.equal('')

describe 'helpers.endsWith', ->
  it 'should accept an array of arguments', ->
    helpers.endsWith('jakob', ['ab', 'cd']).should.be.false
    helpers.endsWith('jakob', ['ab', 'ob']).should.be.true
  it 'should not use regexps', ->
    helpers.endsWith('index.xhtml', ['.html']).should.be.false
    helpers.endsWith('index.xhtml', ['.xhtml']).should.be.true
  it 'should never match the empty set', ->
    helpers.endsWith('index.xhtml', []).should.be.false

describe 'helpers.safeReplace', ->
  it 'should replace the first occurance of the string', ->
    helpers.safeReplace('abrakadabra', 'abra', '...').should.equal('...kadabra')
  it 'should return the original string if the substring does not exist', ->
    helpers.safeReplace('abrakadabra', 'banana', '...').should.equal('abrakadabra')

describe 'helpers.safeReplaceAll', ->
  it 'should replace all occurance of the string', ->
    helpers.safeReplaceAll('abrakadabra', 'abra', '...').should.equal('...kad...')
  it 'should return the original string if the substring does not exist', ->
    helpers.safeReplaceAll('abrakadabra', 'banana', '...').should.equal('abrakadabra')

describe 'helpers.execAll', ->
  it 'should return all match objects for the regexp', ->
    x = [['days', 'd'], ['later', 'l']]
    x[0].index = 3
    x[0].input = '28 days later'
    x[1].index = 8
    x[1].input = '28 days later'
    helpers.execAll(/([a-z])[a-z]+/g, '28 days later').should.eql(x)
  it 'should return an empty list if there are no matches', ->
    helpers.execAll(/([a-z])[a-z]+/g, '1337').should.eql([])

describe 'helpers.arrayContains', ->
  it 'should return true if and only if the array contains the given element', ->
    helpers.arrayContains([1, 2, 3], 3).should.be.true
    helpers.arrayContains([1, 2, 3], 0).should.be.false

describe 'helpers.createTag', ->
  it 'should create a proper html tag', ->
    helpers.createTag('a', { href: '#', id: 'test' }, 'Text').should.equal('<a href="#" id="test">Text</a>')
  it 'should be able to create tags without content', ->
    helpers.createTag('a', { href: '#', id: 'test' }).should.equal('<a href="#" id="test" />')
  it 'should default to no attributes', ->
    helpers.createTag('a').should.equal('<a />')
  it 'should be possible to create content without attributes', ->
    helpers.createTag('a', 'content').should.equal('<a>content</a>')

describe 'helpers.isPathAbsolute', ->
  it 'should check for initial slashes', ->
    helpers.isPathAbsolute('/test').should.be.true
    helpers.isPathAbsolute('bin').should.be.false

describe 'helpers.escapeInlineScript', ->
  it 'should replace tag-opening with escape sequence', ->
    helpers.escapeInlineScript('script <script></script> script').should.equal('script <script>\\x3C/script> script')
  it 'should return strings without inline scripts as-is', ->
    helpers.escapeInlineScript('script').should.equal('script')