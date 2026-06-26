'use strict'

const path = require('path')
const postcss = require('postcss')
const postcssImport = require('postcss-import')
const postcssPresetEnv = require('postcss-preset-env')

const { EleventyI18nPlugin } = require('@11ty/eleventy')

module.exports = function (eleventyConfig) {
  // i18n: pages in src/nl/ → /nl/…, src/en/ → /en/…
  eleventyConfig.addPlugin(EleventyI18nPlugin, {
    defaultLanguage: 'nl',
    errorMode: 'allow-fallback',
  })

  // PostCSS: process only entry-point all.css; partials are resolved via @import
  eleventyConfig.addTemplateFormats('css')
  eleventyConfig.addExtension('css', {
    outputFileExtension: 'css',
    compile: async function (inputContent, inputPath) {
      if (path.basename(inputPath) !== 'all.css') return
      return async () => {
        const result = await postcss([
          postcssImport,
          postcssPresetEnv({
            stage: 2,
            features: { 'custom-media-queries': true },
          }),
        ]).process(inputContent, { from: inputPath })
        return result.css
      }
    },
  })

  // Passthrough: images, CNAME, root redirect
  eleventyConfig.addPassthroughCopy({ 'src/static/img': 'static/img' })
  eleventyConfig.addPassthroughCopy({ CNAME: 'CNAME' })

  return {
    templateFormats: ['njk', 'html', 'css'],
    htmlTemplateEngine: 'njk',
    markdownTemplateEngine: 'njk',
    dir: {
      input: 'src',
      output: 'dest',
      includes: '_includes',
      data: '_data',
    },
  }
}
