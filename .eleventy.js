import { EleventyI18nPlugin } from '@11ty/eleventy'
import path from 'path'
import postcss from 'postcss'
import postcssImport from 'postcss-import'
import postcssPresetEnv from 'postcss-preset-env'

export default function (eleventyConfig) {
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

  eleventyConfig.addPassthroughCopy({ 'src/static/img': 'static/img' })
  eleventyConfig.addPassthroughCopy({ CNAME: 'CNAME' })
  eleventyConfig.addPassthroughCopy({ 'src/index.html': 'index.html' })

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
