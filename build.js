'use strict'

const fs = require('fs')
const path = require('path')

const shell = require('shelljs')
const glob = require('glob').sync
const postcss = require('postcss')
const postcssCssnext = require('postcss-cssnext')
const postcssImport = require('postcss-import')

const nunjucks = require('nunjucks')
const nunjucksEnv = new nunjucks.Environment([
  new nunjucks.FileSystemLoader(__dirname, { noCache: true }),
]).addFilter('date', require('nunjucks-date-filter'))

const config = Object.freeze({
  src: `${__dirname}/src`,
  dest: `${__dirname}/dest`,
  glob: {
    src: `${__dirname}/src/**/*`,
    dest: `${__dirname}/dest/**/*`,
    pages: `${__dirname}/src/pages/**/*.njk`,
    css: `${__dirname}/src/static/css/!(_)*.css`,
    js: `${__dirname}/src/static/js/!(_)*.js`,
  },
  datafile: `${__dirname}/src/pages/data.json`,
})

module.exports.build = function build() {
  const pipeline = [
    decorateLogs(clean, 'clean'),
    decorateLogs(compileCSS, 'compile-css'),
    decorateLogs(compileHTML, 'compile-html'),
    decorateLogs(copyImages, 'copy-img'),
    () => console.log('All done.'),
  ]
  runCallbackChain(pipeline)
}

function clean(cb) {
  shell.rm('-rf', config.dest)
  shell.mkdir('-p', config.dest)
  shell.mkdir('-p', `${config.dest}/static/css`)
  shell.mkdir('-p', `${config.dest}/static/js`)
  shell.cp(`${__dirname}/CNAME`, config.dest)
  cb()
}

function compileCSS(cb) {
  const processor = postcss([postcssImport, postcssCssnext])

  const map = (fn) => (list) => list.map(fn)
  const getCssFiles = (pattern) => Promise.resolve(glob(pattern))
  const renderCss = (vinyl) =>
    processor.process(vinyl.contents, { from: vinyl.filename })
  const render = (vinyl) =>
    renderCss(vinyl).then((result) => {
      vinyl.contents = result.css
      return vinyl
    })
  const mapFilename = (filename) =>
    `${path.relative(`${config.src}/static/css/`, filename)}`
  const mapToDest = (vinyl) => {
    vinyl.filename = mapFilename(vinyl.filename)
    return vinyl
  }
  const writeDest = (vinyl) =>
    fs.writeFileSync(
      `${config.dest}/static/css/${vinyl.filename}`,
      vinyl.contents,
    )

  getCssFiles(config.glob.css)
    .then(map(getVinyl))
    .then(map(render))
    .then((xs) => Promise.all(xs))
    .then(map(mapToDest))
    .then(map(writeDest))
    .then(cb)
    .catch(console.error)
}

function compileHTML(cb) {
  const render = (data) => (vinyl) => {
    vinyl.contents = nunjucksEnv.render(vinyl.filename, { data })
    return vinyl
  }
  const mapFilename = (filename) =>
    `${path.relative(`${config.src}/pages/`, filename)}`.replace(
      /\.njk$/,
      '.html',
    )
  const mapToDest = (vinyl) => {
    vinyl.filename = mapFilename(vinyl.filename)
    return vinyl
  }
  const writeDest = (vinyl) =>
    fs.writeFileSync(`${config.dest}/${vinyl.filename}`, vinyl.contents)

  const data = require(config.datafile)
  data.lastUpdate = +new Date()

  glob(config.glob.pages)
    .map(getVinyl)
    .map(render(data))
    .map(mapToDest)
    .map(writeDest)

  cb()
}

function copyImages(cb) {
  shell.cp('-R', `${config.src}/static/img`, `${config.dest}/static`)
  cb()
}

const getVinyl = (filename) => ({
  filename,
  contents: fs.readFileSync(filename, 'utf8'),
})

function runCallbackChain(xs) {
  return xs.reduce(
    (acc, curr) => (nextCb) => acc(() => curr(nextCb)),
    (cb) => cb(),
  )()
}

function decorateLogs(fn, desc) {
  return (cb) => {
    console.log(`[${desc}] running...`)
    fn(() => {
      console.log(`[${desc}] done.\n`)
      cb()
    })
  }
}
